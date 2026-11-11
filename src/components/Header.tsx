import React, { useState } from 'react';
import {
  Menu,
  Play,
  RotateCw,
  Bug,
  GraduationCap,
  Folder,
  Trash2,
  Settings,
  Palette,
  MessageSquareCode,
  Key,
} from 'lucide-react';
import { EngineType } from '../types';

interface HeaderProps {
  engine: EngineType;
  onChangeEngine: (engine: EngineType) => void;
  onRun: () => void;
  isRunning: boolean;
  viewMode: 'editor' | 'terminal';
  onChangeViewMode: (mode: 'editor' | 'terminal') => void;
  onOpenAIAssistant: (tab?: 'chat' | 'debug' | 'explain') => void;
  onOpenSamples: () => void;
  onOpenFolderMenu: () => void;
  onClearCurrentView: () => void;
  onOpenSyntaxColor: () => void;
  onOpenApiKeySettings?: () => void;
  onToggleDrawer: () => void;
  hasError: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  engine,
  onChangeEngine,
  onRun,
  isRunning,
  viewMode,
  onChangeViewMode,
  onOpenAIAssistant,
  onOpenSamples,
  onOpenFolderMenu,
  onClearCurrentView,
  onOpenSyntaxColor,
  onOpenApiKeySettings,
  onToggleDrawer,
  hasError,
}) => {
  const [showSettingsMenu, setShowSettingsMenu] = useState(false);

  return (
    <header className="h-14 bg-[#11131a] border-b border-slate-800/90 px-2 sm:px-3 flex items-center justify-between select-none shadow-md shrink-0 z-30">
      {/* Left: Hamburger 3-line Menu (Retained as requested) */}
      <div className="flex items-center space-x-1.5 shrink-0">
        <button
          onClick={onToggleDrawer}
          className="p-2 rounded-xl hover:bg-slate-800/80 text-slate-300 hover:text-white transition active:scale-95"
          title="Menu tùy chọn Pydroid 3"
        >
          <Menu className="w-5 h-5" />
        </button>

        {/* ▶ RUN button (Exact style from Screenshot 1 & 2: Yellow pill button) */}
        <button
          onClick={onRun}
          disabled={isRunning}
          title="Thực thi mã nguồn Python"
          className="px-3.5 sm:px-4 py-1.5 rounded-lg bg-amber-400 hover:bg-amber-300 active:bg-amber-500 text-slate-950 font-bold flex items-center space-x-1.5 shadow-md transition active:scale-95 disabled:opacity-50 text-xs sm:text-sm"
        >
          {isRunning ? (
            <RotateCw className="w-4 h-4 animate-spin text-slate-950" />
          ) : (
            <Play className="w-4 h-4 fill-slate-950 text-slate-950" />
          )}
          <span>{isRunning ? 'RUNNING' : 'RUN'}</span>
        </button>
      </div>

      {/* Middle & Right Buttons: View Toggle, Bug, Cap, Folder, Trash, Settings (Screenshots 1 & 2) */}
      <div className="flex items-center space-x-1 sm:space-x-1.5">
        {/* Toggle Editor </> vs Terminal >_ */}
        <div className="flex items-center bg-[#1c212f] p-1 rounded-xl border border-slate-800">
          <button
            onClick={() => onChangeViewMode('editor')}
            title="Xem Trình Soạn Thảo (Editor)"
            className={`px-2.5 py-1 rounded-lg text-xs font-mono font-bold transition ${
              viewMode === 'editor'
                ? 'bg-blue-600 text-white shadow'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            &lt;/&gt;
          </button>
          <button
            onClick={() => onChangeViewMode('terminal')}
            title="Xem Màn Hình Terminal"
            className={`px-2.5 py-1 rounded-lg text-xs font-mono font-bold transition ${
              viewMode === 'terminal'
                ? 'bg-teal-600 text-white shadow'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            &gt;_
          </button>
        </div>

        {/* Bug button: Red rounded button with yellow dot badge (Opens Unified AI Assistant) */}
        <button
          onClick={() => onOpenAIAssistant(hasError ? 'debug' : 'chat')}
          title="Trợ lý AI Gemini (Trò chuyện & Gỡ lỗi)"
          className={`relative p-2 rounded-xl text-white transition active:scale-95 shadow ${
            hasError
              ? 'bg-rose-600 hover:bg-rose-500 animate-pulse ring-2 ring-rose-400/50'
              : 'bg-rose-600/90 hover:bg-rose-600'
          }`}
        >
          <Bug className="w-4 h-4 text-white" />
          {/* Yellow notification dot */}
          <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-amber-300 ring-1 ring-slate-950" />
        </button>

        {/* Cap button: Green rounded button (Mẫu mã & Học tập) */}
        <button
          onClick={onOpenSamples}
          title="Kho mã mẫu Python sẵn có"
          className="p-2 rounded-xl bg-emerald-600/90 hover:bg-emerald-600 text-white transition active:scale-95 shadow"
        >
          <GraduationCap className="w-4 h-4 text-white" />
        </button>

        {/* Folder button: Blue rounded button (Quản lý file / Pip / APK) */}
        <button
          onClick={onOpenFolderMenu}
          title="Quản lý tệp, Pip & Đóng gói APK"
          className="p-2 rounded-xl bg-sky-600/90 hover:bg-sky-600 text-white transition active:scale-95 shadow"
        >
          <Folder className="w-4 h-4 text-white" />
        </button>

        {/* Trash button: Magenta/red rounded button (Xóa nội dung) */}
        <button
          onClick={onClearCurrentView}
          title={viewMode === 'editor' ? 'Xóa mã trong editor' : 'Xóa màn hình terminal'}
          className="p-2 rounded-xl bg-rose-500/80 hover:bg-rose-500 text-white transition active:scale-95 shadow"
        >
          <Trash2 className="w-4 h-4 text-white" />
        </button>

        {/* Settings button: Orange rounded button (Tô màu cú pháp & Cài đặt) */}
        <div className="relative">
          <button
            onClick={() => setShowSettingsMenu(!showSettingsMenu)}
            title="Cài đặt & Tô màu cú pháp"
            className="p-2 rounded-xl bg-amber-600/90 hover:bg-amber-600 text-white transition active:scale-95 shadow"
          >
            <Settings className="w-4 h-4 text-white" />
          </button>

          {/* Settings Quick Dropdown Menu */}
          {showSettingsMenu && (
            <div
              className="absolute right-0 top-full mt-2 w-56 bg-[#1a1e2b] border border-slate-700/80 rounded-2xl shadow-2xl p-1.5 z-50 text-xs animate-in fade-in duration-150"
              onClick={() => setShowSettingsMenu(false)}
            >
              <button
                onClick={() => onOpenAIAssistant('chat')}
                className="w-full text-left p-2.5 rounded-xl hover:bg-slate-800 text-sky-300 flex items-center space-x-2 font-medium"
              >
                <MessageSquareCode className="w-4 h-4 text-sky-400" />
                <span>Trợ lý AI (Trò chuyện & Gỡ lỗi)</span>
              </button>

              <button
                onClick={onOpenSyntaxColor}
                className="w-full text-left p-2.5 rounded-xl hover:bg-slate-800 text-amber-300 flex items-center space-x-2 font-medium"
              >
                <Palette className="w-4 h-4 text-amber-400" />
                <span>Tô Màu Văn Bản (Designer)</span>
              </button>

              {onOpenApiKeySettings && (
                <button
                  onClick={onOpenApiKeySettings}
                  className="w-full text-left p-2.5 rounded-xl hover:bg-slate-800 text-amber-200 flex items-center space-x-2 font-medium"
                >
                  <Key className="w-4 h-4 text-amber-400" />
                  <span>Cài Đặt Khóa API (Gemini Key)</span>
                </button>
              )}

              <div className="h-px bg-slate-800 my-1" />

              <div className="px-2.5 py-1 text-[10px] text-slate-400 uppercase tracking-wider font-semibold">
                Động cơ chạy mã
              </div>

              <button
                onClick={() => onChangeEngine('cpython')}
                className={`w-full text-left px-2.5 py-1.5 rounded-lg flex items-center justify-between ${
                  engine === 'cpython' ? 'bg-emerald-950/60 text-emerald-300 font-bold' : 'text-slate-300 hover:bg-slate-800'
                }`}
              >
                <span>CPython Native (Linux)</span>
                {engine === 'cpython' && <span className="text-[10px] text-emerald-400">✓</span>}
              </button>

              <button
                onClick={() => onChangeEngine('pyodide')}
                className={`w-full text-left px-2.5 py-1.5 rounded-lg flex items-center justify-between ${
                  engine === 'pyodide' ? 'bg-sky-950/60 text-sky-300 font-bold' : 'text-slate-300 hover:bg-slate-800'
                }`}
              >
                <span>Pyodide WASM (Offline)</span>
                {engine === 'pyodide' && <span className="text-[10px] text-sky-400">✓</span>}
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
