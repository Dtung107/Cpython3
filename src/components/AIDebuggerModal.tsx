import React, { useState } from 'react';
import {
  Sparkles,
  X,
  Check,
  Copy,
  AlertCircle,
  Lightbulb,
  ArrowRight,
  Code2,
  BookOpen,
  RotateCw,
  FileCheck,
} from 'lucide-react';
import { AIDebugResult } from '../types';

interface AIDebuggerModalProps {
  isOpen: boolean;
  onClose: () => void;
  isLoading: boolean;
  debugResult: AIDebugResult | null;
  onApplyFix: (fixedCode: string) => void;
  onRetry: () => void;
  explanationText?: string;
  onAskExplain: () => void;
  isExplaining: boolean;
}

export const AIDebuggerModal: React.FC<AIDebuggerModalProps> = ({
  isOpen,
  onClose,
  isLoading,
  debugResult,
  onApplyFix,
  onRetry,
  explanationText,
  onAskExplain,
  isExplaining,
}) => {
  const [activeTab, setActiveTab] = useState<'debug' | 'explain'>('debug');
  const [copied, setCopied] = useState(false);
  const [applied, setApplied] = useState(false);

  if (!isOpen) return null;

  const handleCopyFixed = () => {
    if (debugResult?.fixedCode) {
      navigator.clipboard.writeText(debugResult.fixedCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleApply = () => {
    if (debugResult?.fixedCode) {
      onApplyFix(debugResult.fixedCode);
      setApplied(true);
      setTimeout(() => {
        setApplied(false);
        onClose();
      }, 800);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 animate-in fade-in duration-200">
      <div
        className="w-full max-w-3xl max-h-[92vh] bg-[#161a24] border border-slate-700/80 rounded-2xl shadow-2xl flex flex-col overflow-hidden text-slate-100"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-4 py-3 bg-[#1d2230] border-b border-slate-700/80 flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-2">
            <div className="p-1.5 rounded-lg bg-gradient-to-r from-sky-500 to-indigo-600 text-white shadow">
              <Sparkles className="w-4 h-4 text-yellow-300" />
            </div>
            <div>
              <h2 className="font-bold text-sm sm:text-base text-slate-100 flex items-center space-x-2">
                <span>Trợ Lý Gỡ Lỗi AI Gemini</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] bg-sky-500/20 text-sky-300 border border-sky-500/30 font-medium">
                  gemini-3.8-flash
                </span>
              </h2>
              <p className="text-[11px] text-slate-400">
                Phân tích lỗi cú pháp, logic & tự động sửa mã bằng tiếng Việt
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-1">
            <button
              onClick={onRetry}
              disabled={isLoading}
              title="Phân tích lại"
              className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-white transition disabled:opacity-40"
            >
              <RotateCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-white transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Tab switch */}
        <div className="flex items-center bg-[#13161f] px-4 pt-2 border-b border-slate-800 text-xs shrink-0">
          <button
            onClick={() => setActiveTab('debug')}
            className={`pb-2 px-3 font-semibold border-b-2 flex items-center space-x-1.5 transition ${
              activeTab === 'debug'
                ? 'border-sky-500 text-sky-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <AlertCircle className="w-3.5 h-3.5" />
            <span>Kết Quả Gỡ Lỗi</span>
          </button>
          <button
            onClick={() => {
              setActiveTab('explain');
              if (!explanationText && !isExplaining) {
                onAskExplain();
              }
            }}
            className={`pb-2 px-3 font-semibold border-b-2 flex items-center space-x-1.5 transition ${
              activeTab === 'explain'
                ? 'border-indigo-500 text-indigo-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>Giải Thích Mã Nguồn</span>
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {isLoading ? (
            <div className="py-16 flex flex-col items-center justify-center space-y-3 text-slate-400">
              <div className="relative">
                <div className="w-12 h-12 rounded-full border-2 border-sky-500/20 border-t-sky-400 animate-spin" />
                <Sparkles className="w-5 h-5 text-yellow-300 absolute inset-0 m-auto animate-pulse" />
              </div>
              <p className="text-sm font-medium text-slate-300">
                Gemini AI đang phân tích Traceback và quét mã nguồn...
              </p>
              <p className="text-xs text-slate-500">
                Đang tìm nguyên nhân và tạo phiên bản mã chuẩn xác
              </p>
            </div>
          ) : activeTab === 'debug' ? (
            debugResult ? (
              <>
                {/* Error Summary Card */}
                <div className="p-3.5 rounded-xl bg-rose-950/20 border border-rose-800/40 flex items-start space-x-3">
                  <div className="p-2 rounded-lg bg-rose-900/40 text-rose-400 shrink-0">
                    <AlertCircle className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center space-x-2 flex-wrap gap-1">
                      <span className="px-2 py-0.5 rounded text-xs font-bold bg-rose-900/50 text-rose-300 border border-rose-700/50 font-mono">
                        {debugResult.errorType || 'Lỗi Thực Thi'}
                      </span>
                      {debugResult.lineNumber ? (
                        <span className="px-2 py-0.5 rounded text-xs bg-amber-950/60 text-amber-300 border border-amber-800/40 font-mono">
                          Dòng {debugResult.lineNumber}
                        </span>
                      ) : null}
                    </div>
                    <p className="text-sm font-semibold text-slate-200 mt-1.5">
                      {debugResult.summary}
                    </p>
                  </div>
                </div>

                {/* Explanation */}
                <div className="p-3.5 rounded-xl bg-[#191d28] border border-slate-800">
                  <h3 className="text-xs font-bold text-sky-400 uppercase tracking-wider mb-2 flex items-center space-x-1.5">
                    <Lightbulb className="w-3.5 h-3.5" />
                    <span>Nguyên Nhân & Cách Khắc Phục</span>
                  </h3>
                  <p className="text-xs sm:text-sm text-slate-300 leading-relaxed whitespace-pre-line">
                    {debugResult.explanation}
                  </p>
                </div>

                {/* Fixed Code Preview */}
                {debugResult.fixedCode && (
                  <div className="rounded-xl bg-[#12141a] border border-slate-700/80 overflow-hidden shadow-inner">
                    <div className="px-3 py-2 bg-[#1b202c] border-b border-slate-700/70 flex items-center justify-between text-xs">
                      <span className="font-semibold text-emerald-400 flex items-center space-x-1.5">
                        <Code2 className="w-4 h-4" />
                        <span>Mã Nguồn Đã Được AI Sửa Hoàn Chỉnh</span>
                      </span>
                      <div className="flex items-center space-x-2">
                        <button
                          onClick={handleCopyFixed}
                          className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center space-x-1 text-[11px] transition"
                        >
                          {copied ? (
                            <Check className="w-3 h-3 text-emerald-400" />
                          ) : (
                            <Copy className="w-3 h-3" />
                          )}
                          <span>{copied ? 'Đã chép' : 'Sao chép'}</span>
                        </button>
                      </div>
                    </div>
                    <pre className="p-3 text-xs font-mono text-emerald-200 bg-[#0e1017] overflow-x-auto max-h-56 leading-relaxed select-text">
                      {debugResult.fixedCode}
                    </pre>
                  </div>
                )}

                {/* Suggestions List */}
                {debugResult.suggestions && debugResult.suggestions.length > 0 && (
                  <div className="p-3.5 rounded-xl bg-[#181d27] border border-slate-800">
                    <h4 className="text-xs font-bold text-amber-400 uppercase tracking-wider mb-2 flex items-center space-x-1.5">
                      <Lightbulb className="w-3.5 h-3.5" />
                      <span>Lời Khuyên & Mẹo Lập Trình</span>
                    </h4>
                    <ul className="space-y-1.5 text-xs text-slate-300">
                      {debugResult.suggestions.map((sug, idx) => (
                        <li key={idx} className="flex items-start space-x-2">
                          <span className="text-amber-400 font-bold shrink-0">•</span>
                          <span>{sug}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            ) : (
              <div className="py-12 text-center text-slate-500 text-xs">
                Không có dữ liệu lỗi. Nhấn nút "Phân tích lại" để kiểm tra mã nguồn.
              </div>
            )
          ) : (
            /* Explain Tab */
            <div className="space-y-3">
              {isExplaining ? (
                <div className="py-12 flex flex-col items-center justify-center space-y-2 text-slate-400">
                  <div className="w-8 h-8 rounded-full border-2 border-indigo-500/20 border-t-indigo-400 animate-spin" />
                  <p className="text-xs">Gemini AI đang giải thích logic chương trình...</p>
                </div>
              ) : explanationText ? (
                <div className="p-4 rounded-xl bg-[#191d28] border border-slate-800 text-xs sm:text-sm text-slate-200 leading-relaxed whitespace-pre-wrap select-text">
                  {explanationText}
                </div>
              ) : (
                <div className="py-8 text-center">
                  <button
                    onClick={onAskExplain}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-medium inline-flex items-center space-x-2 shadow"
                  >
                    <BookOpen className="w-4 h-4" />
                    <span>Yêu cầu AI giải thích mã nguồn này</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-4 py-3 bg-[#1d2230] border-t border-slate-700/80 flex items-center justify-between shrink-0">
          <button
            onClick={onClose}
            className="px-3.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs transition"
          >
            Đóng
          </button>

          {debugResult?.fixedCode && activeTab === 'debug' && (
            <button
              onClick={handleApply}
              disabled={applied}
              className="px-4 py-1.5 rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-semibold text-xs flex items-center space-x-1.5 shadow-lg active:scale-95 transition"
            >
              {applied ? (
                <>
                  <Check className="w-4 h-4 text-white" />
                  <span>Đã áp dụng thành công!</span>
                </>
              ) : (
                <>
                  <FileCheck className="w-4 h-4" />
                  <span>Áp Dụng Mã Đã Sửa Vào Editor</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
