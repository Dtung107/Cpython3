import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  Send,
  RotateCw,
  Sparkles,
  ClipboardList,
  ChevronDown,
  Trash2,
  Copy,
  Check,
  Maximize2,
  Download,
  AlertTriangle,
  Image as ImageIcon,
  X,
  Square,
  Eraser,
} from 'lucide-react';
import { ExecutionResult } from '../types';
import {
  TerminalTheme,
  DEFAULT_TERMINAL_THEME,
  normalizeTerminalTheme,
  hexToRgba,
} from '../types/theme';

interface TerminalProps {
  result: ExecutionResult | null;
  isRunning: boolean;
  onRun: (customInputs?: string[]) => void;
  onStop?: () => void;
  onClear: () => void;
  onDebugAI: () => void;
  activeEngine: string;
  onSendInput: (input: string) => void;
  isWaitingInput?: boolean;
  inputPromptText?: string;
  preloadedStdin: string;
  onChangePreloadedStdin: (val: string) => void;
  statusMessage?: string | null;
  terminalTheme?: TerminalTheme;
  autoClearOnRun?: boolean;
  onToggleAutoClear?: () => void;
  isActive?: boolean;
}

export const Terminal: React.FC<TerminalProps> = ({
  result,
  isRunning,
  onRun,
  onStop,
  onClear,
  onDebugAI,
  activeEngine,
  onSendInput,
  isWaitingInput,
  inputPromptText,
  preloadedStdin,
  onChangePreloadedStdin,
  statusMessage,
  terminalTheme,
  autoClearOnRun = true,
  onToggleAutoClear,
  isActive = true,
}) => {
  const activeTheme = normalizeTerminalTheme(terminalTheme || DEFAULT_TERMINAL_THEME);
  const [inputValue, setInputValue] = useState('');
  const [showStdinModal, setShowStdinModal] = useState(false);
  const [copied, setCopied] = useState(false);
  const [selectedPlot, setSelectedPlot] = useState<string | null>(null);
  const [dismissedError, setDismissedError] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const inputFieldRef = useRef<HTMLInputElement>(null);
  const scrollRafRef = useRef<number | null>(null);

  // Smooth, zero-lag auto-scroll batched to animation frame (only when visible)
  useEffect(() => {
    if (!isActive) {
      if (document.activeElement === inputFieldRef.current) {
        inputFieldRef.current?.blur();
      }
      return;
    }
    if (scrollRafRef.current !== null) return;
    scrollRafRef.current = requestAnimationFrame(() => {
      scrollRafRef.current = null;
      const el = scrollContainerRef.current;
      if (el) {
        el.scrollTop = el.scrollHeight;
      }
    });
    return () => {
      if (scrollRafRef.current !== null) {
        cancelAnimationFrame(scrollRafRef.current);
        scrollRafRef.current = null;
      }
    };
  }, [isActive, result?.stdout, result?.stderr, isRunning, isWaitingInput, statusMessage]);

  // Focus bottom input when waiting for user input and Terminal is visible
  useEffect(() => {
    if (isActive && isWaitingInput) {
      const timer = window.setTimeout(() => {
        inputFieldRef.current?.focus();
      }, 60);
      return () => window.clearTimeout(timer);
    }
  }, [isActive, isWaitingInput]);

  // Reset dismissed state whenever a new error occurs
  useEffect(() => {
    if (result?.stderr && !isWaitingInput) {
      setDismissedError(false);
    }
  }, [result?.stderr, isWaitingInput]);

  // Reset transient UI state when terminal is cleared
  useEffect(() => {
    if (!result) {
      setSelectedPlot(null);
      setDismissedError(false);
      setInputValue('');
    }
  }, [result]);

  const handleInputSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim() && !isWaitingInput) return;
    onSendInput(inputValue);
    setInputValue('');
  };

  const handleCopyOutput = () => {
    const text = `${result?.stdout || ''}\n${result?.stderr || ''}`.trim();
    if (text) {
      navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const MAX_RENDER_CHARS = 150000;

  const { displayedStdout, truncatedKb } = useMemo(() => {
    const raw = result?.stdout || '';
    if (raw.length <= MAX_RENDER_CHARS) {
      return { displayedStdout: raw, truncatedKb: 0 };
    }
    const startIdx = raw.length - MAX_RENDER_CHARS;
    const nextNewline = raw.indexOf('\n', startIdx);
    const sliceStart = nextNewline !== -1 && nextNewline - startIdx < 4096 ? nextNewline + 1 : startIdx;
    return {
      displayedStdout: raw.slice(sliceStart),
      truncatedKb: Math.max(1, Math.round(sliceStart / 1024)),
    };
  }, [result?.stdout]);

  const lineCount = useMemo(() => {
    const countNonEmpty = (text: string): number => {
      if (!text) return 0;
      let count = 0;
      let lineStart = 0;
      const len = text.length;
      for (let i = 0; i < len; i++) {
        if (text.charCodeAt(i) === 10) {
          if (i > lineStart) count++;
          lineStart = i + 1;
        }
      }
      if (len > lineStart) count++;
      return count;
    };
    const total = countNonEmpty(result?.stdout || '') + countNonEmpty(result?.stderr || '');
    return total || (isWaitingInput ? 1 : 0);
  }, [result?.stdout, result?.stderr, isWaitingInput]);

  const hasError =
    !isWaitingInput &&
    ((result?.exitCode !== undefined && result.exitCode !== 0 && !!result?.stderr?.trim() && result.stderr.trim() !== 'PythonError') ||
      (!!result?.stderr && result.stderr.trim() !== '' && result.stderr.trim() !== 'PythonError'));

  return (
    <div
      className="flex-1 flex flex-col h-full select-text font-mono relative overflow-hidden"
      style={
        {
          background:
            activeTheme.backgroundOpacity < 1
              ? 'radial-gradient(circle at 18% 18%, rgba(14, 165, 233, 0.22) 0%, transparent 48%), radial-gradient(circle at 82% 78%, rgba(168, 85, 247, 0.18) 0%, transparent 48%), #070b14'
              : '#070b14',
          color: activeTheme.foreground,
          '--term-hl-bg': activeTheme.highlightBg,
          '--term-hl-fg': activeTheme.highlightText,
        } as React.CSSProperties
      }
    >
      <div
        className="flex-1 flex flex-col h-full overflow-hidden"
        style={{
          backgroundColor: hexToRgba(activeTheme.background, activeTheme.backgroundOpacity),
          backdropFilter: activeTheme.backgroundOpacity < 1 ? 'blur(8px)' : undefined,
        }}
      >
      {/* Subheader matching Screenshot 1 (clean, unbloated) */}
      <div
        className="flex flex-wrap items-center justify-between gap-1.5 px-3 py-2 border-b border-slate-800/80 text-xs shrink-0 select-none"
        style={{
          backgroundColor: hexToRgba(
            activeTheme.background,
            Math.min(1, activeTheme.backgroundOpacity + 0.08)
          ),
        }}
      >
        {/* Left: Terminal status indicator + output line count */}
        <div className="flex items-center space-x-2">
          <span
            className="w-2.5 h-2.5 rounded-full animate-pulse"
            style={{ backgroundColor: activeTheme.promptColor }}
          />
          <span className="font-semibold" style={{ color: activeTheme.foreground }}>
            Terminal
          </span>
          <span className="text-[11px] opacity-65" style={{ color: activeTheme.foreground }}>
            {lineCount} dòng xuất
          </span>
          <span
            className="px-2 py-0.5 rounded-full text-[10px] font-bold border border-white/15"
            style={{
              backgroundColor: activeTheme.highlightBg,
              color: activeTheme.highlightText,
            }}
          >
            {activeEngine.includes('CPython') ? '• CPYTHON' : '• WASM'}
          </span>
        </div>

        {/* Right: Auto-clear toggle + STDIN dropdown + Copy + Clear + Rerun icon button */}
        <div className="flex items-center space-x-1.5">
          {onToggleAutoClear && (
            <button
              type="button"
              role="switch"
              aria-checked={autoClearOnRun}
              onClick={onToggleAutoClear}
              title={
                autoClearOnRun
                  ? 'Tự động xóa kết quả cũ khi chạy lại (Đang bật)'
                  : 'Giữ lại kết quả cũ giữa các lần chạy (Đang tắt)'
              }
              className={`flex items-center space-x-1.5 px-2 py-1 rounded border text-[11px] font-semibold transition active:scale-95 ${
                autoClearOnRun
                  ? 'bg-emerald-950/60 border-emerald-500/50 text-emerald-200 hover:bg-emerald-900/60'
                  : 'bg-[#1c2232] border-slate-700/80 text-slate-400 hover:text-slate-200 hover:bg-[#252c40]'
              }`}
            >
              <Eraser
                className={`w-3.5 h-3.5 ${
                  autoClearOnRun ? 'text-emerald-400' : 'text-slate-500'
                }`}
              />
              <span>Tự xóa</span>
              <span
                className={`w-6 h-3.5 rounded-full p-0.5 flex items-center transition-colors ${
                  autoClearOnRun ? 'bg-emerald-500 justify-end' : 'bg-slate-600 justify-start'
                }`}
              >
                <span className="w-2.5 h-2.5 rounded-full bg-white shadow-xs" />
              </span>
            </button>
          )}

          {/* STDIN Button (Screenshot 1) */}
          <button
            onClick={() => setShowStdinModal(!showStdinModal)}
            title="Cài đặt đầu vào bàn phím STDIN"
            className="flex items-center space-x-1 px-2.5 py-1 rounded bg-[#1c2232] hover:bg-[#252c40] border border-slate-700/80 text-amber-300 text-xs font-semibold shadow-sm transition active:scale-95"
          >
            <ClipboardList className="w-3.5 h-3.5 text-amber-400" />
            <span>STDIN</span>
            <ChevronDown className="w-3 h-3 text-slate-400" />
          </button>

          {/* Copy Button */}
          <button
            onClick={handleCopyOutput}
            title="Sao chép kết quả"
            className="p-1.5 rounded bg-[#1c2232] hover:bg-[#252c40] text-slate-400 hover:text-white transition"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
          </button>

          {/* Clear Button */}
          <button
            onClick={onClear}
            title="Xóa màn hình"
            className="p-1.5 rounded bg-[#1c2232] hover:bg-rose-950/40 text-slate-400 hover:text-rose-400 transition"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>

          {/* Rerun / Stop Button */}
          {isRunning && onStop ? (
            <button
              onClick={onStop}
              title="Dừng chạy"
              className="px-2 py-1 rounded bg-rose-600/90 hover:bg-rose-500 text-white text-[11px] font-bold flex items-center space-x-1 transition active:scale-95"
            >
              <Square className="w-3 h-3 fill-current" />
              <span>Dừng</span>
            </button>
          ) : (
            <button
              onClick={() => onRun()}
              disabled={isRunning}
              title="Chạy lại chương trình"
              className="p-1.5 rounded bg-[#1c2232] hover:bg-[#252c40] text-emerald-400 hover:text-emerald-300 transition disabled:opacity-40"
            >
              <RotateCw className={`w-3.5 h-3.5 ${isRunning ? 'animate-spin' : ''}`} />
            </button>
          )}
        </div>
      </div>

      {/* STDIN Configuration Modal / Dropdown */}
      {showStdinModal && (
        <div className="bg-[#181d2a] border-b border-slate-700 p-3 text-xs space-y-2 animate-in fade-in duration-150">
          <div className="flex items-center justify-between">
            <span className="font-bold text-amber-300">
              Nhập trước dữ liệu cho các lệnh input() (STDIN)
            </span>
            <button
              onClick={() => setShowStdinModal(false)}
              className="text-slate-400 hover:text-white text-xs"
            >
              Đóng
            </button>
          </div>
          <p className="text-[11px] text-slate-400">
            Mỗi dòng sẽ tương ứng với một lần gọi <code className="text-amber-400">input()</code> trong mã nguồn Python:
          </p>
          <textarea
            value={preloadedStdin}
            onChange={(e) => onChangePreloadedStdin(e.target.value)}
            placeholder="Dòng 1: 15&#10;Dòng 2: 25&#10;Dòng 3: +"
            rows={3}
            className="w-full bg-[#0d1017] border border-slate-700 rounded-lg p-2 text-slate-100 font-mono text-xs focus:outline-none focus:border-amber-400"
          />
          <div className="flex justify-end space-x-2">
            <button
              onClick={() => onChangePreloadedStdin('')}
              className="px-2.5 py-1 rounded bg-slate-800 text-slate-400 hover:text-white"
            >
              Xóa trắng
            </button>
            <button
              onClick={() => {
                setShowStdinModal(false);
                onRun(preloadedStdin.split('\n'));
              }}
              className="px-3 py-1 rounded bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold"
            >
              Áp dụng &amp; Chạy
            </button>
          </div>
        </div>
      )}

      {/* Terminal Main Output Screen */}
      <div
        ref={scrollContainerRef}
        className="terminal-selectable flex-1 overflow-y-auto p-3.5 leading-relaxed space-y-2 select-text text-[13px]"
        style={{ color: activeTheme.foreground }}
      >
        {/* Startup / Placeholder Banner (Screenshot 1) */}
        {!result?.stdout && !result?.stderr && !isRunning && !isWaitingInput && (
          <div className="text-xs italic opacity-75" style={{ color: activeTheme.foreground }}>
            Nhấn nút{' '}
            <strong
              className="font-bold px-1.5 py-0.5 rounded not-italic"
              style={{
                backgroundColor: activeTheme.highlightBg,
                color: activeTheme.highlightText,
              }}
            >
              RUN
            </strong>{' '}
            để bắt đầu thực thi mã Python...
          </div>
        )}

        {/* Stdout Output */}
        {displayedStdout && (
          <>
            {truncatedKb > 0 && (
              <div className="text-[11px] px-2.5 py-1 rounded-lg bg-slate-800/75 text-slate-300 border border-slate-700/70">
                Đã thu gọn {truncatedKb} KB đầu để Terminal luôn mượt — nhấn nút Sao chép ở trên để lấy toàn bộ kết quả.
              </div>
            )}
            <pre
              className="whitespace-pre-wrap break-words font-mono leading-relaxed"
              style={{ color: activeTheme.foreground }}
            >
              {displayedStdout}
              {isWaitingInput && (
                <span
                  className="inline-block w-2 h-4 align-middle ml-1 animate-pulse"
                  style={{ backgroundColor: activeTheme.promptColor }}
                />
              )}
            </pre>
          </>
        )}

        {/* Fallback prompt display if waiting for input with no stdout captured */}
        {isWaitingInput && !result?.stdout && (
          <div
            className="font-mono text-[13px] leading-relaxed flex items-center"
            style={{ color: activeTheme.foreground }}
          >
            <span>{inputPromptText || 'input():'}</span>
            <span
              className="inline-block w-2 h-4 align-middle ml-1 animate-pulse"
              style={{ backgroundColor: activeTheme.promptColor }}
            />
          </div>
        )}

        {/* Matplotlib Plots Preview */}
        {result?.plotImages && result.plotImages.length > 0 && (
          <div className="my-2 p-2.5 bg-[#141824] rounded-xl border border-slate-700">
            <div className="flex items-center justify-between pb-1 mb-2 border-b border-slate-800 text-xs text-sky-400">
              <span className="flex items-center space-x-1.5 font-bold">
                <ImageIcon className="w-4 h-4" />
                <span>Biểu đồ Matplotlib</span>
              </span>
              <span className="text-[11px] text-slate-400">
                {result.plotImages.length} đồ thị
              </span>
            </div>
            <div className="space-y-2">
              {result.plotImages.map((b64, idx) => (
                <div key={idx} className="rounded-lg overflow-hidden bg-slate-900 border border-slate-800 flex flex-col items-center">
                  <img
                    src={`data:image/png;base64,${b64}`}
                    alt={`Plot ${idx + 1}`}
                    className="max-h-[300px] w-auto object-contain cursor-pointer"
                    onClick={() => setSelectedPlot(b64)}
                  />
                  <div className="w-full flex justify-end space-x-2 p-1.5 bg-[#10131d] text-xs">
                    <button
                      onClick={() => setSelectedPlot(b64)}
                      className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 flex items-center space-x-1 text-[11px]"
                    >
                      <Maximize2 className="w-3 h-3" />
                      <span>Xem lớn</span>
                    </button>
                    <a
                      href={`data:image/png;base64,${b64}`}
                      download={`plot_${idx + 1}.png`}
                      className="px-2 py-0.5 rounded bg-sky-600 hover:bg-sky-500 text-white flex items-center space-x-1 text-[11px]"
                    >
                      <Download className="w-3 h-3" />
                      <span>Tải về</span>
                    </a>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Clean Stderr / Error Traceback in terminal monospace format (No giant container blocking the screen) */}
        {result?.stderr && !isWaitingInput && result.stderr.trim() !== 'PythonError' && (
          <div
            className="font-mono text-xs whitespace-pre-wrap break-words border-l-2 pl-2.5 my-2 py-1 rounded-r-lg"
            style={{
              color: activeTheme.errorColor,
              borderColor: activeTheme.errorColor,
              backgroundColor: hexToRgba(activeTheme.errorColor, 0.14),
            }}
          >
            {result.stderr}
          </div>
        )}

        {/* Running status indicator */}
        {isRunning && (
          <div className="flex items-center space-x-2 py-1" style={{ color: activeTheme.promptColor }}>
            <div
              className="w-2.5 h-2.5 rounded-full animate-ping"
              style={{ backgroundColor: activeTheme.promptColor }}
            />
            <span className="text-xs">
              {statusMessage || 'Đang thực thi mã nguồn Python...'}
            </span>
          </div>
        )}
      </div>

      {/* Compact Floating Dismissable Error Pill - ONLY appears when there is a real error */}
      {hasError && !dismissedError && (
        <div className="mx-3 mb-2 p-2 rounded-xl bg-rose-950/95 border border-rose-500/70 text-slate-100 flex items-center justify-between shadow-2xl backdrop-blur-md animate-in slide-in-from-bottom-2 shrink-0 z-20">
          <div className="flex items-center space-x-2 min-w-0 pr-2">
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 animate-bounce" />
            <span className="text-xs font-semibold text-rose-200 truncate">
              Phát hiện lỗi cú pháp / thực thi
            </span>
          </div>
          <div className="flex items-center space-x-1.5 shrink-0">
            <button
              onClick={onDebugAI}
              className="px-2.5 py-1 rounded-lg bg-rose-600 hover:bg-rose-500 active:scale-95 text-white text-xs font-bold flex items-center space-x-1 shadow transition"
            >
              <Sparkles className="w-3.5 h-3.5 text-yellow-300" />
              <span>Gỡ lỗi AI</span>
            </button>
            <button
              onClick={() => setDismissedError(true)}
              title="Tắt thanh gỡ lỗi để giải phóng không gian màn hình"
              className="p-1 rounded-lg hover:bg-rose-900/60 text-rose-300 hover:text-white transition"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Bottom Input Window matching Screenshot 1: >>> [ Nhập lệnh hoặc tham số vào đây.. ] [ Gửi ✈ ] */}
      <div
        className="p-2.5 border-t border-slate-800/80 shrink-0"
        style={{
          backgroundColor: hexToRgba(
            activeTheme.background,
            Math.min(1, activeTheme.backgroundOpacity + 0.06)
          ),
        }}
      >
        {isWaitingInput && (
          <div
            className="flex items-center justify-between pb-1.5 px-1 text-[11px] font-sans"
            style={{ color: activeTheme.promptColor }}
          >
            <span className="flex items-center space-x-1.5 font-medium">
              <span
                className="w-2 h-2 rounded-full animate-ping"
                style={{ backgroundColor: activeTheme.promptColor }}
              />
              <span>Đang chờ nhập dữ liệu cho chương trình</span>
            </span>
            <span className="text-[10px] opacity-75" style={{ color: activeTheme.foreground }}>
              Nhập xong nhấn Gửi ✈
            </span>
          </div>
        )}
        <form onSubmit={handleInputSubmit} className="flex items-center space-x-2">
          {/* >>> prefix in bold promptColor */}
          <span
            className="font-bold font-mono text-base shrink-0 select-none"
            style={{ color: activeTheme.promptColor }}
          >
            &gt;&gt;&gt;
          </span>

          {/* Custom bordered input box */}
          <div className="flex-1 relative">
            <input
              ref={inputFieldRef}
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder={isWaitingInput && inputPromptText ? `Đang chờ: ${inputPromptText}` : "Nhập lệnh hoặc tham số vào đây.."}
              className={`w-full rounded-xl px-3.5 py-2 text-xs sm:text-sm placeholder-slate-500 focus:outline-none font-mono shadow-inner transition ${
                isWaitingInput ? 'border-2 ring-2 ring-white/10' : 'border-2'
              }`}
              style={{
                backgroundColor: hexToRgba(
                  activeTheme.background,
                  Math.min(1, activeTheme.backgroundOpacity + 0.1)
                ),
                color: activeTheme.foreground,
                borderColor: activeTheme.promptColor,
              }}
            />
          </div>

          {/* Gửi ✈ button matching Screenshot 1 */}
          <button
            type="submit"
            className="px-4 py-2 bg-[#252c3d] hover:bg-[#2f384d] active:bg-amber-500 active:text-slate-950 text-slate-200 font-semibold rounded-xl text-xs sm:text-sm flex items-center space-x-1.5 border border-slate-700/80 transition shadow active:scale-95 shrink-0"
          >
            <span>Gửi</span>
            <Send className="w-3.5 h-3.5" />
          </button>
        </form>
      </div>

      {/* Zoomed Plot Modal */}
      {selectedPlot && (
        <div
          className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm flex flex-col items-center justify-center p-4"
          onClick={() => setSelectedPlot(null)}
        >
          <div
            className="max-w-4xl max-h-[90vh] bg-[#161a23] rounded-2xl overflow-hidden p-3 border border-slate-700 flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-700">
              <span className="text-sm font-semibold text-slate-200">Biểu đồ Matplotlib phóng to</span>
              <button
                onClick={() => setSelectedPlot(null)}
                className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs"
              >
                Đóng
              </button>
            </div>
            <img
              src={`data:image/png;base64,${selectedPlot}`}
              alt="Zoomed Plot"
              className="max-h-[75vh] object-contain rounded-lg"
            />
          </div>
        </div>
      )}
      </div>
    </div>
  );
};
