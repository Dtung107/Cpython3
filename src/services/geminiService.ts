import { AIDebugResult } from '../types';
import { getApiUrl } from '../utils/apiConfig';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp?: number;
}

export async function requestAIDebug(
  code: string,
  errorOutput: string,
  context?: string
): Promise<AIDebugResult> {
  const response = await fetch(getApiUrl('/api/gemini/debug'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
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
    headers: { 'Content-Type': 'application/json' },
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
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages, currentCode }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `Lỗi kết nối Trợ lý AI (${response.status})`);
  }

  const data = await response.json();
  return data.reply || '';
}
