import React from 'react';
import { User } from 'firebase/auth';

interface HeaderProps {
  onRun: () => void;
  isRunning: boolean;
  viewMode: 'editor' | 'terminal';
  onChangeViewMode: (mode: 'editor' | 'terminal') => void;
  onOpenAIAssistant: (tab?: 'chat' | 'debug' | 'explain') => void;
  onOpenFolderMenu: () => void;
  onClearCurrentView: () => void;
  onOpenGoogleWorkspace?: () => void;
  googleUser?: User | null;
  hasGoogleToken?: boolean;
  onToggleDrawer: () => void;
  hasError: boolean;
  aiStatus?: 'online' | 'offline' | 'checking';
  aiStatusTooltip?: string;
  onCheckAiStatus?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  onRun,
  isRunning,
  viewMode,
  onChangeViewMode,
  onOpenAIAssistant,
  onOpenFolderMenu,
  onClearCurrentView,
  onOpenGoogleWorkspace,
  googleUser,
  hasGoogleToken = false,
  onToggleDrawer,
  hasError,
  aiStatus = 'online',
  aiStatusTooltip = 'Máy chủ AI sẵn sàng',
  onCheckAiStatus,
}) => {
  const isGoogleConnected = !!(googleUser && hasGoogleToken);

  return (
    <header className="bg-[#070b14] border-b border-cyan-950/70 pt-[env(safe-area-inset-top,0px)] px-1.5 sm:px-3 py-1.5 select-none shrink-0 relative z-30">
      {/* Dark Premium Editor Toolbar — gently rounded buttons matching reference style, preserving exact app controls */}
      <div className="w-full flex items-center gap-1.5">
        {/* Drawer Menu Button (Gently rounded) */}
        <button
          onClick={onToggleDrawer}
          className="w-9 sm:w-10 h-9 sm:h-10 rounded-xl bg-gradient-to-b from-[#131d33] to-[#0b1222] hover:from-[#192642] hover:to-[#0f182e] border border-cyan-500/35 text-slate-200 hover:text-cyan-300 flex items-center justify-center shadow-sm active:scale-95 transition shrink-0"
          title="Menu Pydroid 3"
          aria-label="Mở menu tùy chọn"
        >
          <svg viewBox="0 0 24 24" className="w-4.5 h-4.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
            <path d="M4 7h16" />
            <path d="M4 12h12" />
            <path d="M4 17h16" />
          </svg>
        </button>

        {/* Primary ▶ RUN CTA (Gently rounded amber button) */}
        <button
          onClick={onRun}
          disabled={isRunning}
          title="Chạy mã Python"
          className="h-9 sm:h-10 px-3 sm:px-3.5 rounded-xl bg-gradient-to-b from-amber-300 via-amber-400 to-amber-500 hover:from-amber-200 hover:to-amber-400 active:translate-y-[1px] text-slate-950 font-extrabold flex items-center justify-center gap-1 sm:gap-1.5 border border-amber-200/75 shadow-[0_2px_0_#92400e,0_4px_12px_rgba(245,158,11,0.2)] transition disabled:opacity-60 text-xs sm:text-[13px] shrink-0 tracking-wide"
        >
          {isRunning ? (
            <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 animate-spin" fill="none" stroke="currentColor" strokeWidth="2.6">
              <path d="M21 12a9 9 0 1 1-6.219-8.56" strokeLinecap="round" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-slate-950">
              <path d="M7.5 5.25a1 1 0 0 1 1.52-.85l10.5 6.75a1 1 0 0 1 0 1.7l-10.5 6.75a1 1 0 0 1-1.52-.85V5.25z" />
            </svg>
          )}
          <span className="whitespace-nowrap">{isRunning ? 'CHẠY' : 'RUN'}</span>
        </button>

        {/* Editor </> vs Terminal >_ Segmented Pill Switch (Gently rounded) */}
        <div className="h-9 sm:h-10 rounded-xl bg-[#0a101d] border border-slate-700/80 p-0.5 flex items-center gap-0.5 shrink-0">
          <button
            onClick={() => onChangeViewMode('editor')}
            title="Trình soạn thảo mã"
            aria-label="Trình soạn thảo"
            className={`w-8 sm:w-10 h-full rounded-[9px] flex items-center justify-center transition ${
              viewMode === 'editor'
                ? 'bg-gradient-to-b from-blue-500 to-blue-700 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-100 hover:bg-[#131d33]'
            }`}
          >
            <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m8 8-4 4 4 4" />
              <path d="m16 8 4 4-4 4" />
              <path d="m13.5 5-3 14" />
            </svg>
          </button>
          <button
            onClick={() => onChangeViewMode('terminal')}
            title="Màn hình Terminal"
            aria-label="Terminal"
            className={`w-8 sm:w-10 h-full rounded-[9px] flex items-center justify-center transition ${
              viewMode === 'terminal'
                ? 'bg-gradient-to-b from-cyan-500 to-teal-700 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-100 hover:bg-[#131d33]'
            }`}
          >
            <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m5 7 5 5-5 5" />
              <path d="M12 17h7" />
            </svg>
          </button>
        </div>

        {/* Crisp Vertical Divider */}
        <div className="w-px h-6 bg-slate-700/80 shrink-0" />

        {/* Right Action Buttons (Gently rounded corners + comfortable wider horizontal tap targets) */}
        <div className="flex-1 flex items-center gap-1.5 sm:justify-end">
          {/* AI Assistant / Error Debugger */}
          <button
            onClick={() => onOpenAIAssistant(hasError ? 'debug' : 'chat')}
            onContextMenu={(e) => {
              e.preventDefault();
              onCheckAiStatus?.();
            }}
            title={`Trợ lý AI & Gỡ lỗi Python (${aiStatusTooltip})`}
            aria-label="Trợ lý AI & Gỡ lỗi"
            className={`relative flex-1 sm:flex-none sm:w-12 md:w-14 h-9 sm:h-10 rounded-xl border flex items-center justify-center shadow-sm active:scale-95 transition ${
              hasError
                ? 'bg-gradient-to-b from-rose-600 to-rose-800 border-rose-400/80 text-amber-200'
                : 'bg-gradient-to-b from-[#2c2109] to-[#1a1305] hover:from-[#3a2b0d] hover:to-[#221907] border-amber-400/75 text-amber-300'
            }`}
          >
            {hasError ? (
              <svg viewBox="0 0 24 24" className="w-4.5 h-4.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="m8 2 1.88 1.88M14.12 3.88 16 2" />
                <path d="M9 7.13v-1a3 3 0 1 1 6 0v1" />
                <path d="M12 20c-3.3 0-6-2.7-6-6v-3a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v3c0 3.3-2.7 6-6 6" />
                <path d="M12 20v-9M6.53 9C4.6 8.8 3 7.1 3 5M6 13H2M3 21c0-2.1 1.7-3.9 3.8-4M20.97 5c0 2.1-1.6 3.8-3.5 4M22 13h-4M17.2 17c2.1.1 3.8 1.9 3.8 4" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" className="w-4.5 h-4.5 fill-amber-400">
                <path d="M12 3l1.7 4.3L18 9l-4.3 1.7L12 15l-1.7-4.3L6 9l4.3-1.7L12 3z" />
                <circle cx="7.5" cy="17" r="1.6" />
                <path d="M17.5 14.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7.7-1.8z" />
              </svg>
            )}
            <span
              className={`absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full ring-2 ring-[#070b14] ${
                aiStatus === 'online'
                  ? 'bg-emerald-400'
                  : aiStatus === 'checking'
                  ? 'bg-amber-400'
                  : 'bg-rose-500'
              }`}
            />
          </button>

          {/* Folder (Tệp & Mã Nguồn) */}
          <button
            onClick={onOpenFolderMenu}
            title="Tệp & Mã Nguồn"
            aria-label="Mở Tệp và Mã Nguồn"
            className="flex-1 sm:flex-none sm:w-12 md:w-14 h-9 sm:h-10 rounded-xl bg-gradient-to-b from-[#0d2642] to-[#08172b] hover:from-[#123357] hover:to-[#0b203a] border border-cyan-400/70 text-cyan-300 flex items-center justify-center shadow-sm active:scale-95 transition"
          >
            <svg viewBox="0 0 24 24" className="w-4.5 h-4.5" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 7a2 2 0 0 1 2-2h4.2a2 2 0 0 1 1.56.75L12 7.25A2 2 0 0 0 13.56 8H19a2 2 0 0 1 2 2v7.5a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5V7z" />
            </svg>
          </button>

          {/* Trash (Xóa mã / Terminal) */}
          <button
            onClick={onClearCurrentView}
            title={viewMode === 'editor' ? 'Xóa trắng mã trong tệp' : 'Xóa màn hình Terminal'}
            aria-label={viewMode === 'editor' ? 'Xóa mã nguồn' : 'Xóa Terminal'}
            className="flex-1 sm:flex-none sm:w-12 md:w-14 h-9 sm:h-10 rounded-xl bg-gradient-to-b from-[#33111f] to-[#1e0a12] hover:from-[#441629] hover:to-[#280e18] border border-rose-400/70 text-rose-300 flex items-center justify-center shadow-sm active:scale-95 transition"
          >
            <svg viewBox="0 0 24 24" className="w-4.5 h-4.5" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 7h16" />
              <path d="M9.5 4h5a1 1 0 0 1 1 1v2h-7V5a1 1 0 0 1 1-1z" />
              <path d="M6.5 7l1 12a2 2 0 0 0 2 1.8h5a2 2 0 0 0 2-1.8l1-12" />
              <path d="M10 11.5v5M14 11.5v5" />
            </svg>
          </button>

          {/* Google Account & Drive */}
          {onOpenGoogleWorkspace && (
            <button
              onClick={onOpenGoogleWorkspace}
              title={
                isGoogleConnected
                  ? `Google: ${googleUser?.email || googleUser?.displayName}`
                  : 'Tài khoản Google & Đồng bộ Drive'
              }
              aria-label="Tài khoản Google và Drive"
              className={`relative flex-1 sm:flex-none sm:w-12 md:w-14 h-9 sm:h-10 rounded-xl border flex items-center justify-center shadow-sm active:scale-95 transition ${
                isGoogleConnected
                  ? 'bg-gradient-to-b from-[#0f2b3f] to-[#091c2b] border-emerald-400/70'
                  : 'bg-gradient-to-b from-[#131d33] to-[#0b1222] hover:from-[#1a2744] hover:to-[#101a30] border-sky-400/60'
              }`}
            >
              {googleUser?.photoURL && isGoogleConnected ? (
                <img
                  src={googleUser.photoURL}
                  alt="Google"
                  className="w-5.5 h-5.5 rounded-full object-cover ring-1 ring-emerald-400/80"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <svg viewBox="0 0 48 48" className="w-4.5 h-4.5">
                  <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
                  <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
                  <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
                  <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
                </svg>
              )}
              <span
                className={`absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full ring-2 ring-[#070b14] ${
                  isGoogleConnected ? 'bg-emerald-400' : 'bg-slate-400'
                }`}
              />
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
