import React from 'react';
import {
  X,
  FilePlus,
  Download,
  Upload,
  Save,
  RotateCcw,
  Package,
  Smartphone,
  Cpu,
  Globe,
  Sparkles,
  BookOpen,
  Info,
  ExternalLink,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  FolderOpen,
} from 'lucide-react';
import { EngineType } from '../types';

interface DrawerMenuProps {
  isOpen: boolean;
  onClose: () => void;
  engine: EngineType;
  onChangeEngine: (engine: EngineType) => void;
  onNewFile: () => void;
  onSaveToLocal: () => void;
  onDownloadPy: () => void;
  onUploadPy: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onResetCode: () => void;
  onOpenAIAssistant: () => void;
  onOpenPip: () => void;
  onOpenApk: () => void;
  onOpenSamples: () => void;
  fontSize: number;
  onChangeFontSize: (delta: number) => void;
}

export const DrawerMenu: React.FC<DrawerMenuProps> = ({
  isOpen,
  onClose,
  engine,
  onChangeEngine,
  onNewFile,
  onSaveToLocal,
  onDownloadPy,
  onUploadPy,
  onResetCode,
  onOpenAIAssistant,
  onOpenPip,
  onOpenApk,
  onOpenSamples,
  fontSize,
  onChangeFontSize,
}) => {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex justify-start animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="w-80 max-w-[85vw] h-full bg-[#151821] border-r border-slate-800 shadow-2xl flex flex-col overflow-y-auto select-none"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drawer Header with Pydroid 3 Logo */}
        <div className="p-4 bg-gradient-to-r from-[#1a1f2c] to-[#161a25] border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-amber-400 via-sky-500 to-indigo-600 flex items-center justify-center text-lg shadow-md">
              🐍
            </div>
            <div>
              <h2 className="font-bold text-sm text-slate-100 flex items-center space-x-1.5">
                <span>Pydroid 3</span>
                <span className="text-amber-400">Web</span>
              </h2>
              <p className="text-[10px] text-slate-400">
                IDE Python & AI Android
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Drawer Menu Sections */}
        <div className="p-3 space-y-4 flex-1">
          {/* Section: File Operations */}
          <div>
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider px-2 mb-1.5">
              Tệp & Mã Nguồn
            </div>
            <div className="space-y-1">
              <button
                onClick={() => {
                  onNewFile();
                  onClose();
                }}
                className="w-full text-left px-3 py-2 rounded-lg hover:bg-slate-800/80 text-xs text-slate-200 flex items-center space-x-2.5 transition"
              >
                <FilePlus className="w-4 h-4 text-emerald-400" />
                <span>Tạo file Python mới</span>
              </button>

              <button
                onClick={() => {
                  onSaveToLocal();
                  onClose();
                }}
                className="w-full text-left px-3 py-2 rounded-lg hover:bg-slate-800/80 text-xs text-slate-200 flex items-center space-x-2.5 transition"
              >
                <Save className="w-4 h-4 text-sky-400" />
                <span>Lưu mã nguồn (Bộ nhớ máy)</span>
              </button>

              <button
                onClick={() => {
                  onDownloadPy();
                  onClose();
                }}
                className="w-full text-left px-3 py-2 rounded-lg hover:bg-slate-800/80 text-xs text-slate-200 flex items-center space-x-2.5 transition"
              >
                <Download className="w-4 h-4 text-amber-400" />
                <span>Tải file .py về điện thoại</span>
              </button>

              {/* Upload File Input */}
              <label className="w-full text-left px-3 py-2 rounded-lg hover:bg-slate-800/80 text-xs text-slate-200 flex items-center space-x-2.5 transition cursor-pointer">
                <Upload className="w-4 h-4 text-purple-400" />
                <span>Mở file .py từ điện thoại</span>
                <input
                  type="file"
                  accept=".py,.txt"
                  onChange={(e) => {
                    onUploadPy(e);
                    onClose();
                  }}
                  className="hidden"
                />
              </label>

              <button
                onClick={() => {
                  onResetCode();
                  onClose();
                }}
                className="w-full text-left px-3 py-2 rounded-lg hover:bg-rose-950/30 text-xs text-rose-300 flex items-center space-x-2.5 transition"
              >
                <RotateCcw className="w-4 h-4 text-rose-400" />
                <span>Khôi phục mã ban đầu</span>
              </button>
            </div>
          </div>

          {/* Section: Features */}
          <div>
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider px-2 mb-1.5">
              Tính Năng Nổi Bật
            </div>
            <div className="space-y-1">
              <button
                onClick={() => {
                  onOpenAIAssistant();
                  onClose();
                }}
                className="w-full text-left px-3 py-2 rounded-lg bg-sky-950/40 border border-sky-600/40 text-xs text-sky-200 flex items-center justify-between transition"
              >
                <div className="flex items-center space-x-2.5">
                  <Sparkles className="w-4 h-4 text-sky-400" />
                  <span className="font-semibold">Trợ Lý AI (Trò chuyện &amp; Gỡ lỗi)</span>
                </div>
                <ChevronRight className="w-3.5 h-3.5 text-sky-400" />
              </button>
              <button
                onClick={() => {
                  onOpenPip();
                  onClose();
                }}
                className="w-full text-left px-3 py-2 rounded-lg hover:bg-slate-800/80 text-xs text-slate-200 flex items-center justify-between transition"
              >
                <div className="flex items-center space-x-2.5">
                  <Package className="w-4 h-4 text-purple-400" />
                  <span>Quản lý thư viện Pip</span>
                </div>
                <ChevronRight className="w-3.5 h-3.5 text-slate-500" />
              </button>

              <button
                onClick={() => {
                  onOpenApk();
                  onClose();
                }}
                className="w-full text-left px-3 py-2 rounded-lg bg-indigo-950/30 border border-indigo-700/40 text-xs text-indigo-200 flex items-center justify-between transition"
              >
                <div className="flex items-center space-x-2.5">
                  <Smartphone className="w-4 h-4 text-indigo-400" />
                  <span className="font-semibold">Đóng gói Android APK</span>
                </div>
                <ChevronRight className="w-3.5 h-3.5 text-indigo-400" />
              </button>

              <button
                onClick={() => {
                  onOpenSamples();
                  onClose();
                }}
                className="w-full text-left px-3 py-2 rounded-lg hover:bg-slate-800/80 text-xs text-slate-200 flex items-center justify-between transition"
              >
                <div className="flex items-center space-x-2.5">
                  <BookOpen className="w-4 h-4 text-amber-400" />
                  <span>Kho mã mẫu có sẵn</span>
                </div>
                <ChevronRight className="w-3.5 h-3.5 text-slate-500" />
              </button>
            </div>
          </div>

          {/* Section: Dual Engine */}
          <div>
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider px-2 mb-1.5">
              Động Cơ Chạy Mã (Dual Engine)
            </div>
            <div className="space-y-1 bg-[#1a1e2a] p-2 rounded-xl border border-slate-800 text-xs">
              <button
                onClick={() => onChangeEngine('cpython')}
                className={`w-full text-left p-2 rounded-lg flex items-center space-x-2 transition ${
                  engine === 'cpython'
                    ? 'bg-emerald-600/30 text-emerald-200 font-semibold border border-emerald-500/40'
                    : 'text-slate-300 hover:bg-slate-800'
                }`}
              >
                <Cpu className="w-4 h-4 text-emerald-400 shrink-0" />
                <div className="flex-1">
                  <div>1. CPython Native (Server)</div>
                  <div className="text-[10px] text-slate-400 font-normal">
                    Linux Python 3.10 đầy đủ thư viện
                  </div>
                </div>
              </button>

              <button
                onClick={() => onChangeEngine('pyodide')}
                className={`w-full text-left p-2 rounded-lg flex items-center space-x-2 transition ${
                  engine === 'pyodide'
                    ? 'bg-sky-600/30 text-sky-200 font-semibold border border-sky-500/40'
                    : 'text-slate-300 hover:bg-slate-800'
                }`}
              >
                <Globe className="w-4 h-4 text-sky-400 shrink-0" />
                <div className="flex-1">
                  <div>2. Pyodide WASM (Client)</div>
                  <div className="text-[10px] text-slate-400 font-normal">
                    Chạy offline trên điện thoại
                  </div>
                </div>
              </button>
            </div>
          </div>

          {/* Section: Editor Zoom Settings */}
          <div>
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider px-2 mb-1.5">
              Cỡ Chữ Trình Soạn Thảo
            </div>
            <div className="flex items-center justify-between p-2 bg-[#1a1e2a] rounded-xl border border-slate-800 text-xs">
              <span className="text-slate-300">Cỡ chữ: {fontSize}px</span>
              <div className="flex items-center space-x-1.5">
                <button
                  onClick={() => onChangeFontSize(-1)}
                  className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200"
                >
                  <ZoomOut className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => onChangeFontSize(1)}
                  className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200"
                >
                  <ZoomIn className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Drawer Footer */}
        <div className="p-3 bg-[#11131a] border-t border-slate-800 text-center text-[10px] text-slate-400">
          Pydroid 3 Web • Môi trường phát triển Python & AI Debugger
        </div>
      </div>
    </div>
  );
};
