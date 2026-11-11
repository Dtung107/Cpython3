import React, { useState } from 'react';
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
  Server,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Settings,
} from 'lucide-react';
import { EngineType } from '../types';
import { getApiUrl, getApiBaseUrl, isMobileOrApk, hasCustomServer } from '../utils/apiConfig';

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
  const [testingServer, setTestingServer] = useState(false);
  const [serverStatus, setServerStatus] = useState<{
    tested: boolean;
    online: boolean;
    gemini?: boolean;
    cpython?: boolean;
    message?: string;
  } | null>(null);
  const [showServerConfig, setShowServerConfig] = useState(false);
  const [customServerUrl, setCustomServerUrl] = useState(() => {
    return localStorage.getItem('pydroid_custom_server_url') || '';
  });

  const handleTestConnection = async () => {
    setTestingServer(true);
    setServerStatus(null);

    // If on Mobile/APK and user hasn't set a custom backend URL
    if (isMobileOrApk() && !customServerUrl.trim()) {
      setTimeout(() => {
        setServerStatus({
          tested: true,
          online: false,
          message: '📱 Bản APK đang chạy Offline qua Pyodide WASM. Để kết nối máy chủ Cloud CPython và Trợ lý AI trên APK, hãy cấu hình URL máy chủ riêng bên dưới.',
        });
        setTestingServer(false);
      }, 350);
      return;
    }

    try {
      const endpoint = getApiUrl('/api/engine/status');
      const res = await fetch(endpoint, { method: 'GET', signal: AbortSignal.timeout(6000) });
      if (res.ok) {
        const data = await res.json();
        const geminiReady = !!data?.gemini?.available;
        setServerStatus({
          tested: true,
          online: true,
          gemini: geminiReady,
          cpython: data?.cpython?.available,
          message: geminiReady
            ? '🟢 Máy chủ và Gemini AI đang kết nối ổn định!'
            : '⚠️ Máy chủ online, nhưng chưa kích hoạt Gemini API: Hãy chọn Secret Key trong AI Studio hoặc máy chủ.',
        });
      } else {
        setServerStatus({
          tested: true,
          online: false,
          message: `Máy chủ phản hồi mã ${res.status}. Pyodide WASM vẫn hoạt động Offline bình thường trên máy.`,
        });
      }
    } catch (e: any) {
      setServerStatus({
        tested: true,
        online: false,
        message: customServerUrl
          ? `Không thể kết nối tới máy chủ riêng (${customServerUrl}). Vui lòng kiểm tra lại đường dẫn.`
          : 'Chưa có kết nối máy chủ backend. Pyodide WASM vẫn chạy Offline độc lập hoàn toàn không cần mạng.',
      });
    } finally {
      setTestingServer(false);
    }
  };

  const handleSaveCustomServer = () => {
    if (customServerUrl.trim()) {
      localStorage.setItem('pydroid_custom_server_url', customServerUrl.trim());
    } else {
      localStorage.removeItem('pydroid_custom_server_url');
    }
    alert('Đã cập nhật máy chủ kết nối!');
  };

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
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider px-2 mb-1.5 flex items-center justify-between">
              <span>Động Cơ Chạy Mã (Dual Engine)</span>
              {engine === 'pyodide' && (
                <span className="px-1.5 py-0.5 rounded text-[9px] bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/40">
                  OFFLINE 100%
                </span>
              )}
            </div>
            <div className="space-y-1.5 bg-[#1a1e2a] p-2 rounded-xl border border-slate-800 text-xs">
              {/* Option 2: Pyodide WASM (Primary recommended for Mobile APK) */}
              <button
                onClick={() => onChangeEngine('pyodide')}
                className={`w-full text-left p-2.5 rounded-lg flex items-start space-x-2.5 transition ${
                  engine === 'pyodide'
                    ? 'bg-sky-600/30 text-sky-200 font-semibold border border-sky-500/50 shadow-sm'
                    : 'text-slate-300 hover:bg-slate-800/80 border border-transparent'
                }`}
              >
                <Globe className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs">2. Pyodide WASM (Client)</span>
                    <span className="text-[10px] text-emerald-400 font-semibold">Khuyên dùng cho APK</span>
                  </div>
                  <div className="text-[10px] text-slate-400 font-normal mt-0.5 leading-snug">
                    Chạy Python 3.11 trực tiếp trên điện thoại bằng WebAssembly. Hoàn toàn Offline, không cần mạng hay máy chủ!
                  </div>
                </div>
              </button>

              {/* Option 1: CPython Native (Server) */}
              <button
                onClick={() => onChangeEngine('cpython')}
                className={`w-full text-left p-2.5 rounded-lg flex items-start space-x-2.5 transition ${
                  engine === 'cpython'
                    ? 'bg-emerald-600/30 text-emerald-200 font-semibold border border-emerald-500/50 shadow-sm'
                    : 'text-slate-300 hover:bg-slate-800/80 border border-transparent'
                }`}
              >
                <Cpu className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs">1. CPython Native (Server)</span>
                    <span className="text-[10px] text-amber-400 font-normal">Cần Máy Chủ</span>
                  </div>
                  <div className="text-[10px] text-slate-400 font-normal mt-0.5 leading-snug">
                    Linux Python 3.10 trên máy chủ backend. Dành cho môi trường Web AI Studio hoặc khi có Server riêng.
                  </div>
                </div>
              </button>

              {/* Friendly advice if CPython is selected on APK */}
              {engine === 'cpython' && !customServerUrl && (
                <div className="p-2 rounded-lg bg-amber-950/40 border border-amber-600/50 text-[11px] text-amber-200 space-y-1.5 animate-in fade-in duration-150">
                  <div className="flex items-center space-x-1 font-semibold text-amber-300">
                    <AlertCircle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    <span>Lưu ý khi dùng bản APK di động:</span>
                  </div>
                  <p className="text-[10.5px] text-slate-300 leading-snug">
                    Bản APK trên điện thoại không có máy chủ Linux nội bộ. Hãy chuyển sang <strong>Pyodide WASM</strong> để chạy Python Offline tức thì!
                  </p>
                  <button
                    onClick={() => onChangeEngine('pyodide')}
                    className="w-full py-1 rounded bg-sky-600 hover:bg-sky-500 text-white font-bold text-[11px] flex items-center justify-center space-x-1 shadow transition"
                  >
                    <Globe className="w-3.5 h-3.5" />
                    <span>Chuyển sang Pyodide WASM (Offline)</span>
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Section: Cloud Server & AI Proxy Status */}
          <div>
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider px-2 mb-1.5 flex items-center justify-between">
              <span>Máy Chủ AI &amp; Backend Cloud</span>
              <button
                onClick={() => setShowServerConfig(!showServerConfig)}
                className="text-[10px] text-sky-400 hover:text-sky-300 flex items-center space-x-0.5"
              >
                <Settings className="w-3 h-3" />
                <span>{showServerConfig ? 'Đóng' : 'Cấu hình'}</span>
              </button>
            </div>
            <div className="p-2.5 bg-[#1a1e2a] rounded-xl border border-slate-800 text-xs space-y-2">
              <div className="flex items-start justify-between">
                <div className="flex items-center space-x-2">
                  <Server className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
                  <div>
                    <div className="text-slate-200 font-semibold text-[11px]">
                      {customServerUrl
                        ? 'Máy chủ riêng (Tùy chỉnh)'
                        : getApiBaseUrl()
                        ? 'Máy chủ Web'
                        : 'Chế độ APK Ngoại Tuyến (Offline)'}
                    </div>
                    <div className="text-[10px] text-slate-400 break-all">
                      {customServerUrl || getApiBaseUrl() || 'Pyodide WASM độc lập (Không cần máy chủ)'}
                    </div>
                  </div>
                </div>
              </div>

              {serverStatus && (
                <div
                  className={`p-2 rounded-lg text-[11px] flex items-start space-x-1.5 border ${
                    serverStatus.online
                      ? 'bg-emerald-950/40 border-emerald-600/40 text-emerald-200'
                      : 'bg-sky-950/40 border-sky-600/40 text-sky-200'
                  }`}
                >
                  {serverStatus.online ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                  ) : (
                    <Info className="w-3.5 h-3.5 text-sky-400 shrink-0 mt-0.5" />
                  )}
                  <span className="leading-tight">{serverStatus.message}</span>
                </div>
              )}

              <button
                onClick={handleTestConnection}
                disabled={testingServer}
                className="w-full py-1.5 px-2 rounded-lg bg-sky-950/60 hover:bg-sky-900/60 border border-sky-600/50 text-sky-200 font-medium text-[11px] flex items-center justify-center space-x-1.5 active:scale-95 transition"
              >
                <RefreshCw className={`w-3 h-3 ${testingServer ? 'animate-spin' : ''}`} />
                <span>{testingServer ? 'Đang kiểm tra kết nối...' : 'Kiểm tra kết nối Máy chủ'}</span>
              </button>

              {showServerConfig && (
                <div className="pt-2 border-t border-slate-800 space-y-1.5 animate-in fade-in duration-150">
                  <label className="text-[10px] text-slate-400 block font-medium">
                    URL Máy Chủ Backend Riêng (Dành cho bản APK):
                  </label>
                  <p className="text-[10px] text-slate-400 leading-snug">
                    Nếu bạn triển khai mã nguồn backend (server.ts) lên Cloud Run, Render, Railway hoặc VPS cá nhân, hãy nhập địa chỉ tại đây:
                  </p>
                  <input
                    type="text"
                    value={customServerUrl}
                    onChange={(e) => setCustomServerUrl(e.target.value)}
                    placeholder="https://my-pydroid-server.app"
                    className="w-full bg-[#10131d] border border-slate-700 rounded p-1.5 text-[11px] text-slate-100 font-mono focus:outline-none focus:border-sky-400"
                  />
                  <div className="flex justify-end space-x-1.5 pt-1">
                    <button
                      onClick={() => {
                        setCustomServerUrl('');
                        localStorage.removeItem('pydroid_custom_server_url');
                      }}
                      className="px-2 py-0.5 text-[10px] text-slate-400 hover:text-white"
                    >
                      Mặc định (Offline)
                    </button>
                    <button
                      onClick={handleSaveCustomServer}
                      className="px-2.5 py-0.5 rounded bg-sky-600 text-white font-medium text-[10px] hover:bg-sky-500"
                    >
                      Lưu URL
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

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
