// Pyodide WASM Client-Side Python Runner & Pip Manager

declare global {
  interface Window {
    loadPyodide?: (config: { indexURL: string }) => Promise<any>;
    pyodideInstance?: any;
    __pydroid_input_callback?: (promptText: string) => string | null;
  }
}

let pyodideLoadingPromise: Promise<any> | null = null;
let installedPackages: Set<string> = new Set(['builtins', 'math', 'sys', 'os', 'random', 'time', 'json', 'datetime', 're']);

export type PyodideStatus = 'unloaded' | 'loading' | 'ready' | 'running' | 'error';

export interface PyodideRunOptions {
  code: string;
  inputs?: string[];
  onStdout?: (text: string) => void;
  onStderr?: (text: string) => void;
  onInputPrompt?: (promptText: string) => Promise<string>;
}

export async function getPyodideInstance(onProgress?: (message: string) => void): Promise<any> {
  if (window.pyodideInstance) {
    return window.pyodideInstance;
  }

  if (pyodideLoadingPromise) {
    return pyodideLoadingPromise;
  }

  pyodideLoadingPromise = (async () => {
    onProgress?.('Đang tải thư viện Pyodide WebAssembly...');

    // Load pyodide.js script if not present
    if (!window.loadPyodide) {
      await new Promise<void>((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/pyodide/v0.26.4/full/pyodide.js';
        script.async = true;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error('Không thể tải Pyodide từ CDN. Vui lòng kiểm tra kết nối mạng.'));
        document.head.appendChild(script);
      });
    }

    onProgress?.('Khởi tạo nhân WebAssembly Python 3.12...');
    const pyodide = await window.loadPyodide!({
      indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.26.4/full/',
    });

    onProgress?.('Cài đặt hệ thống I/O & micropip...');
    await pyodide.loadPackage('micropip');

    window.pyodideInstance = pyodide;
    return pyodide;
  })();

  return pyodideLoadingPromise;
}

export async function installPyodidePackage(
  packageName: string,
  onProgress?: (msg: string) => void
): Promise<boolean> {
  const pyodide = await getPyodideInstance(onProgress);
  onProgress?.(`Đang tải và cài đặt ${packageName}...`);

  try {
    // Try built-in pre-compiled Pyodide packages first (e.g. numpy, matplotlib, pandas, sympy, scipy)
    await pyodide.loadPackage(packageName.toLowerCase());
    installedPackages.add(packageName.toLowerCase());
    return true;
  } catch (err) {
    // Fall back to micropip (pure python packages like pyfiglet, colorama, requests, etc.)
    try {
      const micropip = pyodide.pyimport('micropip');
      await micropip.install(packageName);
      installedPackages.add(packageName.toLowerCase());
      return true;
    } catch (micropipErr: any) {
      console.error(`Lỗi cài đặt ${packageName}:`, micropipErr);
      throw new Error(`Không thể cài đặt ${packageName}: ${micropipErr.message || micropipErr}`);
    }
  }
}

export function getInstalledPackagesList(): string[] {
  return Array.from(installedPackages);
}

export async function runPyodideCode(options: PyodideRunOptions): Promise<{
  stdout: string;
  stderr: string;
  exitCode: number;
  duration: number;
  engine: string;
  plotImages: string[];
  isWaitingInput?: boolean;
  prompt?: string;
}> {
  const { code, inputs = [], onStdout, onStderr } = options;
  const pyodide = await getPyodideInstance();

  let stdoutBuffer = '';
  let stderrBuffer = '';

  pyodide.setStdout({
    batched: (text: string) => {
      stdoutBuffer += text + '\n';
      onStdout?.(text + '\n');
    },
  });

  pyodide.setStderr({
    batched: (text: string) => {
      stderrBuffer += text + '\n';
      onStderr?.(text + '\n');
    },
  });

  const startTime = performance.now();
  let exitCode = 0;
  let plotImages: string[] = [];

  // Setup TTY streams, input queue & interactive prompt hooks in Python
  const inputQueueJson = JSON.stringify(inputs);
  const setupScript = `
import sys
import builtins
import json

# Setup input queue and TTY stream buffers
_pydroid_input_queue = ${inputQueueJson}
_pydroid_stdout_chunks = []
_pydroid_stderr_chunks = []
_pydroid_last_prompt = ""
_pydroid_is_waiting_input = False

class _PydroidWaitingInput(Exception):
    pass

class _PydroidTTYStream:
    def __init__(self, target_list):
        self._list = target_list
        self.encoding = 'utf-8'
    def write(self, s):
        if s:
            self._list.append(str(s))
        return len(s) if s else 0
    def flush(self):
        pass
    def isatty(self):
        return True
    def fileno(self):
        return 1
    def readable(self):
        return False
    def writable(self):
        return True

sys.stdout = _PydroidTTYStream(_pydroid_stdout_chunks)
sys.stderr = _PydroidTTYStream(_pydroid_stderr_chunks)

class _PydroidTTYStdin:
    def __init__(self, queue):
        self.queue = queue
        self.encoding = 'utf-8'
    def readline(self):
        if len(self.queue) > 0:
            val = str(self.queue.pop(0))
            sys.stdout.write(val + "\\n")
            return val + "\\n"
        global _pydroid_is_waiting_input
        _pydroid_is_waiting_input = True
        raise _PydroidWaitingInput(_pydroid_last_prompt)
    def isatty(self):
        return True
    def fileno(self):
        return 0
    def readable(self):
        return True
    def writable(self):
        return False

sys.stdin = _PydroidTTYStdin(_pydroid_input_queue)

def _custom_input(prompt=""):
    global _pydroid_last_prompt, _pydroid_is_waiting_input
    p_str = str(prompt) if prompt is not None else ""
    if p_str:
        _pydroid_last_prompt = p_str
        sys.stdout.write(p_str)
    else:
        _pydroid_last_prompt = "input():"
    
    if len(_pydroid_input_queue) > 0:
        val = str(_pydroid_input_queue.pop(0))
        sys.stdout.write(str(val) + "\\n")
        return val
    
    _pydroid_is_waiting_input = True
    raise _PydroidWaitingInput(_pydroid_last_prompt)

builtins.input = _custom_input

# Hook Matplotlib backend if available
try:
    import matplotlib
    matplotlib.use("module://matplotlib.backends.backend_agg")
except ImportError:
    pass
`;

  try {
    await pyodide.runPythonAsync(setupScript);

    // Auto-load commonly imported packages if referenced in code
    const lowerCode = code.toLowerCase();
    if ((lowerCode.includes('import numpy') || lowerCode.includes('from numpy')) && !installedPackages.has('numpy')) {
      await pyodide.loadPackage('numpy');
      installedPackages.add('numpy');
    }
    if ((lowerCode.includes('import matplotlib') || lowerCode.includes('from matplotlib')) && !installedPackages.has('matplotlib')) {
      await pyodide.loadPackage('matplotlib');
      installedPackages.add('matplotlib');
    }
    if ((lowerCode.includes('import pandas') || lowerCode.includes('from pandas')) && !installedPackages.has('pandas')) {
      await pyodide.loadPackage('pandas');
      installedPackages.add('pandas');
    }

    // Execute user code
    await pyodide.runPythonAsync(code);

    // Check for rendered matplotlib plots
    const plotCaptureScript = `
import json
_captured_plots = []
try:
    import matplotlib.pyplot as plt
    import io, base64
    for fig_num in plt.get_fignums():
        fig = plt.figure(fig_num)
        buf = io.BytesIO()
        fig.savefig(buf, format='png', bbox_inches='tight', dpi=120)
        buf.seek(0)
        _captured_plots.append(base64.b64encode(buf.read()).decode('utf-8'))
        plt.close(fig)
except Exception as e:
    pass
json.dumps(_captured_plots)
`;
    const plotsJson = await pyodide.runPythonAsync(plotCaptureScript);
    try {
      plotImages = JSON.parse(plotsJson);
    } catch (e) {
      plotImages = [];
    }
  } catch (err: any) {
    // Check with Python directly if process was interrupted for interactive input
    let isWaitingFromPython = false;
    let pyStdout = '';
    let pyPrompt = '';
    try {
      isWaitingFromPython = !!pyodide.runPython('_pydroid_is_waiting_input');
      pyStdout = pyodide.runPython('"".join(_pydroid_stdout_chunks)');
      pyPrompt = pyodide.runPython('_pydroid_last_prompt');
    } catch (e) {}

    const errStr = String(err?.message || err || '');
    const errType = String(err?.type || '');
    const isWaiting =
      isWaitingFromPython ||
      errType === '_PydroidWaitingInput' ||
      errType === 'EOFError' ||
      errStr.includes('_PydroidWaitingInput') ||
      errStr.includes('EOFError') ||
      errStr.includes('EOF when reading a line');

    if (isWaiting) {
      return {
        stdout: pyStdout || stdoutBuffer,
        stderr: '',
        exitCode: 0,
        duration: Math.round(performance.now() - startTime),
        engine: 'Pyodide 0.26.4 (WASM TTY Emulated)',
        plotImages,
        isWaitingInput: true,
        prompt: pyPrompt || 'input():',
      };
    }

    // Genuinely an error (SyntaxError, NameError, etc.)
    exitCode = 1;
    let cleanErr = errStr;
    if (cleanErr === 'PythonError') {
      try {
        cleanErr = pyodide.runPython('"".join(_pydroid_stderr_chunks)') || errStr;
      } catch (e) {}
    }
    stderrBuffer += (stderrBuffer ? '\n' : '') + cleanErr;
    onStderr?.(cleanErr);
  }

  let finalStdout = '';
  try {
    finalStdout = pyodide.runPython('"".join(_pydroid_stdout_chunks)');
  } catch (e) {
    finalStdout = stdoutBuffer;
  }

  const duration = Math.round(performance.now() - startTime);

  return {
    stdout: finalStdout || stdoutBuffer,
    stderr: stderrBuffer,
    exitCode,
    duration,
    engine: 'Pyodide 0.26.4 (WASM TTY Emulated)',
    plotImages,
    isWaitingInput: false,
  };
}
