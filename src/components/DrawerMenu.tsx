import React, { useState, useEffect } from 'react';
import {
  X,
  Package,
  Smartphone,
  Cpu,
  Globe,
  Info,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  Server,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Settings,
  Key,
  Cloud,
  Palette,
  UserCheck,
  Trash2,
  Plus,
  Download,
  Archive,
  Upload,
  FolderOpen,
  Activity,
  Eraser,
} from 'lucide-react';
import { User } from 'firebase/auth';
import { EngineType } from '../types';
import {
  getApiBaseUrl,
  getCustomServerUrl,
  getSavedServerHistory,
  saveCustomServerUrl,
  removeServerFromHistory,
  clearCustomServerUrl,
  testBackendServerUrl,
  isMobileOrApk,
  SavedServerEntry,
} from '../utils/apiConfig';
import { downloadProjectUpdateZip } from '../utils/updateBundle';
import { PyodideWarmState } from '../services/pyodideService';
import { CPythonWarmState, resetCPythonWarmState } from '../services/cpythonService';
import { FULL_BACKUP_FILENAME, getDefaultFolderPath } from '../services/deviceStorageService';

interface DrawerMenuProps {
  isOpen: boolean;
  onClose: () => void;
  engine: EngineType;
  onChangeEngine: (engine: EngineType) => void;
  pyodideWarmState?: PyodideWarmState;
  cpythonWarmState?: CPythonWarmState;
  onOpenPip: () => void;
  onOpenApk: () => void;
  onOpenSyntaxColor: () => void;
  onOpenApiKeySettings?: () => void;
  onOpenGoogleWorkspace?: () => void;
  onSwitchGoogleAccount?: () => void;
  googleUser?: User | null;
  hasGoogleToken?: boolean;
  onServerUrlChanged?: () => void;
  fontSize: number;
  onChangeFontSize: (delta: number) => void;
  onExportFullBackup?: () => Promise<{ ok: boolean; message: string }>;
  onImportFullBackupFile?: (file: File) => Promise<{ ok: boolean; message: string }>;
  onRestoreFullBackupFromFolder?: () => Promise<{ ok: boolean; message: string }>;
  onOptimizeMemory?: () => Promise<{ ok: boolean; message: string }>;
  onOpenRamDiagnostics?: () => void;
  onQuickClearTerminal?: () => Promise<void> | void;
  hasTerminalData?: boolean;
  shortcutsCount?: number;
  pipPackagesCount?: number;
}

export const DrawerMenu: React.FC<DrawerMenuProps> = ({
  isOpen,
  onClose,
  engine,
  onChangeEngine,
  pyodideWarmState = 'idle',
  cpythonWarmState = 'idle',
  onOpenPip,
  onOpenApk,
  onOpenSyntaxColor,
  onOpenApiKeySettings,
  onOpenGoogleWorkspace,
  onSwitchGoogleAccount,
  googleUser,
  hasGoogleToken = false,
  onServerUrlChanged,
  fontSize,
  onChangeFontSize,
  onExportFullBackup,
  onImportFullBackupFile,
  onRestoreFullBackupFromFolder,
  onOptimizeMemory,
  onOpenRamDiagnostics,
  onQuickClearTerminal,
  hasTerminalData = false,
  shortcutsCount = 0,
  pipPackagesCount = 0,
}) => {
  const [testingServer, setTestingServer] = useState(false);
  const [serverStatus, setServerStatus] = useState<{
    tested: boolean;
    online: boolean;
    message?: string;
  } | null>(null);
  const [showServerConfig, setShowServerConfig] = useState(false);
  const [activeCustomUrl, setActiveCustomUrl] = useState<string>(() => getCustomServerUrl());
  const [serverInputUrl, setServerInputUrl] = useState<string>(() => getCustomServerUrl());
  const [serverInputLabel, setServerInputLabel] = useState<string>('');
  const [serverHistory, setServerHistory] = useState<SavedServerEntry[]>(() => getSavedServerHistory());
  const [downloadingUpdate, setDownloadingUpdate] = useState(false);
  const [updateNotice, setUpdateNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [backupBusy, setBackupBusy] = useState(false);
  const [backupNotice, setBackupNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [optimizingMem, setOptimizingMem] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const current = getCustomServerUrl();
    setActiveCustomUrl(current);
    setServerInputUrl(current);
    setServerHistory(getSavedServerHistory());
  }, [isOpen]);

  const handleTestConnection = async (targetUrl?: string) => {
    setTestingServer(true);
    setServerStatus({
      tested: false,
      online: false,
      message: 'Đang kết nối tới máy chủ...',
    });
    const urlToTest = (targetUrl ?? activeCustomUrl) || getApiBaseUrl() || window.location.origin;

    try {
      const check = await testBackendServerUrl(urlToTest, 60000, (msg) => {
        setServerStatus({
          tested: false,
          online: false,
          message: msg,
        });
      });
      if (check.ok) {
        setServerStatus({
          tested: true,
          online: true,
          message: check.geminiAvailable
            ? `${check.message} Gemini AI đã sẵn sàng.`
            : `${check.message} Hãy nhập Khóa Gemini API nếu máy chủ chưa cấu hình sẵn.`,
        });
      } else {
        setServerStatus({
          tested: true,
          online: false,
          message: check.message,
        });
      }
    } finally {
      setTestingServer(false);
    }
  };

  const handleSaveCustomServer = async () => {
    const saved = saveCustomServerUrl(serverInputUrl, serverInputLabel);
    if (saved.ok === false) {
      setServerStatus({
        tested: true,
        online: false,
        message: saved.error,
      });
      return;
    }

    setActiveCustomUrl(saved.url);
    setServerInputUrl(saved.url);
    setServerInputLabel('');
    setServerHistory(getSavedServerHistory());
    resetCPythonWarmState();
    onServerUrlChanged?.();
    await handleTestConnection(saved.url);
  };

  const handleSelectSavedServer = async (entry: SavedServerEntry) => {
    const saved = saveCustomServerUrl(entry.url, entry.label);
    if (saved.ok) {
      setActiveCustomUrl(saved.url);
      setServerInputUrl(saved.url);
      setServerHistory(getSavedServerHistory());
      resetCPythonWarmState();
      onServerUrlChanged?.();
      await handleTestConnection(saved.url);
    }
  };

  const handleRemoveSavedServer = (url: string) => {
    const updated = removeServerFromHistory(url);
    setServerHistory(updated);
    const remainingActive = getCustomServerUrl();
    setActiveCustomUrl(remainingActive);
    if (!remainingActive) {
      setServerInputUrl('');
      resetCPythonWarmState();
      onServerUrlChanged?.();
    }
  };

  const handleUseDefaultOffline = () => {
    clearCustomServerUrl();
    setActiveCustomUrl('');
    setServerInputUrl('');
    resetCPythonWarmState();
    setServerStatus({
      tested: false,
      online: false,
      message: 'Đã chuyển về chế độ mặc định (Pyodide Offline trên APK / Server nội bộ trên Web).',
    });
    onServerUrlChanged?.();
  };

  const handleDownloadUpdateFiles = async () => {
    setDownloadingUpdate(true);
    setUpdateNotice(null);
    try {
      const res = await downloadProjectUpdateZip((msg) => {
        setUpdateNotice({ ok: true, text: msg });
      });
      setUpdateNotice({ ok: res.ok, text: res.message });
    } finally {
      setDownloadingUpdate(false);
    }
  };

  const handleExportConfigClick = async () => {
    if (!onExportFullBackup || backupBusy) return;
    setBackupBusy(true);
    setBackupNotice(null);
    try {
      const res = await onExportFullBackup();
      setBackupNotice({ ok: res.ok, text: res.message });
    } finally {
      setBackupBusy(false);
    }
  };

  const handleRestoreFromFolderClick = async () => {
    if (!onRestoreFullBackupFromFolder || backupBusy) return;
    setBackupBusy(true);
    setBackupNotice(null);
    try {
      const res = await onRestoreFullBackupFromFolder();
      setBackupNotice({ ok: res.ok, text: res.message });
    } finally {
      setBackupBusy(false);
    }
  };

  const handleImportConfigFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !onImportFullBackupFile || backupBusy) return;
    setBackupBusy(true);
    setBackupNotice(null);
    try {
      const res = await onImportFullBackupFile(file);
      setBackupNotice({ ok: res.ok, text: res.message });
    } finally {
      setBackupBusy(false);
    }
  };

  if (!isOpen) return null;

  const isGoogleConnected = !!(googleUser && hasGoogleToken);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex justify-start animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="w-[332px] max-w-[88vw] h-full bg-[#070b14] border-r border-cyan-500/25 shadow-[8px_0_40px_rgba(0,0,0,0.85)] flex flex-col pt-[env(safe-area-inset-top,0px)] pb-[env(safe-area-inset-bottom,0px)] select-none relative overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Subtle Dark Premium atmospheric glow */}
        <div
          className="pointer-events-none absolute inset-0 opacity-65"
          style={{
            background:
              'radial-gradient(circle at 12% 6%, rgba(6, 182, 212, 0.16) 0%, transparent 42%), radial-gradient(circle at 92% 16%, rgba(225, 29, 72, 0.14) 0%, transparent 38%), radial-gradient(circle at 75% 75%, rgba(168, 85, 247, 0.10) 0%, transparent 45%)',
          }}
        />

        <div className="relative z-10 flex-1 flex flex-col overflow-y-auto no-scrollbar">
          {/* Dark Premium Drawer Header */}
          <div className="px-4 py-4 bg-gradient-to-r from-[#0c162b] via-[#091122] to-[#111226] border-b border-cyan-500/25 flex items-center justify-between gap-3">
            <div className="flex items-center space-x-3.5 min-w-0">
              <div className="w-13 h-13 rounded-2xl p-[1.5px] bg-gradient-to-br from-cyan-400/80 via-sky-500/40 to-amber-400/75 shadow-[0_0_20px_rgba(34,211,238,0.28)] shrink-0">
                <img
                  src="/app-icon.jpg"
                  alt="Pydroid 3 Web"
                  className="w-full h-full rounded-[14px] object-cover bg-[#060911]"
                />
              </div>
              <div className="min-w-0">
                <h2 className="font-extrabold text-[17px] tracking-tight text-white flex items-center space-x-1.5 leading-tight">
                  <span>Pydroid 3</span>
                  <span className="text-amber-400">Web</span>
                </h2>
                <p className="text-[11px] text-slate-300/85 mt-0.5 truncate">
                  IDE Python &amp; AI Android
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="w-10 h-10 rounded-xl bg-[#0e192f] hover:bg-[#162748] border border-cyan-500/25 text-slate-300 hover:text-cyan-300 flex items-center justify-center transition shrink-0"
              aria-label="Đóng menu"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Drawer Body — Ordered strictly per user layout */}
          <div className="p-3 space-y-3 flex-1">
            {/* Quick Clear Terminal Action */}
            {onQuickClearTerminal && (
              <button
                type="button"
                onClick={() => {
                  void onQuickClearTerminal();
                  onClose();
                }}
                className="w-full min-h-[48px] text-left px-3 py-2.5 rounded-2xl bg-gradient-to-r from-[#24131c] via-[#131424] to-[#080d18] border border-rose-500/40 hover:border-rose-400/70 shadow-[0_4px_16px_rgba(244,63,94,0.12)] flex items-center justify-between gap-2.5 active:scale-[0.99] transition"
              >
                <div className="flex items-center space-x-3 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-rose-500/25 to-orange-500/15 border border-rose-400/50 flex items-center justify-center shrink-0">
                    <Eraser className="w-5 h-5 text-rose-300" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-[13px] font-bold text-slate-50 truncate">
                      Xoá nhanh terminal
                    </div>
                    <div className="text-[11px] text-slate-300/80 truncate">
                      {hasTerminalData
                        ? 'Dọn output, đồ thị & dữ liệu tạm phiên trước'
                        : 'Dọn sạch dữ liệu tạm không cần chạy lại mã'}
                    </div>
                  </div>
                </div>
                <ChevronRight className="w-4.5 h-4.5 text-rose-300 shrink-0" />
              </button>
            )}

            {/* 1. Đăng nhập tài khoản Google */}
            {(onOpenGoogleWorkspace || onSwitchGoogleAccount) && (
              <div className="rounded-2xl bg-gradient-to-r from-[#0d213a] via-[#0a1426] to-[#080d18] border border-cyan-500/40 shadow-[0_4px_18px_rgba(56,189,248,0.14)] overflow-hidden">
                {onOpenGoogleWorkspace && (
                  <button
                    onClick={() => {
                      onOpenGoogleWorkspace();
                      onClose();
                    }}
                    className="w-full text-left px-3 py-2.5 hover:bg-cyan-500/10 flex items-center justify-between gap-2.5 transition"
                  >
                    <div className="flex items-center space-x-3 min-w-0">
                      {googleUser?.photoURL ? (
                        <img
                          src={googleUser.photoURL}
                          alt="Google"
                          className="w-10 h-10 rounded-xl object-cover border border-cyan-400/60 shrink-0"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-sky-500/25 to-blue-600/15 border border-sky-400/50 shadow-[0_0_14px_rgba(56,189,248,0.28)] flex items-center justify-center shrink-0">
                          <Cloud className="w-5 h-5 text-sky-300" />
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="text-[13px] font-bold text-slate-50 truncate">
                          {googleUser
                            ? googleUser.displayName || googleUser.email || 'Tài khoản Google'
                            : 'Đăng nhập tài khoản Google'}
                        </div>
                        <div className="text-[11px] text-cyan-300/90 truncate">
                          {isGoogleConnected
                            ? googleUser?.email || 'Đã kết nối Drive & Đồng bộ'
                            : 'Google Drive, Ghi chú & Đồng bộ APK'}
                        </div>
                      </div>
                    </div>
                    <ChevronRight className="w-4.5 h-4.5 text-cyan-400 shrink-0" />
                  </button>
                )}

                {onSwitchGoogleAccount && (
                  <div className="px-3 pb-2.5 pt-2 border-t border-cyan-500/20">
                    <button
                      onClick={() => {
                        onSwitchGoogleAccount();
                        onClose();
                      }}
                      className="w-full py-2 px-3 rounded-xl bg-emerald-950/55 hover:bg-emerald-900/55 border border-emerald-500/40 text-emerald-200 font-semibold text-[11px] flex items-center justify-center space-x-1.5 active:scale-[0.98] transition"
                    >
                      <UserCheck className="w-3.5 h-3.5 text-emerald-300" />
                      <span>
                        {googleUser
                          ? 'Đổi / Đăng nhập tài khoản Google khác'
                          : 'Chọn tài khoản Google để đăng nhập'}
                      </span>
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* 2. Tab Máy chủ tùy chỉnh (Đã gỡ nút đăng nhập Google ra khỏi tab này) */}
            <div>
              <div className="text-[10.5px] font-bold text-cyan-300/80 uppercase tracking-wider px-1.5 mb-1.5 flex items-center justify-between">
                <span>Máy Chủ Tùy Chỉnh</span>
                <button
                  onClick={() => setShowServerConfig((v) => !v)}
                  className="text-[11px] text-cyan-400 hover:text-cyan-300 flex items-center space-x-1 font-semibold py-0.5"
                >
                  <Settings className="w-3.5 h-3.5" />
                  <span>{showServerConfig ? 'Thu gọn' : 'Đổi máy chủ'}</span>
                </button>
              </div>

              <div className="p-2.5 bg-gradient-to-b from-[#0b1324] to-[#080d18] rounded-2xl border border-cyan-500/25 text-xs space-y-2.5">
                <div className="flex items-start space-x-2.5">
                  <div className="w-8 h-8 rounded-lg bg-cyan-500/15 border border-cyan-400/40 flex items-center justify-center shrink-0">
                    <Server className="w-4 h-4 text-cyan-300" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-slate-100 font-semibold text-[11.5px]">
                      {activeCustomUrl
                        ? 'Máy chủ đang chọn (Tùy chỉnh)'
                        : isMobileOrApk()
                        ? 'Chưa chọn máy chủ riêng (APK)'
                        : 'Máy chủ Web (Nội bộ)'}
                    </div>
                    <div className="text-[10px] text-cyan-300/75 break-all font-mono mt-0.5">
                      {activeCustomUrl || getApiBaseUrl() || 'Kết nối trực tiếp cùng tên miền'}
                    </div>
                  </div>
                </div>

                {serverStatus && (
                  <div
                    className={`p-2 rounded-xl text-[11px] flex items-start space-x-1.5 border ${
                      serverStatus.online
                        ? 'bg-emerald-950/40 border-emerald-500/45 text-emerald-200'
                        : 'bg-cyan-950/40 border-cyan-500/45 text-cyan-200'
                    }`}
                  >
                    {serverStatus.online ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                    ) : (
                      <Info className="w-3.5 h-3.5 text-cyan-400 shrink-0 mt-0.5" />
                    )}
                    <span className="leading-snug">{serverStatus.message}</span>
                  </div>
                )}

                <div className="grid grid-cols-1 gap-2">
                  <button
                    onClick={() => handleTestConnection()}
                    disabled={testingServer}
                    className="w-full py-2 px-3 rounded-xl bg-gradient-to-r from-cyan-950/70 to-blue-950/60 hover:from-cyan-900/70 hover:to-blue-900/60 border border-cyan-500/45 text-cyan-200 font-semibold text-[11.5px] flex items-center justify-center space-x-2 active:scale-[0.98] transition disabled:opacity-60"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 text-cyan-300 ${testingServer ? 'animate-spin' : ''}`} />
                    <span>{testingServer ? 'Đang kiểm tra (tối đa 25s)...' : 'Kiểm tra kết nối máy chủ'}</span>
                  </button>

                  {onOpenApiKeySettings && (
                    <button
                      onClick={() => {
                        onOpenApiKeySettings();
                        onClose();
                      }}
                      className="w-full py-2 px-3 rounded-xl bg-gradient-to-r from-[#1c160d] to-[#121626] hover:from-[#292011] hover:to-[#181e33] border border-amber-500/40 text-amber-200 font-semibold text-[11.5px] flex items-center justify-center space-x-2 active:scale-[0.98] transition"
                    >
                      <Key className="w-3.5 h-3.5 text-amber-400" />
                      <span>Khóa Gemini API (Tùy chọn)</span>
                    </button>
                  )}
                </div>

                {showServerConfig && (
                  <div className="pt-2.5 border-t border-cyan-950/70 space-y-2.5 animate-in fade-in duration-150">
                    {serverHistory.length > 0 && (
                      <div className="space-y-1.5">
                        <div className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">
                          Danh sách máy chủ đã lưu (Chạm để đổi nhanh):
                        </div>
                        <div className="space-y-1 max-h-36 overflow-y-auto">
                          {serverHistory.map((entry) => {
                            const isCurrent = activeCustomUrl === entry.url;
                            return (
                              <div
                                key={entry.url}
                                className={`flex items-center justify-between gap-1.5 p-2 rounded-xl border text-[11px] ${
                                  isCurrent
                                    ? 'bg-cyan-950/50 border-cyan-500/60 text-cyan-200'
                                    : 'bg-[#090e1a] border-slate-800 text-slate-300 hover:border-slate-700'
                                }`}
                              >
                                <button
                                  onClick={() => handleSelectSavedServer(entry)}
                                  className="flex-1 min-w-0 text-left"
                                >
                                  <div className="font-semibold truncate flex items-center space-x-1.5">
                                    <span>{entry.label}</span>
                                    {isCurrent && (
                                      <span className="text-[9px] text-emerald-400">✓ Đang dùng</span>
                                    )}
                                  </div>
                                  <div className="text-[10px] text-slate-400 font-mono truncate">
                                    {entry.url}
                                  </div>
                                </button>
                                <button
                                  onClick={() => handleRemoveSavedServer(entry.url)}
                                  className="p-1.5 rounded-lg hover:bg-rose-950/50 text-slate-500 hover:text-rose-400 shrink-0"
                                  title="Xóa máy chủ khỏi danh sách"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    <div className="space-y-1.5">
                      <label className="text-[10px] text-slate-400 block font-medium">
                        Thêm hoặc thay đổi URL Máy chủ (Render, Cloud Run, Wi-Fi LAN):
                      </label>
                      <input
                        type="text"
                        value={serverInputLabel}
                        onChange={(e) => setServerInputLabel(e.target.value)}
                        placeholder="Tên gợi nhớ (VD: Server Render chính)"
                        className="w-full bg-[#070b14] border border-slate-700 rounded-xl px-2.5 py-2 text-[11px] text-slate-100 focus:outline-none focus:border-cyan-400"
                      />
                      <input
                        type="text"
                        value={serverInputUrl}
                        onChange={(e) => setServerInputUrl(e.target.value)}
                        placeholder="https://my-pydroid-server.onrender.com"
                        className="w-full bg-[#070b14] border border-slate-700 rounded-xl px-2.5 py-2 text-[11px] text-slate-100 font-mono focus:outline-none focus:border-cyan-400"
                      />
                      <div className="flex items-center justify-between pt-1">
                        <button
                          onClick={handleUseDefaultOffline}
                          className="px-2 py-1.5 text-[11px] text-slate-400 hover:text-white"
                        >
                          Mặc định (Offline)
                        </button>
                        <button
                          onClick={handleSaveCustomServer}
                          disabled={testingServer}
                          className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:brightness-110 text-white font-semibold text-[11px] flex items-center space-x-1 disabled:opacity-50"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>Lưu &amp; Kết nối</span>
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* 3. Tab Động cơ chạy Python — gộp thành 1 tab duy nhất có vách ngăn ở giữa */}
            <div>
              <div className="text-[10.5px] font-bold text-cyan-300/80 uppercase tracking-wider px-1.5 mb-1.5 flex items-center justify-between">
                <span>Động Cơ Chạy Python</span>
                <span className="text-[10px] text-amber-400 font-bold">
                  {engine === 'pyodide' ? 'Python 3.11 • Offline' : 'CPython 3.10 • Server'}
                </span>
              </div>

              <div className="rounded-2xl bg-gradient-to-b from-[#0b1324] to-[#080d18] border border-cyan-500/30 overflow-hidden shadow-[0_4px_18px_rgba(6,182,212,0.08)]">
                {/* 2-column unified switcher with crisp vertical center divider */}
                <div className="grid grid-cols-2 divide-x divide-cyan-500/30">
                  {/* Left: Pyodide WASM */}
                  <button
                    onClick={() => onChangeEngine('pyodide')}
                    className={`p-2.5 text-left transition flex flex-col justify-between gap-1.5 ${
                      engine === 'pyodide'
                        ? 'bg-gradient-to-b from-cyan-500/20 to-blue-600/10 text-cyan-50'
                        : 'text-slate-400 hover:bg-[#101a2f] hover:text-slate-200'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <Globe className={`w-4 h-4 shrink-0 ${engine === 'pyodide' ? 'text-cyan-300' : 'text-slate-500'}`} />
                      <span
                        className={`text-[9.5px] font-bold px-1.5 py-0.5 rounded-md ${
                          engine === 'pyodide'
                            ? 'bg-amber-400/20 text-amber-300 border border-amber-400/40'
                            : 'bg-slate-800/80 text-slate-400'
                        }`}
                      >
                        Offline
                      </span>
                    </div>
                    <div>
                      <div className="font-bold text-[12px] leading-tight">Pyodide WASM</div>
                      <div className="text-[10px] text-slate-400 mt-0.5 leading-snug">
                        Chạy trực tiếp trên APK
                      </div>
                      <div className="mt-1 flex items-center space-x-1 text-[9.5px]">
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            pyodideWarmState === 'ready'
                              ? 'bg-emerald-400'
                              : pyodideWarmState === 'warming'
                              ? 'bg-amber-400 animate-pulse'
                              : pyodideWarmState === 'error'
                              ? 'bg-rose-400'
                              : 'bg-slate-500'
                          }`}
                        />
                        <span
                          className={
                            pyodideWarmState === 'ready'
                              ? 'text-emerald-300'
                              : pyodideWarmState === 'warming'
                              ? 'text-amber-300'
                              : 'text-slate-400'
                          }
                        >
                          {pyodideWarmState === 'ready'
                            ? 'Đã nạp sẵn sàng'
                            : pyodideWarmState === 'warming'
                            ? 'Đang khởi động...'
                            : pyodideWarmState === 'error'
                            ? 'Cần mạng lần đầu'
                            : 'Chưa nạp'}
                        </span>
                      </div>
                    </div>
                  </button>

                  {/* Right: CPython Native */}
                  <button
                    onClick={() => onChangeEngine('cpython')}
                    className={`p-2.5 text-left transition flex flex-col justify-between gap-1.5 ${
                      engine === 'cpython'
                        ? 'bg-gradient-to-b from-emerald-500/20 to-teal-600/10 text-emerald-50'
                        : 'text-slate-400 hover:bg-[#101a2f] hover:text-slate-200'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <Cpu className={`w-4 h-4 shrink-0 ${engine === 'cpython' ? 'text-emerald-300' : 'text-slate-500'}`} />
                      <span
                        className={`text-[9.5px] font-bold px-1.5 py-0.5 rounded-md ${
                          engine === 'cpython'
                            ? 'bg-emerald-400/20 text-emerald-300 border border-emerald-400/40'
                            : 'bg-slate-800/80 text-slate-400'
                        }`}
                      >
                        Server
                      </span>
                    </div>
                    <div>
                      <div className="font-bold text-[12px] leading-tight">CPython 3.10</div>
                      <div className="text-[10px] text-slate-400 mt-0.5 leading-snug">
                        Linux Native Backend
                      </div>
                      <div className="mt-1 flex items-center space-x-1 text-[9.5px]">
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            cpythonWarmState === 'ready'
                              ? 'bg-emerald-400'
                              : cpythonWarmState === 'warming'
                              ? 'bg-amber-400 animate-pulse'
                              : cpythonWarmState === 'offline'
                              ? 'bg-rose-400'
                              : 'bg-slate-500'
                          }`}
                        />
                        <span
                          className={
                            cpythonWarmState === 'ready'
                              ? 'text-emerald-300'
                              : cpythonWarmState === 'warming'
                              ? 'text-amber-300'
                              : cpythonWarmState === 'offline'
                              ? 'text-rose-300'
                              : 'text-slate-400'
                          }
                        >
                          {cpythonWarmState === 'ready'
                            ? 'Máy chủ sẵn sàng'
                            : cpythonWarmState === 'warming'
                            ? 'Đang kết nối...'
                            : cpythonWarmState === 'offline'
                            ? 'Ngoại tuyến'
                            : 'Chờ kết nối'}
                        </span>
                      </div>
                    </div>
                  </button>
                </div>

                {engine === 'cpython' && !activeCustomUrl && isMobileOrApk() && (
                  <div className="p-2.5 border-t border-amber-500/35 bg-amber-950/35 text-[11px] text-amber-200 space-y-1.5">
                    <div className="flex items-center space-x-1.5 font-semibold text-amber-300">
                      <AlertCircle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                      <span>Chưa đặt URL Server riêng trên APK</span>
                    </div>
                    <button
                      onClick={() => onChangeEngine('pyodide')}
                      className="w-full py-1.5 rounded-lg bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-bold text-[11px] flex items-center justify-center space-x-1.5 transition"
                    >
                      <Globe className="w-3.5 h-3.5" />
                      <span>Chuyển nhanh sang Pyodide WASM</span>
                    </button>
                  </div>
                )}

                {(onOpenRamDiagnostics || onOptimizeMemory) && (
                  <div className="px-2.5 py-2 border-t border-cyan-500/20 bg-[#070d19]/80 space-y-1.5">
                    {onOpenRamDiagnostics && (
                      <button
                        type="button"
                        onClick={() => {
                          onOpenRamDiagnostics();
                          onClose();
                        }}
                        className="w-full min-h-[44px] py-2 px-3 rounded-xl bg-gradient-to-r from-cyan-500/20 to-sky-600/15 hover:from-cyan-500/30 hover:to-sky-600/25 border border-cyan-400/45 text-cyan-100 font-bold text-[11.5px] flex items-center justify-between gap-2 whitespace-nowrap active:scale-[0.98] transition"
                      >
                        <span className="flex items-center space-x-2">
                          <Activity className="w-4 h-4 text-cyan-300 shrink-0" />
                          <span>Chẩn đoán RAM</span>
                        </span>
                        <ChevronRight className="w-4 h-4 text-cyan-300 shrink-0" />
                      </button>
                    )}

                    {onOptimizeMemory && (
                      <button
                        type="button"
                        disabled={optimizingMem}
                        onClick={async () => {
                          setOptimizingMem(true);
                          try {
                            await onOptimizeMemory();
                          } finally {
                            setOptimizingMem(false);
                          }
                        }}
                        className="w-full py-1.5 px-2.5 rounded-xl bg-[#0e192f] hover:bg-[#162748] border border-cyan-500/30 text-cyan-200 font-semibold text-[11px] flex items-center justify-center space-x-1.5 whitespace-nowrap active:scale-[0.98] transition disabled:opacity-60"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 text-cyan-300 shrink-0 ${optimizingMem ? 'animate-spin' : ''}`} />
                        <span>
                          {optimizingMem
                            ? 'Đang giải phóng RAM & Cache...'
                            : 'Giải phóng RAM & Dọn Cache WASM'}
                        </span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* 4. Tab Đóng gói APK (Thêm nút tải về các file cập nhật cần thiết cho mã nguồn cũ) */}
            <div className="rounded-2xl bg-gradient-to-r from-[#241a0b] via-[#0d1424] to-[#080d18] border border-amber-500/45 shadow-[0_4px_18px_rgba(245,158,11,0.12)] overflow-hidden">
              <button
                onClick={() => {
                  onOpenApk();
                  onClose();
                }}
                className="w-full text-left px-3 py-2.5 hover:bg-amber-500/10 flex items-center justify-between gap-2.5 transition"
              >
                <div className="flex items-center space-x-3 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-400/25 to-orange-500/10 border border-amber-400/55 shadow-[0_0_14px_rgba(245,158,11,0.30)] flex items-center justify-center shrink-0">
                    <Smartphone className="w-5 h-5 text-amber-300" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-[13.5px] font-bold text-slate-50 truncate">
                      Đóng gói Android APK
                    </div>
                    <div className="text-[11px] text-slate-400 truncate">
                      Biến Python thành ứng dụng Android
                    </div>
                  </div>
                </div>
                <ChevronRight className="w-4.5 h-4.5 text-cyan-400 shrink-0" />
              </button>

              <div className="px-3 pb-2.5 pt-2 border-t border-amber-500/25 space-y-1.5">
                <button
                  onClick={handleDownloadUpdateFiles}
                  disabled={downloadingUpdate}
                  className="w-full py-2 px-3 rounded-xl bg-gradient-to-r from-amber-500/25 to-orange-500/15 hover:from-amber-500/35 hover:to-orange-500/25 border border-amber-400/55 text-amber-200 font-semibold text-[11px] flex items-center justify-center space-x-1.5 active:scale-[0.98] transition disabled:opacity-60"
                >
                  {downloadingUpdate ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin text-amber-300" />
                  ) : (
                    <Download className="w-3.5 h-3.5 text-amber-300" />
                  )}
                  <span>
                    {downloadingUpdate
                      ? 'Đang nén gói cập nhật offline...'
                      : 'Tải file cập nhật mã nguồn cũ (.ZIP)'}
                  </span>
                </button>
                <p className="text-[10px] text-slate-400 leading-snug px-0.5">
                  Tạo offline đủ <span className="font-mono text-amber-300/90">src/</span>, icon &amp; <span className="font-mono text-amber-300/90">build-apk.yml</span> (giải nén đè vào gốc repo, hoặc bấm &ldquo;Đóng gói Android APK&rdquo; ở trên để đẩy thẳng bằng Token GitHub).
                </p>
                {updateNotice && (
                  <div
                    className={`p-2 rounded-xl text-[10.5px] border leading-snug ${
                      updateNotice.ok
                        ? 'bg-emerald-950/40 border-emerald-500/45 text-emerald-200'
                        : 'bg-rose-950/40 border-rose-500/45 text-rose-200'
                    }`}
                  >
                    {updateNotice.text}
                  </div>
                )}
              </div>
            </div>

            {/* 5. Quản lý thư viện (Pip) */}
            <button
              onClick={() => {
                onOpenPip();
                onClose();
              }}
              className="w-full text-left px-3 py-2.5 rounded-2xl bg-gradient-to-r from-[#1b1230] via-[#0c1324] to-[#080d18] border border-purple-500/35 hover:border-purple-400/70 shadow-[0_4px_18px_rgba(168,85,247,0.10)] flex items-center justify-between gap-2.5 transition active:scale-[0.99]"
            >
              <div className="flex items-center space-x-3 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500/25 to-fuchsia-500/10 border border-purple-400/50 shadow-[0_0_14px_rgba(168,85,247,0.28)] flex items-center justify-center shrink-0">
                  <Package className="w-5 h-5 text-purple-300" />
                </div>
                <div className="min-w-0">
                  <div className="text-[13.5px] font-bold text-slate-50 truncate">
                    Quản lý thư viện Pip
                  </div>
                  <div className="text-[11px] text-slate-400 truncate">
                    Cài đặt và quản lý thư viện Python
                  </div>
                </div>
              </div>
              <ChevronRight className="w-4.5 h-4.5 text-cyan-400 shrink-0" />
            </button>

            {/* 6. Tô màu văn bản (và cỡ chữ trình soạn thảo) */}
            <div className="rounded-2xl bg-gradient-to-r from-[#231910] via-[#101424] to-[#080d18] border border-amber-500/35 overflow-hidden">
              <button
                onClick={() => {
                  onOpenSyntaxColor();
                  onClose();
                }}
                className="w-full px-3 py-2.5 hover:bg-amber-500/10 text-slate-100 font-semibold text-xs flex items-center justify-between gap-2.5 transition"
              >
                <div className="flex items-center space-x-3 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-400/25 to-purple-500/15 border border-amber-400/50 shadow-[0_0_14px_rgba(245,158,11,0.20)] flex items-center justify-center shrink-0">
                    <Palette className="w-5 h-5 text-amber-300" />
                  </div>
                  <div className="text-left min-w-0">
                    <div className="text-[13.5px] font-bold text-slate-50 truncate">
                      Tô Màu Văn Bản (Designer)
                    </div>
                    <div className="text-[11px] text-slate-400 truncate">
                      Tùy chỉnh bảng màu cú pháp Python
                    </div>
                  </div>
                </div>
                <ChevronRight className="w-4.5 h-4.5 text-cyan-400 shrink-0" />
              </button>

              <div className="px-3 py-2 border-t border-cyan-950/60 bg-[#080d18]/75 flex items-center justify-between text-xs">
                <div>
                  <div className="text-slate-200 font-semibold text-[11.5px]">Cỡ chữ trình soạn thảo</div>
                  <div className="text-[10px] text-slate-400">Hiện tại: {fontSize}px</div>
                </div>
                <div className="flex items-center space-x-1.5">
                  <button
                    onClick={() => onChangeFontSize(-1)}
                    className="w-9 h-9 rounded-xl bg-[#0e192f] hover:bg-[#162748] border border-slate-700 text-slate-200 flex items-center justify-center transition"
                    aria-label="Giảm cỡ chữ"
                  >
                    <ZoomOut className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => onChangeFontSize(1)}
                    className="w-9 h-9 rounded-xl bg-[#0e192f] hover:bg-[#162748] border border-slate-700 text-slate-200 flex items-center justify-center transition"
                    aria-label="Tăng cỡ chữ"
                  >
                    <ZoomIn className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>

            {/* 7. Sao lưu toàn bộ cấu hình máy thành 1 file duy nhất */}
            {onExportFullBackup && (
              <div className="rounded-2xl bg-gradient-to-b from-[#0d2229] via-[#0b1324] to-[#080d18] border border-teal-500/40 shadow-[0_4px_18px_rgba(20,184,166,0.12)] overflow-hidden">
                <div className="px-3 py-2.5 flex items-center space-x-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-teal-400/25 to-cyan-500/10 border border-teal-400/50 shadow-[0_0_14px_rgba(20,184,166,0.25)] flex items-center justify-center shrink-0">
                    <Archive className="w-5 h-5 text-teal-300" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-bold text-slate-50 leading-tight">
                      Sao Lưu Cấu Hình Máy (1 File)
                    </div>
                    <div className="text-[10.5px] text-teal-300/85 mt-0.5 leading-snug">
                      Phím tắt ({shortcutsCount}) • Tô màu văn bản • Thư viện Pip ({pipPackagesCount})
                    </div>
                  </div>
                </div>

                <div className="px-3 pb-3 pt-2 border-t border-teal-500/20 space-y-2">
                  <button
                    onClick={handleExportConfigClick}
                    disabled={backupBusy}
                    className="w-full py-2 px-3 rounded-xl bg-gradient-to-r from-teal-500 to-cyan-600 hover:brightness-110 text-white font-bold text-[11.5px] flex items-center justify-center space-x-2 shadow-md active:scale-[0.98] transition disabled:opacity-60"
                  >
                    {backupBusy ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Download className="w-3.5 h-3.5" />
                    )}
                    <span>{backupBusy ? 'Đang đóng gói...' : 'Sao lưu toàn bộ thành 1 file'}</span>
                  </button>

                  <div className="grid grid-cols-2 gap-1.5">
                    {onImportFullBackupFile && (
                      <label className="py-2 px-2 rounded-xl bg-[#0e192f] hover:bg-[#162748] border border-cyan-500/35 text-cyan-200 font-semibold text-[11px] flex items-center justify-center space-x-1.5 cursor-pointer active:scale-[0.98] transition">
                        <Upload className="w-3.5 h-3.5 text-cyan-300 shrink-0" />
                        <span className="truncate">Khôi phục từ file</span>
                        <input
                          type="file"
                          accept=".json,application/json,text/plain"
                          onChange={handleImportConfigFileChange}
                          disabled={backupBusy}
                          className="hidden"
                        />
                      </label>
                    )}

                    {onRestoreFullBackupFromFolder && (
                      <button
                        onClick={handleRestoreFromFolderClick}
                        disabled={backupBusy}
                        className="py-2 px-2 rounded-xl bg-[#0e192f] hover:bg-[#162748] border border-emerald-500/35 text-emerald-200 font-semibold text-[11px] flex items-center justify-center space-x-1.5 active:scale-[0.98] transition disabled:opacity-60"
                      >
                        <FolderOpen className="w-3.5 h-3.5 text-emerald-300 shrink-0" />
                        <span className="truncate">Từ thư mục máy</span>
                      </button>
                    )}
                  </div>

                  <p className="text-[10px] text-slate-400 leading-snug px-0.5 break-all">
                    File: <span className="font-mono text-teal-300/90">Documents/{getDefaultFolderPath()}/{FULL_BACKUP_FILENAME}</span>
                  </p>

                  {backupNotice && (
                    <div
                      className={`p-2 rounded-xl text-[10.5px] border leading-snug ${
                        backupNotice.ok
                          ? 'bg-emerald-950/40 border-emerald-500/45 text-emerald-200'
                          : 'bg-rose-950/40 border-rose-500/45 text-rose-200'
                      }`}
                    >
                      {backupNotice.text}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Dark Premium Drawer Footer */}
          <div className="px-4 py-3 bg-[#060911] border-t border-cyan-950/70 flex items-center justify-between text-[10.5px] text-slate-400">
            <span className="font-semibold text-slate-300">
              {engine === 'pyodide' ? 'Python 3.11 • Offline' : 'CPython 3.10 • Server'}
            </span>
            <span className="text-cyan-400/80 font-mono truncate max-w-[145px]">
              {activeCustomUrl ? 'Server: Custom' : 'Local / Studio'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
