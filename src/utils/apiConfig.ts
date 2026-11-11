/**
 * API Configuration for Pydroid 3 Web & Android APK
 * Provides automatic routing between local relative path (Web/AI Studio)
 * and Cloud Server proxy (Android APK / Capacitor).
 */

export const DEFAULT_CLOUD_API_URL = 'https://ais-dev-2ii6f72d6ena7e5jxlrv4d-237488245798.asia-east1.run.app';

export function isMobileOrApk(): boolean {
  if (typeof window === 'undefined') return false;
  const isCap = !!(window as any).Capacitor;
  const isCapProtocol = window.location.protocol === 'capacitor:' || window.location.protocol === 'file:';
  // In Capacitor Android, the hostname is localhost or android.local and port is empty or 80
  const isAndroidLocal =
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') &&
    (isCap || !window.location.port || window.location.port === '80');

  return isCap || isCapProtocol || isAndroidLocal;
}

export function getApiBaseUrl(): string {
  // Check if user set a custom server URL in drawer settings
  const custom = typeof window !== 'undefined' ? localStorage.getItem('pydroid_custom_server_url') : null;
  if (custom && custom.trim()) {
    return custom.trim().replace(/\/+$/, '');
  }

  // If running inside Capacitor APK on mobile device, route to Cloud Server
  if (isMobileOrApk()) {
    // If the window origin was saved from a web session, or fallback to default
    const savedCloud = typeof window !== 'undefined' ? localStorage.getItem('pydroid_cloud_server_url') : null;
    return savedCloud && savedCloud.startsWith('http') ? savedCloud : DEFAULT_CLOUD_API_URL;
  }

  // In standard browser / AI Studio dev server, use relative path so requests hit local Express server
  return '';
}

export function getApiUrl(endpoint: string): string {
  const base = getApiBaseUrl();
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  return base ? `${base}${cleanEndpoint}` : cleanEndpoint;
}
