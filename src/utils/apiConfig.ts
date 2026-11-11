/**
 * API Configuration for Pydroid 3 Web & Android APK
 * Provides automatic routing between local relative path (Web/AI Studio)
 * and Custom Backend Server (Android APK / Capacitor).
 */

export function isMobileOrApk(): boolean {
  if (typeof window === 'undefined') return false;
  const isCap = !!(window as any).Capacitor;
  const isCapProtocol = window.location.protocol === 'capacitor:' || window.location.protocol === 'file:';
  const isAndroidLocal =
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') &&
    (isCap || !window.location.port || window.location.port === '80');
  const isWebView = /Android.*Version\/[0-9.]+\s+Chrome\/[0-9.]+|wv/.test(navigator.userAgent);

  return isCap || isCapProtocol || isAndroidLocal || isWebView;
}

export function hasCustomServer(): boolean {
  if (typeof window === 'undefined') return false;
  const custom = localStorage.getItem('pydroid_custom_server_url');
  return !!(custom && custom.trim().startsWith('http'));
}

export function getCustomServerUrl(): string {
  if (typeof window === 'undefined') return '';
  const custom = localStorage.getItem('pydroid_custom_server_url');
  return custom ? custom.trim().replace(/\/+$/, '') : '';
}

export function getApiBaseUrl(): string {
  // 1. If user set a custom backend server URL in drawer settings, always prioritize it
  const custom = getCustomServerUrl();
  if (custom) {
    return custom;
  }

  // 2. If running inside APK or standalone mobile container without a custom backend server,
  // return empty string so local endpoints don't crash with 302 redirects to internal dev URLs.
  if (isMobileOrApk()) {
    return '';
  }

  // 3. In Web IDE inside AI Studio / browser, use relative path so requests hit local Express server
  return '';
}

export function getApiUrl(endpoint: string): string {
  const base = getApiBaseUrl();
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  return base ? `${base}${cleanEndpoint}` : cleanEndpoint;
}

