import { AIDebugResult } from '../types';
import { getApiUrl } from '../utils/apiConfig';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp?: number;
}

export function getSavedGeminiApiKey(): string {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem('pydroid_gemini_api_key') || '';
}

export function saveGeminiApiKey(key: string): void {
  if (typeof window === 'undefined') return;
  if (key && key.trim()) {
    localStorage.setItem('pydroid_gemini_api_key', key.trim());
  } else {
    localStorage.removeItem('pydroid_gemini_api_key');
  }
}

export function getAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const key = getSavedGeminiApiKey();
  if (key) {
    headers['x-gemini-api-key'] = key;
  }
  return headers;
}

export async function validateGeminiApiKey(apiKey: string): Promise<{
  valid: boolean;
  message?: string;
  error?: string;
  model?: string;
}> {
  const endpoint = getApiUrl('/api/gemini/validate');
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ apiKey: apiKey.trim() }),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok || !data.valid) {
    return {
      valid: false,
      error: data.error || `Khóa API không hợp lệ hoặc thiếu quyền hạn (HTTP ${response.status}).`,
    };
  }

  return {
    valid: true,
    message: data.message || 'Khóa Gemini API hợp lệ và sẵn sàng sử dụng!',
    model: data.model,
  };
}

export async function requestAIDebug(
  code: string,
  errorOutput: string,
  context?: string
): Promise<AIDebugResult> {
  const response = await fetch(getApiUrl('/api/gemini/debug'), {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ code, errorOutput, context }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `Lỗi gọi Gemini AI (${response.status})`);
  }

  const data = await response.json();
  return {
    summary: data.summary || 'Đã phân tích mã nguồn.',
    errorType: data.errorType || 'Syntax / Logic Issue',
    lineNumber: data.lineNumber,
    explanation: data.explanation || 'Không có giải thích chi tiết.',
    fixedCode: data.fixedCode || code,
    suggestions: data.suggestions || [],
  };
}

export async function requestAIExplain(
  code: string,
  question?: string
): Promise<string> {
  const response = await fetch(getApiUrl('/api/gemini/explain'), {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ code, question }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `Lỗi gọi Gemini AI (${response.status})`);
  }

  const data = await response.json();
  return data.explanation || '';
}

export async function requestAIChat(
  messages: { role: 'user' | 'assistant'; content: string }[],
  currentCode?: string
): Promise<string> {
  const response = await fetch(getApiUrl('/api/gemini/chat'), {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ messages, currentCode }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `Lỗi kết nối Trợ lý AI (${response.status})`);
  }

  const data = await response.json();
  return data.reply || '';
}
