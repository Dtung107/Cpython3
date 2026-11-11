// Pyodide WASM Client-Side Python Runner & Pip Manager

declare global {
  interface Window {
    loadPyodide?: (config: { indexURL: string }) => Promise<any>;
    pyodideInstance?: any;
    __pydroid_input_callback?: (promptText: string) => string | null;
    __pydroid_tty_stdout?: (chunk: string) => void;
    __pydroid_tty_stderr?: (chunk: string) => void;
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

  // Normalize multi-line buffered inputs into sequential line queue
  const normalizedInputs: string[] = [];
  for (const item of inputs) {
    if (typeof item === 'string') {
      const lines = item.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
      normalizedInputs.push(...lines);
    } else if (item !== undefined && item !== null) {
      normalizedInputs.push(String(item));
    }
  }

  let stdoutBuffer = '';
  let stderrBuffer = '';

  // Real-time bidirectional streaming bridge for TTY echo and live output
  window.__pydroid_tty_stdout = (chunk: string) => {
    stdoutBuffer += chunk;
    onStdout?.(chunk);
  };

  window.__pydroid_tty_stderr = (chunk: string) => {
    stderrBuffer += chunk;
    onStderr?.(chunk);
  };

  // Configure Emscripten-level standard I/O streams
  let emscriptenInputIdx = 0;
  pyodide.setStdin({
    isatty: true,
    stdin: () => {
      if (emscriptenInputIdx < normalizedInputs.length) {
        return normalizedInputs[emscriptenInputIdx++];
      }
      return null;
    },
  });

  const startTime = performance.now();
  let exitCode = 0;
  let plotImages: string[] = [];

  // Setup interactive Python TTY streams, line buffering, and character echo
  const inputQueueJson = JSON.stringify(normalizedInputs);
  const setupScript = `
import sys
import io
import os
import builtins
import json
from js import window

class _PydroidWaitingInput(Exception):
    """Raised to yield execution back to JS runtime when input queue is empty"""
    def __init__(self, prompt=""):
        self.prompt = prompt
        super().__init__(prompt)

_pydroid_input_queue = ${inputQueueJson}
_pydroid_stdout_buffer = []
_pydroid_stderr_buffer = []
_pydroid_last_prompt = ""
_pydroid_is_waiting_input = False
_pydroid_echo_enabled = True

class _PydroidTTYStream:
    encoding = 'utf-8'
    errors = 'replace'
    
    def __init__(self, stream_type='stdout'):
        self.stream_type = stream_type
        self._buffer = _pydroid_stdout_buffer if stream_type == 'stdout' else _pydroid_stderr_buffer
    
    def write(self, s):
        if s is None:
            return 0
        text = str(s)
        if not text:
            return 0
        self._buffer.append(text)
        try:
            if self.stream_type == 'stdout' and hasattr(window, '__pydroid_tty_stdout'):
                window.__pydroid_tty_stdout(text)
            elif self.stream_type == 'stderr' and hasattr(window, '__pydroid_tty_stderr'):
                window.__pydroid_tty_stderr(text)
        except Exception:
            pass
        return len(text)
    
    def flush(self):
        pass
    
    def isatty(self):
        return True
    
    def readable(self):
        return False
    
    def writable(self):
        return True

    def seekable(self):
        return False
    
    def fileno(self):
        return 1 if self.stream_type == 'stdout' else 2

class _PydroidTTYStdin:
    encoding = 'utf-8'
    errors = 'replace'

    def __init__(self, queue):
        self.queue = queue
    
    def isatty(self):
        return True
    
    def readable(self):
        return True
    
    def writable(self):
        return False

    def seekable(self):
        return False
    
    def fileno(self):
        return 0
    
    def readline(self, size=-1):
        global _pydroid_is_waiting_input, _pydroid_last_prompt
        if len(self.queue) > 0:
            val = str(self.queue.pop(0))
            # Echo input line to standard output in interactive TTY mode
            if _pydroid_echo_enabled:
                sys.stdout.write(val + "\\n")
            return val + "\\n"
        
        _pydroid_is_waiting_input = True
        raise _PydroidWaitingInput(_pydroid_last_prompt or "")
    
    def read(self, size=-1):
        if size is None or size < 0:
            chunks = []
            while len(self.queue) > 0:
                chunks.append(self.readline())
            return "".join(chunks)
        res = self.readline()
        return res[:size] if len(res) > size else res

    def readlines(self, hint=-1):
        lines = []
        while len(self.queue) > 0:
            lines.append(self.readline())
        return lines
    
    def __iter__(self):
        return self
    
    def __next__(self):
        if len(self.queue) > 0:
            return self.readline()
        raise StopIteration

sys.stdout = _PydroidTTYStream('stdout')
sys.stderr = _PydroidTTYStream('stderr')
sys.stdin = _PydroidTTYStdin(_pydroid_input_queue)

def _custom_input(prompt=""):
    global _pydroid_last_prompt, _pydroid_is_waiting_input
    p_str = str(prompt) if prompt is not None else ""
    _pydroid_last_prompt = p_str
    if p_str:
        sys.stdout.write(p_str)
    
    if len(_pydroid_input_queue) > 0:
        val = str(_pydroid_input_queue.pop(0))
        # Character echo: print user-supplied line directly after the prompt
        if _pydroid_echo_enabled:
            sys.stdout.write(val + "\\n")
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
    // Check with Python runtime directly if process yielded for interactive input
    let isWaitingFromPython = false;
    let pyStdout = '';
    let pyPrompt = '';
    try {
      isWaitingFromPython = !!pyodide.runPython('_pydroid_is_waiting_input');
      pyStdout = pyodide.runPython('"".join(_pydroid_stdout_buffer)');
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

    // Actual runtime or syntax error
    exitCode = 1;
    let cleanErr = errStr;
    if (cleanErr === 'PythonError') {
      try {
        cleanErr = pyodide.runPython('"".join(_pydroid_stderr_buffer)') || errStr;
      } catch (e) {}
    }

    // Clean up internal Pyodide runtime frames to present a clean, native Python traceback
    const errLines = cleanErr.split('\n');
    const filteredLines: string[] = [];
    let skippingInternal = false;
    for (const line of errLines) {
      if (line.includes('_pyodide') || line.includes('eval_code_async') || line.includes('CodeRunner')) {
        skippingInternal = true;
        continue;
      }
      if (skippingInternal && (line.trim().startsWith('await ') || line.trim().startsWith('self.') || line.trim().startsWith('mod = ') || line.trim().startsWith('^^^^'))) {
        continue;
      }
      skippingInternal = false;
      filteredLines.push(line.replace('File "<exec>"', 'File "main.py"'));
    }
    cleanErr = filteredLines.join('\n').trim() || errStr;

    stderrBuffer += (stderrBuffer ? '\n' : '') + cleanErr;
    onStderr?.(cleanErr);
  } finally {
    // Clean up temporary streaming listeners
    delete window.__pydroid_tty_stdout;
    delete window.__pydroid_tty_stderr;
  }

  let finalStdout = '';
  try {
    finalStdout = pyodide.runPython('"".join(_pydroid_stdout_buffer)');
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
