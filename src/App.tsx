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
import { SettingsApiKeyModal } from './components/SettingsApiKeyModal';
import { CodeFile, EngineType, ExecutionResult, AIDebugResult } from './types';
import { SyntaxTheme, DEFAULT_SYNTAX_THEME } from './types/theme';
import { ShortcutKey, KeySize, DEFAULT_SHORTCUTS } from './types/shortcuts';
import { runPyodideCode, installPyodidePackage, getInstalledPackagesList } from './services/pyodideService';
import { runCPythonCode } from './services/cpythonService';
import { requestAIDebug, requestAIExplain } from './services/geminiService';
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
print("💡 Mẹo: Nhấn nút đỏ có hình con bọ để AI Debugger phân tích lỗi tức thì.")
print("🎨 Nhấn nút cài đặt cam > Tô Màu Văn Bản để tùy chỉnh màu cú pháp.")
print("🎚️ Nhấn nút thanh trượt góc phải bàn phím để tùy biến phím tắt kéo thả!")
`;

export default function App() {
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

  // Keyboard Shortcuts & Size state (Screenshot 4)
  const [shortcuts, setShortcuts] = useState<ShortcutKey[]>(() => {
    const saved = localStorage.getItem('pydroid_shortcuts');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {}
    }
    return DEFAULT_SHORTCUTS;
  });
  const [keySize, setKeySize] = useState<KeySize>(() => {
    return (localStorage.getItem('pydroid_keysize') as KeySize) || 'medium';
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
  const [pipModalOpen, setPipModalOpen] = useState(false);
  const [installedPackages, setInstalledPackages] = useState<string[]>([]);
  const [isInstallingPip, setIsInstallingPip] = useState(false);
  const [pipInstallMessage, setPipInstallMessage] = useState('');
  const [apkModalOpen, setApkModalOpen] = useState(false);
  const [samplesModalOpen, setSamplesModalOpen] = useState(false);
  const [apiKeyModalOpen, setApiKeyModalOpen] = useState(false);

  // Editor ref
  const editorRef = useRef<EditorHandle>(null);

  const activeFile = files.find((f) => f.id === activeFileId) || files[0];

  // Persist files, theme, engine, shortcuts
  useEffect(() => {
    if (typeof window !== 'undefined' && window.location.origin && window.location.origin.startsWith('https://')) {
      if (!window.location.origin.includes('localhost') && !window.location.origin.includes('127.0.0.1')) {
        localStorage.setItem('pydroid_cloud_server_url', window.location.origin);
      }
    }
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

  const handleAddFile = () => {
    const filename = prompt('Nhập tên file mới (ví dụ: utils.py):');
    if (!filename) return;
    const finalName = filename.endsWith('.py') ? filename : `${filename}.py`;
    const newFile: CodeFile = {
      id: Date.now().toString(),
      name: finalName,
      content: `# ${finalName}\n`,
    };
    setFiles((prev) => [...prev, newFile]);
    setActiveFileId(newFile.id);
  };

  const handleCloseFile = (id: string) => {
    if (files.length <= 1) return;
    const remaining = files.filter((f) => f.id !== id);
    setFiles(remaining);
    if (activeFileId === id) {
      setActiveFileId(remaining[0].id);
    }
  };

  // Run Code logic (CPython Native or Pyodide WASM) with Multi-input support
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

    try {
      if (engine === 'cpython') {
        if (isMobileOrApk() && !hasCustomServer()) {
          const wasmRes = await runPyodideCode({
            code,
            inputs: inputsToProvide,
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
            const res = await runCPythonCode({ code, inputs: inputsToProvide });
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
        stdout: '',
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
      handleRunAIDebug();
    } else if (tab === 'explain' && !aiExplainText) {
      handleAskAIExplain();
    }
  };

  const handleRunAIDebug = async () => {
    setAiLoading(true);

    try {
      const code = activeFile?.content || '';
      const errorOutput = executionResult?.stderr || '';

      const debugData = await requestAIDebug(code, errorOutput);
      setAiDebugResult(debugData);

      if (debugData.lineNumber) {
        setHighlightLine(debugData.lineNumber);
      }
    } catch (err: any) {
      setAiDebugResult({
        summary: 'Không thể phân tích lỗi.',
        errorType: 'API Error',
        explanation: err?.message || 'Lỗi kết nối Gemini AI. Vui lòng kiểm tra lại.',
        fixedCode: activeFile?.content || '',
        suggestions: ['Kiểm tra kết nối mạng hoặc thử lại sau.'],
      });
    } finally {
      setAiLoading(false);
    }
  };

  const handleAskAIExplain = async () => {
    setAiExplaining(true);
    try {
      const code = activeFile?.content || '';
      const text = await requestAIExplain(code);
      setAiExplainText(text);
    } catch (err: any) {
      setAiExplainText('Lỗi: ' + (err?.message || 'Không thể tạo giải thích.'));
    } finally {
      setAiExplaining(false);
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

  // Clear current view
  const handleClearCurrentView = () => {
    if (viewMode === 'editor') {
      if (confirm('Bạn có muốn xóa trắng nội dung tệp hiện tại?')) {
        handleUpdateContent('');
      }
    } else {
      setExecutionResult(null);
      setSessionInputs([]);
      setIsWaitingInput(false);
    }
  };

  // Only consider as real error if NOT waiting for user input and contains actual error message
  const hasError =
    !isWaitingInput &&
    ((executionResult?.exitCode !== undefined && executionResult.exitCode !== 0 && !!executionResult?.stderr?.trim() && executionResult.stderr.trim() !== 'PythonError') ||
      (!!executionResult?.stderr && executionResult.stderr.trim() !== '' && executionResult.stderr.trim() !== 'PythonError'));

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-[#10121a] text-slate-100">
      {/* Top Header Toolbar matching Screenshots 1 & 2 */}
      <Header
        engine={engine}
        onChangeEngine={setEngine}
        onRun={() => handleRunCode(undefined, true)}
        isRunning={isRunning}
        viewMode={viewMode}
        onChangeViewMode={setViewMode}
        onOpenAIAssistant={handleOpenAIAssistant}
        onOpenSamples={() => setSamplesModalOpen(true)}
        onOpenFolderMenu={() => setDrawerOpen(true)}
        onClearCurrentView={handleClearCurrentView}
        onOpenSyntaxColor={() => setSyntaxModalOpen(true)}
        onOpenApiKeySettings={() => setApiKeyModalOpen(true)}
        onToggleDrawer={() => setDrawerOpen(true)}
        hasError={hasError}
      />

      {/* Main Screen: Editor view (Screenshot 2) or Terminal view (Screenshot 1) */}
      <main className="flex-1 flex flex-col overflow-hidden relative">
        {viewMode === 'editor' ? (
          <div className="flex-1 flex flex-col h-full overflow-hidden">
            <Editor
              ref={editorRef}
              files={files}
              activeFileId={activeFileId}
              onSelectFile={setActiveFileId}
              onAddFile={handleAddFile}
              onCloseFile={handleCloseFile}
              onChangeContent={handleUpdateContent}
              highlightLine={highlightLine}
              fontSize={fontSize}
              theme={syntaxTheme}
            />

            {/* Mobile Keyboard Shortcut Bar matching Screenshot 2 (No left arrows, no right AI, slider icon button on far right) */}
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
        onNewFile={handleAddFile}
        onSaveToLocal={() => {
          localStorage.setItem('pydroid_files', JSON.stringify(files));
          alert('Đã lưu mã nguồn thành công vào bộ nhớ trình duyệt!');
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
          };
          reader.readAsText(file);
          e.target.value = '';
        }}
        onResetCode={() => {
          if (confirm('Khôi phục mã nguồn ban đầu cho file này?')) {
            handleUpdateContent(DEFAULT_MAIN_PY);
            setHighlightLine(undefined);
          }
        }}
        onOpenAIAssistant={() => handleOpenAIAssistant('chat')}
        onOpenPip={() => setPipModalOpen(true)}
        onOpenApk={() => setApkModalOpen(true)}
        onOpenSamples={() => setSamplesModalOpen(true)}
        onOpenApiKeySettings={() => setApiKeyModalOpen(true)}
        fontSize={fontSize}
        onChangeFontSize={(delta) => setFontSize((s) => Math.min(26, Math.max(11, s + delta)))}
      />

      {/* Unified AI Assistant Modal (Chat, Debugger, Explainer) */}
      <AIAssistantModal
        isOpen={aiAssistantOpen}
        onClose={() => setAiAssistantOpen(false)}
        initialTab={aiAssistantTab}
        currentCode={activeFile?.content || ''}
        errorOutput={executionResult?.stderr || ''}
        debugResult={aiDebugResult}
        isLoadingDebug={aiLoading}
        onRetryDebug={handleRunAIDebug}
        onApplyFixedCode={handleApplyFixedCode}
        explanationText={aiExplainText}
        isLoadingExplain={aiExplaining}
        onAskExplain={handleAskAIExplain}
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
      />
    </div>
  );
}
