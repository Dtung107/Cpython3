import React, { useState, useEffect } from 'react';
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
  AlertCircle,
  HardDrive,
  RefreshCw,
  FolderCog,
  Keyboard,
} from 'lucide-react';
import { CodeFile } from '../types';
import {
  DeviceFolderFile,
  getDefaultFolderPath,
  setDefaultFolderPath,
  getDefaultFolderDisplayPath,
  ensureDefaultFolderExists,
  listFilesInDefaultFolder,
  supportsDirectoryPicker,
  supportsFileSystemAccess,
  pickWebDefaultDirectory,
  isNativeDevice,
} from '../services/deviceStorageService';

interface FileManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  files: CodeFile[];
  activeFileId: string;
  onSelectFile: (id: string) => void;
  onCreateFile: (filename: string) => void;
  onRenameFile: (id: string, newName: string) => void;
  onCloseFile: (id: string) => void;
  onSaveFile: () => Promise<{ ok: boolean; message: string }>;
  onDownloadPy: () => Promise<{ ok: boolean; message: string }>;
  onUploadPy: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onPickPyWithHandle: () => Promise<boolean>;
  onOpenFromDefaultFolder: (fileName: string, relPath: string) => Promise<{ ok: boolean; message: string }>;
  onSyncShortcutsToDefaultFolder: () => Promise<{ ok: boolean; message: string }>;
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
  onSaveFile,
  onDownloadPy,
  onUploadPy,
  onPickPyWithHandle,
  onOpenFromDefaultFolder,
  onSyncShortcutsToDefaultFolder,
  onResetCode,
  onOpenEditorSearch,
  onCopyAllCode,
}) => {
  const [newFileName, setNewFileName] = useState('');
  const [showNewInput, setShowNewInput] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [confirmReset, setConfirmReset] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [copied, setCopied] = useState(false);

  // Default phone folder state
  const [folderInput, setFolderInput] = useState<string>(() => getDefaultFolderPath());
  const [editingFolder, setEditingFolder] = useState(false);
  const [displayFolderPath, setDisplayFolderPath] = useState<string>('Documents/Pydroid3Web');
  const [folderFiles, setFolderFiles] = useState<DeviceFolderFile[]>([]);
  const [loadingFolder, setLoadingFolder] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);

  const refreshFolderState = async () => {
    setLoadingFolder(true);
    try {
      await ensureDefaultFolderExists();
      const label = await getDefaultFolderDisplayPath();
      setDisplayFolderPath(label);
      const list = await listFilesInDefaultFolder();
      setFolderFiles(list);
    } finally {
      setLoadingFolder(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      setFolderInput(getDefaultFolderPath());
      setNotice(null);
      setEditingFolder(false);
      refreshFolderState();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const activeFile = files.find((f) => f.id === activeFileId) || files[0];

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newFileName.trim();
    if (!trimmed) return;
    onCreateFile(trimmed);
    setNewFileName('');
    setShowNewInput(false);
    setNotice({
      ok: true,
      text: `Đã tạo và mở tệp ${trimmed.endsWith('.py') ? trimmed : `${trimmed}.py`}`,
    });
  };

  const handleStartRename = (file: CodeFile) => {
    setRenamingId(file.id);
    setRenameValue(file.name);
  };

  const handleSaveRename = (id: string) => {
    const trimmed = renameValue.trim();
    if (trimmed) {
      onRenameFile(id, trimmed);
      setNotice({
        ok: true,
        text: `Đã đổi tên tệp thành ${trimmed.endsWith('.py') ? trimmed : `${trimmed}.py`}`,
      });
    }
    setRenamingId(null);
  };

  const handleCopy = () => {
    onCopyAllCode();
    setCopied(true);
    setNotice({ ok: true, text: 'Đã sao chép toàn bộ mã nguồn vào khay nhớ tạm!' });
    setTimeout(() => setCopied(false), 1800);
  };

  const handleSaveOverwrite = async () => {
    if (isSaving) return;
    setIsSaving(true);
    try {
      const res = await onSaveFile();
      setNotice({ ok: res.ok, text: res.message });
      refreshFolderState();
    } finally {
      setIsSaving(false);
    }
  };

  const handleDownloadAction = async () => {
    if (isDownloading) return;
    setIsDownloading(true);
    try {
      const res = await onDownloadPy();
      setNotice({ ok: res.ok, text: res.message });
      refreshFolderState();
    } finally {
      setIsDownloading(false);
    }
  };

  const handleSaveFolderPath = async (e: React.FormEvent) => {
    e.preventDefault();
    const normalized = setDefaultFolderPath(folderInput);
    setFolderInput(normalized);
    setEditingFolder(false);
    await ensureDefaultFolderExists();
    await onSyncShortcutsToDefaultFolder();
    await refreshFolderState();
    setNotice({
      ok: true,
      text: `Đã đặt thư mục mặc định: Documents/${normalized} (đã đồng bộ cấu hình phím tắt)`,
    });
  };

  const handlePickDirectoryWeb = async () => {
    const res = await pickWebDefaultDirectory();
    if (res.ok && res.name) {
      setFolderInput(res.name);
      await onSyncShortcutsToDefaultFolder();
      await refreshFolderState();
      setNotice({
        ok: true,
        text: `Đã liên kết thư mục "${res.name}" để lưu file .py và cấu hình phím tắt!`,
      });
    } else if (res.error) {
      setNotice({ ok: false, text: res.error });
    }
  };

  const handleOpenPhoneFile = async () => {
    if (supportsFileSystemAccess()) {
      const opened = await onPickPyWithHandle();
      if (opened) {
        onClose();
      }
    }
  };

  const canUseFsOpenPicker = supportsFileSystemAccess();
  const canPickDir = supportsDirectoryPicker();

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-start sm:items-center justify-center p-2.5 sm:p-4 pt-[calc(0.75rem+env(safe-area-inset-top,0px))] pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg max-h-[88vh] bg-[#070b14] border border-cyan-500/35 rounded-2xl shadow-[0_12px_40px_rgba(0,0,0,0.85)] flex flex-col overflow-hidden text-slate-100"
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
            <div
              className={`px-3 py-2 rounded-xl border text-xs flex items-start space-x-2 ${
                notice.ok
                  ? 'bg-emerald-950/50 border-emerald-500/45 text-emerald-200'
                  : 'bg-rose-950/50 border-rose-500/45 text-rose-200'
              }`}
            >
              {notice.ok ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              )}
              <span className="break-words">{notice.text}</span>
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

            <div className="rounded-2xl bg-[#0a1120] border border-cyan-500/25 divide-y divide-cyan-950/70 max-h-40 overflow-y-auto">
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
                          <div className="flex items-center space-x-1.5">
                            <span
                              className={`text-xs font-mono truncate ${
                                isActive ? 'text-cyan-200 font-bold' : 'text-slate-200'
                              }`}
                            >
                              {file.name}
                            </span>
                            {file.sourceType === 'phone' && (
                              <span className="px-1.5 py-0.5 rounded bg-purple-500/20 border border-purple-400/40 text-[9px] text-purple-200 font-semibold shrink-0">
                                ĐT
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] text-slate-400 truncate">
                            {file.content.split('\n').length} dòng
                            {isActive ? ' • Đang chỉnh sửa' : ''}
                            {file.isModified ? ' • Chưa Save' : ''}
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

            {/* Tab 1: Save (ghi đè file đã mở) | Tải file .py | Mở file .py */}
            <div className="rounded-2xl bg-gradient-to-b from-[#0d172b] to-[#080e1c] border border-cyan-500/30 overflow-hidden grid grid-cols-3 divide-x divide-cyan-500/25">
              <button
                onClick={handleSaveOverwrite}
                disabled={isSaving}
                title="Ghi đè thay đổi trong trình soạn thảo vào file .py đang mở"
                className="min-h-[64px] px-2 py-2.5 hover:bg-cyan-500/10 active:bg-cyan-500/20 flex flex-col items-center justify-center gap-1 text-center transition disabled:opacity-60"
              >
                <Save className="w-4.5 h-4.5 text-cyan-300 shrink-0" />
                <span className="text-[11px] font-bold text-slate-100 leading-tight">
                  {isSaving ? 'Đang Save...' : 'Save'}
                </span>
                <span className="text-[9.5px] text-cyan-300/75 leading-none">
                  Ghi đè tệp
                </span>
              </button>

              <button
                onClick={handleDownloadAction}
                disabled={isDownloading}
                title="Tải file .py và lưu vào thư mục mặc định trong điện thoại"
                className="min-h-[64px] px-2 py-2.5 hover:bg-amber-500/10 active:bg-amber-500/20 flex flex-col items-center justify-center gap-1 text-center transition disabled:opacity-60"
              >
                <Download className="w-4.5 h-4.5 text-amber-300 shrink-0" />
                <span className="text-[11px] font-semibold text-slate-100 leading-tight">
                  {isDownloading ? 'Đang tải...' : 'Tải file .py'}
                </span>
                <span className="text-[9.5px] text-amber-300/75 leading-none">
                  Lưu về máy
                </span>
              </button>

              {canUseFsOpenPicker ? (
                <button
                  onClick={handleOpenPhoneFile}
                  className="min-h-[64px] px-2 py-2.5 hover:bg-purple-500/10 active:bg-purple-500/20 flex flex-col items-center justify-center gap-1 text-center transition"
                >
                  <Upload className="w-4.5 h-4.5 text-purple-300 shrink-0" />
                  <span className="text-[11px] font-semibold text-slate-100 leading-tight">
                    Mở file .py
                  </span>
                  <span className="text-[9.5px] text-purple-300/75 leading-none">
                    Từ bộ nhớ
                  </span>
                </button>
              ) : (
                <label className="min-h-[64px] px-2 py-2.5 hover:bg-purple-500/10 active:bg-purple-500/20 flex flex-col items-center justify-center gap-1 text-center transition cursor-pointer">
                  <Upload className="w-4.5 h-4.5 text-purple-300 shrink-0" />
                  <span className="text-[11px] font-semibold text-slate-100 leading-tight">
                    Mở file .py
                  </span>
                  <span className="text-[9.5px] text-purple-300/75 leading-none">
                    Từ bộ nhớ
                  </span>
                  <input
                    type="file"
                    accept=".py,.txt,.json,text/plain,text/x-python"
                    onChange={(e) => {
                      onUploadPy(e);
                      onClose();
                    }}
                    className="hidden"
                  />
                </label>
              )}
            </div>

            {/* Tab 2: Tìm & Thay | Sao chép mã | Khôi phục gốc */}
            <div className="rounded-2xl bg-gradient-to-b from-[#0d172b] to-[#080e1c] border border-cyan-500/30 overflow-hidden grid grid-cols-3 divide-x divide-cyan-500/25">
              <button
                onClick={() => {
                  onClose();
                  onOpenEditorSearch();
                }}
                className="min-h-[60px] px-2 py-2 hover:bg-teal-500/10 active:bg-teal-500/20 flex flex-col items-center justify-center gap-1.5 text-center transition"
              >
                <Search className="w-4.5 h-4.5 text-teal-300 shrink-0" />
                <span className="text-[11px] font-semibold text-slate-100 leading-tight">
                  Tìm &amp; Thay
                </span>
              </button>

              <button
                onClick={handleCopy}
                className="min-h-[60px] px-2 py-2 hover:bg-sky-500/10 active:bg-sky-500/20 flex flex-col items-center justify-center gap-1.5 text-center transition"
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
                className={`min-h-[60px] px-2 py-2 flex flex-col items-center justify-center gap-1.5 text-center transition ${
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
                      setNotice({ ok: true, text: 'Đã khôi phục mã nguồn ban đầu.' });
                    }}
                    className="px-2.5 py-1 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold"
                  >
                    Xác nhận
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Default Phone Storage Folder Section */}
          <div className="space-y-2 pt-0.5">
            <div className="flex items-center justify-between px-0.5">
              <span className="text-[10.5px] font-bold uppercase tracking-wider text-amber-300/90 flex items-center space-x-1.5">
                <HardDrive className="w-3.5 h-3.5 text-amber-300" />
                <span>Thư Mục Mặc Định (Bộ Nhớ Điện Thoại)</span>
              </span>
              <button
                onClick={refreshFolderState}
                className="p-1 rounded-lg hover:bg-[#13203b] text-slate-400 hover:text-cyan-300 transition"
                title="Làm mới danh sách tệp trong thư mục mặc định"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadingFolder ? 'animate-spin' : ''}`} />
              </button>
            </div>

            <div className="rounded-2xl bg-[#0a1120] border border-amber-500/30 p-3 space-y-2.5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="text-[10px] text-slate-400 mb-0.5">
                    Đường dẫn lưu file <span className="text-amber-300 font-mono">.py</span> &amp; cấu hình phím tắt (<span className="text-cyan-300 font-mono">pydroid_shortcuts_config.json</span>):
                  </div>
                  <div className="text-xs font-mono text-amber-200 bg-[#060a13] border border-cyan-950/80 rounded-lg px-2.5 py-1.5 truncate">
                    {displayFolderPath}
                  </div>
                </div>
              </div>

              {editingFolder ? (
                <form onSubmit={handleSaveFolderPath} className="flex items-center space-x-2">
                  <input
                    type="text"
                    value={folderInput}
                    onChange={(e) => setFolderInput(e.target.value)}
                    placeholder="VD: Pydroid3Web"
                    className="flex-1 bg-[#060a13] border border-amber-500/50 rounded-lg px-2.5 py-1.5 text-xs font-mono text-slate-100 focus:outline-none"
                  />
                  <button
                    type="submit"
                    className="px-3 py-1.5 rounded-lg bg-amber-400 hover:bg-amber-300 text-slate-950 text-xs font-bold shrink-0"
                  >
                    Áp dụng
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingFolder(false)}
                    className="px-2.5 py-1.5 rounded-lg bg-slate-800 text-slate-300 text-xs shrink-0"
                  >
                    Hủy
                  </button>
                </form>
              ) : (
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    onClick={() => setEditingFolder(true)}
                    className="px-2.5 py-1.5 rounded-xl bg-[#111c33] hover:bg-[#172644] border border-cyan-500/30 text-[11px] font-semibold text-cyan-200 flex items-center space-x-1.5 transition"
                  >
                    <FolderCog className="w-3.5 h-3.5 text-cyan-300" />
                    <span>Đổi tên thư mục</span>
                  </button>

                  {canPickDir && (
                    <button
                      onClick={handlePickDirectoryWeb}
                      className="px-2.5 py-1.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-400/40 text-[11px] font-semibold text-amber-200 flex items-center space-x-1.5 transition"
                    >
                      <FolderOpen className="w-3.5 h-3.5 text-amber-300" />
                      <span>Chọn thư mục trên máy</span>
                    </button>
                  )}

                  <button
                    onClick={async () => {
                      const res = await onSyncShortcutsToDefaultFolder();
                      setNotice({ ok: res.ok, text: res.message });
                    }}
                    className="px-2.5 py-1.5 rounded-xl bg-purple-500/15 hover:bg-purple-500/25 border border-purple-400/40 text-[11px] font-semibold text-purple-200 flex items-center space-x-1.5 transition"
                  >
                    <Keyboard className="w-3.5 h-3.5 text-purple-300" />
                    <span>Lưu cấu hình phím tắt</span>
                  </button>
                </div>
              )}

              {/* Files stored inside Default Phone Folder */}
              {folderFiles.length > 0 ? (
                <div className="space-y-1 pt-1 border-t border-cyan-950/60">
                  <div className="text-[10px] font-semibold text-slate-400">
                    Tệp .py trong thư mục mặc định ({folderFiles.length}): chạm để mở &amp; Save ghi đè trực tiếp
                  </div>
                  <div className="max-h-28 overflow-y-auto divide-y divide-cyan-950/50 rounded-xl bg-[#070b14] border border-cyan-950/70">
                    {folderFiles.map((df) => (
                      <button
                        key={df.path}
                        onClick={async () => {
                          const res = await onOpenFromDefaultFolder(df.name, df.path);
                          if (res.ok) {
                            onClose();
                          } else {
                            setNotice({ ok: false, text: res.message });
                          }
                        }}
                        className="w-full px-2.5 py-1.5 flex items-center justify-between text-left hover:bg-cyan-500/10 transition"
                      >
                        <div className="flex items-center space-x-2 min-w-0">
                          <FileCode2 className="w-3.5 h-3.5 text-amber-300 shrink-0" />
                          <span className="text-xs font-mono text-slate-200 truncate">{df.name}</span>
                        </div>
                        <span className="text-[10px] text-cyan-300/80 shrink-0 ml-2">Mở file</span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="text-[10.5px] text-slate-400 pt-1 border-t border-cyan-950/60">
                  {isNativeDevice()
                    ? 'Chưa có file .py nào trong thư mục mặc định. Nhấn "Save" hoặc "Tải file .py" để lưu vào Bộ nhớ điện thoại.'
                    : 'Trên bản APK Android, thư mục mặc định tự động tạo tại Bộ nhớ điện thoại/Documents/' +
                      folderInput +
                      '. Trên trình duyệt, bạn có thể bấm "Chọn thư mục trên máy" (nếu hỗ trợ) hoặc dùng "Tải file .py".'}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
