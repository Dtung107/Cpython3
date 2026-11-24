import React, { useState, useEffect, useRef } from 'react';
import { Header } from './components/Header';
import { Editor, EditorHandle } from './components/Editor';
import { Terminal } from './components/Terminal';
import { MobileKeyboardBar } from './components/MobileKeyboardBar';
import { AIAssistantModal } from './components/AIAssistantModal';
import { SyntaxColorModal } from './components/SyntaxColorModal';
import { ShortcutConfigModal } from './components/ShortcutConfigModal';
import { PipManagerModal } from './components/PipManagerModal';
import { ApkBuilderModal } from './components/ApkBuilderModal';
import { SampleCodesModal } from './components/SampleCodesModal';
import { DrawerMenu } from './components/DrawerMenu';
import { FileManagerModal } from './components/FileManagerModal';
import { SettingsApiKeyModal } from './components/SettingsApiKeyModal';
import { GoogleWorkspaceModal } from './components/GoogleWorkspaceModal';
import { ApkGoogleAuthBridge } from './components/ApkGoogleAuthBridge';
import { CodeFile, EngineType, ExecutionResult, AIDebugResult } from './types';
import { SyntaxTheme, DEFAULT_SYNTAX_THEME } from './types/theme';
import {
  ShortcutKey,
  KeySize,
  DEFAULT_SHORTCUTS,
  migrateLegacyPairedShortcuts,
} from './types/shortcuts';
import { runPyodideCode, installPyodidePackage, getInstalledPackagesList } from './services/pyodideService';
import { runCPythonCode } from './services/cpythonService';
import {
  requestAIDebugStream,
  requestAIExplainStream,
  checkAIServerStatus,
} from './services/geminiService';
import {
  initGoogleAuth,
  getAccessToken,
  googleSignIn,
  WorkspaceSyncPayload,
} from './services/googleWorkspaceService';
import { User } from 'firebase/auth';
import { isMobileOrApk, hasCustomServer } from './utils/apiConfig';

const DEFAULT_MAIN_PY = `# =========================================================
#  PYDROID 3 WEB - MÔI TRƯỜNG LẬP TRÌNH PYTHON CHO ANDROID
#  Động cơ kép: CPython Native & Pyodide WASM (Offline)
# =========================================================

def chao_mung(ten_nguoi_dung: str) -> str:
    return f"Xin chào {ten_nguoi_dung}! Chúc bạn lập trình Python vui vẻ trên Android! 📱🐍"

# Thử nghiệm tính toán
so_a = 15
so_b = 27
tong = so_a + so_b

print("=" * 48)
print("  PYDROID 3 WEB IDE - SẴN SÀNG THỰC THI")
print("=" * 48)
print(f"Tổng của {so_a} + {so_b} = {tong}")

# Nhập dữ liệu tương tác trong terminal
ten = input("Nhập tên của bạn để tiếp tục: ")
thong_diep = chao_mung(ten if ten.strip() else "Lập Trình Viên")
print(thong_diep)

print("-" * 48)
print("💡 Mẹo: Nhấn nút AI góc phải để AI Debugger phân tích lỗi tức thì.")
print("🎨 Mở Menu (3 gạch) > Cỡ Chữ Trình Soạn Thảo > Tô Màu Văn Bản để tùy chỉnh màu cú pháp.")
print("📁 Nhấn biểu tượng Thư mục cạnh Thùng rác để tạo, đổi tên, lưu và quản lý tệp .py!")
`;

export default function App() {
  const isApkAuthBridge =
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('apk_auth') === '1';

  if (isApkAuthBridge) {
    return <ApkGoogleAuthBridge />;
  }

  return <MainIDEApp />;
}

function MainIDEApp() {
  // File state
  const [files, setFiles] = useState<CodeFile[]>(() => {
    const saved = localStorage.getItem('pydroid_files');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {}
    }
    return [{ id: '1', name: 'main.py', content: DEFAULT_MAIN_PY }];
  });
  const [activeFileId, setActiveFileId] = useState<string>('1');

  // Engine state (defaults to pyodide on APK/mobile for instant offline execution)
  const [engine, setEngine] = useState<EngineType>(() => {
    const isMobile = isMobileOrApk();
    const custom = hasCustomServer();
    const saved = localStorage.getItem('pydroid_engine') as EngineType | null;

    if (saved) {
      if (isMobile && saved === 'cpython' && !custom) {
        return 'pyodide';
      }
      return saved;
    }
    return isMobile ? 'pyodide' : 'cpython';
  });

  // View Mode: 'editor' | 'terminal' (matching Screenshots 1 & 2)
  const [viewMode, setViewMode] = useState<'editor' | 'terminal'>('editor');
  const [fontSize, setFontSize] = useState<number>(14);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [highlightLine, setHighlightLine] = useState<number | undefined>(undefined);

  // Syntax Theme state (Screenshot 3)
  const [syntaxTheme, setSyntaxTheme] = useState<SyntaxTheme>(() => {
    const saved = localStorage.getItem('pydroid_syntax_theme');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {}
    }
    return DEFAULT_SYNTAX_THEME;
  });
  const [syntaxModalOpen, setSyntaxModalOpen] = useState(false);

  // Keyboard Shortcuts & Size state (Dark Premium Mobile Bar)
  const [shortcuts, setShortcuts] = useState<ShortcutKey[]>(() => {
    const saved = localStorage.getItem('pydroid_shortcuts');
    if (saved) {
      try {
        return migrateLegacyPairedShortcuts(JSON.parse(saved));
      } catch (e) {}
    }
    return DEFAULT_SHORTCUTS;
  });
  const [keySize, setKeySize] = useState<KeySize>(() => {
    return (localStorage.getItem('pydroid_keysize') as KeySize) || 'large';
  });
  const [shortcutConfigOpen, setShortcutConfigOpen] = useState(false);

  // Execution & Terminal state
  const [isRunning, setIsRunning] = useState(false);
  const [executionResult, setExecutionResult] = useState<ExecutionResult | null>(null);
  const [preloadedStdin, setPreloadedStdin] = useState<string>('');
  const [sessionInputs, setSessionInputs] = useState<string[]>([]);
  const [isWaitingInput, setIsWaitingInput] = useState(false);
  const [inputPromptText, setInputPromptText] = useState('input():');

  // Unified AI Assistant Modal (Chat, Debugger, Explainer)
  const [aiAssistantOpen, setAiAssistantOpen] = useState(false);
  const [aiAssistantTab, setAiAssistantTab] = useState<'chat' | 'debug' | 'explain'>('chat');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiDebugResult, setAiDebugResult] = useState<AIDebugResult | null>(null);
  const [aiExplainText, setAiExplainText] = useState('');
  const [aiExplaining, setAiExplaining] = useState(false);

  // Workspace Modals
  const [fileManagerOpen, setFileManagerOpen] = useState(false);
  const [confirmClearEditorOpen, setConfirmClearEditorOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [pipModalOpen, setPipModalOpen] = useState(false);
  const [installedPackages, setInstalledPackages] = useState<string[]>([]);
  const [isInstallingPip, setIsInstallingPip] = useState(false);
  const [pipInstallMessage, setPipInstallMessage] = useState('');
  const [apkModalOpen, setApkModalOpen] = useState(false);
  const [samplesModalOpen, setSamplesModalOpen] = useState(false);
  const [apiKeyModalOpen, setApiKeyModalOpen] = useState(false);
  const [googleModalOpen, setGoogleModalOpen] = useState(false);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((prev) => (prev === msg ? null : prev));
    }, 2600);
  };

  // Google Account & Workspace Auth state
  const [googleUser, setGoogleUser] = useState<User | null>(null);
  const [hasGoogleToken, setHasGoogleToken] = useState(false);

  // AI Server Status Indicator state (Requirement 9)
  const [aiStatus, setAiStatus] = useState<'online' | 'offline' | 'checking'>('checking');
  const [aiStatusTooltip, setAiStatusTooltip] = useState<string>('Đang kiểm tra kết nối AI...');

  const handleCheckAiStatus = async () => {
    setAiStatus('checking');
    try {
      const res = await checkAIServerStatus();
      setAiStatus(res.online ? 'online' : 'offline');
      setAiStatusTooltip(res.message);
    } catch (e: any) {
      setAiStatus('offline');
      setAiStatusTooltip('Không thể kết nối đến máy chủ AI');
    }
  };

  useEffect(() => {
    handleCheckAiStatus();
    const unsubscribe = initGoogleAuth(
      (user, token) => {
        setGoogleUser(user);
        setHasGoogleToken(!!token);
      },
      (user) => {
        setGoogleUser(user);
        setHasGoogleToken(!!getAccessToken());
      }
    );
    return () => unsubscribe();
  }, []);

  // Editor & AI stream abort refs
  const editorRef = useRef<EditorHandle>(null);
  const debugAbortRef = useRef<AbortController | null>(null);
  const explainAbortRef = useRef<AbortController | null>(null);

  const activeFile = files.find((f) => f.id === activeFileId) || files[0];

  // Persist files, theme, engine, shortcuts
  useEffect(() => {
    if (typeof window !== 'undefined' && window.location.origin && window.location.origin.startsWith('https://')) {
      if (!window.location.origin.includes('localhost') && !window.location.origin.includes('127.0.0.1')) {
        localStorage.setItem('pydroid_cloud_server_url', window.location.origin);
      }
    }

    // Configure Capacitor Android StatusBar so the top toolbar never overlaps system icons
    try {
      const statusBar = (window as any).Capacitor?.Plugins?.StatusBar;
      if (statusBar) {
        statusBar.setOverlaysWebView?.({ overlay: false }).catch?.(() => {});
        statusBar.setBackgroundColor?.({ color: '#070b14' }).catch?.(() => {});
        statusBar.setStyle?.({ style: 'DARK' }).catch?.(() => {});
      }
    } catch (e) {}
  }, []);

  useEffect(() => {
    localStorage.setItem('pydroid_files', JSON.stringify(files));
  }, [files]);

  useEffect(() => {
    localStorage.setItem('pydroid_engine', engine);
  }, [engine]);

  useEffect(() => {
    localStorage.setItem('pydroid_syntax_theme', JSON.stringify(syntaxTheme));
  }, [syntaxTheme]);

  useEffect(() => {
    localStorage.setItem('pydroid_shortcuts', JSON.stringify(shortcuts));
  }, [shortcuts]);

  useEffect(() => {
    localStorage.setItem('pydroid_keysize', keySize);
  }, [keySize]);

  useEffect(() => {
    setInstalledPackages(getInstalledPackagesList());
  }, []);

  const handleUpdateContent = (newContent: string) => {
    setFiles((prev) =>
      prev.map((f) =>
        f.id === activeFileId ? { ...f, content: newContent, isModified: true } : f
      )
    );
  };

  const handleCreateFile = (filename: string) => {
    const trimmed = filename.trim();
    if (!trimmed) return;
    const finalName = trimmed.endsWith('.py') ? trimmed : `${trimmed}.py`;
    const newFile: CodeFile = {
      id: Date.now().toString(),
      name: finalName,
      content: `# ${finalName}\n`,
    };
    setFiles((prev) => [...prev, newFile]);
    setActiveFileId(newFile.id);
    setViewMode('editor');
  };

  const handleRenameFile = (id: string, newName: string) => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    const finalName = trimmed.endsWith('.py') ? trimmed : `${trimmed}.py`;
    setFiles((prev) => prev.map((f) => (f.id === id ? { ...f, name: finalName } : f)));
  };

  const handleCloseFile = (id: string) => {
    if (files.length <= 1) return;
    const remaining = files.filter((f) => f.id !== id);
    setFiles(remaining);
    if (activeFileId === id) {
      setActiveFileId(remaining[0].id);
    }
  };

  const handleOpenFileFromDrive = (fileName: string, content: string) => {
    const existing = files.find((f) => f.name === fileName);
    if (existing) {
      setFiles((prev) =>
        prev.map((f) => (f.id === existing.id ? { ...f, content, isModified: false } : f))
      );
      setActiveFileId(existing.id);
    } else {
      const newFile: CodeFile = {
        id: Date.now().toString(),
        name: fileName,
        content,
      };
      setFiles((prev) => [...prev, newFile]);
      setActiveFileId(newFile.id);
    }
    setHighlightLine(undefined);
    setViewMode('editor');
  };

  const handleApplySyncedWorkspace = (payload: WorkspaceSyncPayload) => {
    if (payload.files && payload.files.length > 0) {
      setFiles(payload.files);
      const targetId = payload.files.some((f) => f.id === payload.activeFileId)
        ? payload.activeFileId
        : payload.files[0].id;
      setActiveFileId(targetId);
    }
    if (payload.syntaxTheme) setSyntaxTheme(payload.syntaxTheme);
    if (payload.shortcuts) setShortcuts(payload.shortcuts);
    if (payload.keySize) setKeySize(payload.keySize);
    if (typeof payload.fontSize === 'number') setFontSize(payload.fontSize);
    setHighlightLine(undefined);
    setViewMode('editor');
  };

  // Run Code logic (CPython Native or Pyodide WASM) with Real-Time Streaming & Multi-input support
  const handleRunCode = async (customInputs?: string[], isFresh = false) => {
    if (isRunning) return;

    setIsRunning(true);
    setHighlightLine(undefined);

    // Switch to Terminal view upon clicking RUN
    setViewMode('terminal');

    const code = activeFile?.content || '';
    let inputsToProvide: string[] = [];

    if (isFresh) {
      setSessionInputs([]);
      inputsToProvide = preloadedStdin.trim() ? preloadedStdin.split('\n') : [];
    } else if (customInputs !== undefined) {
      inputsToProvide = customInputs;
    } else {
      inputsToProvide = sessionInputs.length > 0
        ? sessionInputs
        : (preloadedStdin.trim() ? preloadedStdin.split('\n') : []);
    }

    const defaultEngineName = engine === 'cpython' ? 'CPython 3.10 (Native Linux)' : 'Pyodide WASM (Offline)';
    let currentStdout = isFresh ? '' : (executionResult?.stdout || '');
    let currentStderr = '';

    if (isFresh) {
      setExecutionResult({
        stdout: '',
        stderr: '',
        exitCode: 0,
        duration: 0,
        engine: defaultEngineName,
        plotImages: [],
        isWaitingInput: false,
      });
    }

    // Real-time live streaming callbacks: updates Terminal immediately on every print() or chunk
    const handleLiveStdout = (chunk: string) => {
      currentStdout += chunk;
      setExecutionResult((prev) => ({
        stdout: currentStdout,
        stderr: currentStderr || prev?.stderr || '',
        exitCode: 0,
        duration: prev?.duration || 0,
        engine: prev?.engine || defaultEngineName,
        plotImages: prev?.plotImages || [],
        isWaitingInput: false,
      }));
    };

    const handleLiveStderr = (chunk: string) => {
      currentStderr += chunk;
      setExecutionResult((prev) => ({
        stdout: currentStdout,
        stderr: currentStderr,
        exitCode: 1,
        duration: prev?.duration || 0,
        engine: prev?.engine || defaultEngineName,
        plotImages: prev?.plotImages || [],
        isWaitingInput: false,
      }));
    };

    try {
      if (engine === 'cpython') {
        if (isMobileOrApk() && !hasCustomServer()) {
          const wasmRes = await runPyodideCode({
            code,
            inputs: inputsToProvide,
            onStdout: handleLiveStdout,
            onStderr: handleLiveStderr,
          });
          setExecutionResult({
            stdout: wasmRes.stdout,
            stderr: wasmRes.stderr,
            exitCode: wasmRes.exitCode,
            duration: wasmRes.duration,
            engine: 'Pyodide WASM (Chạy Offline trên thiết bị)',
            plotImages: wasmRes.plotImages,
            isWaitingInput: wasmRes.isWaitingInput,
            prompt: wasmRes.prompt,
          });
          setIsWaitingInput(!!wasmRes.isWaitingInput);
          if (wasmRes.prompt) {
            setInputPromptText(wasmRes.prompt);
          }
        } else {
          try {
            const res = await runCPythonCode({
              code,
              inputs: inputsToProvide,
              onStdout: handleLiveStdout,
              onStderr: handleLiveStderr,
            });
            setExecutionResult({
              stdout: res.stdout,
              stderr: res.stderr,
              exitCode: res.exitCode,
              duration: res.duration,
              engine: res.engine,
              isWaitingInput: res.isWaitingInput,
              prompt: res.prompt,
            });
            setIsWaitingInput(!!res.isWaitingInput);
            if (res.prompt) {
              setInputPromptText(res.prompt);
            }
          } catch (serverErr: any) {
            console.warn('CPython server error, falling back to Pyodide WASM:', serverErr);
            const wasmRes = await runPyodideCode({
              code,
              inputs: inputsToProvide,
              onStdout: handleLiveStdout,
              onStderr: handleLiveStderr,
            });
            setExecutionResult({
              stdout: wasmRes.stdout,
              stderr: wasmRes.stderr,
              exitCode: wasmRes.exitCode,
              duration: wasmRes.duration,
              engine: wasmRes.engine + ' (Tự động chuyển từ CPython)',
              plotImages: wasmRes.plotImages,
              isWaitingInput: wasmRes.isWaitingInput,
              prompt: wasmRes.prompt,
            });
            setIsWaitingInput(!!wasmRes.isWaitingInput);
            if (wasmRes.prompt) {
              setInputPromptText(wasmRes.prompt);
            }
          }
        }
      } else {
        const wasmRes = await runPyodideCode({
          code,
          inputs: inputsToProvide,
          onStdout: handleLiveStdout,
          onStderr: handleLiveStderr,
        });
        setExecutionResult({
          stdout: wasmRes.stdout,
          stderr: wasmRes.stderr,
          exitCode: wasmRes.exitCode,
          duration: wasmRes.duration,
          engine: wasmRes.engine,
          plotImages: wasmRes.plotImages,
          isWaitingInput: wasmRes.isWaitingInput,
          prompt: wasmRes.prompt,
        });
        setIsWaitingInput(!!wasmRes.isWaitingInput);
        if (wasmRes.prompt) {
          setInputPromptText(wasmRes.prompt);
        }
      }
    } catch (err: any) {
      setExecutionResult({
        stdout: currentStdout,
        stderr: err?.message || String(err),
        exitCode: 1,
        duration: 0,
        engine: engine === 'cpython' ? 'CPython Native' : 'Pyodide WASM',
        isWaitingInput: false,
      });
      setIsWaitingInput(false);
    } finally {
      setIsRunning(false);
    }
  };

  // Send sequential input from terminal bottom bar
  const handleTerminalInput = (inputText: string) => {
    // If user entered multi-line or comma-separated numbers (e.g. 15, 25, +)
    let newItems: string[] = [];
    if (inputText.includes('\n')) {
      newItems = inputText.split('\n').filter((l) => l.length > 0);
    } else {
      newItems = [inputText];
    }

    const updated = [...sessionInputs, ...newItems];
    setSessionInputs(updated);
    handleRunCode(updated, false);
  };

  // Unified AI Assistant Handlers
  const handleOpenAIAssistant = (tab: 'chat' | 'debug' | 'explain' = 'chat') => {
    setAiAssistantTab(tab);
    setAiAssistantOpen(true);
    if (tab === 'debug') {
      void handleRunAIDebug(false);
    } else if (tab === 'explain') {
      void handleAskAIExplain(false);
    }
  };

  const handleRunAIDebug = async (forceRefresh = false) => {
    debugAbortRef.current?.abort();
    const controller = new AbortController();
    debugAbortRef.current = controller;

    setAiLoading(true);
    setAiDebugResult(null);

    try {
      const code = activeFile?.content || '';
      const errorOutput = executionResult?.stderr || '';

      const debugData = await requestAIDebugStream(
        code,
        errorOutput,
        (partial) => {
          if (controller.signal.aborted) return;
          setAiDebugResult(partial);
          if (partial.lineNumber) {
            setHighlightLine(partial.lineNumber);
          }
        },
        { forceRefresh, signal: controller.signal }
      );

      if (!controller.signal.aborted) {
        setAiDebugResult(debugData);
        if (debugData.lineNumber) {
          setHighlightLine(debugData.lineNumber);
        }
      }
    } catch (err: any) {
      if (controller.signal.aborted) return;
      setAiDebugResult({
        summary: 'Không thể phân tích lỗi.',
        errorType: 'API Error',
        explanation: err?.message || 'Lỗi kết nối Gemini AI. Vui lòng kiểm tra lại.',
        fixedCode: activeFile?.content || '',
        suggestions: ['Kiểm tra kết nối mạng hoặc thử lại sau.'],
      });
    } finally {
      if (!controller.signal.aborted) {
        setAiLoading(false);
      }
    }
  };

  const handleAskAIExplain = async (forceRefresh = false) => {
    explainAbortRef.current?.abort();
    const controller = new AbortController();
    explainAbortRef.current = controller;

    setAiExplaining(true);
    setAiExplainText('');
    try {
      const code = activeFile?.content || '';
      const text = await requestAIExplainStream(
        code,
        (accumulated) => {
          if (!controller.signal.aborted) {
            setAiExplainText(accumulated);
          }
        },
        { forceRefresh, signal: controller.signal }
      );
      if (!controller.signal.aborted) {
        setAiExplainText(text);
      }
    } catch (err: any) {
      if (!controller.signal.aborted) {
        setAiExplainText('Lỗi: ' + (err?.message || 'Không thể tạo giải thích.'));
      }
    } finally {
      if (!controller.signal.aborted) {
        setAiExplaining(false);
      }
    }
  };

  const handleApplyFixedCode = (fixedCode: string) => {
    handleUpdateContent(fixedCode);
    setHighlightLine(undefined);
  };

  // Pip
  const handleInstallPip = async (pkgName: string) => {
    setIsInstallingPip(true);
    setPipInstallMessage(`Đang tải gói ${pkgName}...`);
    try {
      await installPyodidePackage(pkgName, (msg) => setPipInstallMessage(msg));
      setInstalledPackages(getInstalledPackagesList());
      setPipInstallMessage(`Đã cài đặt thành công ${pkgName}!`);
    } finally {
      setIsInstallingPip(false);
    }
  };

  // Clear current view (no window.confirm)
  const handleClearCurrentView = () => {
    if (viewMode === 'editor') {
      setConfirmClearEditorOpen(true);
    } else {
      setExecutionResult(null);
      setSessionInputs([]);
      setIsWaitingInput(false);
    }
  };

  const handleSwitchGoogleAccount = async () => {
    showToast('Đang kết nối máy chủ để chọn tài khoản Google...');
    try {
      const res = await googleSignIn({
        switchAccount: true,
        onProgress: (msg) => showToast(msg),
      });
      if (res?.accessToken) {
        showToast(`Đã chuyển sang ${res.user.email || res.user.displayName || 'tài khoản Google mới'}`);
      } else {
        setGoogleModalOpen(true);
      }
    } catch {
      setGoogleModalOpen(true);
    }
  };

  // Only consider as real error if NOT waiting for user input and contains actual error message
  const hasError =
    !isWaitingInput &&
    ((executionResult?.exitCode !== undefined && executionResult.exitCode !== 0 && !!executionResult?.stderr?.trim() && executionResult.stderr.trim() !== 'PythonError') ||
      (!!executionResult?.stderr && executionResult.stderr.trim() !== '' && executionResult.stderr.trim() !== 'PythonError'));

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-[#070b14] text-slate-100 pb-[env(safe-area-inset-bottom,0px)] relative">
      {/* Top Header Toolbar */}
      <Header
        onRun={() => handleRunCode(undefined, true)}
        isRunning={isRunning}
        viewMode={viewMode}
        onChangeViewMode={setViewMode}
        onOpenAIAssistant={handleOpenAIAssistant}
        onOpenFolderMenu={() => setFileManagerOpen(true)}
        onClearCurrentView={handleClearCurrentView}
        onOpenGoogleWorkspace={() => setGoogleModalOpen(true)}
        googleUser={googleUser}
        hasGoogleToken={hasGoogleToken}
        onToggleDrawer={() => setDrawerOpen(true)}
        hasError={hasError}
        aiStatus={aiStatus}
        aiStatusTooltip={aiStatusTooltip}
        onCheckAiStatus={handleCheckAiStatus}
      />

      {toastMessage && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 px-3.5 py-2 rounded-xl bg-[#182235] border border-sky-500/50 text-xs text-sky-100 shadow-xl animate-in fade-in duration-150">
          {toastMessage}
        </div>
      )}

      {/* Main Screen: Editor view or Terminal view */}
      <main className="flex-1 flex flex-col overflow-hidden relative">
        {viewMode === 'editor' ? (
          <div className="flex-1 flex flex-col h-full overflow-hidden">
            <Editor
              ref={editorRef}
              activeFile={activeFile}
              onChangeContent={handleUpdateContent}
              highlightLine={highlightLine}
              fontSize={fontSize}
              theme={syntaxTheme}
            />

            {/* Mobile Keyboard Shortcut Bar */}
            <MobileKeyboardBar
              shortcuts={shortcuts}
              keySize={keySize}
              onInsertText={(snippet, offset) =>
                editorRef.current?.insertTextAtCursor(snippet, offset)
              }
              onOpenConfig={() => setShortcutConfigOpen(true)}
            />
          </div>
        ) : (
          <div className="flex-1 flex flex-col h-full overflow-hidden">
            <Terminal
              result={executionResult}
              isRunning={isRunning}
              onRun={(inputs) => handleRunCode(inputs, true)}
              onClear={() => {
                setExecutionResult(null);
                setSessionInputs([]);
                setIsWaitingInput(false);
              }}
              onDebugAI={() => handleOpenAIAssistant('debug')}
              activeEngine={engine === 'cpython' ? 'CPython 3.10' : 'Pyodide WASM'}
              onSendInput={handleTerminalInput}
              isWaitingInput={isWaitingInput}
              inputPromptText={inputPromptText}
              preloadedStdin={preloadedStdin}
              onChangePreloadedStdin={setPreloadedStdin}
            />
          </div>
        )}
      </main>

      {/* Side Drawer Menu */}
      <DrawerMenu
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        engine={engine}
        onChangeEngine={setEngine}
        onOpenPip={() => setPipModalOpen(true)}
        onOpenApk={() => setApkModalOpen(true)}
        onOpenSyntaxColor={() => setSyntaxModalOpen(true)}
        onOpenApiKeySettings={() => setApiKeyModalOpen(true)}
        onOpenGoogleWorkspace={() => setGoogleModalOpen(true)}
        onSwitchGoogleAccount={handleSwitchGoogleAccount}
        googleUser={googleUser}
        hasGoogleToken={hasGoogleToken}
        onServerUrlChanged={() => handleCheckAiStatus()}
        fontSize={fontSize}
        onChangeFontSize={(delta) => setFontSize((s) => Math.min(26, Math.max(11, s + delta)))}
      />

      {/* File & Source Manager Modal (Opened from Folder icon next to Trash) */}
      <FileManagerModal
        isOpen={fileManagerOpen}
        onClose={() => setFileManagerOpen(false)}
        files={files}
        activeFileId={activeFileId}
        onSelectFile={(id) => {
          setActiveFileId(id);
          setViewMode('editor');
        }}
        onCreateFile={handleCreateFile}
        onRenameFile={handleRenameFile}
        onCloseFile={handleCloseFile}
        onSaveToLocal={() => {
          localStorage.setItem('pydroid_files', JSON.stringify(files));
          showToast('Đã lưu mã nguồn vào bộ nhớ máy!');
        }}
        onDownloadPy={() => {
          const blob = new Blob([activeFile?.content || ''], { type: 'text/plain;charset=utf-8' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = activeFile?.name || 'main.py';
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        }}
        onUploadPy={(e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          const reader = new FileReader();
          reader.onload = (ev) => {
            const content = ev.target?.result as string;
            const newFile: CodeFile = {
              id: Date.now().toString(),
              name: file.name,
              content: content || '',
            };
            setFiles((prev) => [...prev, newFile]);
            setActiveFileId(newFile.id);
            setViewMode('editor');
          };
          reader.readAsText(file);
          e.target.value = '';
        }}
        onResetCode={() => {
          handleUpdateContent(DEFAULT_MAIN_PY);
          setHighlightLine(undefined);
        }}
        onOpenEditorSearch={() => {
          setViewMode('editor');
          setTimeout(() => editorRef.current?.openSearch(), 50);
        }}
        onCopyAllCode={() => {
          navigator.clipboard?.writeText(activeFile?.content || '').catch(() => {});
        }}
      />

      {/* Non-blocking Confirmation Dialog for Clearing Editor */}
      {confirmClearEditorOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setConfirmClearEditorOpen(false)}
        >
          <div
            className="w-full max-w-sm bg-[#1a1f2c] border border-slate-700 rounded-2xl p-4 shadow-2xl space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-bold text-sm text-slate-100">Xóa trắng mã trong tệp?</h3>
            <p className="text-xs text-slate-300">
              Nội dung trong tệp <span className="font-mono text-sky-300">{activeFile?.name}</span> sẽ bị xóa trắng.
            </p>
            <div className="flex justify-end space-x-2 pt-2 border-t border-slate-800">
              <button
                onClick={() => setConfirmClearEditorOpen(false)}
                className="px-3.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs"
              >
                Hủy
              </button>
              <button
                onClick={() => {
                  handleUpdateContent('');
                  setConfirmClearEditorOpen(false);
                }}
                className="px-3.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs"
              >
                Xóa trắng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Unified AI Assistant Modal (Chat, Debugger, Explainer) */}
      <AIAssistantModal
        isOpen={aiAssistantOpen}
        onClose={() => setAiAssistantOpen(false)}
        initialTab={aiAssistantTab}
        currentCode={activeFile?.content || ''}
        errorOutput={executionResult?.stderr || ''}
        debugResult={aiDebugResult}
        isLoadingDebug={aiLoading}
        onRetryDebug={(forceRefresh) => handleRunAIDebug(forceRefresh ?? true)}
        onApplyFixedCode={handleApplyFixedCode}
        explanationText={aiExplainText}
        isLoadingExplain={aiExplaining}
        onAskExplain={(forceRefresh) => handleAskAIExplain(forceRefresh ?? false)}
        onOpenApiKeySettings={() => setApiKeyModalOpen(true)}
        onInsertCodeToEditor={(snippet) => {
          editorRef.current?.insertTextAtCursor(snippet);
          setViewMode('editor');
        }}
      />

      {/* Custom Color Designer (Screenshot 3 - Requirement 3) */}
      <SyntaxColorModal
        isOpen={syntaxModalOpen}
        onClose={() => setSyntaxModalOpen(false)}
        currentTheme={syntaxTheme}
        onSaveTheme={setSyntaxTheme}
      />

      {/* Shortcut Key Configuration Modal (Screenshot 4 - Requirement 4) */}
      <ShortcutConfigModal
        isOpen={shortcutConfigOpen}
        onClose={() => setShortcutConfigOpen(false)}
        shortcuts={shortcuts}
        currentKeySize={keySize}
        onSaveShortcuts={(updated, updatedSize) => {
          setShortcuts(updated);
          setKeySize(updatedSize);
        }}
      />

      {/* Pip Manager Modal */}
      <PipManagerModal
        isOpen={pipModalOpen}
        onClose={() => setPipModalOpen(false)}
        installedPackages={installedPackages}
        onInstallPackage={handleInstallPip}
        isInstalling={isInstallingPip}
        installMessage={pipInstallMessage}
      />

      {/* Android APK Packager Modal */}
      <ApkBuilderModal
        isOpen={apkModalOpen}
        onClose={() => setApkModalOpen(false)}
        pythonCode={activeFile?.content || ''}
      />

      {/* Sample Codes Modal */}
      <SampleCodesModal
        isOpen={samplesModalOpen}
        onClose={() => setSamplesModalOpen(false)}
        onSelectCode={(code) => {
          handleUpdateContent(code);
          setHighlightLine(undefined);
          setViewMode('editor');
        }}
      />

      {/* Settings API Key Modal (with lightweight ping validation before saving) */}
      <SettingsApiKeyModal
        isOpen={apiKeyModalOpen}
        onClose={() => setApiKeyModalOpen(false)}
        onKeySaved={() => handleCheckAiStatus()}
        onServerUrlChanged={() => handleCheckAiStatus()}
      />

      {/* Google Account, Drive, Notes & Web↔APK Sync Modal */}
      <GoogleWorkspaceModal
        isOpen={googleModalOpen}
        onClose={() => setGoogleModalOpen(false)}
        user={googleUser}
        hasToken={hasGoogleToken}
        files={files}
        activeFile={activeFile}
        syntaxTheme={syntaxTheme}
        shortcuts={shortcuts}
        keySize={keySize}
        fontSize={fontSize}
        aiStatus={aiStatus}
        aiStatusTooltip={aiStatusTooltip}
        onOpenFileFromDrive={handleOpenFileFromDrive}
        onApplySyncedWorkspace={handleApplySyncedWorkspace}
        onInsertSnippetToEditor={(snippet) => {
          editorRef.current?.insertTextAtCursor(snippet);
          setViewMode('editor');
        }}
        onOpenApiKeySettings={() => setApiKeyModalOpen(true)}
        onOpenApkModal={() => setApkModalOpen(true)}
        onCheckAiStatus={handleCheckAiStatus}
        onServerUrlChanged={handleCheckAiStatus}
      />
    </div>
  );
}
