/**
 * API Configuration & Custom Server Manager for Pydroid 3 Web & Android APK
 * Provides automatic routing between local relative path (Web/AI Studio)
 * and Cloud Backend Server (Android APK / Capacitor) with multi-server history.
 */

export const DEFAULT_CLOUD_SERVER_URL =
  'https://ais-pre-2ii6f72d6ena7e5jxlrv4d-237488245798.asia-east1.run.app';

const CUSTOM_SERVER_KEY = 'pydroid_custom_server_url';
const SERVER_HISTORY_KEY = 'pydroid_server_history';

export interface SavedServerEntry {
  url: string;
  label: string;
  lastUsedAt: string;
}

export function isMobileOrApk(): boolean {
  if (typeof window === 'undefined') return false;
  const isCap = !!(window as any).Capacitor?.isNativePlatform?.() || !!(window as any).Capacitor;
  const isCapProtocol = window.location.protocol === 'capacitor:' || window.location.protocol === 'file:';
  const isLocalHost =
    window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

  if (!isCap && !isCapProtocol && !isLocalHost && window.location.protocol.startsWith('http')) {
    return false;
  }

  const isAndroidLocal = isLocalHost && (isCap || !window.location.port || window.location.port === '80');
  const isWebView = /Android.*Version\/[0-9.]+\s+Chrome\/[0-9.]+|wv/.test(navigator.userAgent);

  return isCap || isCapProtocol || isAndroidLocal || (isLocalHost && isWebView);
}

export function isAiStudioPreviewUrl(url: string): boolean {
  return /^https?:\/\/ais-(pre|dev)-/i.test((url || '').trim());
}

export function hasCustomServer(): boolean {
  if (typeof window === 'undefined') return false;
  const custom = localStorage.getItem(CUSTOM_SERVER_KEY);
  return !!(custom && custom.trim().startsWith('http'));
}

export function getCustomServerUrl(): string {
  if (typeof window === 'undefined') return '';
  const custom = localStorage.getItem(CUSTOM_SERVER_KEY);
  return custom ? custom.trim().replace(/\/+$/, '') : '';
}

function inferServerLabel(cleanUrl: string): string {
  try {
    const parsed = new URL(cleanUrl);
    if (parsed.hostname.endsWith('.onrender.com')) return `Render (${parsed.hostname})`;
    if (parsed.hostname.endsWith('.run.app')) return `Cloud Run (${parsed.hostname})`;
    if (parsed.hostname.endsWith('.railway.app')) return `Railway (${parsed.hostname})`;
    if (/^(192\.168\.|10\.|172\.|localhost|127\.)/.test(parsed.hostname)) {
      return `Mạng LAN (${parsed.host})`;
    }
    return parsed.host;
  } catch {
    return cleanUrl;
  }
}

export function getSavedServerHistory(): SavedServerEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(SERVER_HISTORY_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    const list: SavedServerEntry[] = Array.isArray(parsed)
      ? parsed.filter((item) => item && typeof item.url === 'string' && item.url.startsWith('http'))
      : [];

    const active = getCustomServerUrl();
    if (active && !list.some((item) => item.url === active)) {
      list.unshift({
        url: active,
        label: inferServerLabel(active),
        lastUsedAt: new Date().toISOString(),
      });
    }
    return list;
  } catch {
    return [];
  }
}

export function addServerToHistory(cleanUrl: string, customLabel?: string): SavedServerEntry[] {
  if (typeof window === 'undefined') return [];
  const normalized = cleanUrl.trim().replace(/\/+$/, '');
  const existing = getSavedServerHistory().filter((item) => item.url !== normalized);
  const next: SavedServerEntry[] = [
    {
      url: normalized,
      label: (customLabel && customLabel.trim()) || inferServerLabel(normalized),
      lastUsedAt: new Date().toISOString(),
    },
    ...existing,
  ].slice(0, 8);
  localStorage.setItem(SERVER_HISTORY_KEY, JSON.stringify(next));
  return next;
}

export function removeServerFromHistory(urlToRemove: string): SavedServerEntry[] {
  if (typeof window === 'undefined') return [];
  const normalized = urlToRemove.trim().replace(/\/+$/, '');
  const next = getSavedServerHistory().filter((item) => item.url !== normalized);
  localStorage.setItem(SERVER_HISTORY_KEY, JSON.stringify(next));
  if (getCustomServerUrl() === normalized) {
    localStorage.removeItem(CUSTOM_SERVER_KEY);
  }
  return next;
}

export function saveCustomServerUrl(
  rawUrl: string,
  customLabel?: string
): { ok: true; url: string } | { ok: false; error: string } {
  const clean = rawUrl.trim().replace(/\/+$/, '');
  if (!clean) {
    return {
      ok: false,
      error:
        'Bạn chưa nhập URL máy chủ. Hãy dán URL từ Render / Cloud Run / Railway hoặc mạng Wi-Fi LAN (bắt đầu bằng https:// hoặc http://).',
    };
  }
  try {
    const parsed = new URL(clean);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error('Invalid protocol');
    }
  } catch {
    return {
      ok: false,
      error: 'URL máy chủ không hợp lệ. Vui lòng nhập URL đầy đủ bắt đầu bằng https:// hoặc http://.',
    };
  }
  if (typeof window !== 'undefined') {
    localStorage.setItem(CUSTOM_SERVER_KEY, clean);
    addServerToHistory(clean, customLabel);
  }
  return { ok: true, url: clean };
}

export function clearCustomServerUrl(): void {
  if (typeof window !== 'undefined') {
    localStorage.removeItem(CUSTOM_SERVER_KEY);
  }
}

export async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeoutMs = 15000
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const externalSignal = init.signal;
  const onExternalAbort = () => controller.abort();
  if (externalSignal) {
    if (externalSignal.aborted) {
      clearTimeout(timer);
      controller.abort();
    } else {
      externalSignal.addEventListener('abort', onExternalAbort, { once: true });
    }
  }

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
    if (externalSignal) {
      externalSignal.removeEventListener('abort', onExternalAbort);
    }
  }
}

export async function wakeBackendServer(
  baseUrl: string,
  options: {
    timeoutMs?: number;
    onProgress?: (msg: string) => void;
  } = {}
): Promise<{ ok: boolean; status?: number; errorDetail?: string }> {
  const clean = baseUrl.trim().replace(/\/+$/, '');
  const totalBudgetMs = options.timeoutMs ?? 60000;
  const startedAt = Date.now();
  let attempt = 0;
  let lastStatus: number | undefined;
  let lastErrorDetail = '';

  while (Date.now() - startedAt < totalBudgetMs) {
    attempt++;
    const elapsed = Date.now() - startedAt;
    const remaining = Math.max(4000, totalBudgetMs - elapsed);
    const perAttemptTimeout = Math.min(remaining, 30000);

    if (attempt > 1 || elapsed > 3000) {
      options.onProgress?.(
        `Đang đánh thức máy chủ ${clean} (lần ${attempt}, vui lòng chờ 20–50 giây nếu Render đang ngủ)...`
      );
    }

    try {
      // Plain GET with zero custom headers -> no CORS OPTIONS preflight while server wakes up
      const res = await fetchWithTimeout(
        `${clean}/api/health`,
        {
          method: 'GET',
          cache: 'no-store',
        },
        perAttemptTimeout
      );
      lastStatus = res.status;

      const ct = res.headers.get('content-type') || '';
      if (res.ok && ct.includes('application/json')) {
        return { ok: true, status: res.status };
      }

      // Render/Cloudflare returns 502/503/504 while container boots -> retry after brief wait
      if ([502, 503, 504, 520, 521, 522, 524].includes(res.status)) {
        lastErrorDetail = `HTTP ${res.status}`;
        if (Date.now() - startedAt + 3000 < totalBudgetMs) {
          options.onProgress?.(
            `Máy chủ đang khởi động (${res.status}), tự động thử lại sau 3 giây...`
          );
          await new Promise((r) => setTimeout(r, 3000));
          continue;
        }
      } else {
        lastErrorDetail = `HTTP ${res.status} (${ct || 'non-JSON'})`;
        break;
      }
    } catch (err: any) {
      const msg = err?.name === 'AbortError' ? 'Hết thời gian chờ phản hồi' : err?.message || String(err);
      lastErrorDetail = msg;

      // Retry quick transient failures if plenty of budget remains
      if (Date.now() - startedAt + 3000 < totalBudgetMs) {
        options.onProgress?.(
          `Đang chờ máy chủ phản hồi (${msg}), thử lại tự động...`
        );
        await new Promise((r) => setTimeout(r, 2500));
        continue;
      }
      break;
    }
  }

  return {
    ok: false,
    status: lastStatus,
    errorDetail: lastErrorDetail || 'Không nhận được phản hồi từ máy chủ',
  };
}

export async function testBackendServerUrl(
  baseUrl: string,
  timeoutMs = 60000,
  onProgress?: (msg: string) => void
): Promise<{
  ok: boolean;
  status?: number;
  geminiAvailable?: boolean;
  cpythonAvailable?: boolean;
  message: string;
}> {
  const clean = baseUrl.trim().replace(/\/+$/, '');
  onProgress?.(`Đang kết nối tới ${clean}...`);

  const wake = await wakeBackendServer(clean, { timeoutMs, onProgress });
  if (!wake.ok) {
    return {
      ok: false,
      status: wake.status,
      message: `Không thể kết nối tới ${clean} (${wake.errorDetail}). Nếu dùng Render miễn phí, hãy thử lại sau ít giây hoặc dùng nút "Mở Chrome đăng nhập trực tiếp".`,
    };
  }

  try {
    const savedKey =
      typeof window !== 'undefined' ? localStorage.getItem('pydroid_gemini_api_key') || '' : '';
    const headers: Record<string, string> = {};
    if (savedKey) headers['x-gemini-api-key'] = savedKey;

    const res = await fetchWithTimeout(
      `${clean}/api/engine/status`,
      {
        method: 'GET',
        headers,
        cache: 'no-store',
      },
      12000
    );
    const ct = res.headers.get('content-type') || '';
    if (res.ok && ct.includes('application/json')) {
      const data = await res.json().catch(() => ({}));
      return {
        ok: true,
        status: res.status,
        geminiAvailable: !!data?.gemini?.available,
        cpythonAvailable: !!data?.cpython?.available,
        message: `Kết nối máy chủ ${clean} thành công!`,
      };
    }
  } catch {
    // /api/health already succeeded above, so server IS online
  }

  return {
    ok: true,
    status: wake.status || 200,
    message: `Kết nối máy chủ ${clean} thành công!`,
  };
}

export function getApiBaseUrl(): string {
  const custom = getCustomServerUrl();
  if (custom) {
    return custom;
  }

  if (isMobileOrApk()) {
    const envUrl = (import.meta as any).env?.VITE_API_BASE_URL || '';
    const savedCloudUrl = typeof window !== 'undefined' ? localStorage.getItem('pydroid_cloud_server_url') || '' : '';
    const fallback = (envUrl || savedCloudUrl || DEFAULT_CLOUD_SERVER_URL).trim().replace(/\/+$/, '');
    return fallback;
  }

  return '';
}

export function hasReachablePublicBackendOnApk(): boolean {
  if (!isMobileOrApk()) return true;
  const base = getApiBaseUrl();
  return !!base && !isAiStudioPreviewUrl(base);
}

export function getApiUrl(endpoint: string): string {
  const base = getApiBaseUrl();
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  return base ? `${base}${cleanEndpoint}` : cleanEndpoint;
}
