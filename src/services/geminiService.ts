import { AIDebugResult } from '../types';
import {
  getApiUrl,
  getApiBaseUrl,
  isMobileOrApk,
  fetchWithTimeout,
  wakeBackendServer,
  hasReachablePublicBackendOnApk,
} from '../utils/apiConfig';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp?: number;
}

export interface AnalysisRequestOptions {
  context?: string;
  question?: string;
  forceRefresh?: boolean;
  signal?: AbortSignal;
}

export interface BatchAnalysisTask {
  id: string;
  type: 'debug' | 'explain';
  code: string;
  errorOutput?: string;
  question?: string;
  context?: string;
}

export interface BatchAnalysisOutcome {
  id: string;
  type: 'debug' | 'explain';
  debugResult?: AIDebugResult;
  explanation?: string;
  cached?: boolean;
}

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const ANALYSIS_CACHE_MAX = 40;
const ANALYSIS_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const BATCH_WINDOW_MS = 45;
const MAX_BATCH_SIZE = 6;

const debugCache = new Map<string, CacheEntry<AIDebugResult>>();
const explainCache = new Map<string, CacheEntry<string>>();
const inFlightDebugPromises = new Map<string, Promise<AIDebugResult>>();
const inFlightExplainPromises = new Map<string, Promise<string>>();

interface ActiveDebugStreamEntry {
  promise: Promise<AIDebugResult>;
  listeners: Set<(partial: AIDebugResult) => void>;
  latestPartial: AIDebugResult | null;
}

const inFlightDebugStreams = new Map<string, ActiveDebugStreamEntry>();

interface PendingBatchItem {
  cacheKey: string;
  task: BatchAnalysisTask;
  resolve: (value: any) => void;
  reject: (err: Error) => void;
}

let pendingBatchQueue: PendingBatchItem[] = [];
let batchFlushTimer: ReturnType<typeof setTimeout> | null = null;

function hashString(input: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < input.length; i++) {
    const ch = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return `${(h2 >>> 0).toString(36)}_${(h1 >>> 0).toString(36)}`;
}

function buildAnalysisCacheKey(
  kind: 'debug' | 'explain',
  code: string,
  extra = '',
  context = ''
): string {
  const base = getApiBaseUrl();
  const key = getSavedGeminiApiKey();
  const keyTag = key ? key.slice(-6) : 'default';
  const payload = `${kind}|${base}|${keyTag}|${code}|${extra}|${context}`;
  return `${kind}:${hashString(payload)}:${code.length}`;
}

function getFromCache<T>(map: Map<string, CacheEntry<T>>, key: string): T | null {
  const entry = map.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    map.delete(key);
    return null;
  }
  // LRU promotion
  map.delete(key);
  map.set(key, entry);
  return entry.value;
}

function setInCache<T>(map: Map<string, CacheEntry<T>>, key: string, value: T): void {
  if (map.has(key)) {
    map.delete(key);
  } else if (map.size >= ANALYSIS_CACHE_MAX) {
    const oldestKey = map.keys().next().value;
    if (oldestKey !== undefined) {
      map.delete(oldestKey);
    }
  }
  map.set(key, {
    value,
    expiresAt: Date.now() + ANALYSIS_CACHE_TTL_MS,
  });
}

export function clearGeminiAnalysisCache(): void {
  debugCache.clear();
  explainCache.clear();
}

export function getGeminiCacheStats(): { debugEntries: number; explainEntries: number } {
  return {
    debugEntries: debugCache.size,
    explainEntries: explainCache.size,
  };
}

function normalizeDebugResult(data: any, fallbackCode: string, isPartial = false): AIDebugResult {
  const parsedLine =
    typeof data?.lineNumber === 'number' && data.lineNumber > 0 ? data.lineNumber : undefined;
  return {
    summary: data?.summary || (isPartial ? '' : 'Đã phân tích mã nguồn.'),
    errorType: data?.errorType || (isPartial ? '' : 'Syntax / Logic Issue'),
    lineNumber: parsedLine,
    explanation: data?.explanation || (isPartial ? '' : 'Không có giải thích chi tiết.'),
    fixedCode: data?.fixedCode || fallbackCode,
    suggestions: Array.isArray(data?.suggestions) ? data.suggestions : [],
  };
}

function buildFriendlyNetworkError(err: any): Error {
  const msg = err?.message || String(err || '');
  const isTimeout = err?.name === 'AbortError' || msg.includes('AbortError') || msg.includes('timed out');
  const isNet =
    isTimeout ||
    msg.includes('Failed to fetch') ||
    msg.includes('NetworkError') ||
    msg.includes('Load failed');

  if (isNet) {
    const base = getApiBaseUrl();
    if (isMobileOrApk()) {
      return new Error(
        isTimeout
          ? `Hết thời gian chờ phản hồi từ máy chủ AI (${base || 'chưa cấu hình'}). Vui lòng thử lại sau giây lát.`
          : `Không thể kết nối tới máy chủ Backend (${base || 'chưa cấu hình'}). Bản APK không có máy chủ nội bộ và URL xem trước AI Studio không mở cho ứng dụng rời; hãy triển khai server lên Cloud Run / Render rồi nhập URL đó vào Cài đặt Máy chủ.`
      );
    }
    return new Error(
      isTimeout
        ? 'Hết thời gian chờ phản hồi từ máy chủ AI. Vui lòng thử lại sau giây lát.'
        : 'Không thể kết nối tới máy chủ Backend. Vui lòng kiểm tra lại kết nối mạng.'
    );
  }
  return err instanceof Error ? err : new Error(msg);
}

async function consumeSseStream(
  body: ReadableStream<Uint8Array>,
  onPayload: (payload: any) => void
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';

  const dispatchFrame = (frame: string) => {
    const dataLines = frame
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.startsWith('data:'))
      .map((l) => l.replace(/^data:\s*/, ''));
    if (dataLines.length === 0) return;

    const jsonStr = dataLines.join('\n');
    let payload: any = null;
    try {
      payload = JSON.parse(jsonStr);
    } catch {
      return;
    }
    onPayload(payload);
  };

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const frames = buffer.split(/\r?\n\r?\n/);
    buffer = frames.pop() || '';
    for (const frame of frames) {
      dispatchFrame(frame);
    }
  }

  buffer += decoder.decode();
  if (buffer.trim()) {
    for (const frame of buffer.split(/\r?\n\r?\n/)) {
      if (frame.trim()) dispatchFrame(frame);
    }
  }
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
  clearGeminiAnalysisCache();
}

export function getAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const key = getSavedGeminiApiKey();
  if (key) {
    headers['x-gemini-api-key'] = key;
  }
  return headers;
}

/**
 * Validates a Gemini API Key via the server-side endpoint /api/gemini/validate
 */
export async function validateGeminiApiKey(apiKey: string): Promise<{
  valid: boolean;
  message?: string;
  error?: string;
  model?: string;
  isConnectionError?: boolean;
}> {
  const trimmedKey = apiKey.trim();
  if (!trimmedKey) {
    return { valid: false, error: 'Khóa API không được để trống.' };
  }

  const endpoint = getApiUrl('/api/gemini/validate');
  let response: Response;
  try {
    response = await fetchWithTimeout(
      endpoint,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: trimmedKey }),
      },
      22000
    );
  } catch (err: any) {
    return {
      valid: false,
      isConnectionError: true,
      error: buildFriendlyNetworkError(err).message,
    };
  }

  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    return {
      valid: false,
      isConnectionError: true,
      error: `Máy chủ (${getApiBaseUrl() || window.location.origin}) phản hồi HTTP ${response.status} không phải JSON API. Hãy kiểm tra lại URL Máy chủ Backend trong Menu.`,
    };
  }

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

let lastAiWarmAt = 0;
let inflightAiWarm: Promise<boolean> | null = null;

/**
 * Silently wakes/warms the backend AI server when the Assistant modal opens
 * so sleeping Cloud Run / Render containers are ready before the user hits Send.
 */
export function prewarmAIServer(): Promise<boolean> {
  if (typeof window === 'undefined') return Promise.resolve(false);
  if (isMobileOrApk() && !hasReachablePublicBackendOnApk()) {
    return Promise.resolve(false);
  }
  const now = Date.now();
  if (now - lastAiWarmAt < 40_000) {
    return Promise.resolve(true);
  }
  if (inflightAiWarm) {
    return inflightAiWarm;
  }
  inflightAiWarm = fetchWithTimeout(
    getApiUrl('/api/health'),
    { method: 'GET', cache: 'no-store' },
    10000
  )
    .then((res) => {
      if (res.ok) {
        lastAiWarmAt = Date.now();
        return true;
      }
      return false;
    })
    .catch(() => false)
    .finally(() => {
      inflightAiWarm = null;
    });
  return inflightAiWarm;
}

/**
 * AI Server Status Ping Check
 * Queries the server-side health & engine endpoint /api/engine/status
 */
export async function checkAIServerStatus(): Promise<{
  online: boolean;
  message: string;
  source: 'server' | 'direct_key' | 'none';
}> {
  try {
    const key = getSavedGeminiApiKey();
    const headers: Record<string, string> = {};
    if (key) {
      headers['x-gemini-api-key'] = key;
    }
    const timeoutMs = isMobileOrApk() && hasReachablePublicBackendOnApk() ? 45000 : 10000;
    const res = await fetchWithTimeout(
      getApiUrl('/api/engine/status'),
      {
        headers,
      },
      timeoutMs
    );
    const ct = res.headers.get('content-type') || '';
    if (res.ok && ct.includes('application/json')) {
      const data = await res.json();
      if (data.status === 'online') {
        return {
          online: true,
          message: data?.gemini?.available
            ? 'Máy chủ AI đang hoạt động bình thường'
            : 'Máy chủ đang online (chưa có khóa Gemini mặc định)',
          source: 'server',
        };
      }
    }
  } catch (e) {}

  return {
    online: false,
    message: 'Máy chủ AI tạm thời không phản hồi',
    source: 'none',
  };
}

async function executeSingleDebugRequest(
  code: string,
  errorOutput: string,
  context?: string
): Promise<AIDebugResult> {
  let response: Response;
  try {
    response = await fetch(getApiUrl('/api/gemini/debug'), {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ code, errorOutput, context }),
    });
  } catch (err: any) {
    throw buildFriendlyNetworkError(err);
  }

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `Lỗi gọi Gemini AI (${response.status})`);
  }

  const data = await response.json();
  return normalizeDebugResult(data, code);
}

async function executeSingleExplainRequest(code: string, question?: string): Promise<string> {
  let response: Response;
  try {
    response = await fetch(getApiUrl('/api/gemini/explain'), {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ code, question }),
    });
  } catch (err: any) {
    throw buildFriendlyNetworkError(err);
  }

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `Lỗi gọi Gemini AI (${response.status})`);
  }

  const data = await response.json();
  return data.explanation || '';
}

async function dispatchBatchToServer(items: BatchAnalysisTask[]): Promise<Map<string, any>> {
  let response: Response;
  try {
    response = await fetch(getApiUrl('/api/gemini/analyze-batch'), {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ items }),
    });
  } catch (err: any) {
    throw buildFriendlyNetworkError(err);
  }

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `Lỗi xử lý hàng loạt Gemini AI (${response.status})`);
  }

  const data = await response.json();
  const map = new Map<string, any>();
  if (Array.isArray(data?.results)) {
    for (const r of data.results) {
      if (r && r.id) {
        map.set(r.id, r);
      }
    }
  }
  return map;
}

async function flushPendingBatchQueue(): Promise<void> {
  batchFlushTimer = null;
  const batch = pendingBatchQueue.splice(0, MAX_BATCH_SIZE);
  if (batch.length === 0) return;

  // If more items remain beyond MAX_BATCH_SIZE, schedule next flush right away
  if (pendingBatchQueue.length > 0) {
    batchFlushTimer = setTimeout(flushPendingBatchQueue, 0);
  }

  // Fast path: 1 item uses the dedicated single endpoint directly
  if (batch.length === 1) {
    const entry = batch[0];
    try {
      if (entry.task.type === 'debug') {
        const res = await executeSingleDebugRequest(
          entry.task.code,
          entry.task.errorOutput || '',
          entry.task.context
        );
        setInCache(debugCache, entry.cacheKey, res);
        entry.resolve(res);
      } else {
        const res = await executeSingleExplainRequest(entry.task.code, entry.task.question);
        setInCache(explainCache, entry.cacheKey, res);
        entry.resolve(res);
      }
    } catch (err: any) {
      entry.reject(err instanceof Error ? err : new Error(String(err)));
    }
    return;
  }

  // Batched path: combine 2..MAX_BATCH_SIZE tasks into ONE server Gemini call
  try {
    const resultMap = await dispatchBatchToServer(batch.map((b) => b.task));

    for (const entry of batch) {
      const raw = resultMap.get(entry.task.id);
      if (!raw) {
        // Fallback to single endpoint if a batch item was omitted by the model
        try {
          if (entry.task.type === 'debug') {
            const single = await executeSingleDebugRequest(
              entry.task.code,
              entry.task.errorOutput || '',
              entry.task.context
            );
            setInCache(debugCache, entry.cacheKey, single);
            entry.resolve(single);
          } else {
            const single = await executeSingleExplainRequest(entry.task.code, entry.task.question);
            setInCache(explainCache, entry.cacheKey, single);
            entry.resolve(single);
          }
        } catch (fallbackErr: any) {
          entry.reject(fallbackErr instanceof Error ? fallbackErr : new Error(String(fallbackErr)));
        }
        continue;
      }

      if (entry.task.type === 'debug') {
        const normalized = normalizeDebugResult(raw, entry.task.code);
        setInCache(debugCache, entry.cacheKey, normalized);
        entry.resolve(normalized);
      } else {
        const text = raw.explanation || '';
        setInCache(explainCache, entry.cacheKey, text);
        entry.resolve(text);
      }
    }
  } catch (err: any) {
    const finalErr = err instanceof Error ? err : new Error(String(err));
    for (const entry of batch) {
      entry.reject(finalErr);
    }
  }
}

function enqueueAnalysisTask<T>(cacheKey: string, task: Omit<BatchAnalysisTask, 'id'>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const id = `${task.type}_${pendingBatchQueue.length}_${Date.now().toString(36)}`;
    pendingBatchQueue.push({
      cacheKey,
      task: { id, ...task },
      resolve,
      reject,
    });

    if (pendingBatchQueue.length >= MAX_BATCH_SIZE) {
      if (batchFlushTimer) {
        clearTimeout(batchFlushTimer);
        batchFlushTimer = null;
      }
      void flushPendingBatchQueue();
    } else if (!batchFlushTimer) {
      batchFlushTimer = setTimeout(() => {
        void flushPendingBatchQueue();
      }, BATCH_WINDOW_MS);
    }
  });
}

/**
 * Explicit Batch Code Analysis
 * Serves cache hits immediately and batches all remaining tasks into a single /api/gemini/analyze-batch call.
 */
export async function requestBatchCodeAnalysis(
  tasks: BatchAnalysisTask[],
  options?: { forceRefresh?: boolean }
): Promise<BatchAnalysisOutcome[]> {
  if (!tasks.length) return [];

  const outcomes = new Map<string, BatchAnalysisOutcome>();
  const misses: { cacheKey: string; task: BatchAnalysisTask }[] = [];

  for (const task of tasks) {
    const extra = task.type === 'debug' ? task.errorOutput || '' : task.question || '';
    const cacheKey = buildAnalysisCacheKey(task.type, task.code, extra, task.context || '');

    if (!options?.forceRefresh) {
      if (task.type === 'debug') {
        const hit = getFromCache(debugCache, cacheKey);
        if (hit) {
          outcomes.set(task.id, { id: task.id, type: 'debug', debugResult: hit, cached: true });
          continue;
        }
      } else {
        const hit = getFromCache(explainCache, cacheKey);
        if (hit !== null) {
          outcomes.set(task.id, { id: task.id, type: 'explain', explanation: hit, cached: true });
          continue;
        }
      }
    }

    misses.push({ cacheKey, task });
  }

  for (let i = 0; i < misses.length; i += MAX_BATCH_SIZE) {
    const slice = misses.slice(i, i + MAX_BATCH_SIZE);
    const resultMap = await dispatchBatchToServer(slice.map((m) => m.task));

    for (const item of slice) {
      const raw = resultMap.get(item.task.id);
      if (item.task.type === 'debug') {
        const normalized = raw
          ? normalizeDebugResult(raw, item.task.code)
          : await executeSingleDebugRequest(
              item.task.code,
              item.task.errorOutput || '',
              item.task.context
            );
        setInCache(debugCache, item.cacheKey, normalized);
        outcomes.set(item.task.id, {
          id: item.task.id,
          type: 'debug',
          debugResult: normalized,
          cached: false,
        });
      } else {
        const text =
          raw?.explanation ??
          (await executeSingleExplainRequest(item.task.code, item.task.question));
        setInCache(explainCache, item.cacheKey, text);
        outcomes.set(item.task.id, {
          id: item.task.id,
          type: 'explain',
          explanation: text,
          cached: false,
        });
      }
    }
  }

  return tasks.map((t) => outcomes.get(t.id)!);
}

/**
 * AI Debugger (Cached + Micro-Batched + In-Flight Deduplicated)
 * Proxied securely through /api/gemini/debug or /api/gemini/analyze-batch
 */
export async function requestAIDebug(
  code: string,
  errorOutput: string,
  context?: string,
  options?: { forceRefresh?: boolean }
): Promise<AIDebugResult> {
  const cacheKey = buildAnalysisCacheKey('debug', code, errorOutput || '', context || '');

  if (!options?.forceRefresh) {
    const cached = getFromCache(debugCache, cacheKey);
    if (cached) return cached;

    const existing = inFlightDebugPromises.get(cacheKey);
    if (existing) return existing;
  }

  const promise = enqueueAnalysisTask<AIDebugResult>(cacheKey, {
    type: 'debug',
    code,
    errorOutput,
    context,
  }).finally(() => {
    inFlightDebugPromises.delete(cacheKey);
  });

  inFlightDebugPromises.set(cacheKey, promise);
  return promise;
}

/**
 * AI Debugger Streaming Handler (SSE + Cache + In-Flight Stream Deduplication)
 * Streams progressive error summary, explanation, and fixedCode from /api/gemini/debug
 * to drastically lower perceived latency in the AI Studio Debugger.
 */
export async function requestAIDebugStream(
  code: string,
  errorOutput: string,
  onPartial: (partial: AIDebugResult) => void,
  options?: AnalysisRequestOptions
): Promise<AIDebugResult> {
  const context = options?.context || '';
  const cacheKey = buildAnalysisCacheKey('debug', code, errorOutput || '', context);

  if (!options?.forceRefresh) {
    const cached = getFromCache(debugCache, cacheKey);
    if (cached) {
      onPartial(cached);
      return cached;
    }

    const active = inFlightDebugStreams.get(cacheKey);
    if (active) {
      active.listeners.add(onPartial);
      if (active.latestPartial) {
        onPartial(active.latestPartial);
      }
      try {
        return await active.promise;
      } finally {
        active.listeners.delete(onPartial);
      }
    }
  }

  const listeners = new Set<(partial: AIDebugResult) => void>([onPartial]);
  const entry: ActiveDebugStreamEntry = {
    listeners,
    latestPartial: null,
    promise: null as unknown as Promise<AIDebugResult>,
  };

  const emitPartial = (partial: AIDebugResult) => {
    entry.latestPartial = partial;
    for (const cb of entry.listeners) {
      cb(partial);
    }
  };

  const runStream = async (): Promise<AIDebugResult> => {
    const headers = getAuthHeaders();
    headers['Accept'] = 'text/event-stream';

    let response: Response;
    try {
      response = await fetchWithTimeout(
        getApiUrl('/api/gemini/debug'),
        {
          method: 'POST',
          headers,
          body: JSON.stringify({ code, errorOutput, context: options?.context, stream: true }),
          signal: options?.signal,
        },
        45000
      );
    } catch (err: any) {
      throw buildFriendlyNetworkError(err);
    }

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `Lỗi gọi Gemini AI (${response.status})`);
    }

    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('text/html')) {
      throw new Error(
        'Không thể kết nối đến máy chủ AI Cloud (HTML response). Hãy kiểm tra cấu hình URL máy chủ.'
      );
    }

    // Fallback for JSON-only servers
    if (contentType.includes('application/json') || !response.body) {
      const data = await response.json();
      const normalized = normalizeDebugResult(data, code);
      setInCache(debugCache, cacheKey, normalized);
      emitPartial(normalized);
      return normalized;
    }

    let finalResult: AIDebugResult | null = null;

    await consumeSseStream(response.body, (payload) => {
      if (payload?.error) {
        throw new Error(payload.error);
      }

      if (payload?.partial) {
        const partialResult = normalizeDebugResult(payload.partial, '', true);
        emitPartial(partialResult);
      }

      if (payload?.done && payload?.result) {
        finalResult = normalizeDebugResult(payload.result, code);
        emitPartial(finalResult);
      }
    });

    if (!finalResult) {
      finalResult = entry.latestPartial
        ? normalizeDebugResult(entry.latestPartial, code)
        : normalizeDebugResult({}, code);
    }

    setInCache(debugCache, cacheKey, finalResult);
    return finalResult;
  };

  entry.promise = runStream().finally(() => {
    inFlightDebugStreams.delete(cacheKey);
  });

  inFlightDebugStreams.set(cacheKey, entry);
  return entry.promise;
}

/**
 * AI Code Explainer (Cached + Micro-Batched + In-Flight Deduplicated)
 * Proxied securely through /api/gemini/explain or /api/gemini/analyze-batch
 */
export async function requestAIExplain(
  code: string,
  question?: string,
  options?: { forceRefresh?: boolean }
): Promise<string> {
  const cacheKey = buildAnalysisCacheKey('explain', code, question || '', '');

  if (!options?.forceRefresh) {
    const cached = getFromCache(explainCache, cacheKey);
    if (cached !== null) return cached;

    const existing = inFlightExplainPromises.get(cacheKey);
    if (existing) return existing;
  }

  const promise = enqueueAnalysisTask<string>(cacheKey, {
    type: 'explain',
    code,
    question,
  }).finally(() => {
    inFlightExplainPromises.delete(cacheKey);
  });

  inFlightExplainPromises.set(cacheKey, promise);
  return promise;
}

/**
 * AI Code Explainer Streaming Handler (SSE + Cache)
 */
export async function requestAIExplainStream(
  code: string,
  onChunk: (accumulated: string) => void,
  options?: AnalysisRequestOptions
): Promise<string> {
  const question = options?.question || '';
  const cacheKey = buildAnalysisCacheKey('explain', code, question, '');

  if (!options?.forceRefresh) {
    const cached = getFromCache(explainCache, cacheKey);
    if (cached !== null) {
      onChunk(cached);
      return cached;
    }
  }

  const headers = getAuthHeaders();
  headers['Accept'] = 'text/event-stream';

  let response: Response;
  try {
    response = await fetchWithTimeout(
      getApiUrl('/api/gemini/explain'),
      {
        method: 'POST',
        headers,
        body: JSON.stringify({ code, question: options?.question, stream: true }),
        signal: options?.signal,
      },
      45000
    );
  } catch (err: any) {
    throw buildFriendlyNetworkError(err);
  }

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `Lỗi gọi Gemini AI (${response.status})`);
  }

  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('text/html')) {
    throw new Error(
      'Không thể kết nối đến máy chủ AI Cloud (HTML response). Hãy kiểm tra cấu hình URL máy chủ.'
    );
  }

  if (contentType.includes('application/json') || !response.body) {
    const data = await response.json();
    const explanation = data.explanation || '';
    setInCache(explainCache, cacheKey, explanation);
    onChunk(explanation);
    return explanation;
  }

  let accumulated = '';

  await consumeSseStream(response.body, (payload) => {
    if (payload?.chunk) {
      accumulated += payload.chunk;
      onChunk(accumulated);
    } else if (payload?.error) {
      throw new Error(payload.error);
    }
  });

  setInCache(explainCache, cacheKey, accumulated);
  return accumulated;
}

/**
 * AI Chat Assistant (Full text response)
 * Proxied securely through server route /api/gemini/chat
 */
export async function requestAIChat(
  messages: { role: 'user' | 'assistant'; content: string }[],
  currentCode?: string
): Promise<string> {
  let response: Response;
  try {
    response = await fetch(getApiUrl('/api/gemini/chat'), {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ messages, currentCode }),
    });
  } catch (err: any) {
    throw buildFriendlyNetworkError(err);
  }

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `Lỗi kết nối Trợ lý AI (${response.status})`);
  }

  const data = await response.json();
  return data.reply || 'Xin chào! Tôi có thể giúp gì cho bạn về lập trình Python?';
}

/**
 * AI Chat Streaming Assistant
 * Proxied via Server-Sent Events (SSE) from server route /api/gemini/chat
 * Includes connect timeout, JSON fallback, and automatic retry on transient cold-start/5xx failures.
 */
export async function requestAIChatStream(
  messages: { role: 'user' | 'assistant'; content: string }[],
  onChunk: (chunk: string) => void,
  currentCode?: string,
  options?: {
    signal?: AbortSignal;
    onStatus?: (message: string) => void;
  }
): Promise<string> {
  let lastError: any = null;
  for (let attempt = 1; attempt <= 2; attempt++) {
    let emittedAny = false;
    try {
      const headers = getAuthHeaders();
      headers['Accept'] = 'text/event-stream';

      let response: Response;
      try {
        response = await fetchWithTimeout(
          getApiUrl('/api/gemini/chat'),
          {
            method: 'POST',
            headers,
            body: JSON.stringify({ messages, currentCode, stream: true }),
            signal: options?.signal,
          },
          45000
        );
      } catch (err: any) {
        if (options?.signal?.aborted) throw err;
        throw buildFriendlyNetworkError(err);
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const err: any = new Error(
          errorData.error || `Lỗi kết nối Trợ lý AI (${response.status})`
        );
        err.status = response.status;
        throw err;
      }

      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('text/html')) {
        throw new Error(
          'Không thể kết nối đến máy chủ AI Cloud (HTML response). Hãy kiểm tra cấu hình URL máy chủ.'
        );
      }

      let finalReply = '';
      if (contentType.includes('application/json') || !response.body) {
        const data = await response.json().catch(() => ({}));
        finalReply = data.reply || '';
        if (finalReply) {
          emittedAny = true;
          onChunk(finalReply);
        }
      } else {
        await consumeSseStream(response.body, (payload) => {
          if (payload?.chunk) {
            emittedAny = true;
            finalReply += payload.chunk;
            onChunk(payload.chunk);
          } else if (payload?.error) {
            throw new Error(payload.error);
          }
        });
      }

      // If SSE stream closed without chunks or errors (e.g. proxy/WebView buffered SSE), try non-streaming JSON fallback once
      if (!finalReply.trim() && !options?.signal?.aborted) {
        const jsonFallbackRes = await fetchWithTimeout(
          getApiUrl('/api/gemini/chat'),
          {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ messages, currentCode, stream: false }),
            signal: options?.signal,
          },
          30000
        );
        if (!jsonFallbackRes.ok) {
          const errJson = await jsonFallbackRes.json().catch(() => ({}));
          throw new Error(errJson.error || `Lỗi kết nối Trợ lý AI (${jsonFallbackRes.status})`);
        }
        const jsonCt = jsonFallbackRes.headers.get('content-type') || '';
        if (jsonCt.includes('text/html')) {
          throw new Error(
            'Không thể kết nối đến máy chủ AI Cloud (HTML response). Hãy kiểm tra cấu hình URL máy chủ.'
          );
        }
        const fallbackData = await jsonFallbackRes.json().catch(() => ({}));
        if (typeof fallbackData?.reply === 'string' && fallbackData.reply.trim()) {
          finalReply = fallbackData.reply;
          emittedAny = true;
          onChunk(finalReply);
        }
      }

      if (finalReply.trim()) {
        lastAiWarmAt = Date.now();
        return finalReply;
      }
      throw new Error('Máy chủ AI không trả về nội dung.');
    } catch (err: any) {
      lastError = err;
      if (options?.signal?.aborted) {
        throw err;
      }

      const msg = err?.message || String(err || '');
      const isAuthOrQuota =
        msg.includes('API Key') ||
        msg.includes('Khóa') ||
        msg.includes('PERMISSION_DENIED') ||
        msg.includes('429') ||
        msg.includes('RESOURCE_EXHAUSTED') ||
        msg.includes('HTML response');

      if (attempt >= 2 || isAuthOrQuota || emittedAny) {
        throw err;
      }

      // Transient cold-start / network / 502-504 error: wake server briefly and retry once automatically
      options?.onStatus?.('Đang đánh thức máy chủ AI & thử kết nối lại...');
      const baseUrl = getApiBaseUrl();
      if (baseUrl) {
        await wakeBackendServer(baseUrl, {
          timeoutMs: 22000,
          onProgress: options?.onStatus,
        }).catch(() => {});
      } else {
        await new Promise((r) => setTimeout(r, 650));
      }
    }
  }

  throw lastError || new Error('Không thể kết nối đến Trợ lý AI lúc này.');
}
