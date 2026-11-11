// CPython Native Runner Service (calls server.ts backend)
import { getApiUrl } from '../utils/apiConfig';

export interface CPythonRunOptions {
  code: string;
  inputs?: string[];
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
  const response = await fetch(getApiUrl('/api/python/run'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(options),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `Lỗi máy chủ (${response.status})`);
  }

  const data = await response.json();
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
