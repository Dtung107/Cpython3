// Boot crash-loop guard, Safe Mode detection, and non-destructive cache cleanup for Android APK & WebView

export interface BootRecoveryState {
  safeMode: boolean;
  clearTransientCache: boolean;
  crashCount: number;
  reason: string | null;
}

const BOOT_GUARD_KEY = 'pydroid_boot_guard';
const RAPID_CRASH_WINDOW_MS = 25000;
const STABLE_BOOT_DELAY_MS = 10000;

interface StoredBootGuard {
  booting: boolean;
  rapidFailCount: number;
  lastBootTs: number;
}

let cachedRecoveryState: BootRecoveryState | null = null;
let stableTimerId: number | null = null;

function readStoredBootGuard(): StoredBootGuard | null {
  try {
    const raw = localStorage.getItem(BOOT_GUARD_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return {
      booting: !!parsed.booting,
      rapidFailCount: Number.isFinite(Number(parsed.rapidFailCount))
        ? Math.max(0, Number(parsed.rapidFailCount))
        : 0,
      lastBootTs: Number.isFinite(Number(parsed.lastBootTs)) ? Number(parsed.lastBootTs) : 0,
    };
  } catch {
    return null;
  }
}

function writeStoredBootGuard(next: StoredBootGuard): void {
  try {
    localStorage.setItem(BOOT_GUARD_KEY, JSON.stringify(next));
  } catch {}
}

export function markBootStableNow(): void {
  if (stableTimerId !== null) {
    window.clearTimeout(stableTimerId);
    stableTimerId = null;
  }
  writeStoredBootGuard({
    booting: false,
    rapidFailCount: 0,
    lastBootTs: Date.now(),
  });
}

export function initBootRecoveryGuard(): BootRecoveryState {
  if (cachedRecoveryState) return cachedRecoveryState;
  if (typeof window === 'undefined') {
    return { safeMode: false, clearTransientCache: false, crashCount: 0, reason: null };
  }

  let urlSafeMode = false;
  let urlClearCache = false;
  try {
    const url = new URL(window.location.href);
    urlSafeMode = url.searchParams.get('safe_mode') === '1';
    urlClearCache = url.searchParams.get('clear_transient_cache') === '1';
    if (urlSafeMode || urlClearCache) {
      url.searchParams.delete('safe_mode');
      url.searchParams.delete('clear_transient_cache');
      const cleaned =
        url.pathname + (url.searchParams.toString() ? `?${url.searchParams.toString()}` : '') + url.hash;
      window.history.replaceState(null, '', cleaned || '/');
    }
  } catch {}

  const now = Date.now();
  const prev = readStoredBootGuard();
  let rapidFailCount = 0;

  if (prev && prev.booting && now - prev.lastBootTs < RAPID_CRASH_WINDOW_MS) {
    rapidFailCount = prev.rapidFailCount + 1;
  } else if (prev && now - prev.lastBootTs < RAPID_CRASH_WINDOW_MS) {
    rapidFailCount = prev.rapidFailCount;
  }

  // Record active boot; normal pagehide/unload or 10s uptime clears booting=false
  writeStoredBootGuard({
    booting: true,
    rapidFailCount,
    lastBootTs: now,
  });

  const handleCleanExit = () => {
    const current = readStoredBootGuard();
    if (current) {
      writeStoredBootGuard({
        booting: false,
        rapidFailCount: current.rapidFailCount,
        lastBootTs: current.lastBootTs,
      });
    }
  };

  window.addEventListener('pagehide', handleCleanExit, { once: true });
  window.addEventListener('beforeunload', handleCleanExit, { once: true });

  stableTimerId = window.setTimeout(() => {
    stableTimerId = null;
    writeStoredBootGuard({
      booting: false,
      rapidFailCount: 0,
      lastBootTs: Date.now(),
    });
  }, STABLE_BOOT_DELAY_MS);

  const safeMode = urlSafeMode || urlClearCache || rapidFailCount >= 2;
  const clearTransientCache = urlClearCache || rapidFailCount >= 3;

  let reason: string | null = null;
  if (clearTransientCache) {
    reason =
      'Phát hiện khởi động lại liên tiếp — đã tự động dọn bộ nhớ đệm WASM và bật Chế độ An toàn (giữ nguyên mã Python).';
  } else if (safeMode) {
    reason =
      'Đã bật Chế độ An toàn: tạm tắt tự động nạp Pyodide khi mở app để tránh tràn RAM.';
  }

  cachedRecoveryState = {
    safeMode,
    clearTransientCache,
    crashCount: rapidFailCount,
    reason,
  };
  return cachedRecoveryState;
}

export async function clearTransientCachesPreservingUserCode(): Promise<void> {
  // Reset boot crash counter first so next boot starts clean
  markBootStableNow();

  // Clear CacheStorage if any
  try {
    if (typeof caches !== 'undefined' && caches.keys) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k).catch(() => false)));
    }
  } catch {}

  // Clear CDN WASM/wheel cache in IndexedDB while preserving user's .py files, settings & pip list
  try {
    if (typeof indexedDB !== 'undefined') {
      await new Promise<void>((resolve) => {
        const req = indexedDB.open('pydroid_pip_cache_db', 2);
        req.onsuccess = () => {
          const db = req.result;
          try {
            if (db.objectStoreNames.contains('cdn_assets')) {
              const tx = db.transaction('cdn_assets', 'readwrite');
              tx.objectStore('cdn_assets').clear();
              tx.oncomplete = () => {
                db.close();
                resolve();
              };
              tx.onerror = () => {
                db.close();
                resolve();
              };
              return;
            }
          } catch {}
          db.close();
          resolve();
        };
        req.onerror = () => resolve();
        req.onblocked = () => resolve();
      });
    }
  } catch {}
}
