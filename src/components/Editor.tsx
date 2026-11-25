import React, { useRef, useState, useImperativeHandle, forwardRef, useMemo, useLayoutEffect, useEffect } from 'react';
import { X } from 'lucide-react';
import { CodeFile } from '../types';
import { SyntaxTheme } from '../types/theme';

export interface EditorHandle {
  insertTextAtCursor: (text: string, cursorOffset?: number) => void;
  indentSelection: () => void;
  unindentSelection: () => void;
  openSearch: () => void;
  blur: () => void;
  getText: () => string;
  setText: (newText: string) => void;
}

interface EditorProps {
  activeFile: CodeFile;
  onChangeContent: (content: string) => void;
  highlightLine?: number;
  fontSize: number;
  theme: SyntaxTheme;
  isActive?: boolean;
}

const PYTHON_KEYWORDS = new Set([
  'and', 'as', 'assert', 'break', 'class', 'continue', 'def', 'del', 'elif',
  'else', 'except', 'False', 'finally', 'for', 'from', 'global', 'if', 'import',
  'in', 'is', 'lambda', 'None', 'nonlocal', 'not', 'or', 'pass', 'raise',
  'return', 'True', 'try', 'while', 'with', 'yield', 'async', 'await'
]);

const PYTHON_BUILTINS = new Set([
  'abs', 'all', 'any', 'ascii', 'bin', 'bool', 'bytearray', 'bytes', 'callable',
  'chr', 'classmethod', 'compile', 'complex', 'delattr', 'dict', 'dir', 'divmod',
  'enumerate', 'eval', 'exec', 'filter', 'float', 'format', 'frozenset', 'getattr',
  'globals', 'hasattr', 'hash', 'help', 'hex', 'id', 'input', 'int', 'isinstance',
  'issubclass', 'iter', 'len', 'list', 'locals', 'map', 'max', 'memoryview',
  'min', 'next', 'object', 'oct', 'open', 'ord', 'pow', 'print', 'property',
  'range', 'repr', 'reversed', 'round', 'set', 'setattr', 'slice', 'sorted',
  'staticmethod', 'str', 'sum', 'super', 'tuple', 'type', 'vars', 'zip'
]);

// Tokenizer to produce colored elements based on user's SyntaxTheme
function highlightPythonLine(line: string, theme: SyntaxTheme, inDocstring: boolean): { elements: React.ReactNode[]; endsInDocstring: boolean } {
  const elements: React.ReactNode[] = [];
  let i = 0;
  const len = line.length;

  if (inDocstring) {
    const endTriple = line.indexOf('"""') !== -1 ? line.indexOf('"""') : line.indexOf("'''");
    if (endTriple !== -1) {
      elements.push(
        <span key="doc-end" style={{ color: theme.strings }}>
          {line.substring(0, endTriple + 3)}
        </span>
      );
      i = endTriple + 3;
      inDocstring = false;
    } else {
      elements.push(
        <span key="doc-body" style={{ color: theme.strings }}>
          {line}
        </span>
      );
      return { elements, endsInDocstring: true };
    }
  }

  while (i < len) {
    // Comments
    if (line[i] === '#') {
      elements.push(
        <span key={`comm_${i}`} style={{ color: theme.comments }}>
          {line.substring(i)}
        </span>
      );
      break;
    }

    // Triple Quotes Docstrings
    if (line.substring(i, i + 3) === '"""' || line.substring(i, i + 3) === "'''") {
      const quoteType = line.substring(i, i + 3);
      const nextIdx = line.indexOf(quoteType, i + 3);
      if (nextIdx !== -1) {
        elements.push(
          <span key={`doc_${i}`} style={{ color: theme.strings }}>
            {line.substring(i, nextIdx + 3)}
          </span>
        );
        i = nextIdx + 3;
      } else {
        elements.push(
          <span key={`doc_${i}`} style={{ color: theme.strings }}>
            {line.substring(i)}
          </span>
        );
        return { elements, endsInDocstring: true };
      }
      continue;
    }

    // Strings single or double
    if (line[i] === '"' || line[i] === "'") {
      const quoteChar = line[i];
      let j = i + 1;
      while (j < len && line[j] !== quoteChar) {
        if (line[j] === '\\') j++;
        j++;
      }
      elements.push(
        <span key={`str_${i}`} style={{ color: theme.strings }}>
          {line.substring(i, Math.min(len, j + 1))}
        </span>
      );
      i = j + 1;
      continue;
    }

    // Numbers
    if (/\d/.test(line[i])) {
      let j = i;
      while (j < len && /[\d.xXa-fA-F_]/.test(line[j])) {
        j++;
      }
      elements.push(
        <span key={`num_${i}`} style={{ color: theme.numbers }}>
          {line.substring(i, j)}
        </span>
      );
      i = j;
      continue;
    }

    // Words / Identifiers
    if (/[a-zA-Z_]/.test(line[i])) {
      let j = i;
      while (j < len && /[a-zA-Z0-9_]/.test(line[j])) {
        j++;
      }
      const word = line.substring(i, j);

      if (PYTHON_KEYWORDS.has(word)) {
        elements.push(
          <span key={`kw_${i}`} style={{ color: theme.keywords }}>
            {word}
          </span>
        );
      } else if (PYTHON_BUILTINS.has(word)) {
        elements.push(
          <span key={`bi_${i}`} style={{ color: theme.builtins }}>
            {word}
          </span>
        );
      } else if (i > 0 && /def\s+$/.test(line.substring(0, i))) {
        elements.push(
          <span key={`func_${i}`} style={{ color: theme.functions }}>
            {word}
          </span>
        );
      } else if (i > 0 && /class\s+$/.test(line.substring(0, i))) {
        elements.push(
          <span key={`cls_${i}`} style={{ color: theme.functions }}>
            {word}
          </span>
        );
      } else {
        elements.push(
          <span key={`id_${i}`} style={{ color: theme.variables }}>
            {word}
          </span>
        );
      }
      i = j;
      continue;
    }

    // Operators and punctuation
    if (/[+\-*/%=&|^~<>!?:;,]/.test(line[i])) {
      elements.push(
        <span key={`op_${i}`} style={{ color: theme.operators }}>
          {line[i]}
        </span>
      );
      i++;
      continue;
    }

    // Normal characters / whitespace
    elements.push(
      <span key={`fg_${i}`} style={{ color: theme.foreground }}>
        {line[i]}
      </span>
    );
    i++;
  }

  return { elements, endsInDocstring: false };
}

export const Editor = forwardRef<EditorHandle, EditorProps>(
  (
    {
      activeFile,
      onChangeContent,
      highlightLine,
      fontSize,
      theme,
      isActive = true,
    },
    ref
  ) => {
    const hScrollerRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const lineNumbersRef = useRef<HTMLDivElement>(null);
    const backdropRef = useRef<HTMLDivElement>(null);
    const measureCanvasRef = useRef<HTMLCanvasElement | null>(null);
    const lastScrollRef = useRef<{ top: number; left: number }>({ top: 0, left: 0 });
    const pendingSelectionRef = useRef<{
      start: number;
      end: number;
      scrollTop: number;
      scrollLeft: number;
      shouldFocusIfBlurred: boolean;
    } | null>(null);

    const [cursorPos, setCursorPos] = useState({ line: 1, col: 1 });
    const [showSearch, setShowSearch] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [replaceQuery, setReplaceQuery] = useState('');
    const [fontReadyTick, setFontReadyTick] = useState(0);

    // Recompute horizontal stage width once webfonts (JetBrains Mono) finish loading
    useEffect(() => {
      if (typeof document === 'undefined' || !document.fonts?.ready) return;
      let cancelled = false;
      document.fonts.ready.then(() => {
        if (!cancelled) setFontReadyTick((t) => t + 1);
      }).catch(() => {});
      return () => {
        cancelled = true;
      };
    }, []);

    // Sync vertical scroll natively from <textarea> to line numbers & colored backdrop
    const handleVerticalScroll = () => {
      const textarea = textareaRef.current;
      if (!textarea) return;
      const top = textarea.scrollTop;
      if (textarea.scrollLeft !== 0 && hScrollerRef.current) {
        hScrollerRef.current.scrollLeft += textarea.scrollLeft;
        textarea.scrollLeft = 0;
      }
      if (isActive) {
        lastScrollRef.current.top = top;
      }
      if (lineNumbersRef.current) lineNumbersRef.current.scrollTop = top;
      if (backdropRef.current) backdropRef.current.scrollTop = top;
    };

    const handleHorizontalScroll = () => {
      const hScroller = hScrollerRef.current;
      if (!hScroller) return;
      if (isActive) {
        lastScrollRef.current.left = hScroller.scrollLeft;
      }
    };

    // Keep caret comfortably inside horizontal viewport with generous right-side breathing room
    const ensureCaretXInView = (caretIndex?: number) => {
      const hScroller = hScrollerRef.current;
      const textarea = textareaRef.current;
      if (!hScroller || !textarea) return;

      const pos = caretIndex ?? textarea.selectionEnd ?? 0;
      const textBefore = textarea.value.slice(0, pos);
      const lastNl = textBefore.lastIndexOf('\n');
      const currentLine = lastNl === -1 ? textBefore : textBefore.slice(lastNl + 1);

      const computed = window.getComputedStyle(textarea);
      if (!measureCanvasRef.current) {
        measureCanvasRef.current = document.createElement('canvas');
      }
      const ctx = measureCanvasRef.current.getContext('2d');
      let textWidth = currentLine.length * (fontSize * 0.6);
      if (ctx) {
        ctx.font =
          computed.font ||
          `${fontSize}px "JetBrains Mono", "Fira Code", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
        textWidth = ctx.measureText(currentLine.replace(/\t/g, '    ')).width;
      }

      const paddingLeft = parseFloat(computed.paddingLeft) || 12;
      const caretX = paddingLeft + textWidth;

      const rightMargin = 68;
      const leftMargin = 20;
      if (caretX > hScroller.scrollLeft + hScroller.clientWidth - rightMargin) {
        hScroller.scrollLeft = Math.max(0, caretX - hScroller.clientWidth + rightMargin);
      } else if (caretX < hScroller.scrollLeft + leftMargin) {
        hScroller.scrollLeft = Math.max(0, caretX - leftMargin);
      }
      handleHorizontalScroll();
    };

    // Restore scroll position cleanly when Editor becomes active again after being hidden
    useLayoutEffect(() => {
      if (!isActive) return;
      const raf = requestAnimationFrame(() => {
        const textarea = textareaRef.current;
        const hScroller = hScrollerRef.current;
        const { top, left } = lastScrollRef.current;
        if (textarea) {
          textarea.scrollTop = top;
          if (lineNumbersRef.current) lineNumbersRef.current.scrollTop = top;
          if (backdropRef.current) backdropRef.current.scrollTop = top;
        }
        if (hScroller) {
          hScroller.scrollLeft = left;
        }
      });
      return () => cancelAnimationFrame(raf);
    }, [isActive]);

    const updateCursorPosition = () => {
      if (!textareaRef.current) return;
      const text = textareaRef.current.value;
      const selStart = textareaRef.current.selectionStart;
      const lines = text.substring(0, selStart).split('\n');
      setCursorPos({
        line: lines.length,
        col: lines[lines.length - 1].length + 1,
      });
    };

    // Apply selection & scroll synchronously right after React commits textarea.value,
    // without calling focus() when textarea is already focused (prevents Android IME restart).
    useLayoutEffect(() => {
      const pending = pendingSelectionRef.current;
      const textarea = textareaRef.current;
      const hScroller = hScrollerRef.current;
      if (!pending || !textarea) return;
      pendingSelectionRef.current = null;

      if (pending.shouldFocusIfBlurred && document.activeElement !== textarea) {
        textarea.focus({ preventScroll: true });
      }
      textarea.setSelectionRange(pending.start, pending.end);
      textarea.scrollTop = pending.scrollTop;
      if (hScroller) {
        hScroller.scrollLeft = pending.scrollLeft;
      }
      handleVerticalScroll();
      ensureCaretXInView(pending.end);
      updateCursorPosition();
    }, [activeFile?.content]);

    const applyProgrammaticEdit = (
      updatedText: string,
      selStart: number,
      selEnd: number,
      shouldFocusIfBlurred: boolean = true
    ) => {
      const textarea = textareaRef.current;
      const hScroller = hScrollerRef.current;
      if (!textarea) return;
      const wasFocused = document.activeElement === textarea;
      pendingSelectionRef.current = {
        start: selStart,
        end: selEnd,
        scrollTop: textarea.scrollTop,
        scrollLeft: hScroller?.scrollLeft ?? 0,
        shouldFocusIfBlurred: shouldFocusIfBlurred && !wasFocused,
      };
      onChangeContent(updatedText);
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      const textarea = textareaRef.current;
      if (!textarea) return;

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        setShowSearch((prev) => !prev);
        return;
      }

      if (e.key === 'Tab') {
        e.preventDefault();
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const val = textarea.value;

        const updated = val.substring(0, start) + '    ' + val.substring(end);
        applyProgrammaticEdit(updated, start + 4, start + 4, false);
      } else if (e.key === 'Enter') {
        const start = textarea.selectionStart;
        const val = textarea.value;
        const currentLine = val.substring(0, start).split('\n').pop() || '';
        const match = currentLine.match(/^(\s*)/);
        let indent = match ? match[1] : '';

        if (currentLine.trim().endsWith(':')) {
          indent += '    ';
        }

        if (indent.length > 0) {
          e.preventDefault();
          const updated =
            val.substring(0, start) + '\n' + indent + val.substring(start);
          const pos = start + 1 + indent.length;
          applyProgrammaticEdit(updated, pos, pos, false);
        }
      }
    };

    useImperativeHandle(ref, () => ({
      insertTextAtCursor: (text: string, cursorOffset: number = 0) => {
        const textarea = textareaRef.current;
        if (!textarea) return;

        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const val = textarea.value;

        if (start !== end && ['()', '[]', '{}', '""', "''"].includes(text)) {
          const selected = val.substring(start, end);
          const openChar = text[0];
          const closeChar = text[1];
          const updated =
            val.substring(0, start) +
            openChar +
            selected +
            closeChar +
            val.substring(end);
          applyProgrammaticEdit(updated, start + 1, end + 1, true);
          return;
        }

        const updated = val.substring(0, start) + text + val.substring(end);
        const newPos = start + text.length - cursorOffset;
        applyProgrammaticEdit(updated, newPos, newPos, true);
      },

      indentSelection: () => {
        const textarea = textareaRef.current;
        if (!textarea) return;
        const start = textarea.selectionStart;
        const val = textarea.value;
        const updated = val.substring(0, start) + '    ' + val.substring(start);
        applyProgrammaticEdit(updated, start + 4, start + 4, true);
      },

      unindentSelection: () => {
        const textarea = textareaRef.current;
        if (!textarea) return;
        const start = textarea.selectionStart;
        const val = textarea.value;
        const lineStart = val.lastIndexOf('\n', start - 1) + 1;
        const lineChunk = val.substring(lineStart, lineStart + 4);
        if (lineChunk === '    ') {
          const updated =
            val.substring(0, lineStart) + val.substring(lineStart + 4);
          const newPos = Math.max(lineStart, start - 4);
          applyProgrammaticEdit(updated, newPos, newPos, true);
        }
      },

      openSearch: () => setShowSearch(true),
      blur: () => {
        if (document.activeElement === textareaRef.current) {
          textareaRef.current?.blur();
        }
      },
      getText: () => activeFile?.content || '',
      setText: (newText: string) => onChangeContent(newText),
    }));

    const lines = (activeFile?.content || '').split('\n');
    const totalLines = lines.length;

    // Compute pixel width of longest line + 84px right-edge tappable space
    const stageWidthPx = useMemo(() => {
      if (typeof document === 'undefined') return 0;
      if (!measureCanvasRef.current) {
        measureCanvasRef.current = document.createElement('canvas');
      }
      const ctx = measureCanvasRef.current.getContext('2d');
      if (!ctx) return 0;
      const computedFont = textareaRef.current
        ? window.getComputedStyle(textareaRef.current).font
        : '';
      ctx.font =
        computedFont ||
        `${fontSize}px "JetBrains Mono", "Fira Code", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;

      let maxCharLen = 0;
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].length > maxCharLen) maxCharLen = lines[i].length;
      }
      const threshold = Math.floor(maxCharLen * 0.7);
      let maxPx = 0;
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.length >= threshold) {
          const w = ctx.measureText(line.replace(/\t/g, '    ')).width;
          if (w > maxPx) maxPx = w;
        }
      }
      // 12px left padding + longest line width + 84px right breathing space
      return maxPx > 0 ? Math.ceil(12 + maxPx + 84) : 0;
    }, [activeFile?.content, fontSize, fontReadyTick]);

    // Tokenized syntax highlighted lines
    const highlightedCode = useMemo(() => {
      let inDocstring = false;
      return lines.map((l, idx) => {
        const res = highlightPythonLine(l, theme, inDocstring);
        inDocstring = res.endsInDocstring;
        return (
          <div key={idx} className="leading-[1.6]">
            {res.elements.length > 0 ? res.elements : ' '}
          </div>
        );
      });
    }, [activeFile?.content, theme]);

    const handleReplace = () => {
      if (!searchQuery) return;
      const updated = (activeFile?.content || '').replaceAll(
        searchQuery,
        replaceQuery
      );
      onChangeContent(updated);
    };

    return (
      <div
        className="flex-1 flex flex-col h-full overflow-hidden select-none"
        style={{ backgroundColor: theme.background }}
      >

        {/* Search & Replace Floating Bar */}
        {showSearch && (
          <div className="bg-[#0b1324] border-b border-cyan-950/70 p-2 flex flex-wrap items-center gap-2 text-xs">
            <input
              type="text"
              placeholder="Tìm kiếm..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-[#070b14] border border-slate-700 rounded-lg px-2.5 py-1 text-slate-200 focus:outline-none focus:border-cyan-400 font-mono text-xs"
            />
            <input
              type="text"
              placeholder="Thay thế bằng..."
              value={replaceQuery}
              onChange={(e) => setReplaceQuery(e.target.value)}
              className="bg-[#070b14] border border-slate-700 rounded-lg px-2.5 py-1 text-slate-200 focus:outline-none focus:border-cyan-400 font-mono text-xs"
            />
            <button
              onClick={handleReplace}
              className="px-2.5 py-1 bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold rounded-lg transition"
            >
              Thay thế
            </button>
            <button
              onClick={() => setShowSearch(false)}
              className="p-1 text-slate-400 hover:text-slate-200 ml-auto"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Editor Main Canvas (Line Numbers + Highlighted Textarea) */}
        <div className="flex-1 flex overflow-hidden relative">
          {/* Line Numbers Bar: muted gray on Dark Premium gutter so code syntax takes primary visual focus */}
          <div
            ref={lineNumbersRef}
            className="w-11 bg-[#080d17] text-slate-600 font-normal tabular-nums select-none py-3 pr-2.5 text-right font-mono border-r border-cyan-950/60 overflow-hidden shrink-0"
            style={{ fontSize: `${fontSize}px`, lineHeight: '1.6' }}
          >
            {Array.from({ length: Math.max(totalLines, 1) }).map((_, i) => {
              const lineNum = i + 1;
              const isErrorLine = highlightLine === lineNum;
              return (
                <div
                  key={lineNum}
                  className={`transition-colors ${
                    isErrorLine
                      ? 'text-rose-400 bg-rose-500/20 font-semibold rounded px-1'
                      : 'text-slate-600'
                  }`}
                >
                  {lineNum}
                </div>
              );
            })}
          </div>

          {/* Horizontal Scroller wraps a full-height stage wide enough for 80px right-edge breathing space */}
          <div
            ref={hScrollerRef}
            onScroll={handleHorizontalScroll}
            className="flex-1 overflow-x-auto overflow-y-hidden relative editor-h-scroll"
          >
            <div
              className="absolute inset-y-0 left-0 min-w-full"
              style={{ width: stageWidthPx > 0 ? `max(100%, ${stageWidthPx}px)` : '100%' }}
            >
              {/* Colorized Backdrop */}
              <div
                ref={backdropRef}
                aria-hidden="true"
                className="absolute inset-0 p-3 pr-20 font-mono leading-[1.6] whitespace-pre overflow-hidden pointer-events-none select-none"
                style={{
                  fontSize: `${fontSize}px`,
                  tabSize: 4,
                }}
              >
                {highlightedCode}
              </div>

              {/* Native full-height vertical-scrollable Textarea (restores caret & phone keyboard, zero right-edge scrollbar column) */}
              <textarea
                ref={textareaRef}
                value={activeFile?.content || ''}
                onChange={(e) => {
                  onChangeContent(e.target.value);
                  updateCursorPosition();
                  requestAnimationFrame(() => ensureCaretXInView());
                }}
                onKeyUp={() => {
                  updateCursorPosition();
                  ensureCaretXInView();
                }}
                onClick={updateCursorPosition}
                onScroll={handleVerticalScroll}
                onKeyDown={handleKeyDown}
                spellCheck={false}
                autoCapitalize="none"
                autoComplete="off"
                autoCorrect="off"
                className="absolute inset-0 w-full h-full bg-transparent text-transparent caret-amber-400 p-3 pr-20 outline-none resize-none overflow-y-auto overflow-x-hidden editor-v-scroll font-mono leading-[1.6] whitespace-pre tab-4 select-text selection:bg-amber-500/30 selection:text-white"
                style={{
                  fontSize: `${fontSize}px`,
                  tabSize: 4,
                }}
                placeholder="# Viết mã Python tại đây..."
              />
            </div>
          </div>
        </div>

        {/* Editor Status Bar */}
        <div className="bg-[#090e1a] border-t border-cyan-950/60 px-3 py-1 text-[11px] text-slate-400 flex items-center justify-between select-none shrink-0 font-mono">
          <div className="flex items-center space-x-2.5 min-w-0">
            <span className="text-slate-300 truncate max-w-[120px]">{activeFile?.name || 'main.py'}</span>
            <span className="text-slate-600">•</span>
            <span className="text-amber-400/90 tabular-nums">
              Ln {cursorPos.line}, Col {cursorPos.col}
            </span>
          </div>
          <div className="flex items-center space-x-2 shrink-0 text-slate-500">
            <span>{totalLines} dòng</span>
            <span>•</span>
            <span className="text-cyan-400/80">Python 3.11</span>
          </div>
        </div>
      </div>
    );
  }
);
