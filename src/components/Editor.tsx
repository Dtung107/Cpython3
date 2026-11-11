import React, { useRef, useState, useImperativeHandle, forwardRef, useMemo } from 'react';
import {
  FileCode,
  Plus,
  X,
  Search,
  Check,
  Copy,
} from 'lucide-react';
import { CodeFile } from '../types';
import { SyntaxTheme } from '../types/theme';

export interface EditorHandle {
  insertTextAtCursor: (text: string, cursorOffset?: number) => void;
  indentSelection: () => void;
  unindentSelection: () => void;
  getText: () => string;
  setText: (newText: string) => void;
}

interface EditorProps {
  files: CodeFile[];
  activeFileId: string;
  onSelectFile: (id: string) => void;
  onAddFile: () => void;
  onCloseFile: (id: string) => void;
  onChangeContent: (content: string) => void;
  highlightLine?: number;
  fontSize: number;
  theme: SyntaxTheme;
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
      files,
      activeFileId,
      onSelectFile,
      onAddFile,
      onCloseFile,
      onChangeContent,
      highlightLine,
      fontSize,
      theme,
    },
    ref
  ) => {
    const activeFile = files.find((f) => f.id === activeFileId) || files[0];
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const lineNumbersRef = useRef<HTMLDivElement>(null);
    const backdropRef = useRef<HTMLDivElement>(null);

    const [cursorPos, setCursorPos] = useState({ line: 1, col: 1 });
    const [showSearch, setShowSearch] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [replaceQuery, setReplaceQuery] = useState('');
    const [copied, setCopied] = useState(false);

    // Sync scroll
    const handleScroll = () => {
      if (textareaRef.current) {
        const top = textareaRef.current.scrollTop;
        const left = textareaRef.current.scrollLeft;
        if (lineNumbersRef.current) lineNumbersRef.current.scrollTop = top;
        if (backdropRef.current) {
          backdropRef.current.scrollTop = top;
          backdropRef.current.scrollLeft = left;
        }
      }
    };

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

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      const textarea = textareaRef.current;
      if (!textarea) return;

      if (e.key === 'Tab') {
        e.preventDefault();
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const val = textarea.value;

        const updated = val.substring(0, start) + '    ' + val.substring(end);
        onChangeContent(updated);

        setTimeout(() => {
          textarea.selectionStart = textarea.selectionEnd = start + 4;
          updateCursorPosition();
        }, 0);
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
          onChangeContent(updated);

          setTimeout(() => {
            textarea.selectionStart = textarea.selectionEnd =
              start + 1 + indent.length;
            updateCursorPosition();
          }, 0);
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
          onChangeContent(updated);
          setTimeout(() => {
            textarea.selectionStart = start + 1;
            textarea.selectionEnd = end + 1;
            textarea.focus();
            updateCursorPosition();
          }, 0);
          return;
        }

        const updated = val.substring(0, start) + text + val.substring(end);
        onChangeContent(updated);

        setTimeout(() => {
          const newPos = start + text.length - cursorOffset;
          textarea.selectionStart = textarea.selectionEnd = newPos;
          textarea.focus();
          updateCursorPosition();
        }, 0);
      },

      indentSelection: () => {
        const textarea = textareaRef.current;
        if (!textarea) return;
        const start = textarea.selectionStart;
        const val = textarea.value;
        const updated = val.substring(0, start) + '    ' + val.substring(start);
        onChangeContent(updated);
        setTimeout(() => {
          textarea.selectionStart = textarea.selectionEnd = start + 4;
          textarea.focus();
          updateCursorPosition();
        }, 0);
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
          onChangeContent(updated);
          setTimeout(() => {
            textarea.selectionStart = textarea.selectionEnd = Math.max(
              lineStart,
              start - 4
            );
            textarea.focus();
            updateCursorPosition();
          }, 0);
        }
      },

      getText: () => activeFile?.content || '',
      setText: (newText: string) => onChangeContent(newText),
    }));

    const lines = (activeFile?.content || '').split('\n');
    const totalLines = lines.length;

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

    const handleCopyAll = () => {
      navigator.clipboard.writeText(activeFile?.content || '');
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    };

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
        {/* File Tabs & Editor Controls */}
        <div className="flex items-center justify-between bg-[#131620] border-b border-slate-800/80 px-2 pt-1 shrink-0 select-none">
          <div className="flex items-center space-x-1 overflow-x-auto no-scrollbar max-w-[70vw]">
            {files.map((file) => {
              const isActive = file.id === activeFileId;
              return (
                <div
                  key={file.id}
                  onClick={() => onSelectFile(file.id)}
                  className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-t-lg text-xs font-mono cursor-pointer transition-all border-t-2 ${
                    isActive
                      ? 'bg-[#181d28] text-amber-300 font-bold border-amber-400 shadow-sm'
                      : 'bg-[#151822] text-slate-400 hover:text-slate-200 border-transparent hover:bg-[#1a1f2c]'
                  }`}
                >
                  <FileCode className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <span className="truncate max-w-[110px]">{file.name}</span>
                  {files.length > 1 && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onCloseFile(file.id);
                      }}
                      className="p-0.5 hover:text-rose-400 rounded transition"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
              );
            })}

            <button
              onClick={onAddFile}
              title="Thêm file mới (.py)"
              className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white transition"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="flex items-center space-x-1 text-slate-400 pb-1">
            <button
              onClick={() => setShowSearch(!showSearch)}
              title="Tìm kiếm & Thay thế"
              className={`p-1.5 rounded hover:bg-slate-800 transition ${
                showSearch ? 'text-amber-400 bg-slate-800' : ''
              }`}
            >
              <Search className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={handleCopyAll}
              title="Sao chép toàn bộ mã nguồn"
              className="p-1.5 rounded hover:bg-slate-800 transition"
            >
              {copied ? (
                <Check className="w-3.5 h-3.5 text-emerald-400" />
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )}
            </button>
          </div>
        </div>

        {/* Search & Replace Floating Bar */}
        {showSearch && (
          <div className="bg-[#1b202c] border-b border-slate-700/70 p-2 flex flex-wrap items-center gap-2 text-xs">
            <input
              type="text"
              placeholder="Tìm kiếm..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-[#0e1117] border border-slate-700 rounded px-2.5 py-1 text-slate-200 focus:outline-none focus:border-amber-400 font-mono text-xs"
            />
            <input
              type="text"
              placeholder="Thay thế bằng..."
              value={replaceQuery}
              onChange={(e) => setReplaceQuery(e.target.value)}
              className="bg-[#0e1117] border border-slate-700 rounded px-2.5 py-1 text-slate-200 focus:outline-none focus:border-amber-400 font-mono text-xs"
            />
            <button
              onClick={handleReplace}
              className="px-2.5 py-1 bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold rounded transition"
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
          {/* Line Numbers Bar (Screenshot 2: Yellow line numbers) */}
          <div
            ref={lineNumbersRef}
            className="w-12 bg-[#0e1017] text-amber-400 font-bold select-none py-3 pr-2.5 text-right font-mono border-r border-slate-800/80 overflow-hidden shrink-0"
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
                      ? 'text-rose-400 bg-rose-500/20 rounded px-1'
                      : 'text-amber-400'
                  }`}
                >
                  {lineNum}
                </div>
              );
            })}
          </div>

          {/* Syntax Highlighted Backdrop + Real-time Interactive Textarea */}
          <div className="flex-1 relative overflow-hidden">
            {/* Colorized Backdrop */}
            <div
              ref={backdropRef}
              className="absolute inset-0 p-3 font-mono leading-[1.6] whitespace-pre overflow-hidden pointer-events-none select-none"
              style={{
                fontSize: `${fontSize}px`,
                tabSize: 4,
              }}
            >
              {highlightedCode}
            </div>

            {/* Transparent Textarea for seamless typing, cursor, and selection */}
            <textarea
              ref={textareaRef}
              value={activeFile?.content || ''}
              onChange={(e) => {
                onChangeContent(e.target.value);
                updateCursorPosition();
              }}
              onKeyUp={updateCursorPosition}
              onClick={updateCursorPosition}
              onScroll={handleScroll}
              onKeyDown={handleKeyDown}
              spellCheck={false}
              autoCapitalize="none"
              autoComplete="off"
              autoCorrect="off"
              className="absolute inset-0 w-full h-full bg-transparent text-transparent caret-amber-400 p-3 outline-none resize-none font-mono leading-[1.6] whitespace-pre tab-4 select-text selection:bg-amber-500/30 selection:text-white"
              style={{
                fontSize: `${fontSize}px`,
                tabSize: 4,
              }}
              placeholder="# Viết mã Python tại đây..."
            />
          </div>
        </div>

        {/* Editor Status Bar */}
        <div className="bg-[#0f1118] border-t border-slate-800/80 px-3 py-1 text-[11px] text-slate-400 flex items-center justify-between select-none shrink-0 font-mono">
          <div className="flex items-center space-x-3">
            <span className="text-amber-400 font-bold">
              Ln {cursorPos.line}, Col {cursorPos.col}
            </span>
            <span>{totalLines} dòng</span>
          </div>
          <div className="flex items-center space-x-2">
            <span>UTF-8</span>
            <span className="px-1.5 py-0.2 rounded bg-slate-800 text-amber-400 text-[10px] font-bold">
              Python 3.10
            </span>
          </div>
        </div>
      </div>
    );
  }
);
