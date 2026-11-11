import React, { useState, useEffect } from 'react';
import {
  Key,
  X,
  CheckCircle2,
  AlertCircle,
  Eye,
  EyeOff,
  RefreshCw,
  ExternalLink,
  ShieldCheck,
  Trash2,
  Sparkles,
} from 'lucide-react';
import {
  getSavedGeminiApiKey,
  saveGeminiApiKey,
  validateGeminiApiKey,
} from '../services/geminiService';

interface SettingsApiKeyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onKeySaved?: (savedKey: string) => void;
}

export const SettingsApiKeyModal: React.FC<SettingsApiKeyModalProps> = ({
  isOpen,
  onClose,
  onKeySaved,
}) => {
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [savedKey, setSavedKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      const current = getSavedGeminiApiKey();
      setSavedKey(current);
      setApiKeyInput(current);
      setErrorMessage(null);
      setSuccessMessage(null);
      setShowKey(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleTestAndSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cleanKey = apiKeyInput.trim();

    if (!cleanKey) {
      setErrorMessage('Vui lòng nhập khóa Gemini API trước khi kiểm tra.');
      setSuccessMessage(null);
      return;
    }

    setIsValidating(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      // Validation step: lightweight ping request to verify validity & permissions before saving
      const result = await validateGeminiApiKey(cleanKey);

      if (result.valid) {
        // Save only after successful validation
        saveGeminiApiKey(cleanKey);
        setSavedKey(cleanKey);
        setSuccessMessage(
          result.message || 'Khóa Gemini API hợp lệ! Đã lưu thành công vào thiết bị.'
        );
        onKeySaved?.(cleanKey);

        // Auto close after brief moment of success confirmation
        setTimeout(() => {
          onClose();
        }, 1200);
      } else {
        // Validation failed: display error and prevent saving
        setErrorMessage(
          result.error || 'Khóa API không hợp lệ hoặc thiếu quyền hạn cần thiết.'
        );
      }
    } catch (err: any) {
      setErrorMessage(
        err?.message || 'Không thể kiểm tra khóa API. Vui lòng kiểm tra kết nối mạng và thử lại.'
      );
    } finally {
      setIsValidating(false);
    }
  };

  const handleClearKey = () => {
    saveGeminiApiKey('');
    setSavedKey('');
    setApiKeyInput('');
    setErrorMessage(null);
    setSuccessMessage('Đã xóa khóa tùy chỉnh. Ứng dụng sẽ sử dụng khóa mặc định từ hệ thống.');
    onKeySaved?.('');
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg bg-[#141722] border border-sky-800/60 rounded-2xl shadow-2xl overflow-hidden text-slate-100 flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-4 py-3 bg-[#1b2030] border-b border-sky-900/50 flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-xl bg-gradient-to-br from-amber-500 to-sky-600 text-white shadow-md">
              <Key className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-bold text-sm text-slate-100 flex items-center space-x-1.5">
                <span>Cài Đặt Khóa API (Settings API Key)</span>
                <span className="px-1.5 py-0.5 rounded text-[10px] bg-sky-500/20 text-sky-300 font-semibold border border-sky-500/30">
                  Gemini AI
                </span>
              </h2>
              <p className="text-[11px] text-slate-400">
                Xác thực và lưu khóa Gemini API để kích hoạt Trợ lý AI và AI Debugger
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleTestAndSave} className="p-4 space-y-4 text-xs">
          {/* Current Key Status Card */}
          <div className="p-3 rounded-xl bg-[#181d2c] border border-slate-800 flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
              <div>
                <div className="font-semibold text-slate-200 text-xs">Trạng thái khóa hiện tại:</div>
                <div className="text-[11px] text-slate-400">
                  {savedKey
                    ? `Đang sử dụng khóa cá nhân: ${savedKey.slice(0, 6)}...${savedKey.slice(-4)}`
                    : 'Đang dùng khóa mặc định từ hệ thống / máy chủ'}
                </div>
              </div>
            </div>
            {savedKey && (
              <button
                type="button"
                onClick={handleClearKey}
                title="Xóa khóa đã lưu để quay về mặc định"
                className="px-2 py-1 rounded-lg bg-rose-950/40 hover:bg-rose-900/50 border border-rose-600/40 text-rose-300 text-[11px] flex items-center space-x-1 transition active:scale-95"
              >
                <Trash2 className="w-3 h-3" />
                <span>Xóa khóa</span>
              </button>
            )}
          </div>

          {/* API Key Input Section */}
          <div className="space-y-1.5">
            <label className="block text-slate-300 font-semibold text-xs flex items-center justify-between">
              <span>Khóa Gemini API (API Key)</span>
              <a
                href="https://aistudio.google.com/apikey"
                target="_blank"
                rel="noreferrer"
                className="text-sky-400 hover:text-sky-300 font-normal text-[11px] flex items-center space-x-1"
              >
                <span>Lấy khóa miễn phí</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </label>

            <div className="relative">
              <input
                type={showKey ? 'text' : 'password'}
                value={apiKeyInput}
                onChange={(e) => {
                  setApiKeyInput(e.target.value);
                  setErrorMessage(null);
                  setSuccessMessage(null);
                }}
                placeholder="Dán chuỗi khóa API (bắt đầu bằng AIzaSy...)"
                className="w-full bg-[#0d1017] border border-slate-700 focus:border-sky-500 rounded-xl px-3 py-2.5 pr-10 text-slate-100 font-mono text-xs shadow-inner focus:outline-none transition"
              />
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 p-1"
              >
                {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-[10.5px] text-slate-400 leading-snug">
              Hệ thống sẽ thực hiện <strong>1 truy vấn ping nhẹ (lightweight test)</strong> để kiểm tra tính hợp lệ và quyền hạn của khóa trước khi lưu.
            </p>
          </div>

          {/* Validation Error Banner */}
          {errorMessage && (
            <div className="p-3 rounded-xl bg-rose-950/60 border border-rose-500/70 text-rose-200 text-xs flex items-start space-x-2 animate-in fade-in duration-150">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <div className="space-y-0.5 flex-1 leading-snug">
                <div className="font-bold text-rose-300">Không thể lưu khóa API:</div>
                <div className="text-[11px] text-rose-100">{errorMessage}</div>
              </div>
            </div>
          )}

          {/* Validation Success Banner */}
          {successMessage && (
            <div className="p-3 rounded-xl bg-emerald-950/60 border border-emerald-500/70 text-emerald-200 text-xs flex items-start space-x-2 animate-in fade-in duration-150">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <div className="space-y-0.5 flex-1 leading-snug">
                <div className="font-bold text-emerald-300">Xác thực thành công!</div>
                <div className="text-[11px] text-emerald-100">{successMessage}</div>
              </div>
            </div>
          )}

          {/* Footer Actions */}
          <div className="pt-2 border-t border-slate-800 flex items-center justify-between">
            <button
              type="button"
              onClick={onClose}
              disabled={isValidating}
              className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs transition"
            >
              Đóng
            </button>

            <button
              type="submit"
              disabled={isValidating || !apiKeyInput.trim()}
              className="px-4 py-2 rounded-xl bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 text-white font-bold text-xs flex items-center space-x-2 shadow-lg active:scale-95 transition disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isValidating ? 'animate-spin' : ''}`} />
              <span>{isValidating ? 'Đang kiểm tra khóa API...' : 'Kiểm tra & Lưu Khóa'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
