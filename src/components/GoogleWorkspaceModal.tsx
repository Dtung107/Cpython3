import React, { useState, useEffect, useCallback } from 'react';
import {
  X,
  Cloud,
  CloudUpload,
  CloudDownload,
  FolderOpen,
  FileCode,
  Trash2,
  RefreshCw,
  Search,
  StickyNote,
  Plus,
  CheckCircle2,
  AlertTriangle,
  LogOut,
  Sparkles,
  Smartphone,
  Key,
  Save,
  Edit3,
} from 'lucide-react';
import { User } from 'firebase/auth';
import {
  DriveFileItem,
  DriveNoteItem,
  WorkspaceSyncPayload,
  googleSignIn,
  googleLogout,
  getAccessToken,
  ensurePydroidFolder,
  listDriveFiles,
  findFileByNameInFolder,
  readDriveFileContent,
  saveFileToDrive,
  deleteDriveFile,
  checkWorkspaceSyncExists,
  syncWorkspaceToDrive,
  loadWorkspaceFromDrive,
  loadDriveNotes,
  saveDriveNotes,
  fetchGoogleProfile,
  shouldUseApkBrowserAuth,
  hasPendingApkAuth,
  pollPendingApkAuth,
  submitManualApkAuthCode,
  setApkAuthEventListener,
} from '../services/googleWorkspaceService';
import { CodeFile } from '../types';
import { SyntaxTheme, TerminalTheme } from '../types/theme';
import { ShortcutKey, KeySize } from '../types/shortcuts';
import {
  getApiBaseUrl,
  getCustomServerUrl,
  getSavedServerHistory,
  removeServerFromHistory,
  hasReachablePublicBackendOnApk,
  saveCustomServerUrl,
  clearCustomServerUrl,
  testBackendServerUrl,
  isMobileOrApk,
  DEFAULT_CLOUD_SERVER_URL,
  SavedServerEntry,
} from '../utils/apiConfig';

interface GoogleWorkspaceModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: User | null;
  hasToken: boolean;
  files: CodeFile[];
  activeFile: CodeFile;
  syntaxTheme: SyntaxTheme;
  terminalTheme?: TerminalTheme;
  shortcuts: ShortcutKey[];
  keySize: KeySize;
  fontSize: number;
  aiStatus: 'online' | 'offline' | 'checking';
  aiStatusTooltip: string;
  onOpenFileFromDrive: (fileName: string, content: string) => void;
  onApplySyncedWorkspace: (payload: WorkspaceSyncPayload) => void;
  onInsertSnippetToEditor: (snippet: string) => void;
  onOpenApiKeySettings: () => void;
  onOpenApkModal: () => void;
  onCheckAiStatus: () => void;
  onServerUrlChanged?: () => void;
}

interface ConfirmState {
  title: string;
  message: string;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => Promise<void>;
}

const NOTE_COLORS: Record<DriveNoteItem['color'], string> = {
  amber: 'bg-amber-950/50 border-amber-500/40 text-amber-100',
  sky: 'bg-sky-950/50 border-sky-500/40 text-sky-100',
  emerald: 'bg-emerald-950/50 border-emerald-500/40 text-emerald-100',
  rose: 'bg-rose-950/50 border-rose-500/40 text-rose-100',
  slate: 'bg-slate-800/70 border-slate-600/50 text-slate-100',
};

export const GoogleWorkspaceModal: React.FC<GoogleWorkspaceModalProps> = ({
  isOpen,
  onClose,
  user,
  hasToken,
  files,
  activeFile,
  syntaxTheme,
  terminalTheme,
  shortcuts,
  keySize,
  fontSize,
  aiStatus,
  aiStatusTooltip,
  onOpenFileFromDrive,
  onApplySyncedWorkspace,
  onInsertSnippetToEditor,
  onOpenApiKeySettings,
  onOpenApkModal,
  onCheckAiStatus,
  onServerUrlChanged,
}) => {
  const [activeTab, setActiveTab] = useState<'drive' | 'notes' | 'sync_info'>('drive');
  const [authLoading, setAuthLoading] = useState(false);
  const [busyMessage, setBusyMessage] = useState<string | null>(null);
  const [statusNotice, setStatusNotice] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  // APK browser auth & inline backend server setup state
  const isApkEnv = shouldUseApkBrowserAuth();
  const [awaitingApkAuth, setAwaitingApkAuth] = useState(false);
  const [manualAuthCode, setManualAuthCode] = useState('');
  const [showApkServerSetup, setShowApkServerSetup] = useState(false);
  const [apkServerUrlInput, setApkServerUrlInput] = useState('');
  const [serverHistory, setServerHistory] = useState<SavedServerEntry[]>(() => getSavedServerHistory());
  const [testingApkServer, setTestingApkServer] = useState(false);

  // Profile details from People API
  const [profileInfo, setProfileInfo] = useState<{ name?: string; email?: string; photo?: string }>({});

  // Drive state
  const [driveFiles, setDriveFiles] = useState<DriveFileItem[]>([]);
  const [onlyPydroidFolder, setOnlyPydroidFolder] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [loadingDrive, setLoadingDrive] = useState(false);

  // Notes state (Drive-backed Keep alternative)
  const [notes, setNotes] = useState<DriveNoteItem[]>([]);
  const [notesFileId, setNotesFileId] = useState<string | null>(null);
  const [loadingNotes, setLoadingNotes] = useState(false);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [noteTitle, setNoteTitle] = useState('');
  const [noteContent, setNoteContent] = useState('');
  const [noteColor, setNoteColor] = useState<DriveNoteItem['color']>('amber');

  // Mandatory confirmation dialog state for mutating/destructive operations
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
  const [confirmLoading, setConfirmLoading] = useState(false);

  const loadDriveList = useCallback(async (token: string) => {
    setLoadingDrive(true);
    try {
      const items = await listDriveFiles(token, {
        onlyPydroidFolder,
        search: searchQuery,
      });
      setDriveFiles(items);
    } catch (err: any) {
      setStatusNotice({ type: 'error', text: err?.message || 'Không thể tải danh sách Google Drive.' });
    } finally {
      setLoadingDrive(false);
    }
  }, [onlyPydroidFolder, searchQuery]);

  const loadNotesList = useCallback(async (token: string) => {
    setLoadingNotes(true);
    try {
      const res = await loadDriveNotes(token);
      setNotesFileId(res.fileId);
      setNotes(res.notes);
    } catch (err: any) {
      setStatusNotice({ type: 'error', text: err?.message || 'Không thể tải ghi chú từ Google Drive.' });
    } finally {
      setLoadingNotes(false);
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    setApkServerUrlInput(getCustomServerUrl());
    setServerHistory(getSavedServerHistory());
    setAwaitingApkAuth(hasPendingApkAuth());
    if (isApkEnv && !hasReachablePublicBackendOnApk()) {
      setShowApkServerSetup(true);
    }
  }, [isOpen, isApkEnv]);

  useEffect(() => {
    if (!isOpen) {
      setApkAuthEventListener(undefined);
      return;
    }
    setApkAuthEventListener((evt) => {
      setAwaitingApkAuth(false);
      setAuthLoading(false);
      setStatusNotice({ type: evt.type, text: evt.message });
      if (evt.type === 'success') {
        const token = getAccessToken();
        if (token) {
          void loadDriveList(token);
        }
      }
    });
    return () => setApkAuthEventListener(undefined);
  }, [isOpen, loadDriveList]);

  useEffect(() => {
    if (!isOpen) return;
    const token = getAccessToken();
    if (token && hasToken) {
      setAwaitingApkAuth(false);
      fetchGoogleProfile(token)
        .then((p) => {
          setProfileInfo({
            name: p.displayName || user?.displayName || undefined,
            email: p.email || user?.email || undefined,
            photo: p.photoUrl || user?.photoURL || undefined,
          });
        })
        .catch(() => {});
      if (activeTab === 'drive') {
        void loadDriveList(token);
      } else if (activeTab === 'notes') {
        void loadNotesList(token);
      }
    }
  }, [isOpen, hasToken, activeTab, user, loadDriveList, loadNotesList]);

  if (!isOpen) return null;

  const handleGoogleSignIn = async (switchAccount = false, bypassWakeCheck = false) => {
    setAuthLoading(true);
    setStatusNotice({
      type: 'info',
      text: bypassWakeCheck
        ? 'Đang mở trình duyệt Chrome để đăng nhập Google...'
        : 'Đang kết nối tới máy chủ để mở Google Sign-In...',
    });
    try {
      const res = await googleSignIn({
        switchAccount,
        bypassWakeCheck,
        onProgress: (msg) => setStatusNotice({ type: 'info', text: msg }),
      });
      if (res?.accessToken) {
        setAwaitingApkAuth(false);
        setStatusNotice({
          type: 'success',
          text: `Đã đăng nhập Google thành công (${res.user.email || res.user.displayName}).`,
        });
        void loadDriveList(res.accessToken);
      } else if (isApkEnv) {
        setAwaitingApkAuth(true);
        setStatusNotice({
          type: 'info',
          text: 'Đã mở trình duyệt Chrome để chọn tài khoản Google. Sau khi xác nhận, bạn sẽ tự động quay lại Pydroid 3 APK.',
        });
      }
    } catch (err: any) {
      if (err?.code === 'APK_BACKEND_REQUIRED' || err?.code === 'APK_BACKEND_UNREACHABLE') {
        setShowApkServerSetup(true);
      }
      setStatusNotice({
        type: 'error',
        text: err?.message || 'Đăng nhập Google không thành công. Vui lòng thử lại.',
      });
    } finally {
      setAuthLoading(false);
    }
  };

  const handleSaveApkServerUrl = async (overrideUrl?: string) => {
    const saved = saveCustomServerUrl(overrideUrl ?? apkServerUrlInput);
    if (saved.ok === false) {
      setStatusNotice({ type: 'error', text: saved.error });
      return;
    }
    setApkServerUrlInput(saved.url);
    setServerHistory(getSavedServerHistory());
    onServerUrlChanged?.();
    setTestingApkServer(true);
    setStatusNotice({
      type: 'info',
      text: `Đang kết nối tới ${saved.url}...`,
    });
    try {
      const check = await testBackendServerUrl(saved.url, 60000, (msg) =>
        setStatusNotice({ type: 'info', text: msg })
      );
      if (check.ok) {
        setShowApkServerSetup(false);
        setStatusNotice({
          type: 'success',
          text: `${check.message} Bây giờ bạn có thể đăng nhập tài khoản Google bất kỳ hoặc dùng Gemini AI.`,
        });
      } else {
        setStatusNotice({ type: 'error', text: check.message });
      }
    } finally {
      setTestingApkServer(false);
    }
  };

  const handleCheckPendingApkAuth = async () => {
    setAuthLoading(true);
    setStatusNotice(null);
    try {
      const res = await pollPendingApkAuth();
      if (res?.accessToken) {
        setAwaitingApkAuth(false);
        setStatusNotice({
          type: 'success',
          text: `Đã đăng nhập Google thành công (${res.user.email || res.user.displayName}).`,
        });
        void loadDriveList(res.accessToken);
      } else {
        setStatusNotice({
          type: 'info',
          text: 'Chưa nhận được phản hồi từ Chrome. Hãy hoàn tất đăng nhập trên trình duyệt rồi thử lại hoặc nhập mã 8 ký tự.',
        });
      }
    } catch (err: any) {
      setStatusNotice({ type: 'error', text: err?.message || 'Không thể kiểm tra phiên đăng nhập.' });
    } finally {
      setAuthLoading(false);
    }
  };

  const handleSubmitManualCode = async () => {
    setAuthLoading(true);
    setStatusNotice(null);
    try {
      const res = await submitManualApkAuthCode(manualAuthCode);
      if (res?.accessToken) {
        setAwaitingApkAuth(false);
        setManualAuthCode('');
        setStatusNotice({
          type: 'success',
          text: `Đã đăng nhập Google thành công (${res.user.email || res.user.displayName}).`,
        });
        void loadDriveList(res.accessToken);
      }
    } catch (err: any) {
      setStatusNotice({ type: 'error', text: err?.message || 'Mã xác nhận không hợp lệ hoặc đã hết hạn.' });
    } finally {
      setAuthLoading(false);
    }
  };

  const handleSignOut = async () => {
    setAuthLoading(true);
    try {
      await googleLogout();
      setDriveFiles([]);
      setNotes([]);
      setNotesFileId(null);
      setProfileInfo({});
      setStatusNotice({ type: 'info', text: 'Đã đăng xuất tài khoản Google.' });
    } finally {
      setAuthLoading(false);
    }
  };

  const executeConfirmed = async () => {
    if (!confirmState) return;
    setConfirmLoading(true);
    try {
      await confirmState.onConfirm();
      setConfirmState(null);
    } catch (err: any) {
      setStatusNotice({ type: 'error', text: err?.message || 'Thao tác thất bại.' });
      setConfirmState(null);
    } finally {
      setConfirmLoading(false);
    }
  };

  const handleSaveActiveFileToDrive = async () => {
    const token = getAccessToken();
    if (!token) return;
    setBusyMessage(`Đang kiểm tra ${activeFile.name} trên Drive...`);
    setStatusNotice(null);
    try {
      const folderId = await ensurePydroidFolder(token);
      const existing = await findFileByNameInFolder(token, activeFile.name, folderId);

      const doUpload = async (existingId?: string) => {
        setBusyMessage(`Đang lưu ${activeFile.name} lên Google Drive...`);
        await saveFileToDrive(token, {
          fileId: existingId,
          fileName: activeFile.name,
          content: activeFile.content,
          folderId,
          mimeType: 'text/plain',
        });
        setStatusNotice({
          type: 'success',
          text: `Đã lưu "${activeFile.name}" vào thư mục "Pydroid 3 Web" trên Google Drive!`,
        });
        await loadDriveList(token);
      };

      if (existing) {
        setBusyMessage(null);
        setConfirmState({
          title: 'Ghi đè tệp trên Google Drive?',
          message: `Tệp "${activeFile.name}" đã tồn tại trong thư mục "Pydroid 3 Web" trên Google Drive. Bạn có muốn ghi đè nội dung hiện tại lên tệp đó không?`,
          confirmLabel: 'Xác nhận ghi đè',
          onConfirm: () => doUpload(existing.id),
        });
      } else {
        await doUpload();
      }
    } catch (err: any) {
      setStatusNotice({ type: 'error', text: err?.message || 'Không thể lưu tệp lên Drive.' });
    } finally {
      setBusyMessage(null);
    }
  };

  const handleSyncWorkspaceUp = async () => {
    const token = getAccessToken();
    if (!token) return;
    setBusyMessage('Đang kiểm tra bản đồng bộ trên Drive...');
    setStatusNotice(null);
    try {
      const existing = await checkWorkspaceSyncExists(token);
      const payload: WorkspaceSyncPayload = {
        version: 1,
        updatedAt: new Date().toISOString(),
        sourcePlatform: isMobileOrApk() ? 'Android APK' : 'AI Studio Web',
        activeFileId: activeFile.id,
        files,
        syntaxTheme,
        terminalTheme,
        shortcuts,
        keySize,
        fontSize,
      };

      const doSync = async () => {
        setBusyMessage('Đang đồng bộ toàn bộ mã nguồn & cài đặt lên Google Drive...');
        await syncWorkspaceToDrive(token, payload);
        setStatusNotice({
          type: 'success',
          text: `Đã đồng bộ ${files.length} tệp và cấu hình IDE lên Google Drive!`,
        });
        await loadDriveList(token);
      };

      if (existing) {
        setBusyMessage(null);
        setConfirmState({
          title: 'Cập nhật bản đồng bộ trên Google Drive?',
          message: `Bản đồng bộ cũ (cập nhật lúc ${
            existing.modifiedTime ? new Date(existing.modifiedTime).toLocaleString('vi-VN') : 'trước đó'
          }) sẽ được thay thế bằng ${files.length} tệp và cài đặt hiện tại trên thiết bị này.`,
          confirmLabel: 'Đồng bộ lên Drive',
          onConfirm: doSync,
        });
      } else {
        await doSync();
      }
    } catch (err: any) {
      setStatusNotice({ type: 'error', text: err?.message || 'Đồng bộ lên Drive thất bại.' });
    } finally {
      setBusyMessage(null);
    }
  };

  const handlePullWorkspaceDown = async () => {
    const token = getAccessToken();
    if (!token) return;
    setBusyMessage('Đang tải bản đồng bộ từ Google Drive...');
    setStatusNotice(null);
    try {
      const payload = await loadWorkspaceFromDrive(token);
      if (!payload || !Array.isArray(payload.files) || payload.files.length === 0) {
        setStatusNotice({
          type: 'info',
          text: 'Chưa có bản đồng bộ nào trên Google Drive. Hãy bấm "Đẩy đồng bộ lên Drive" trước.',
        });
        return;
      }

      setBusyMessage(null);
      setConfirmState({
        title: 'Tải bản đồng bộ về thiết bị này?',
        message: `Thao tác này sẽ thay thế các tab mã nguồn hiện tại bằng ${payload.files.length} tệp từ bản đồng bộ (${payload.sourcePlatform}, lưu lúc ${new Date(payload.updatedAt).toLocaleString('vi-VN')}).`,
        confirmLabel: 'Áp dụng bản đồng bộ',
        onConfirm: async () => {
          onApplySyncedWorkspace(payload);
          setStatusNotice({
            type: 'success',
            text: `Đã đồng bộ ${payload.files.length} tệp từ ${payload.sourcePlatform} về máy!`,
          });
        },
      });
    } catch (err: any) {
      setStatusNotice({ type: 'error', text: err?.message || 'Không thể tải bản đồng bộ.' });
    } finally {
      setBusyMessage(null);
    }
  };

  const handleOpenFile = async (item: DriveFileItem) => {
    const token = getAccessToken();
    if (!token) return;
    setBusyMessage(`Đang mở ${item.name}...`);
    setStatusNotice(null);
    try {
      const content = await readDriveFileContent(token, item.id);
      onOpenFileFromDrive(item.name, content);
      setStatusNotice({ type: 'success', text: `Đã mở "${item.name}" vào trình soạn thảo!` });
      onClose();
    } catch (err: any) {
      setStatusNotice({ type: 'error', text: err?.message || 'Không thể đọc nội dung tệp.' });
    } finally {
      setBusyMessage(null);
    }
  };

  const handleRequestDeleteFile = (item: DriveFileItem) => {
    const token = getAccessToken();
    if (!token) return;
    setConfirmState({
      title: 'Xóa tệp khỏi Google Drive?',
      message: `Bạn có chắc chắn muốn xóa vĩnh viễn tệp "${item.name}" khỏi Google Drive? Hành động này không thể hoàn tác.`,
      confirmLabel: 'Xóa vĩnh viễn',
      danger: true,
      onConfirm: async () => {
        setBusyMessage(`Đang xóa ${item.name}...`);
        try {
          await deleteDriveFile(token, item.id);
          setStatusNotice({ type: 'success', text: `Đã xóa "${item.name}" khỏi Google Drive.` });
          await loadDriveList(token);
        } finally {
          setBusyMessage(null);
        }
      },
    });
  };

  const handleSaveNote = async () => {
    const token = getAccessToken();
    if (!token) return;
    const trimmedContent = noteContent.trim();
    const trimmedTitle = noteTitle.trim() || 'Ghi chú không tiêu đề';
    if (!trimmedContent) {
      setStatusNotice({ type: 'error', text: 'Vui lòng nhập nội dung ghi chú.' });
      return;
    }

    const persistNotes = async (nextNotes: DriveNoteItem[]) => {
      setBusyMessage('Đang lưu ghi chú lên Google Drive...');
      try {
        const saved = await saveDriveNotes(token, nextNotes, notesFileId);
        setNotesFileId(saved.id);
        setNotes(nextNotes);
        setEditingNoteId(null);
        setNoteTitle('');
        setNoteContent('');
        setStatusNotice({ type: 'success', text: 'Đã lưu ghi chú lên Google Drive!' });
      } finally {
        setBusyMessage(null);
      }
    };

    if (editingNoteId) {
      const updated = notes.map((n) =>
        n.id === editingNoteId
          ? { ...n, title: trimmedTitle, content: noteContent, color: noteColor, updatedAt: new Date().toISOString() }
          : n
      );
      setConfirmState({
        title: 'Cập nhật ghi chú trên Google Drive?',
        message: `Xác nhận lưu thay đổi cho ghi chú "${trimmedTitle}" lên Google Drive?`,
        confirmLabel: 'Lưu thay đổi',
        onConfirm: () => persistNotes(updated),
      });
    } else {
      const newNote: DriveNoteItem = {
        id: Date.now().toString(),
        title: trimmedTitle,
        content: noteContent,
        color: noteColor,
        updatedAt: new Date().toISOString(),
      };
      await persistNotes([newNote, ...notes]);
    }
  };

  const handleRequestDeleteNote = (note: DriveNoteItem) => {
    const token = getAccessToken();
    if (!token) return;
    setConfirmState({
      title: 'Xóa ghi chú khỏi Google Drive?',
      message: `Bạn có chắc muốn xóa ghi chú "${note.title}" khỏi tệp ghi chú trên Google Drive?`,
      confirmLabel: 'Xóa ghi chú',
      danger: true,
      onConfirm: async () => {
        const remaining = notes.filter((n) => n.id !== note.id);
        setBusyMessage('Đang xóa ghi chú...');
        try {
          const saved = await saveDriveNotes(token, remaining, notesFileId);
          setNotesFileId(saved.id);
          setNotes(remaining);
          setStatusNotice({ type: 'success', text: `Đã xóa ghi chú "${note.title}".` });
        } finally {
          setBusyMessage(null);
        }
      },
    });
  };

  const displayName = profileInfo.name || user?.displayName || 'Người dùng Google';
  const displayEmail = profileInfo.email || user?.email || '';
  const displayPhoto = profileInfo.photo || user?.photoURL || '';
  const currentApiBase = getApiBaseUrl() || DEFAULT_CLOUD_SERVER_URL;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl max-h-[92vh] bg-[#161a24] border border-sky-700/50 rounded-2xl shadow-2xl flex flex-col overflow-hidden text-slate-100 relative"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-4 py-3 bg-[#1d2232] border-b border-slate-800 flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-xl bg-gradient-to-br from-sky-500 to-indigo-600 text-white shadow">
              <Cloud className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-bold text-sm sm:text-base text-slate-100">
                Tài Khoản Google &amp; Đồng Bộ Web ↔ APK
              </h2>
              <p className="text-[11px] text-slate-400">
                Google Drive, Ghi chú đám mây &amp; Kết nối Gemini thống nhất giữa Web và APK
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-white transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Auth Bar */}
        <div className="px-4 py-2.5 bg-[#131722] border-b border-slate-800/80 space-y-2.5 shrink-0">
          {user && hasToken ? (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center space-x-2.5 min-w-0">
                {displayPhoto ? (
                  <img
                    src={displayPhoto}
                    alt={displayName}
                    className="w-8 h-8 rounded-full border border-sky-500/50 shrink-0"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-sky-600 flex items-center justify-center text-xs font-bold text-white shrink-0">
                    {displayName.charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0">
                  <div className="text-xs font-bold text-slate-100 truncate">{displayName}</div>
                  <div className="text-[11px] text-emerald-400 truncate">{displayEmail}</div>
                </div>
              </div>
              <div className="flex items-center space-x-1.5 flex-wrap gap-1.5">
                {isApkEnv && (
                  <button
                    type="button"
                    onClick={() => setShowApkServerSetup((v) => !v)}
                    className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs text-sky-300 transition"
                  >
                    {showApkServerSetup ? 'Ẩn máy chủ' : 'Đổi máy chủ'}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => void handleGoogleSignIn(true)}
                  disabled={authLoading}
                  className="px-2.5 py-1.5 rounded-lg bg-sky-950/60 hover:bg-sky-900/60 border border-sky-600/50 text-xs text-sky-200 flex items-center space-x-1.5 transition disabled:opacity-60"
                >
                  <RefreshCw className={`w-3.5 h-3.5 text-sky-400 ${authLoading ? 'animate-spin' : ''}`} />
                  <span>Đổi tài khoản Google</span>
                </button>
                <button
                  onClick={handleSignOut}
                  disabled={authLoading}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-rose-950/60 border border-slate-700 hover:border-rose-600/50 text-xs text-slate-200 flex items-center space-x-1.5 transition"
                >
                  <LogOut className="w-3.5 h-3.5 text-rose-400" />
                  <span>Đăng xuất</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="w-full flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs text-slate-300">
                {user
                  ? 'Phiên Google Drive cần cấp quyền lại sau khi tải lại trang.'
                  : 'Đăng nhập Google để lưu tệp lên Drive, ghi chú và đồng bộ giữa AI Studio & APK.'}
              </div>
              <div className="flex items-center space-x-2">
                {isApkEnv && (
                  <button
                    type="button"
                    onClick={() => setShowApkServerSetup((v) => !v)}
                    className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-[11px] text-sky-300"
                  >
                    {showApkServerSetup ? 'Ẩn URL Server' : 'Đổi máy chủ APK'}
                  </button>
                )}
                <button
                  onClick={() => void handleGoogleSignIn(false)}
                  disabled={authLoading}
                  className="gsi-material-button inline-flex items-center bg-white hover:bg-slate-100 active:bg-slate-200 text-[#1f1f1f] font-medium text-xs px-3.5 py-2 rounded-lg border border-slate-300 shadow-sm transition disabled:opacity-60"
                >
                  <div className="gsi-material-button-state" />
                  <div className="gsi-material-button-content-wrapper flex items-center space-x-2">
                    <div className="gsi-material-button-icon w-4 h-4 shrink-0">
                      <svg version="1.1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" style={{ display: 'block' }}>
                        <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
                        <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
                        <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
                        <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
                        <path fill="none" d="M0 0h48v48H0z" />
                      </svg>
                    </div>
                    <span className="gsi-material-button-contents">
                      {authLoading ? 'Đang mở Google...' : 'Sign in with Google'}
                    </span>
                  </div>
                </button>
              </div>
            </div>
          )}

          {/* Inline APK Backend Server switcher & setup */}
          {isApkEnv && showApkServerSetup && (
            <div className="p-3 rounded-xl bg-[#181e2d] border border-sky-700/50 space-y-2.5 text-[11px]">
              <div className="flex items-center justify-between">
                <span className="font-bold text-sky-300">
                  Máy chủ tùy chỉnh cho APK (Google Drive &amp; Gemini AI)
                </span>
                {getCustomServerUrl() && (
                  <button
                    type="button"
                    onClick={() => {
                      clearCustomServerUrl();
                      setApkServerUrlInput('');
                      onServerUrlChanged?.();
                      setStatusNotice({ type: 'info', text: 'Đã chuyển về chế độ mặc định (không dùng URL tùy chỉnh).' });
                    }}
                    className="text-rose-400 underline"
                  >
                    Về mặc định
                  </button>
                )}
              </div>

              {serverHistory.length > 0 && (
                <div className="space-y-1">
                  <div className="text-[10px] text-slate-400 font-semibold">Máy chủ đã lưu (Chạm để chuyển nhanh):</div>
                  <div className="flex flex-wrap gap-1.5">
                    {serverHistory.map((item) => {
                      const isActive = getCustomServerUrl() === item.url;
                      return (
                        <div
                          key={item.url}
                          className={`inline-flex items-center rounded-lg border text-[10.5px] ${
                            isActive
                              ? 'bg-sky-600/30 border-sky-400 text-sky-100 font-semibold'
                              : 'bg-[#10141f] border-slate-700 text-slate-300'
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => void handleSaveApkServerUrl(item.url)}
                            className="px-2 py-1 truncate max-w-[200px]"
                            title={item.url}
                          >
                            {isActive ? '✓ ' : ''}
                            {item.label}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              const next = removeServerFromHistory(item.url);
                              setServerHistory(next);
                              onServerUrlChanged?.();
                            }}
                            className="pr-1.5 pl-0.5 py-1 text-slate-500 hover:text-rose-400"
                            title="Xóa khỏi lịch sử"
                          >
                            ×
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <p className="text-slate-300 leading-relaxed">
                Dán URL máy chủ công khai chạy <code className="text-sky-300">server.ts</code> trên Render, Cloud Run hoặc Railway:
              </p>
              <div className="flex items-center space-x-2">
                <input
                  type="text"
                  value={apkServerUrlInput}
                  onChange={(e) => setApkServerUrlInput(e.target.value)}
                  placeholder="https://ten-app-cua-ban.onrender.com"
                  className="flex-1 bg-[#0c1018] border border-slate-700 focus:border-sky-400 rounded-lg px-2.5 py-1.5 text-xs font-mono text-slate-100 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => void handleSaveApkServerUrl()}
                  disabled={testingApkServer}
                  className="px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-semibold shrink-0 disabled:opacity-50"
                >
                  {testingApkServer ? 'Đang thử...' : 'Lưu & Kiểm tra'}
                </button>
              </div>
            </div>
          )}

          {/* Pending Chrome Custom Tab / Manual Code fallback */}
          {isApkEnv && awaitingApkAuth && (
            <div className="p-3 rounded-xl bg-amber-950/30 border border-amber-500/50 space-y-2 text-[11px]">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold text-amber-200">
                  Đang chờ hoàn tất đăng nhập Google trên trình duyệt Chrome...
                </span>
                <button
                  type="button"
                  onClick={handleCheckPendingApkAuth}
                  disabled={authLoading}
                  className="px-2.5 py-1 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold"
                >
                  Kiểm tra ngay
                </button>
              </div>
              <div className="flex items-center space-x-2">
                <input
                  type="text"
                  value={manualAuthCode}
                  onChange={(e) => setManualAuthCode(e.target.value)}
                  placeholder="Hoặc dán mã 8 ký tự (VD: ABCD-1234)"
                  className="flex-1 bg-[#0c1018] border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs font-mono uppercase text-slate-100 focus:outline-none focus:border-amber-400"
                />
                <button
                  type="button"
                  onClick={handleSubmitManualCode}
                  disabled={authLoading || !manualAuthCode.trim()}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-600 text-slate-100 font-semibold disabled:opacity-50"
                >
                  Xác nhận mã
                </button>
              </div>
              <div className="p-2 rounded-lg bg-[#10141f] border border-slate-700/80 text-[10.5px] text-slate-300 leading-relaxed">
                <span className="text-amber-300 font-semibold">Nếu Chrome báo Lỗi 403: access_denied khi chọn Gmail khác:</span> Hãy vào{' '}
                <a
                  href="https://console.cloud.google.com/auth/audience?project=gen-lang-client-0914508012"
                  target="_blank"
                  rel="noreferrer"
                  className="text-sky-400 underline font-semibold"
                >
                  Google Cloud Console → Audience
                </a>{' '}
                để thêm email đó vào <strong>Test users (+ ADD USERS)</strong> hoặc bấm <strong>PUBLISH APP</strong>.
              </div>
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="flex items-center bg-[#12151f] px-4 pt-2 border-b border-slate-800 text-xs shrink-0 overflow-x-auto">
          <button
            onClick={() => setActiveTab('drive')}
            className={`pb-2 px-3 font-semibold border-b-2 flex items-center space-x-1.5 transition shrink-0 ${
              activeTab === 'drive'
                ? 'border-sky-500 text-sky-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <FolderOpen className="w-3.5 h-3.5" />
            <span>Google Drive &amp; Đồng bộ</span>
          </button>
          <button
            onClick={() => setActiveTab('notes')}
            className={`pb-2 px-3 font-semibold border-b-2 flex items-center space-x-1.5 transition shrink-0 ${
              activeTab === 'notes'
                ? 'border-amber-500 text-amber-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <StickyNote className="w-3.5 h-3.5" />
            <span>Ghi chú Drive (Keep)</span>
          </button>
          <button
            onClick={() => setActiveTab('sync_info')}
            className={`pb-2 px-3 font-semibold border-b-2 flex items-center space-x-1.5 transition shrink-0 ${
              activeTab === 'sync_info'
                ? 'border-emerald-500 text-emerald-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Smartphone className="w-3.5 h-3.5" />
            <span>Đồng bộ Studio ↔ APK &amp; Gemini</span>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {statusNotice && (
            <div
              className={`p-3 rounded-xl text-xs space-y-2 border ${
                statusNotice.type === 'success'
                  ? 'bg-emerald-950/40 border-emerald-500/50 text-emerald-200'
                  : statusNotice.type === 'error'
                  ? 'bg-rose-950/40 border-rose-500/50 text-rose-200'
                  : 'bg-sky-950/40 border-sky-500/50 text-sky-200'
              }`}
            >
              <div className="flex items-start space-x-2">
                {statusNotice.type === 'error' ? (
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
                ) : (
                  <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                )}
                <span>{statusNotice.text}</span>
              </div>
              {isApkEnv && statusNotice.type === 'error' && hasReachablePublicBackendOnApk() && (
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => void handleGoogleSignIn(false, true)}
                    disabled={authLoading}
                    className="px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-semibold text-[11px] transition disabled:opacity-50"
                  >
                    Mở Chrome đăng nhập trực tiếp
                  </button>
                </div>
              )}
            </div>
          )}

          {busyMessage && (
            <div className="p-2.5 rounded-xl bg-sky-950/30 border border-sky-700/50 text-xs text-sky-200 flex items-center space-x-2">
              <RefreshCw className="w-3.5 h-3.5 animate-spin text-sky-400" />
              <span>{busyMessage}</span>
            </div>
          )}

          {activeTab === 'drive' && (
            !hasToken ? (
              <div className="p-6 rounded-xl bg-[#191d29] border border-slate-800 text-center space-y-2">
                <Cloud className="w-10 h-10 text-sky-400 mx-auto" />
                <div className="font-bold text-sm text-slate-200">
                  Kết nối Google Drive để mở, lưu &amp; đồng bộ mã nguồn
                </div>
                <p className="text-xs text-slate-400 max-w-md mx-auto">
                  Sau khi bấm "Sign in with Google" phía trên, bạn có thể đẩy toàn bộ tab Python, giao diện màu, phím tắt lên Google Drive và tải về trên bản Android APK chỉ bằng 1 chạm.
                </p>
              </div>
            ) : (
              <>
                {/* 1-Tap Web <-> APK Workspace Sync Card */}
                <div className="p-3.5 rounded-xl bg-gradient-to-r from-[#182235] to-[#1a1f2e] border border-sky-700/50 space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="text-xs font-bold text-sky-300">
                        Đồng bộ Không Gian Làm Việc (AI Studio Web ↔ Android APK)
                      </div>
                      <div className="text-[11px] text-slate-400">
                        Đồng bộ {files.length} tab code, màu cú pháp, phím tắt nhanh qua tệp pydroid_workspace_sync.json trên Drive
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <button
                      onClick={handleSyncWorkspaceUp}
                      disabled={!!busyMessage}
                      className="px-3 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-semibold text-xs flex items-center justify-center space-x-1.5 transition disabled:opacity-50"
                    >
                      <CloudUpload className="w-4 h-4" />
                      <span>Đẩy đồng bộ lên Drive</span>
                    </button>
                    <button
                      onClick={handlePullWorkspaceDown}
                      disabled={!!busyMessage}
                      className="px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs flex items-center justify-center space-x-1.5 transition disabled:opacity-50"
                    >
                      <CloudDownload className="w-4 h-4" />
                      <span>Kéo đồng bộ về máy</span>
                    </button>
                    <button
                      onClick={handleSaveActiveFileToDrive}
                      disabled={!!busyMessage}
                      className="px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs flex items-center justify-center space-x-1.5 transition disabled:opacity-50"
                    >
                      <Save className="w-4 h-4" />
                      <span>Lưu "{activeFile.name}" lên Drive</span>
                    </button>
                  </div>
                </div>

                {/* Drive File Browser */}
                <div className="space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center space-x-1.5 text-xs">
                      <button
                        onClick={() => setOnlyPydroidFolder(true)}
                        className={`px-2.5 py-1 rounded-lg border transition ${
                          onlyPydroidFolder
                            ? 'bg-sky-600/30 border-sky-500/60 text-sky-200 font-semibold'
                            : 'bg-slate-800/60 border-slate-700 text-slate-400'
                        }`}
                      >
                        Thư mục Pydroid 3 Web
                      </button>
                      <button
                        onClick={() => setOnlyPydroidFolder(false)}
                        className={`px-2.5 py-1 rounded-lg border transition ${
                          !onlyPydroidFolder
                            ? 'bg-sky-600/30 border-sky-500/60 text-sky-200 font-semibold'
                            : 'bg-slate-800/60 border-slate-700 text-slate-400'
                        }`}
                      >
                        Toàn bộ Google Drive
                      </button>
                    </div>

                    <div className="flex items-center space-x-1.5 flex-1 sm:flex-initial">
                      <div className="relative flex-1 sm:w-52">
                        <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                        <input
                          type="text"
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && getAccessToken() && loadDriveList(getAccessToken()!)}
                          placeholder="Tìm tệp trên Drive..."
                          className="w-full bg-[#11141c] border border-slate-700 rounded-lg pl-8 pr-2.5 py-1 text-xs text-slate-100 focus:outline-none focus:border-sky-400"
                        />
                      </div>
                      <button
                        onClick={() => getAccessToken() && loadDriveList(getAccessToken()!)}
                        disabled={loadingDrive}
                        className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700"
                        title="Làm mới danh sách"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${loadingDrive ? 'animate-spin' : ''}`} />
                      </button>
                    </div>
                  </div>

                  <div className="rounded-xl bg-[#11141c] border border-slate-800 divide-y divide-slate-800/80 max-h-64 overflow-y-auto">
                    {loadingDrive ? (
                      <div className="p-6 text-center text-xs text-slate-400">Đang tải tệp từ Google Drive...</div>
                    ) : driveFiles.length === 0 ? (
                      <div className="p-6 text-center text-xs text-slate-400">
                        Chưa có tệp nào phù hợp trong {onlyPydroidFolder ? 'thư mục Pydroid 3 Web' : 'Google Drive'}.
                      </div>
                    ) : (
                      driveFiles.map((item) => (
                        <div
                          key={item.id}
                          className="px-3 py-2 flex items-center justify-between gap-2 hover:bg-slate-800/40 transition text-xs"
                        >
                          <div className="flex items-center space-x-2.5 min-w-0">
                            <FileCode className="w-4 h-4 text-sky-400 shrink-0" />
                            <div className="min-w-0">
                              <div className="font-medium text-slate-200 truncate">{item.name}</div>
                              <div className="text-[10px] text-slate-400">
                                {item.modifiedTime ? new Date(item.modifiedTime).toLocaleString('vi-VN') : ''}
                                {item.size ? ` • ${(Number(item.size) / 1024).toFixed(1)} KB` : ''}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center space-x-1.5 shrink-0">
                            <button
                              onClick={() => handleOpenFile(item)}
                              className="px-2.5 py-1 rounded bg-sky-600/30 hover:bg-sky-600/50 border border-sky-500/40 text-sky-200 text-[11px] font-medium"
                            >
                              Mở
                            </button>
                            <button
                              onClick={() => handleRequestDeleteFile(item)}
                              className="p-1.5 rounded bg-rose-950/40 hover:bg-rose-900/60 border border-rose-700/40 text-rose-300"
                              title="Xóa tệp"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </>
            )
          )}

          {activeTab === 'notes' && (
            !hasToken ? (
              <div className="p-6 rounded-xl bg-[#191d29] border border-slate-800 text-center space-y-2">
                <StickyNote className="w-10 h-10 text-amber-400 mx-auto" />
                <div className="font-bold text-sm text-slate-200">
                  Đăng nhập Google để đồng bộ Ghi chú lập trình
                </div>
                <p className="text-xs text-slate-400 max-w-md mx-auto">
                  Google Keep API chỉ hỗ trợ tài khoản doanh nghiệp Workspace có quản trị miền. Với tài khoản Google cá nhân, ghi chú của bạn được lưu đồng bộ an toàn ngay trên Google Drive (<code className="text-amber-300">pydroid_notes.json</code>) để dùng chung trên Web và APK.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="p-3 rounded-xl bg-[#191d29] border border-slate-700/70 space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-amber-300">
                      {editingNoteId ? 'Chỉnh sửa ghi chú' : 'Tạo ghi chú mới (lưu trên Google Drive)'}
                    </span>
                    <div className="flex items-center space-x-1">
                      {(['amber', 'sky', 'emerald', 'rose', 'slate'] as const).map((c) => (
                        <button
                          key={c}
                          onClick={() => setNoteColor(c)}
                          className={`w-4 h-4 rounded-full border ${
                            c === 'amber'
                              ? 'bg-amber-400'
                              : c === 'sky'
                              ? 'bg-sky-400'
                              : c === 'emerald'
                              ? 'bg-emerald-400'
                              : c === 'rose'
                              ? 'bg-rose-400'
                              : 'bg-slate-400'
                          } ${noteColor === c ? 'ring-2 ring-white scale-110' : 'opacity-60'}`}
                        />
                      ))}
                    </div>
                  </div>
                  <input
                    type="text"
                    value={noteTitle}
                    onChange={(e) => setNoteTitle(e.target.value)}
                    placeholder="Tiêu đề ghi chú (VD: Đoạn code kết nối API, công thức...)"
                    className="w-full bg-[#11141c] border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-amber-400"
                  />
                  <textarea
                    rows={3}
                    value={noteContent}
                    onChange={(e) => setNoteContent(e.target.value)}
                    placeholder="Nội dung ghi chú hoặc đoạn mã Python..."
                    className="w-full bg-[#11141c] border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs font-mono text-slate-100 focus:outline-none focus:border-amber-400"
                  />
                  <div className="flex justify-end space-x-2">
                    {editingNoteId && (
                      <button
                        onClick={() => {
                          setEditingNoteId(null);
                          setNoteTitle('');
                          setNoteContent('');
                        }}
                        className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 text-xs"
                      >
                        Hủy sửa
                      </button>
                    )}
                    <button
                      onClick={handleSaveNote}
                      disabled={!!busyMessage}
                      className="px-3.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center space-x-1"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>{editingNoteId ? 'Lưu cập nhật' : 'Thêm ghi chú'}</span>
                    </button>
                  </div>
                </div>

                {loadingNotes ? (
                  <div className="p-4 text-center text-xs text-slate-400">Đang tải ghi chú từ Drive...</div>
                ) : notes.length === 0 ? (
                  <div className="p-4 text-center text-xs text-slate-400 bg-[#11141c] rounded-xl border border-slate-800">
                    Chưa có ghi chú nào trên Google Drive.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {notes.map((n) => (
                      <div key={n.id} className={`p-3 rounded-xl border space-y-2 ${NOTE_COLORS[n.color]}`}>
                        <div className="flex items-start justify-between gap-2">
                          <div className="font-bold text-xs break-words">{n.title}</div>
                          <div className="flex items-center space-x-1 shrink-0">
                            <button
                              onClick={() => {
                                setEditingNoteId(n.id);
                                setNoteTitle(n.title);
                                setNoteContent(n.content);
                                setNoteColor(n.color);
                              }}
                              className="p-1 rounded hover:bg-white/10"
                              title="Chỉnh sửa"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleRequestDeleteNote(n)}
                              className="p-1 rounded hover:bg-rose-500/20 text-rose-300"
                              title="Xóa"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                        <pre className="text-[11px] font-mono whitespace-pre-wrap break-words opacity-90 max-h-28 overflow-y-auto">
                          {n.content}
                        </pre>
                        <div className="flex items-center justify-between pt-1 border-t border-white/10 text-[10px] opacity-75">
                          <span>{new Date(n.updatedAt).toLocaleString('vi-VN')}</span>
                          <button
                            onClick={() => {
                              onInsertSnippetToEditor(n.content);
                              onClose();
                            }}
                            className="px-2 py-0.5 rounded bg-white/10 hover:bg-white/20 font-semibold"
                          >
                            Chèn vào code
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          )}

          {activeTab === 'sync_info' && (
            <div className="space-y-3 text-xs">
              {/* Gemini & Backend Sync */}
              <div className="p-3.5 rounded-xl bg-[#191d29] border border-slate-700/70 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="font-bold text-emerald-300 flex items-center space-x-1.5">
                    <Sparkles className="w-4 h-4" />
                    <span>Trạng thái Gemini AI &amp; Máy chủ đồng bộ APK</span>
                  </div>
                  <button
                    onClick={onCheckAiStatus}
                    className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px]"
                  >
                    Kiểm tra lại
                  </button>
                </div>
                <div className="text-[11px] text-slate-300 space-y-1">
                  <div>
                    Trạng thái AI:{' '}
                    <span className={aiStatus === 'online' ? 'text-emerald-400 font-bold' : 'text-amber-300 font-bold'}>
                      {aiStatusTooltip}
                    </span>
                  </div>
                  <div className="break-all text-slate-400">
                    Máy chủ Cloud mặc định cho APK:{' '}
                    <code className="text-sky-300">{currentApiBase}</code>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 pt-1">
                  <button
                    onClick={() => {
                      onClose();
                      onOpenApiKeySettings();
                    }}
                    className="px-3 py-1.5 rounded-lg bg-amber-600/30 hover:bg-amber-600/50 border border-amber-500/40 text-amber-200 font-semibold text-xs flex items-center space-x-1.5"
                  >
                    <Key className="w-3.5 h-3.5" />
                    <span>Cài đặt Khóa Gemini &amp; URL Server</span>
                  </button>
                </div>
              </div>

              {/* How to build Full Synced IDE APK vs Single Script APK */}
              <div className="p-3.5 rounded-xl bg-[#191d29] border border-indigo-700/50 space-y-2">
                <div className="font-bold text-indigo-300 flex items-center space-x-1.5">
                  <Smartphone className="w-4 h-4" />
                  <span>Cách build bản APK giống hệt bản AI Studio (Capacitor)</span>
                </div>
                <ol className="list-decimal list-inside space-y-1 text-[11px] text-slate-300 leading-relaxed">
                  <li>
                    Tải toàn bộ mã nguồn dự án AI Studio (gồm <code className="text-sky-300">src/</code>, <code className="text-sky-300">capacitor.config.json</code>, <code className="text-sky-300">firebase-applet-config.json</code>, <code className="text-sky-300">.github/workflows/build-apk.yml</code>) và đẩy lên GitHub.
                  </li>
                  <li>
                    Trong tab <strong>Actions</strong> trên GitHub, chạy workflow <code className="text-emerald-300">Xây dựng file APK Android cho Pydroid 3 Web</code> để nhận file <code className="text-emerald-300">Pydroid3-Web-Debug-APK</code> (có đầy đủ khung soạn thảo, Terminal, Pip, Gemini AI, Google Drive).
                  </li>
                  <li>
                    Nếu bạn muốn đóng gói riêng 1 script Python thành app độc lập (không kèm trình soạn thảo), mới dùng mục{' '}
                    <button
                      onClick={() => {
                        onClose();
                        onOpenApkModal();
                      }}
                      className="text-sky-400 underline font-semibold"
                    >
                      Đóng gói Android APK (Buildozer)
                    </button>
                    .
                  </li>
                </ol>
              </div>
            </div>
          )}
        </div>

        {/* Mandatory User Confirmation Overlay for Destructive / Mutating Operations */}
        {confirmState && (
          <div className="absolute inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="w-full max-w-md bg-[#1c2130] border border-slate-700 rounded-2xl p-4 shadow-2xl space-y-3">
              <div className="flex items-start space-x-2.5">
                <AlertTriangle
                  className={`w-5 h-5 shrink-0 mt-0.5 ${confirmState.danger ? 'text-rose-400' : 'text-amber-400'}`}
                />
                <div className="space-y-1">
                  <h3 className="font-bold text-sm text-slate-100">{confirmState.title}</h3>
                  <p className="text-xs text-slate-300 leading-relaxed">{confirmState.message}</p>
                </div>
              </div>
              <div className="flex justify-end space-x-2 pt-2 border-t border-slate-800">
                <button
                  onClick={() => setConfirmState(null)}
                  disabled={confirmLoading}
                  className="px-3.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs"
                >
                  Hủy
                </button>
                <button
                  onClick={executeConfirmed}
                  disabled={confirmLoading}
                  className={`px-3.5 py-1.5 rounded-lg text-white font-bold text-xs flex items-center space-x-1.5 ${
                    confirmState.danger
                      ? 'bg-rose-600 hover:bg-rose-500'
                      : 'bg-sky-600 hover:bg-sky-500'
                  } disabled:opacity-60`}
                >
                  {confirmLoading && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                  <span>{confirmState.confirmLabel}</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
