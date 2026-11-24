// CPython Native Runner Service (calls server.ts backend)
import { getApiUrl } from '../utils/apiConfig';

export interface CPythonRunOptions {
  code: string;
  inputs?: string[];
  onStdout?: (chunk: string) => void;
  onStderr?: (chunk: string) => void;
}

export async function runCPythonCode(options: CPythonRunOptions): Promise<{
  stdout: string;
  stderr: string;
  exitCode: number;
  duration: number;
  engine: string;
  isWaitingInput?: boolean;
  prompt?: string;
}> {
  const { code, inputs = [], onStdout, onStderr } = options;

  const response = await fetch(getApiUrl('/api/python/run'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream, application/json',
    },
    body: JSON.stringify({ code, inputs }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `Lỗi máy chủ (${response.status})`);
  }

  const contentType = response.headers.get('content-type') || '';

  // Stream reading if server returned SSE
  if (contentType.includes('text/event-stream') && response.body) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    let finalResult = {
      stdout: '',
      stderr: '',
      exitCode: 0,
      duration: 0,
      engine: 'CPython 3.10 (Native Linux)',
      isWaitingInput: false,
      prompt: '',
    };

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n\n');
      buffer = lines.pop() || '';

      for (const block of lines) {
        const trimmed = block.trim();
        if (!trimmed.startsWith('data:')) continue;
        const jsonStr = trimmed.replace(/^data:\s*/, '');
        try {
          const evt = JSON.parse(jsonStr);
          if (evt.type === 'stdout' && evt.chunk) {
            finalResult.stdout += evt.chunk;
            onStdout?.(evt.chunk);
          } else if (evt.type === 'stderr' && evt.chunk) {
            finalResult.stderr += evt.chunk;
            onStderr?.(evt.chunk);
          } else if (evt.type === 'done') {
            finalResult.stdout = evt.stdout !== undefined ? evt.stdout : finalResult.stdout;
            finalResult.stderr = evt.stderr !== undefined ? evt.stderr : finalResult.stderr;
            finalResult.exitCode = evt.exitCode ?? 0;
            finalResult.duration = evt.duration || 0;
            finalResult.engine = evt.engine || 'CPython 3.10 (Native Linux)';
            finalResult.isWaitingInput = !!evt.isWaitingInput;
            finalResult.prompt = evt.prompt || '';
          } else if (evt.type === 'error') {
            throw new Error(evt.error || 'Lỗi thực thi CPython');
          }
        } catch (e: any) {
          if (e.message && e.message.includes('Lỗi')) throw e;
        }
      }
    }

    return finalResult;
  }

  // Fallback normal JSON response
  const data = await response.json();
  if (onStdout && data.stdout) {
    onStdout(data.stdout);
  }
  if (onStderr && data.stderr) {
    onStderr(data.stderr);
  }

  return {
    stdout: data.stdout || '',
    stderr: data.stderr || '',
    exitCode: data.exitCode ?? (data.success ? 0 : 1),
    duration: data.duration || 0,
    engine: data.engine || 'CPython 3.10 (Native Linux)',
    isWaitingInput: !!data.isWaitingInput,
    prompt: data.prompt || '',
  };
}

