import React, { useState } from 'react';
import {
  X,
  FolderOpen,
  FilePlus,
  Save,
  Download,
  Upload,
  RotateCcw,
  Search,
  Copy,
  Check,
  FileCode2,
  Pencil,
  Trash2,
  CheckCircle2,
} from 'lucide-react';
import { CodeFile } from '../types';

interface FileManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  files: CodeFile[];
  activeFileId: string;
  onSelectFile: (id: string) => void;
  onCreateFile: (filename: string) => void;
  onRenameFile: (id: string, newName: string) => void;
  onCloseFile: (id: string) => void;
  onSaveToLocal: () => void;
  onDownloadPy: () => void;
  onUploadPy: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onResetCode: () => void;
  onOpenEditorSearch: () => void;
  onCopyAllCode: () => void;
}

export const FileManagerModal: React.FC<FileManagerModalProps> = ({
  isOpen,
  onClose,
  files,
  activeFileId,
  onSelectFile,
  onCreateFile,
  onRenameFile,
  onCloseFile,
  onSaveToLocal,
  onDownloadPy,
  onUploadPy,
  onResetCode,
  onOpenEditorSearch,
  onCopyAllCode,
}) => {
  const [newFileName, setNewFileName] = useState('');
  const [showNewInput, setShowNewInput] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [confirmReset, setConfirmReset] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const activeFile = files.find((f) => f.id === activeFileId) || files[0];

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newFileName.trim();
    if (!trimmed) return;
    onCreateFile(trimmed);
    setNewFileName('');
    setShowNewInput(false);
    setNotice(`Đã tạo và mở tệp ${trimmed.endsWith('.py') ? trimmed : `${trimmed}.py`}`);
  };

  const handleStartRename = (file: CodeFile) => {
    setRenamingId(file.id);
    setRenameValue(file.name);
  };

  const handleSaveRename = (id: string) => {
    const trimmed = renameValue.trim();
    if (trimmed) {
      onRenameFile(id, trimmed);
      setNotice(`Đã đổi tên tệp thành ${trimmed.endsWith('.py') ? trimmed : `${trimmed}.py`}`);
    }
    setRenamingId(null);
  };

  const handleCopy = () => {
    onCopyAllCode();
    setCopied(true);
    setNotice('Đã sao chép toàn bộ mã nguồn vào khay nhớ tạm!');
    setTimeout(() => setCopied(false), 1800);
  };

  const handleSaveLocal = () => {
    onSaveToLocal();
    setNotice('Đã lưu tất cả tệp mã nguồn vào bộ nhớ máy!');
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-start sm:items-center justify-center p-2.5 sm:p-4 pt-[calc(0.75rem+env(safe-area-inset-top,0px))] pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg max-h-[86vh] bg-[#070b14] border border-cyan-500/35 rounded-2xl shadow-[0_12px_40px_rgba(0,0,0,0.85)] flex flex-col overflow-hidden text-slate-100"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header — Dark Premium */}
        <div className="px-4 py-3 bg-gradient-to-r from-[#0c162b] via-[#091122] to-[#111226] border-b border-cyan-500/25 flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-cyan-500/25 to-blue-600/15 border border-cyan-400/50 shadow-[0_0_12px_rgba(34,211,238,0.2)] flex items-center justify-center shrink-0">
              <FolderOpen className="w-4.5 h-4.5 text-cyan-300" />
            </div>
            <div className="min-w-0">
              <h2 className="font-bold text-sm text-white truncate">Tệp &amp; Mã Nguồn</h2>
              <p className="text-[11px] text-slate-400 truncate">
                Đang mở: <span className="text-cyan-300 font-mono">{activeFile?.name}</span> ({files.length} tệp)
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-xl bg-[#0e192f] hover:bg-[#162748] border border-cyan-500/25 text-slate-300 hover:text-cyan-300 flex items-center justify-center transition shrink-0"
            aria-label="Đóng quản lý tệp"
          >
            <X className="w-4.5 h-4.5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-3.5 space-y-3.5">
          {notice && (
            <div className="px-3 py-2 rounded-xl bg-emerald-950/50 border border-emerald-500/45 text-emerald-200 text-xs flex items-center space-x-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{notice}</span>
            </div>
          )}

          {/* Open Files Switcher */}
          <div className="space-y-2">
            <div className="flex items-center justify-between px-0.5">
              <span className="text-[10.5px] font-bold uppercase tracking-wider text-cyan-300/80">
                Danh Sách Tệp Đang Mở
              </span>
              <button
                onClick={() => setShowNewInput((v) => !v)}
                className="px-2.5 py-1.5 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-400/50 text-emerald-300 text-xs font-semibold flex items-center space-x-1.5 transition"
              >
                <FilePlus className="w-3.5 h-3.5" />
                <span>Tạo file mới</span>
              </button>
            </div>

            {showNewInput && (
              <form
                onSubmit={handleCreateSubmit}
                className="flex items-center space-x-2 p-2 rounded-xl bg-[#0b1324] border border-emerald-500/45"
              >
                <input
                  type="text"
                  autoFocus
                  value={newFileName}
                  onChange={(e) => setNewFileName(e.target.value)}
                  placeholder="Tên file mới (VD: may_tinh.py)"
                  className="flex-1 bg-transparent px-2 py-1 text-xs font-mono text-slate-100 focus:outline-none"
                />
                <button
                  type="submit"
                  className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold"
                >
                  Tạo
                </button>
              </form>
            )}

            <div className="rounded-2xl bg-[#0a1120] border border-cyan-500/25 divide-y divide-cyan-950/70 max-h-44 overflow-y-auto">
              {files.map((file) => {
                const isActive = file.id === activeFileId;
                const isRenaming = renamingId === file.id;
                return (
                  <div
                    key={file.id}
                    className={`px-3 py-2 flex items-center justify-between gap-2 transition ${
                      isActive ? 'bg-cyan-500/12' : 'hover:bg-[#101a30]'
                    }`}
                  >
                    {isRenaming ? (
                      <div className="flex-1 flex items-center space-x-1.5">
                        <input
                          type="text"
                          autoFocus
                          value={renameValue}
                          onChange={(e) => setRenameValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSaveRename(file.id);
                            if (e.key === 'Escape') setRenamingId(null);
                          }}
                          className="flex-1 bg-[#070b14] border border-cyan-500/60 rounded-lg px-2 py-1 text-xs font-mono text-slate-100 focus:outline-none"
                        />
                        <button
                          onClick={() => handleSaveRename(file.id)}
                          className="px-2.5 py-1 rounded-lg bg-cyan-600 text-white text-xs font-semibold"
                        >
                          Lưu
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => {
                          onSelectFile(file.id);
                          onClose();
                        }}
                        className="flex-1 min-w-0 flex items-center space-x-2.5 text-left"
                      >
                        <FileCode2
                          className={`w-4 h-4 shrink-0 ${isActive ? 'text-cyan-300' : 'text-slate-500'}`}
                        />
                        <div className="min-w-0">
                          <div
                            className={`text-xs font-mono truncate ${
                              isActive ? 'text-cyan-200 font-bold' : 'text-slate-200'
                            }`}
                          >
                            {file.name}
                          </div>
                          <div className="text-[10px] text-slate-400">
                            {file.content.split('\n').length} dòng
                            {isActive ? ' • Đang chỉnh sửa' : ''}
                          </div>
                        </div>
                      </button>
                    )}

                    {!isRenaming && (
                      <div className="flex items-center space-x-1 shrink-0">
                        <button
                          onClick={() => handleStartRename(file)}
                          className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-cyan-300 transition"
                          title="Đổi tên tệp"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        {files.length > 1 && (
                          <button
                            onClick={() => onCloseFile(file.id)}
                            className="p-1.5 rounded-lg hover:bg-rose-950/50 text-slate-400 hover:text-rose-400 transition"
                            title="Đóng tệp"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Grouped Action Tabs with Vertical Dividers */}
          <div className="space-y-2.5">
            <div className="text-[10.5px] font-bold uppercase tracking-wider text-cyan-300/80 px-0.5">
              Thao Tác Tệp &amp; Trình Soạn Thảo
            </div>

            {/* Tab 1: Lưu máy | Tải về .py | Mở từ máy (3 actions separated by vertical dividers) */}
            <div className="rounded-2xl bg-gradient-to-b from-[#0d172b] to-[#080e1c] border border-cyan-500/30 overflow-hidden grid grid-cols-3 divide-x divide-cyan-500/25">
              <button
                onClick={handleSaveLocal}
                className="min-h-[64px] px-2 py-2.5 hover:bg-cyan-500/10 active:bg-cyan-500/20 flex flex-col items-center justify-center gap-1.5 text-center transition"
              >
                <Save className="w-4.5 h-4.5 text-cyan-300 shrink-0" />
                <span className="text-[11px] font-semibold text-slate-100 leading-tight">
                  Lưu máy
                </span>
              </button>

              <button
                onClick={() => {
                  onDownloadPy();
                  setNotice(`Đang tải xuống ${activeFile?.name || 'main.py'}...`);
                }}
                className="min-h-[64px] px-2 py-2.5 hover:bg-amber-500/10 active:bg-amber-500/20 flex flex-col items-center justify-center gap-1.5 text-center transition"
              >
                <Download className="w-4.5 h-4.5 text-amber-300 shrink-0" />
                <span className="text-[11px] font-semibold text-slate-100 leading-tight">
                  Tải file .py
                </span>
              </button>

              <label className="min-h-[64px] px-2 py-2.5 hover:bg-purple-500/10 active:bg-purple-500/20 flex flex-col items-center justify-center gap-1.5 text-center transition cursor-pointer">
                <Upload className="w-4.5 h-4.5 text-purple-300 shrink-0" />
                <span className="text-[11px] font-semibold text-slate-100 leading-tight">
                  Mở file .py
                </span>
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
            </div>

            {/* Tab 2: Tìm & Thay | Sao chép mã | Khôi phục gốc (3 actions separated by vertical dividers) */}
            <div className="rounded-2xl bg-gradient-to-b from-[#0d172b] to-[#080e1c] border border-cyan-500/30 overflow-hidden grid grid-cols-3 divide-x divide-cyan-500/25">
              <button
                onClick={() => {
                  onClose();
                  onOpenEditorSearch();
                }}
                className="min-h-[64px] px-2 py-2.5 hover:bg-teal-500/10 active:bg-teal-500/20 flex flex-col items-center justify-center gap-1.5 text-center transition"
              >
                <Search className="w-4.5 h-4.5 text-teal-300 shrink-0" />
                <span className="text-[11px] font-semibold text-slate-100 leading-tight">
                  Tìm &amp; Thay
                </span>
              </button>

              <button
                onClick={handleCopy}
                className="min-h-[64px] px-2 py-2.5 hover:bg-sky-500/10 active:bg-sky-500/20 flex flex-col items-center justify-center gap-1.5 text-center transition"
              >
                {copied ? (
                  <Check className="w-4.5 h-4.5 text-emerald-400 shrink-0" />
                ) : (
                  <Copy className="w-4.5 h-4.5 text-sky-300 shrink-0" />
                )}
                <span className="text-[11px] font-semibold text-slate-100 leading-tight">
                  {copied ? 'Đã sao chép' : 'Sao chép mã'}
                </span>
              </button>

              <button
                onClick={() => setConfirmReset((v) => !v)}
                className={`min-h-[64px] px-2 py-2.5 flex flex-col items-center justify-center gap-1.5 text-center transition ${
                  confirmReset
                    ? 'bg-rose-950/50 text-rose-200'
                    : 'hover:bg-rose-500/10 active:bg-rose-500/20 text-rose-300'
                }`}
              >
                <RotateCcw className="w-4.5 h-4.5 text-rose-400 shrink-0" />
                <span className="text-[11px] font-semibold leading-tight">
                  Khôi phục gốc
                </span>
              </button>
            </div>

            {confirmReset && (
              <div className="p-2.5 rounded-xl bg-rose-950/40 border border-rose-500/50 flex items-center justify-between gap-2 text-xs animate-in fade-in duration-150">
                <span className="text-rose-200 font-medium">Khôi phục mã nguồn ban đầu?</span>
                <div className="flex items-center space-x-1.5 shrink-0">
                  <button
                    onClick={() => setConfirmReset(false)}
                    className="px-2.5 py-1 rounded-lg bg-slate-800 text-slate-300 hover:text-white"
                  >
                    Hủy
                  </button>
                  <button
                    onClick={() => {
                      onResetCode();
                      setConfirmReset(false);
                      setNotice('Đã khôi phục mã nguồn ban đầu.');
                    }}
                    className="px-2.5 py-1 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold"
                  >
                    Xác nhận
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
