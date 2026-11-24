import React, { useState, useRef, useEffect } from 'react';
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
} from 'lucide-react';
import { ExecutionResult } from '../types';

interface TerminalProps {
  result: ExecutionResult | null;
  isRunning: boolean;
  onRun: (customInputs?: string[]) => void;
  onClear: () => void;
  onDebugAI: () => void;
  activeEngine: string;
  onSendInput: (input: string) => void;
  isWaitingInput?: boolean;
  inputPromptText?: string;
  preloadedStdin: string;
  onChangePreloadedStdin: (val: string) => void;
}

export const Terminal: React.FC<TerminalProps> = ({
  result,
  isRunning,
  onRun,
  onClear,
  onDebugAI,
  activeEngine,
  onSendInput,
  isWaitingInput,
  inputPromptText,
  preloadedStdin,
  onChangePreloadedStdin,
}) => {
  const [inputValue, setInputValue] = useState('');
  const [showStdinModal, setShowStdinModal] = useState(false);
  const [copied, setCopied] = useState(false);
  const [selectedPlot, setSelectedPlot] = useState<string | null>(null);
  const [dismissedError, setDismissedError] = useState(false);
  const terminalEndRef = useRef<HTMLDivElement>(null);
  const inputFieldRef = useRef<HTMLInputElement>(null);

  // Auto-scroll when output changes
  useEffect(() => {
    terminalEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [result?.stdout, result?.stderr, isRunning, isWaitingInput]);

  // Focus bottom input when waiting for user input
  useEffect(() => {
    if (isWaitingInput) {
      inputFieldRef.current?.focus();
    }
  }, [isWaitingInput]);

  // Reset dismissed state whenever a new error occurs
  useEffect(() => {
    if (result?.stderr && !isWaitingInput) {
      setDismissedError(false);
    }
  }, [result?.stderr, isWaitingInput]);

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

  const lineCount = ((result?.stdout || '') + (result?.stderr || ''))
    .split('\n')
    .filter((l) => l.length > 0).length || (isWaitingInput ? 1 : 0);

  const hasError =
    !isWaitingInput &&
    ((result?.exitCode !== undefined && result.exitCode !== 0 && !!result?.stderr?.trim() && result.stderr.trim() !== 'PythonError') ||
      (!!result?.stderr && result.stderr.trim() !== '' && result.stderr.trim() !== 'PythonError'));

  return (
    <div className="flex-1 flex flex-col h-full bg-[#0a0d14] text-slate-100 select-text font-mono relative overflow-hidden">
      {/* Subheader matching Screenshot 1 (clean, unbloated) */}
      <div className="flex items-center justify-between px-3 py-2 bg-[#121622] border-b border-slate-800 text-xs shrink-0 select-none">
        {/* Left: Terminal status indicator + output line count */}
        <div className="flex items-center space-x-2">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
          <span className="font-semibold text-slate-200">Terminal</span>
          <span className="text-[11px] text-slate-400">
            {lineCount} dòng xuất
          </span>
          <span className="px-2 py-0.5 rounded-full text-[10px] bg-sky-500/20 text-sky-300 font-bold border border-sky-500/30">
            {activeEngine.includes('CPython') ? '• CPYTHON' : '• WASM'}
          </span>
        </div>

        {/* Right: STDIN dropdown button + Copy + Clear + Rerun icon button */}
        <div className="flex items-center space-x-1.5">
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

          {/* Rerun Button (Screenshot 1) */}
          <button
            onClick={() => onRun()}
            disabled={isRunning}
            title="Chạy lại chương trình"
            className="p-1.5 rounded bg-[#1c2232] hover:bg-[#252c40] text-emerald-400 hover:text-emerald-300 transition disabled:opacity-40"
          >
            <RotateCw className={`w-3.5 h-3.5 ${isRunning ? 'animate-spin' : ''}`} />
          </button>
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
      <div className="flex-1 overflow-y-auto p-3.5 leading-relaxed space-y-2 select-text text-[13px]">
        {/* Startup / Placeholder Banner (Screenshot 1) */}
        {!result?.stdout && !result?.stderr && !isRunning && !isWaitingInput && (
          <div className="text-slate-400 text-xs italic">
            Nhấn nút <strong className="text-amber-400 font-bold">RUN</strong> để bắt đầu thực thi mã Python...
          </div>
        )}

        {/* Stdout Output */}
        {result?.stdout && (
          <pre className="whitespace-pre-wrap break-words text-slate-100 font-mono leading-relaxed">
            {result.stdout}
            {isWaitingInput && (
              <span className="inline-block w-2 h-4 bg-amber-400 align-middle ml-1 animate-pulse" />
            )}
          </pre>
        )}

        {/* Fallback prompt display if waiting for input with no stdout captured */}
        {isWaitingInput && !result?.stdout && (
          <div className="text-slate-100 font-mono text-[13px] leading-relaxed flex items-center">
            <span>{inputPromptText || 'input():'}</span>
            <span className="inline-block w-2 h-4 bg-amber-400 align-middle ml-1 animate-pulse" />
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
          <div className="text-rose-400 font-mono text-xs whitespace-pre-wrap break-words border-l-2 border-rose-500/80 pl-2.5 my-2 py-0.5 bg-rose-950/20 rounded-r-lg">
            {result.stderr}
          </div>
        )}

        {/* Running status indicator */}
        {isRunning && (
          <div className="flex items-center space-x-2 text-amber-400 py-1">
            <div className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-ping" />
            <span className="text-xs">Đang thực thi mã nguồn Python...</span>
          </div>
        )}

        <div ref={terminalEndRef} />
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
      <div className="p-2.5 bg-[#12151f] border-t border-slate-800 shrink-0">
        {isWaitingInput && (
          <div className="flex items-center justify-between pb-1.5 px-1 text-[11px] text-amber-300 font-sans">
            <span className="flex items-center space-x-1.5 font-medium">
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
              <span>Đang chờ nhập dữ liệu cho chương trình</span>
            </span>
            <span className="text-[10px] text-slate-400">Nhập xong nhấn Gửi ✈</span>
          </div>
        )}
        <form onSubmit={handleInputSubmit} className="flex items-center space-x-2">
          {/* >>> prefix in bold yellow */}
          <span className="text-amber-400 font-bold font-mono text-base shrink-0 select-none">
            &gt;&gt;&gt;
          </span>

          {/* Yellow bordered input box matching Screenshot 1 */}
          <div className="flex-1 relative">
            <input
              ref={inputFieldRef}
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder={isWaitingInput && inputPromptText ? `Đang chờ: ${inputPromptText}` : "Nhập lệnh hoặc tham số vào đây.."}
              className={`w-full bg-[#0a0d14] rounded-xl px-3.5 py-2 text-xs sm:text-sm text-slate-100 placeholder-slate-500 focus:outline-none font-mono shadow-inner transition ${
                isWaitingInput
                  ? 'border-2 border-amber-400 ring-2 ring-amber-400/20'
                  : 'border-2 border-amber-400/90 focus:ring-1 focus:ring-amber-400'
              }`}
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
  );
};
