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
import { useDebouncedIdeLayout } from './hooks/useDebouncedIdeLayout';
import { CodeFile, EngineType, ExecutionResult, AIDebugResult } from './types';
import {
  SyntaxTheme,
  DEFAULT_SYNTAX_THEME,
  TerminalTheme,
  DEFAULT_TERMINAL_THEME,
  normalizeTerminalTheme,
} from './types/theme';
import {
  ShortcutKey,
  KeySize,
  DEFAULT_SHORTCUTS,
  migrateLegacyPairedShortcuts,
} from './types/shortcuts';
import {
  runPyodideCode,
  installPyodidePackage,
  getInstalledPackagesList,
  getUserInstalledPackageNames,
  removeUserPipPackage,
  saveUserPipPackage,
  mergeSavedPipPackages,
  exportPipBackupData,
  restorePipBackupData,
  prewarmPyodide,
  prewarmCodeDependencies,
  precachePyodideCoreAssets,
  subscribePyodideWarmState,
  trimPyodideMemory,
  prunePyodideTransientCache,
  PyodideWarmState,
} from './services/pyodideService';
import {
  initBootRecoveryGuard,
  clearTransientCachesPreservingUserCode,
  BootRecoveryState,
} from './utils/apkRecovery';
import {
  runCPythonCode,
  prewarmCPythonServer,
  fetchCPythonPipList,
  installCPythonPipPackage,
  subscribeCPythonWarmState,
  resetCPythonWarmState,
  CPythonWarmState,
} from './services/cpythonService';
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
import {
  ensureDefaultFolderExists,
  getDefaultFolderPath,
  setDefaultFolderPath,
  saveActiveFileOverwrite,
  downloadPyFileToDevice,
  pickPyFileWithHandle,
  pickNativeDocumentForEdit,
  readFileFromDefaultFolder,
  saveShortcutsConfigToDefaultFolder,
  loadShortcutsConfigFromDefaultFolder,
  FullDeviceConfigBackup,
  FULL_BACKUP_FILENAME,
  exportFullDeviceConfigBackup,
  parseFullDeviceConfigBackup,
  loadFullDeviceConfigFromDefaultFolder,
} from './services/deviceStorageService';

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
  const [bootRecovery] = useState<BootRecoveryState>(() => initBootRecoveryGuard());
  const [safeModeBanner, setSafeModeBanner] = useState<string | null>(() => bootRecovery.reason);

  // File state with schema validation so corrupted localStorage never crash-loops on boot
  const [files, setFiles] = useState<CodeFile[]>(() => {
    const saved = localStorage.getItem('pydroid_files');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (
          Array.isArray(parsed) &&
          parsed.length > 0 &&
          parsed.every(
            (f) =>
              f &&
              typeof f.id === 'string' &&
              typeof f.name === 'string' &&
              typeof f.content === 'string'
          )
        ) {
          return parsed;
        }
      } catch {}
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
  const [fontSize, setFontSize] = useState<number>(() => {
    const saved = Number(localStorage.getItem('pydroid_font_size'));
    return Number.isFinite(saved) && saved >= 11 && saved <= 26 ? saved : 14;
  });
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [highlightLine, setHighlightLine] = useState<number | undefined>(undefined);
  const [pyodideWarmState, setPyodideWarmState] = useState<PyodideWarmState>('idle');
  const [cpythonWarmState, setCpythonWarmState] = useState<CPythonWarmState>('idle');

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
  const [terminalTheme, setTerminalTheme] = useState<TerminalTheme>(() => {
    const saved = localStorage.getItem('pydroid_terminal_theme');
    if (saved) {
      try {
        return normalizeTerminalTheme(JSON.parse(saved));
      } catch (e) {}
    }
    return DEFAULT_TERMINAL_THEME;
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
  const [autoClearTerminalOnRun, setAutoClearTerminalOnRun] = useState<boolean>(() => {
    try {
      return localStorage.getItem('pydroid_terminal_auto_clear') !== 'false';
    } catch {
      return true;
    }
  });

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
  const [installedPackages, setInstalledPackages] = useState<string[]>(() =>
    getInstalledPackagesList()
  );
  const [userSavedPackages, setUserSavedPackages] = useState<string[]>(() =>
    getUserInstalledPackageNames()
  );
  const [isInstallingPip, setIsInstallingPip] = useState(false);
  const [pipInstallMessage, setPipInstallMessage] = useState('');
  const [runStatusMessage, setRunStatusMessage] = useState<string | null>(null);
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

  // Editor, execution & AI stream abort refs
  const editorRef = useRef<EditorHandle>(null);
  const runAbortRef = useRef<AbortController | null>(null);
  const debugAbortRef = useRef<AbortController | null>(null);
  const explainAbortRef = useRef<AbortController | null>(null);
  const fileHandlesRef = useRef<Map<string, any>>(new Map());
  const preservedOutputPrefixRef = useRef<{
    stdout: string;
    stderr: string;
    plotImages: string[];
  }>({ stdout: '', stderr: '', plotImages: [] });

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

  const safeSetStorage = (key: string, value: string) => {
    try {
      localStorage.setItem(key, value);
    } catch {}
  };

  const filesRef = useRef<CodeFile[]>(files);
  filesRef.current = files;
  const filesSaveTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (filesSaveTimerRef.current !== null) {
      window.clearTimeout(filesSaveTimerRef.current);
    }
    filesSaveTimerRef.current = window.setTimeout(() => {
      filesSaveTimerRef.current = null;
      safeSetStorage('pydroid_files', JSON.stringify(filesRef.current));
    }, 450);

    return () => {
      if (filesSaveTimerRef.current !== null) {
        window.clearTimeout(filesSaveTimerRef.current);
        filesSaveTimerRef.current = null;
      }
    };
  }, [files]);

  useEffect(() => {
    const flushFilesOnHide = () => {
      if (filesSaveTimerRef.current !== null) {
        window.clearTimeout(filesSaveTimerRef.current);
        filesSaveTimerRef.current = null;
      }
      safeSetStorage('pydroid_files', JSON.stringify(filesRef.current));
    };
    const onVisibilityFlush = () => {
      if (document.hidden) flushFilesOnHide();
    };
    window.addEventListener('pagehide', flushFilesOnHide);
    document.addEventListener('visibilitychange', onVisibilityFlush);
    return () => {
      window.removeEventListener('pagehide', flushFilesOnHide);
      document.removeEventListener('visibilitychange', onVisibilityFlush);
    };
  }, []);

  useEffect(() => {
    safeSetStorage('pydroid_engine', engine);
  }, [engine]);

  useEffect(() => {
    safeSetStorage('pydroid_syntax_theme', JSON.stringify(syntaxTheme));
  }, [syntaxTheme]);

  useEffect(() => {
    safeSetStorage('pydroid_terminal_theme', JSON.stringify(terminalTheme));
  }, [terminalTheme]);

  useEffect(() => {
    safeSetStorage('pydroid_terminal_auto_clear', String(autoClearTerminalOnRun));
  }, [autoClearTerminalOnRun]);

  useEffect(() => {
    safeSetStorage('pydroid_shortcuts', JSON.stringify(shortcuts));
  }, [shortcuts]);

  useEffect(() => {
    safeSetStorage('pydroid_keysize', keySize);
  }, [keySize]);

  useEffect(() => {
    safeSetStorage('pydroid_font_size', String(fontSize));
  }, [fontSize]);

  useEffect(() => {
    setInstalledPackages(getInstalledPackagesList());
    setUserSavedPackages(getUserInstalledPackageNames());
    // Ensure default phone folder exists and restore shortcut config from default folder if needed
    ensureDefaultFolderExists().catch(() => {});
    if (!localStorage.getItem('pydroid_shortcuts')) {
      loadShortcutsConfigFromDefaultFolder()
        .then((cfg) => {
          if (cfg?.shortcuts && cfg.shortcuts.length > 0) {
            setShortcuts(cfg.shortcuts);
          }
          if (cfg?.keySize) {
            setKeySize(cfg.keySize);
          }
        })
        .catch(() => {});
    }

    // Boot cache hygiene: clear transient cache if rapid crash-loop recovery asked for it,
    // otherwise lazily prune IndexedDB CDN cache down to mobile budget after startup settles.
    const cachePruneTimer = window.setTimeout(() => {
      void prunePyodideTransientCache(bootRecovery.clearTransientCache);
    }, bootRecovery.clearTransientCache ? 150 : 4000);

    return () => window.clearTimeout(cachePruneTimer);
  }, [bootRecovery.clearTransientCache]);

  // Subscribe to warm-up status for both engines
  useEffect(() => {
    const unsubPyodide = subscribePyodideWarmState(setPyodideWarmState);
    const unsubCpython = subscribeCPythonWarmState((state) => setCpythonWarmState(state));
    return () => {
      unsubPyodide();
      unsubCpython();
    };
  }, []);

  const secondaryWarmTimerRef = useRef<number | null>(null);
  const activeFileContentRef = useRef<string>(activeFile?.content || DEFAULT_MAIN_PY);
  activeFileContentRef.current = activeFile?.content || DEFAULT_MAIN_PY;
  const isRunningRef = useRef<boolean>(isRunning);
  isRunningRef.current = isRunning;

  useEffect(() => {
    return () => {
      if (secondaryWarmTimerRef.current !== null) {
        window.clearTimeout(secondaryWarmTimerRef.current);
      }
    };
  }, []);

  // Native Android memory pressure & background trim handler (prevents prolonged-use OOM restarts)
  useEffect(() => {
    const handleMemoryTrim = (level: number) => {
      const severe = level >= 15; // TRIM_MEMORY_RUNNING_CRITICAL / COMPLETE / MODERATE
      if (!isRunningRef.current) {
        void trimPyodideMemory({
          recycleIdleWorker: severe || level >= 10,
          forceRecycle: level >= 40,
        });
      }
      if (severe) {
        preservedOutputPrefixRef.current = {
          stdout: preservedOutputPrefixRef.current.stdout.slice(-40000),
          stderr: preservedOutputPrefixRef.current.stderr.slice(-12000),
          plotImages: preservedOutputPrefixRef.current.plotImages.slice(-2),
        };
        setExecutionResult((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            stdout: (prev.stdout || '').slice(-60000),
            stderr: (prev.stderr || '').slice(-15000),
            plotImages: (prev.plotImages || []).slice(-2),
          };
        });
      }
    };

    (window as any).__pydroidOnMemoryPressure = handleMemoryTrim;

    let backgroundTrimTimer: number | null = null;
    const onVisibilityChange = () => {
      if (document.hidden) {
        if (backgroundTrimTimer !== null) window.clearTimeout(backgroundTrimTimer);
        backgroundTrimTimer = window.setTimeout(() => {
          backgroundTrimTimer = null;
          if (document.hidden && !isRunningRef.current && isMobileOrApk()) {
            void trimPyodideMemory({ recycleIdleWorker: true });
          }
        }, 12000);
      } else if (backgroundTrimTimer !== null) {
        window.clearTimeout(backgroundTrimTimer);
        backgroundTrimTimer = null;
      }
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      if (backgroundTrimTimer !== null) window.clearTimeout(backgroundTrimTimer);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      if ((window as any).__pydroidOnMemoryPressure === handleMemoryTrim) {
        delete (window as any).__pydroidOnMemoryPressure;
      }
    };
  }, []);

  // Debounced layout resize listener, coalesced Editor<->Terminal switcher,
  // and race-safe CPython<->Pyodide engine transition controller
  const {
    layoutContainerRef,
    settledHeight,
    isLayoutSettling,
    requestViewModeChange,
    markUserEngineSwitch,
  } = useDebouncedIdeLayout({
    viewMode,
    setViewMode,
    engine,
    initialWarmDelayMs: isMobileOrApk() ? 850 : 120,
    engineDebounceMs: 200,
    layoutDebounceMs: 135,
    onBeforeLeaveEditor: () => {
      editorRef.current?.blur();
    },
    onSettledEngineWarmup: (settledEngine, isStale, isUserSwitch) => {
      if (secondaryWarmTimerRef.current !== null) {
        window.clearTimeout(secondaryWarmTimerRef.current);
        secondaryWarmTimerRef.current = null;
      }

      const isApk = isMobileOrApk();
      const customServer = hasCustomServer();
      const useOfflinePyodide =
        settledEngine === 'pyodide' || (isApk && !customServer);
      const seedCode = activeFileContentRef.current || DEFAULT_MAIN_PY;

      // In Safe Mode after rapid crash recovery, avoid automatically booting WASM on startup
      if (bootRecovery.safeMode && !isUserSwitch) {
        return;
      }

      if (useOfflinePyodide) {
        prewarmPyodide(seedCode);
        if (isUserSwitch && settledEngine === 'cpython' && isApk && !customServer) {
          showToast('Chưa cấu hình URL Server riêng — sẽ tự chạy Pyodide Offline khi bấm RUN.');
        }
      } else {
        void prewarmCPythonServer({ force: isUserSwitch }).then((res) => {
          if (isStale()) return;
          if (isUserSwitch) {
            if (res.ok) {
              showToast(
                `CPython ${res.pythonVersion || '3.10'} đã sẵn sàng${
                  typeof res.latencyMs === 'number' ? ` (${res.latencyMs}ms)` : ''
                }!`
              );
            } else {
              showToast('Máy chủ CPython chưa phản hồi — sẽ tự động dự phòng bằng Pyodide WASM.');
              prewarmPyodide(activeFileContentRef.current || DEFAULT_MAIN_PY);
            }
          }
        });
      }

      // Lazily pre-cache/warm the secondary engine during idle time so future switches stay fast
      secondaryWarmTimerRef.current = window.setTimeout(() => {
        secondaryWarmTimerRef.current = null;
        if (isStale() || bootRecovery.safeMode) return;
        if (useOfflinePyodide) {
          if (!isApk || customServer) {
            void prewarmCPythonServer();
          }
        } else {
          precachePyodideCoreAssets();
        }
      }, isApk ? 2600 : 1800);
    },
  });

  // Pre-cache imported packages when user switches to a different file or sample code while Pyodide is ready
  useEffect(() => {
    if (pyodideWarmState !== 'ready' || isRunning || !activeFile?.content) return;
    const timer = setTimeout(() => {
      void prewarmCodeDependencies(activeFile.content);
    }, 550);
    return () => clearTimeout(timer);
  }, [activeFileId, activeFile?.content, pyodideWarmState, isRunning]);

  // Sync installed package list from CPython server when Pip modal opens in CPython mode
  useEffect(() => {
    if (!pipModalOpen) return;
    setInstalledPackages(getInstalledPackagesList());
    setUserSavedPackages(getUserInstalledPackageNames());
    if (engine === 'cpython' && (!isMobileOrApk() || hasCustomServer())) {
      fetchCPythonPipList().then((serverPkgs) => {
        if (serverPkgs.length > 0) {
          const TRACKABLE = new Set([
            'numpy',
            'matplotlib',
            'pandas',
            'pyfiglet',
            'colorama',
            'requests',
            'sympy',
            'beautifulsoup4',
            'scipy',
            'rich',
            'pillow',
          ]);
          const matched = serverPkgs.filter((p) => TRACKABLE.has(p));
          if (matched.length > 0) {
            mergeSavedPipPackages(matched, 'cpython');
            setInstalledPackages(getInstalledPackagesList());
            setUserSavedPackages(getUserInstalledPackageNames());
          }
        }
      });
    }
  }, [pipModalOpen, engine]);

  const handleChangeEngine = (nextEngine: EngineType) => {
    if (nextEngine === engine) return;
    markUserEngineSwitch();
    setEngine(nextEngine);

    if (nextEngine === 'pyodide') {
      showToast(
        pyodideWarmState === 'ready'
          ? 'Đã chuyển sang Pyodide WASM — Sẵn sàng chạy ngay!'
          : 'Đã chuyển sang Pyodide WASM — Đang khởi động môi trường...'
      );
    } else if (isMobileOrApk() && !hasCustomServer()) {
      showToast('Chưa cấu hình URL Server riêng — sẽ tự chạy Pyodide Offline khi bấm RUN.');
    } else {
      showToast('Đã chuyển sang CPython 3.10 — Đang làm nóng máy chủ...');
    }
  };

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
    requestViewModeChange('editor', { immediate: true });
  };

  const handleRenameFile = (id: string, newName: string) => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    const finalName = trimmed.endsWith('.py') ? trimmed : `${trimmed}.py`;
    setFiles((prev) => prev.map((f) => (f.id === id ? { ...f, name: finalName } : f)));
  };

  const handleCloseFile = (id: string) => {
    if (files.length <= 1) return;
    fileHandlesRef.current.delete(id);
    const remaining = files.filter((f) => f.id !== id);
    setFiles(remaining);
    if (activeFileId === id) {
      setActiveFileId(remaining[0].id);
    }
  };

  // Save: overwrite changes in the editor back into the .py file previously opened from phone
  const handleSaveActiveFile = async (): Promise<{ ok: boolean; message: string }> => {
    if (!activeFile) {
      return { ok: false, message: 'Không có tệp đang mở để lưu.' };
    }
    const fileHandle = fileHandlesRef.current.get(activeFile.id);
    const res = await saveActiveFileOverwrite({
      fileName: activeFile.name,
      content: activeFile.content,
      fileHandle,
      devicePath: activeFile.devicePath,
      nativeUri: activeFile.nativeUri,
    });

    if (res.ok) {
      const updatedFiles = files.map((f) =>
        f.id === activeFile.id
          ? {
              ...f,
              isModified: false,
              devicePath: res.devicePath || f.devicePath,
              nativeUri: res.nativeUri || f.nativeUri,
            }
          : f
      );
      setFiles(updatedFiles);
      try {
        localStorage.setItem('pydroid_files', JSON.stringify(updatedFiles));
      } catch {}
    }

    if (!res.ok) {
      const errMsg = res.error || `Không thể ghi đè ${activeFile.name}`;
      showToast(errMsg);
      return { ok: false, message: errMsg };
    }

    const msg =
      res.method === 'local'
        ? `Đã Save ${activeFile.name} vào bộ nhớ ứng dụng.`
        : `Đã Save (ghi đè) ${activeFile.name} → ${res.displayPath}`;
    showToast(msg);
    return { ok: true, message: msg };
  };

  const handleDownloadActivePy = async (): Promise<{ ok: boolean; message: string }> => {
    if (!activeFile) {
      return { ok: false, message: 'Không có tệp để tải xuống.' };
    }
    const res = await downloadPyFileToDevice(activeFile.name, activeFile.content);
    if (res.ok) {
      setFiles((prev) =>
        prev.map((f) =>
          f.id === activeFile.id
            ? { ...f, isModified: false, devicePath: res.devicePath }
            : f
        )
      );
      const msg = res.savedToDefaultFolder
        ? `Đã tải & lưu ${activeFile.name} vào ${res.displayPath}`
        : `Đã tải xuống ${activeFile.name} (${res.displayPath})`;
      showToast(msg);
      return { ok: true, message: msg };
    }
    const errMsg = res.error || `Không thể tải xuống ${activeFile.name}`;
    showToast(errMsg);
    return { ok: false, message: errMsg };
  };

  const openPhoneFileInEditor = (
    fileName: string,
    content: string,
    devicePath?: string,
    fileHandle?: any,
    nativeUri?: string
  ) => {
    const targetDevicePath = devicePath || `${getDefaultFolderPath()}/${fileName}`;
    const existing = files.find(
      (f) =>
        (nativeUri && f.nativeUri === nativeUri) ||
        f.devicePath === targetDevicePath ||
        (f.name === fileName && f.sourceType === 'phone')
    );
    if (existing) {
      if (fileHandle) {
        fileHandlesRef.current.set(existing.id, fileHandle);
      }
      setFiles((prev) =>
        prev.map((f) =>
          f.id === existing.id
            ? {
                ...f,
                name: fileName,
                content,
                isModified: false,
                sourceType: 'phone',
                devicePath: targetDevicePath,
                nativeUri: nativeUri ?? f.nativeUri,
              }
            : f
        )
      );
      setActiveFileId(existing.id);
    } else {
      const newId = Date.now().toString();
      if (fileHandle) {
        fileHandlesRef.current.set(newId, fileHandle);
      }
      const newFile: CodeFile = {
        id: newId,
        name: fileName,
        content,
        isModified: false,
        sourceType: 'phone',
        devicePath: targetDevicePath,
        nativeUri,
      };
      setFiles((prev) => [...prev, newFile]);
      setActiveFileId(newId);
    }
    setHighlightLine(undefined);
    requestViewModeChange('editor', { immediate: true });
  };

  const handlePickPyWithHandle = async (): Promise<boolean> => {
    const res = await pickPyFileWithHandle();
    if (!res.supported || res.cancelled || !res.name) {
      return false;
    }
    openPhoneFileInEditor(res.name, res.content || '', undefined, res.fileHandle);
    showToast(`Đã mở ${res.name} (nhấn Save để ghi đè trực tiếp file này)`);
    return true;
  };

  const handlePickPyNative = async (): Promise<{
    handled: boolean;
    opened: boolean;
    error?: string;
  }> => {
    const res = await pickNativeDocumentForEdit();
    if (!res.supported) {
      return { handled: false, opened: false };
    }
    if (res.cancelled) {
      return { handled: true, opened: false };
    }
    if (res.error || !res.name) {
      return { handled: true, opened: false, error: res.error || 'Không thể mở tệp đã chọn' };
    }
    openPhoneFileInEditor(res.name, res.content || '', undefined, undefined, res.uri);
    showToast(`Đã mở ${res.name} (nhấn Save để ghi đè trực tiếp file trên điện thoại)`);
    return { handled: true, opened: true };
  };

  const handleOpenFromDefaultFolder = async (
    fileName: string,
    relPath: string
  ): Promise<{ ok: boolean; message: string }> => {
    const res = await readFileFromDefaultFolder(fileName, relPath);
    if (!res.ok) {
      return { ok: false, message: res.error || `Không thể mở ${fileName}` };
    }
    openPhoneFileInEditor(fileName, res.content || '', res.devicePath, res.fileHandle);
    showToast(`Đã mở ${fileName} từ thư mục mặc định`);
    return { ok: true, message: `Đã mở ${fileName}` };
  };

  const handleSyncShortcutsToDefaultFolder = async (): Promise<{
    ok: boolean;
    message: string;
  }> => {
    const res = await saveShortcutsConfigToDefaultFolder(shortcuts, keySize);
    if (res.ok) {
      const msg = `Đã lưu cấu hình phím tắt vào ${res.displayPath}`;
      showToast(msg);
      return { ok: true, message: msg };
    }
    const msg = `Đã lưu cấu hình trong ứng dụng (Mặc định APK: Documents/${getDefaultFolderPath()}/pydroid_shortcuts_config.json)`;
    return { ok: true, message: msg };
  };

  // Full Device Config Single-File Backup & Restore (Shortcuts + Syntax Theme + Pip)
  const handleExportFullBackup = async (): Promise<{ ok: boolean; message: string }> => {
    try {
      let userProfileShortcuts: ShortcutKey[] | undefined;
      try {
        const rawUserProfile = localStorage.getItem('pydroid_user_shortcuts');
        if (rawUserProfile) {
          const parsedProfile = JSON.parse(rawUserProfile);
          if (Array.isArray(parsedProfile) && parsedProfile.length > 0) {
            userProfileShortcuts = migrateLegacyPairedShortcuts(parsedProfile);
          }
        }
      } catch {}

      const pipData = await exportPipBackupData();
      const backup: FullDeviceConfigBackup = {
        format: 'pydroid3-web-device-config',
        version: 1,
        exportedAt: new Date().toISOString(),
        appName: 'Pydroid 3 Web',
        shortcutsConfig: {
          shortcuts,
          userProfileShortcuts,
          keySize,
        },
        syntaxTheme,
        terminalTheme,
        editorSettings: {
          fontSize,
          engine,
          defaultFolder: getDefaultFolderPath(),
        },
        pipPackages: pipData,
      };

      const res = await exportFullDeviceConfigBackup(backup);
      if (!res.ok) {
        const errMsg = res.error || 'Không thể tạo file sao lưu toàn bộ cấu hình.';
        showToast(errMsg);
        return { ok: false, message: errMsg };
      }

      const skippedNote =
        pipData.skippedBundlePackages.length > 0
          ? ` (Ghi chú: ${pipData.skippedBundlePackages.join(', ')} quá lớn nên chỉ lưu tên gói)`
          : '';
      const msg = `Đã sao lưu ${shortcuts.length} phím tắt, bảng màu cú pháp & ${pipData.packages.length} thư viện Pip vào 1 file: ${res.displayPath}${skippedNote}`;
      showToast(`Đã sao lưu toàn bộ cấu hình → ${FULL_BACKUP_FILENAME}`);
      return { ok: true, message: msg };
    } catch (err: any) {
      const errMsg = err?.message || 'Lỗi khi sao lưu cấu hình.';
      showToast(errMsg);
      return { ok: false, message: errMsg };
    }
  };

  const applyFullConfigBackup = async (backup: FullDeviceConfigBackup) => {
    const restoredShortcuts =
      backup.shortcutsConfig.shortcuts.length > 0
        ? backup.shortcutsConfig.shortcuts
        : shortcuts;

    if (backup.shortcutsConfig.shortcuts.length > 0) {
      setShortcuts(restoredShortcuts);
      safeSetStorage('pydroid_shortcuts', JSON.stringify(restoredShortcuts));
    }

    setKeySize(backup.shortcutsConfig.keySize);
    safeSetStorage('pydroid_keysize', backup.shortcutsConfig.keySize);

    if (backup.shortcutsConfig.userProfileShortcuts?.length) {
      safeSetStorage(
        'pydroid_user_shortcuts',
        JSON.stringify(backup.shortcutsConfig.userProfileShortcuts)
      );
    }

    setSyntaxTheme(backup.syntaxTheme);
    safeSetStorage('pydroid_syntax_theme', JSON.stringify(backup.syntaxTheme));

    if (backup.terminalTheme) {
      const normalizedTerm = normalizeTerminalTheme(backup.terminalTheme);
      setTerminalTheme(normalizedTerm);
      safeSetStorage('pydroid_terminal_theme', JSON.stringify(normalizedTerm));
    }

    setFontSize(backup.editorSettings.fontSize);
    safeSetStorage('pydroid_font_size', String(backup.editorSettings.fontSize));

    if (backup.editorSettings.defaultFolder) {
      setDefaultFolderPath(backup.editorSettings.defaultFolder);
    }

    await saveShortcutsConfigToDefaultFolder(
      restoredShortcuts,
      backup.shortcutsConfig.keySize
    ).catch(() => {});

    const pipRes = await restorePipBackupData(
      backup.pipPackages.packages,
      backup.pipPackages.bundles
    );
    setInstalledPackages(getInstalledPackagesList());
    setUserSavedPackages(getUserInstalledPackageNames());

    if (backup.editorSettings.engine && backup.editorSettings.engine !== engine) {
      handleChangeEngine(backup.editorSettings.engine);
    }

    return {
      restoredShortcuts: restoredShortcuts.length,
      restoredPackages: pipRes.restoredPackages,
      restoredBundles: pipRes.restoredBundles,
    };
  };

  const handleImportFullBackupFile = async (
    file: File
  ): Promise<{ ok: boolean; message: string }> => {
    try {
      const rawText = await file.text();
      const parsed = parseFullDeviceConfigBackup(rawText);
      if (!parsed) {
        const msg = `File "${file.name}" không phải bản sao lưu cấu hình Pydroid 3 Web hợp lệ.`;
        showToast(msg);
        return { ok: false, message: msg };
      }

      const summary = await applyFullConfigBackup(parsed);
      const msg = `Đã khôi phục từ "${file.name}": ${summary.restoredShortcuts} phím tắt, bảng màu cú pháp & ${summary.restoredPackages} thư viện Pip${
        summary.restoredBundles > 0 ? ` (${summary.restoredBundles} gói offline)` : ''
      }.`;
      showToast('Đã khôi phục toàn bộ cấu hình máy thành công!');
      return { ok: true, message: msg };
    } catch (err: any) {
      const msg = err?.message || 'Không thể đọc file sao lưu.';
      showToast(msg);
      return { ok: false, message: msg };
    }
  };

  const handleRestoreFullBackupFromFolder = async (): Promise<{
    ok: boolean;
    message: string;
  }> => {
    const res = await loadFullDeviceConfigFromDefaultFolder();
    if (!res.ok || !res.backup) {
      const msg = res.error || `Không tìm thấy ${FULL_BACKUP_FILENAME} trong thư mục mặc định.`;
      showToast(msg);
      return { ok: false, message: msg };
    }

    const summary = await applyFullConfigBackup(res.backup);
    const msg = `Đã khôi phục từ ${res.displayPath}: ${summary.restoredShortcuts} phím tắt, màu cú pháp & ${summary.restoredPackages} thư viện Pip.`;
    showToast('Đã khôi phục toàn bộ cấu hình từ thư mục mặc định!');
    return { ok: true, message: msg };
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
    requestViewModeChange('editor', { immediate: true });
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
    if (payload.terminalTheme) setTerminalTheme(normalizeTerminalTheme(payload.terminalTheme));
    if (payload.shortcuts) setShortcuts(payload.shortcuts);
    if (payload.keySize) setKeySize(payload.keySize);
    if (typeof payload.fontSize === 'number') setFontSize(payload.fontSize);
    setHighlightLine(undefined);
    requestViewModeChange('editor', { immediate: true });
  };

  // Run Code logic (CPython Native or Pyodide WASM) with rAF-batched Streaming & Multi-input support
  const handleRunCode = async (customInputs?: string[], isFresh = false) => {
    if (isRunning) return;

    runAbortRef.current?.abort();
    const abortController = new AbortController();
    runAbortRef.current = abortController;

    setIsRunning(true);
    setRunStatusMessage(null);
    setHighlightLine(undefined);

    // Switch to Terminal view immediately upon clicking RUN (blurring Editor IME first)
    requestViewModeChange('terminal', { immediate: true });

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

    const MAX_RETAINED_STDOUT_CHARS = 180000;
    const MAX_RETAINED_STDERR_CHARS = 45000;
    const MAX_RETAINED_PLOTS = 6;

    const capTail = (text: string, maxChars: number): string =>
      text.length > maxChars ? text.slice(text.length - maxChars) : text;

    if (isFresh) {
      if (autoClearTerminalOnRun) {
        preservedOutputPrefixRef.current = { stdout: '', stderr: '', plotImages: [] };
        setExecutionResult({
          stdout: '',
          stderr: '',
          exitCode: 0,
          duration: 0,
          engine: defaultEngineName,
          plotImages: [],
          isWaitingInput: false,
        });
      } else {
        const prevStdout = executionResult?.stdout || '';
        const prevStderr =
          executionResult?.stderr && executionResult.stderr.trim() !== 'PythonError'
            ? executionResult.stderr
            : '';
        const prevPlots = executionResult?.plotImages || [];
        const sep =
          prevStdout.length > 0
            ? `${prevStdout.endsWith('\n') ? '' : '\n'}────────────────────────\n`
            : '';
        preservedOutputPrefixRef.current = {
          stdout: capTail(prevStdout + sep, Math.floor(MAX_RETAINED_STDOUT_CHARS * 0.65)),
          stderr: capTail(prevStderr, Math.floor(MAX_RETAINED_STDERR_CHARS * 0.5)),
          plotImages: prevPlots.slice(-4),
        };
      }
    }

    const prefix = preservedOutputPrefixRef.current;
    const currentStdoutChunks: string[] = [];
    let currentStdoutChars = 0;
    const currentStderrChunks: string[] = [];
    let currentStderrChars = 0;
    let flushScheduled = false;
    let flushRafId: number | null = null;

    const appendBoundedChunk = (
      chunks: string[],
      chunk: string,
      totalChars: number,
      maxChars: number
    ): number => {
      chunks.push(chunk);
      let next = totalChars + chunk.length;
      while (next > maxChars && chunks.length > 1) {
        const dropped = chunks.shift()!;
        next -= dropped.length;
      }
      return next;
    };

    const getCurrentStdout = () => {
      return capTail(currentStdoutChunks.join(''), MAX_RETAINED_STDOUT_CHARS);
    };

    const getCurrentStderr = () => {
      return capTail(currentStderrChunks.join(''), MAX_RETAINED_STDERR_CHARS);
    };

    const mergeRunResult = (nextRes: ExecutionResult): ExecutionResult => {
      const cleanNextStderr =
        nextRes.stderr && nextRes.stderr.trim() !== 'PythonError' ? nextRes.stderr : '';
      const mergedStderr =
        prefix.stderr && cleanNextStderr
          ? `${prefix.stderr}\n---\n${cleanNextStderr}`
          : cleanNextStderr || prefix.stderr;
      const combinedPlots = [...prefix.plotImages, ...(nextRes.plotImages || [])];
      return {
        ...nextRes,
        stdout: capTail(prefix.stdout + (nextRes.stdout || ''), MAX_RETAINED_STDOUT_CHARS),
        stderr: capTail(mergedStderr, MAX_RETAINED_STDERR_CHARS),
        plotImages:
          combinedPlots.length > MAX_RETAINED_PLOTS
            ? combinedPlots.slice(-MAX_RETAINED_PLOTS)
            : combinedPlots,
      };
    };

    const flushPendingOutput = () => {
      flushScheduled = false;
      flushRafId = null;
      const liveStdout = getCurrentStdout();
      const liveStderr = getCurrentStderr();
      const mergedStderr =
        prefix.stderr && liveStderr
          ? `${prefix.stderr}\n---\n${liveStderr}`
          : liveStderr || prefix.stderr;
      setExecutionResult((prev) => ({
        stdout: capTail(prefix.stdout + liveStdout, MAX_RETAINED_STDOUT_CHARS),
        stderr: capTail(
          mergedStderr || (!isFresh ? prev?.stderr || '' : ''),
          MAX_RETAINED_STDERR_CHARS
        ),
        exitCode: liveStderr ? 1 : 0,
        duration: prev?.duration || 0,
        engine: prev?.engine || defaultEngineName,
        plotImages: prefix.plotImages,
        isWaitingInput: false,
      }));
    };

    const scheduleFlush = () => {
      if (flushScheduled) return;
      flushScheduled = true;
      flushRafId = requestAnimationFrame(flushPendingOutput);
    };

    // Batched live streaming callbacks: renders smoothly at display frame rate even under heavy print() loops
    const handleLiveStdout = (chunk: string) => {
      if (!chunk) return;
      currentStdoutChars = appendBoundedChunk(
        currentStdoutChunks,
        chunk,
        currentStdoutChars,
        MAX_RETAINED_STDOUT_CHARS
      );
      scheduleFlush();
    };

    const handleLiveStderr = (chunk: string) => {
      if (!chunk) return;
      currentStderrChars = appendBoundedChunk(
        currentStderrChunks,
        chunk,
        currentStderrChars,
        MAX_RETAINED_STDERR_CHARS
      );
      scheduleFlush();
    };

    try {
      if (engine === 'cpython') {
        if (isMobileOrApk() && !hasCustomServer()) {
          const wasmRes = await runPyodideCode({
            code,
            inputs: inputsToProvide,
            signal: abortController.signal,
            onStdout: handleLiveStdout,
            onStderr: handleLiveStderr,
            onStatus: setRunStatusMessage,
          });
          setExecutionResult(
            mergeRunResult({
              stdout: wasmRes.stdout,
              stderr: wasmRes.stderr,
              exitCode: wasmRes.exitCode,
              duration: wasmRes.duration,
              engine: 'Pyodide WASM (Chạy Offline trên thiết bị)',
              plotImages: wasmRes.plotImages,
              isWaitingInput: wasmRes.isWaitingInput,
              prompt: wasmRes.prompt,
            })
          );
          setIsWaitingInput(!!wasmRes.isWaitingInput);
          if (wasmRes.prompt) {
            setInputPromptText(wasmRes.prompt);
          }
        } else {
          try {
            const res = await runCPythonCode({
              code,
              inputs: inputsToProvide,
              signal: abortController.signal,
              onStdout: handleLiveStdout,
              onStderr: handleLiveStderr,
              onStatus: setRunStatusMessage,
            });
            setExecutionResult(
              mergeRunResult({
                stdout: res.stdout,
                stderr: res.stderr,
                exitCode: res.exitCode,
                duration: res.duration,
                engine: res.engine,
                plotImages: res.plotImages || [],
                isWaitingInput: res.isWaitingInput,
                prompt: res.prompt,
              })
            );
            setIsWaitingInput(!!res.isWaitingInput);
            if (res.prompt) {
              setInputPromptText(res.prompt);
            }
          } catch (serverErr: any) {
            if (serverErr?.name === 'AbortError' || abortController.signal.aborted) {
              setExecutionResult(
                mergeRunResult({
                  stdout: getCurrentStdout(),
                  stderr: getCurrentStderr() || 'Đã dừng thực thi bởi người dùng.',
                  exitCode: 130,
                  duration: 0,
                  engine: 'CPython 3.10 (Native Linux)',
                  isWaitingInput: false,
                })
              );
              setIsWaitingInput(false);
              return;
            }
            console.warn('CPython server error, falling back to Pyodide WASM:', serverErr);
            setRunStatusMessage('Máy chủ CPython bận, đang chuyển sang Pyodide WASM...');
            const wasmRes = await runPyodideCode({
              code,
              inputs: inputsToProvide,
              signal: abortController.signal,
              onStdout: handleLiveStdout,
              onStderr: handleLiveStderr,
              onStatus: setRunStatusMessage,
            });
            setExecutionResult(
              mergeRunResult({
                stdout: wasmRes.stdout,
                stderr: wasmRes.stderr,
                exitCode: wasmRes.exitCode,
                duration: wasmRes.duration,
                engine: wasmRes.engine + ' (Tự động chuyển từ CPython)',
                plotImages: wasmRes.plotImages,
                isWaitingInput: wasmRes.isWaitingInput,
                prompt: wasmRes.prompt,
              })
            );
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
          signal: abortController.signal,
          onStdout: handleLiveStdout,
          onStderr: handleLiveStderr,
          onStatus: setRunStatusMessage,
        });
        setExecutionResult(
          mergeRunResult({
            stdout: wasmRes.stdout,
            stderr: wasmRes.stderr,
            exitCode: wasmRes.exitCode,
            duration: wasmRes.duration,
            engine: wasmRes.engine,
            plotImages: wasmRes.plotImages,
            isWaitingInput: wasmRes.isWaitingInput,
            prompt: wasmRes.prompt,
          })
        );
        setIsWaitingInput(!!wasmRes.isWaitingInput);
        if (wasmRes.prompt) {
          setInputPromptText(wasmRes.prompt);
        }
      }
    } catch (err: any) {
      setExecutionResult(
        mergeRunResult({
          stdout: getCurrentStdout(),
          stderr:
            err?.name === 'AbortError'
              ? 'Đã dừng thực thi bởi người dùng.'
              : err?.message || String(err),
          exitCode: err?.name === 'AbortError' ? 130 : 1,
          duration: 0,
          engine: engine === 'cpython' ? 'CPython Native' : 'Pyodide WASM',
          isWaitingInput: false,
        })
      );
      setIsWaitingInput(false);
    } finally {
      if (flushRafId !== null) {
        cancelAnimationFrame(flushRafId);
      }
      setRunStatusMessage(null);
      setIsRunning(false);
    }
  };

  const handleStopExecution = () => {
    runAbortRef.current?.abort();
    setRunStatusMessage('Đang dừng...');
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

  // Persistent Pip Package Management (Pyodide WASM + IndexedDB + CPython Server)
  const handleInstallPip = async (pkgName: string) => {
    setIsInstallingPip(true);
    setPipInstallMessage(`Đang tải & lưu gói ${pkgName}...`);
    try {
      const canUseCPythonServer =
        engine === 'cpython' && (!isMobileOrApk() || hasCustomServer());

      if (canUseCPythonServer) {
        try {
          setPipInstallMessage(`Đang cài đặt ${pkgName} trên CPython Server...`);
          const res = await installCPythonPipPackage(pkgName);
          saveUserPipPackage(res.packageName || pkgName, 'cpython');
          // Also best-effort install into Pyodide offline cache when network is available
          installPyodidePackage(pkgName).catch(() => {});
        } catch (cpythonErr) {
          // Fall back to Pyodide WASM + IndexedDB cache if server rejects or is unreachable
          await installPyodidePackage(pkgName, (msg) => setPipInstallMessage(msg));
          void cpythonErr;
        }
      } else {
        await installPyodidePackage(pkgName, (msg) => setPipInstallMessage(msg));
      }

      setInstalledPackages(getInstalledPackagesList());
      setUserSavedPackages(getUserInstalledPackageNames());
      setPipInstallMessage(`Đã cài đặt & lưu thành công ${pkgName}!`);
      showToast(`Đã lưu thư viện ${pkgName} vào thiết bị!`);
    } finally {
      setIsInstallingPip(false);
    }
  };

  const handleRemovePip = async (pkgName: string) => {
    await removeUserPipPackage(pkgName);
    setInstalledPackages(getInstalledPackagesList());
    setUserSavedPackages(getUserInstalledPackageNames());
    showToast(`Đã gỡ ${pkgName} khỏi danh sách đã lưu.`);
  };

  // Clear current view (no window.confirm)
  const handleClearCurrentView = () => {
    if (viewMode === 'editor') {
      setConfirmClearEditorOpen(true);
    } else {
      preservedOutputPrefixRef.current = { stdout: '', stderr: '', plotImages: [] };
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
    <div
      ref={layoutContainerRef}
      data-layout-settling={isLayoutSettling ? 'true' : 'false'}
      style={settledHeight ? { height: `${settledHeight}px` } : undefined}
      className="flex flex-col h-dvh w-screen overflow-hidden bg-[#070b14] text-slate-100 pb-[env(safe-area-inset-bottom,0px)] relative"
    >
      {/* Top Header Toolbar */}
      <Header
        onRun={() => handleRunCode(undefined, true)}
        isRunning={isRunning}
        viewMode={viewMode}
        onChangeViewMode={(nextMode) => requestViewModeChange(nextMode)}
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

      {safeModeBanner && (
        <div className="px-3 py-1.5 bg-amber-950/90 border-b border-amber-500/45 text-[11px] text-amber-100 flex items-center justify-between gap-2 shrink-0">
          <span className="leading-snug">{safeModeBanner}</span>
          <button
            type="button"
            onClick={() => setSafeModeBanner(null)}
            className="px-2 py-0.5 rounded bg-amber-500/20 hover:bg-amber-500/35 text-amber-200 font-semibold shrink-0"
          >
            Đóng
          </button>
        </div>
      )}

      {/* Main Screen: Both Editor & Terminal stay mounted; CSS visibility toggling prevents WebView DOM thrashing */}
      <main className="flex-1 flex flex-col overflow-hidden relative">
        <div
          aria-hidden={viewMode !== 'editor'}
          className={
            viewMode === 'editor'
              ? 'flex-1 flex flex-col h-full overflow-hidden'
              : 'hidden'
          }
        >
          <Editor
            ref={editorRef}
            activeFile={activeFile}
            onChangeContent={handleUpdateContent}
            highlightLine={highlightLine}
            fontSize={fontSize}
            theme={syntaxTheme}
            isActive={viewMode === 'editor'}
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

        <div
          aria-hidden={viewMode !== 'terminal'}
          className={
            viewMode === 'terminal'
              ? 'flex-1 flex flex-col h-full overflow-hidden'
              : 'hidden'
          }
        >
          <Terminal
            result={executionResult}
            isRunning={isRunning}
            onRun={(inputs) => handleRunCode(inputs, true)}
            onStop={handleStopExecution}
            onClear={() => {
              preservedOutputPrefixRef.current = { stdout: '', stderr: '', plotImages: [] };
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
            statusMessage={runStatusMessage}
            terminalTheme={terminalTheme}
            autoClearOnRun={autoClearTerminalOnRun}
            onToggleAutoClear={() => setAutoClearTerminalOnRun((prev) => !prev)}
            isActive={viewMode === 'terminal'}
          />
        </div>
      </main>

      {/* Side Drawer Menu */}
      <DrawerMenu
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        engine={engine}
        onChangeEngine={handleChangeEngine}
        pyodideWarmState={pyodideWarmState}
        cpythonWarmState={cpythonWarmState}
        onOpenPip={() => setPipModalOpen(true)}
        onOpenApk={() => setApkModalOpen(true)}
        onOpenSyntaxColor={() => setSyntaxModalOpen(true)}
        onOpenApiKeySettings={() => setApiKeyModalOpen(true)}
        onOpenGoogleWorkspace={() => setGoogleModalOpen(true)}
        onSwitchGoogleAccount={handleSwitchGoogleAccount}
        googleUser={googleUser}
        hasGoogleToken={hasGoogleToken}
        onServerUrlChanged={() => {
          handleCheckAiStatus();
          resetCPythonWarmState();
          void prewarmCPythonServer({ force: true });
        }}
        fontSize={fontSize}
        onChangeFontSize={(delta) => setFontSize((s) => Math.min(26, Math.max(11, s + delta)))}
        onExportFullBackup={handleExportFullBackup}
        onImportFullBackupFile={handleImportFullBackupFile}
        onRestoreFullBackupFromFolder={handleRestoreFullBackupFromFolder}
        onOptimizeMemory={async () => {
          preservedOutputPrefixRef.current = { stdout: '', stderr: '', plotImages: [] };
          setExecutionResult(null);
          await trimPyodideMemory({ forceRecycle: !isRunningRef.current });
          await clearTransientCachesPreservingUserCode();
          showToast('Đã giải phóng RAM & dọn bộ nhớ đệm WASM (giữ nguyên mã Python).');
          return {
            ok: true,
            message: 'Đã giải phóng RAM & dọn bộ nhớ đệm WASM thành công.',
          };
        }}
        shortcutsCount={shortcuts.length}
        pipPackagesCount={userSavedPackages.length}
      />

      {/* File & Source Manager Modal (Opened from Folder icon next to Trash) */}
      <FileManagerModal
        isOpen={fileManagerOpen}
        onClose={() => setFileManagerOpen(false)}
        files={files}
        activeFileId={activeFileId}
        onSelectFile={(id) => {
          setActiveFileId(id);
          requestViewModeChange('editor', { immediate: true });
        }}
        onCreateFile={handleCreateFile}
        onRenameFile={handleRenameFile}
        onCloseFile={handleCloseFile}
        onSaveFile={handleSaveActiveFile}
        onDownloadPy={handleDownloadActivePy}
        onPickPyWithHandle={handlePickPyWithHandle}
        onPickPyNative={handlePickPyNative}
        onOpenFromDefaultFolder={handleOpenFromDefaultFolder}
        onSyncShortcutsToDefaultFolder={handleSyncShortcutsToDefaultFolder}
        onUploadPy={(e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          const reader = new FileReader();
          reader.onload = (ev) => {
            const content = (ev.target?.result as string) || '';
            openPhoneFileInEditor(file.name, content);
            showToast(`Đã mở ${file.name} (nhấn Save để lưu ghi đè vào thư mục mặc định)`);
          };
          reader.readAsText(file);
          e.target.value = '';
        }}
        onResetCode={() => {
          handleUpdateContent(DEFAULT_MAIN_PY);
          setHighlightLine(undefined);
        }}
        onOpenEditorSearch={() => {
          requestViewModeChange('editor', { immediate: true });
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
          requestViewModeChange('editor', { immediate: true });
        }}
      />

      {/* Custom Color Designer (Screenshot 3 - Requirement 3) */}
      <SyntaxColorModal
        isOpen={syntaxModalOpen}
        onClose={() => setSyntaxModalOpen(false)}
        currentTheme={syntaxTheme}
        onSaveTheme={setSyntaxTheme}
        currentTerminalTheme={terminalTheme}
        onSaveTerminalTheme={setTerminalTheme}
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
        userSavedPackages={userSavedPackages}
        onInstallPackage={handleInstallPip}
        onRemovePackage={handleRemovePip}
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
          requestViewModeChange('editor', { immediate: true });
        }}
      />

      {/* Settings API Key Modal (with lightweight ping validation before saving) */}
      <SettingsApiKeyModal
        isOpen={apiKeyModalOpen}
        onClose={() => setApiKeyModalOpen(false)}
        onKeySaved={() => handleCheckAiStatus()}
        onServerUrlChanged={() => {
          handleCheckAiStatus();
          resetCPythonWarmState();
          void prewarmCPythonServer({ force: true });
        }}
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
        terminalTheme={terminalTheme}
        shortcuts={shortcuts}
        keySize={keySize}
        fontSize={fontSize}
        aiStatus={aiStatus}
        aiStatusTooltip={aiStatusTooltip}
        onOpenFileFromDrive={handleOpenFileFromDrive}
        onApplySyncedWorkspace={handleApplySyncedWorkspace}
        onInsertSnippetToEditor={(snippet) => {
          editorRef.current?.insertTextAtCursor(snippet);
          requestViewModeChange('editor', { immediate: true });
        }}
        onOpenApiKeySettings={() => setApiKeyModalOpen(true)}
        onOpenApkModal={() => setApkModalOpen(true)}
        onCheckAiStatus={handleCheckAiStatus}
        onServerUrlChanged={() => {
          handleCheckAiStatus();
          resetCPythonWarmState();
          void prewarmCPythonServer({ force: true });
        }}
      />
    </div>
  );
}
