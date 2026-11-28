// Pyodide WASM Client-Side Python Runner & Persistent IndexedDB Pip/Asset Cache

declare global {
  interface Window {
    loadPyodide?: (config: { indexURL: string }) => Promise<any>;
    pyodideInstance?: any;
    __pydroid_input_callback?: (promptText: string) => string | null;
    __pydroid_tty_stdout?: (chunk: string) => void;
    __pydroid_tty_stderr?: (chunk: string) => void;
    __pydroid_cancel_requested?: boolean;
  }
}

export interface PersistedPipEntry {
  name: string;
  source: 'pyodide' | 'micropip' | 'cpython';
  installedAt: string;
}

export interface SerializedPipBundle {
  packageName: string;
  totalBytes: number;
  cachedAt: number;
  files: Array<{
    path: string;
    dataBase64: string;
  }>;
}

const PYODIDE_VERSION = '0.26.4';
const PYODIDE_CDN_BASE = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`;
const PYODIDE_SCRIPT_URL = `${PYODIDE_CDN_BASE}pyodide.js`;
const PYPI_WHEEL_PREFIX = 'https://files.pythonhosted.org/packages/';

const PIP_STORAGE_KEY = 'pydroid_pip_packages';
const IDB_NAME = 'pydroid_pip_cache_db';
const IDB_LEGACY_FILES_STORE = 'site_packages';
const IDB_BUNDLES_STORE = 'package_bundles';
const IDB_ASSETS_STORE = 'cdn_assets';
const IDB_VERSION = 2;
const IS_MOBILE_RUNTIME =
  typeof navigator !== 'undefined' &&
  /android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent || '');
const MAX_CDN_CACHE_BYTES = IS_MOBILE_RUNTIME ? 90 * 1024 * 1024 : 180 * 1024 * 1024; // Soft limit for cached WASM/wheels

export const BUILTIN_STDLIB_PACKAGES = [
  'builtins',
  'math',
  'sys',
  'os',
  'random',
  'time',
  'json',
  'datetime',
  're',
] as const;

const BUILTIN_SET = new Set<string>(BUILTIN_STDLIB_PACKAGES);

// Map common Python import names to pip/Pyodide package names
const IMPORT_TO_PACKAGE_MAP: Record<string, string> = {
  numpy: 'numpy',
  matplotlib: 'matplotlib',
  pandas: 'pandas',
  scipy: 'scipy',
  sympy: 'sympy',
  PIL: 'pillow',
  pillow: 'pillow',
  bs4: 'beautifulsoup4',
  beautifulsoup4: 'beautifulsoup4',
  pyfiglet: 'pyfiglet',
  colorama: 'colorama',
  requests: 'requests',
  rich: 'rich',
  yaml: 'pyyaml',
  pyyaml: 'pyyaml',
  sklearn: 'scikit-learn',
};

const PYODIDE_PREBUILT_PACKAGES = new Set<string>([
  'numpy',
  'matplotlib',
  'pandas',
  'scipy',
  'sympy',
  'pillow',
  'scikit-learn',
  'pyyaml',
  'beautifulsoup4',
  'micropip',
]);

export type PyodideWarmState = 'idle' | 'warming' | 'ready' | 'error';

const MAX_RAM_ASSET_BYTES = 512 * 1024; // Keep small manifests/scripts in RAM; avoid duplicating large WASM/wheels in heap
const MAX_RAM_CACHE_TOTAL_BYTES = 4 * 1024 * 1024;

let pyodideLoadingPromise: Promise<any> | null = null;
let runtimeBootstrapped = false;
let micropipLoaded = false;
let sitePackagesRestored = false;
let matplotlibConfigured = false;
let fetchInterceptorInstalled = false;
let originalFetchRef: typeof window.fetch | null = null;
let dbPromise: Promise<IDBDatabase> | null = null;
let pyodideWarmState: PyodideWarmState = 'idle';
let coreAssetsPrecached = false;

const memoryAssetCache = new Map<string, CachedCdnAsset>();
let memoryAssetCacheBytes = 0;
const inflightAssetFetches = new Map<string, Promise<CachedCdnAsset | null>>();
const verifiedImportableModules = new Set<string>();
const verifiedImportSignatureCache = new Map<string, string[]>();
const sleepTransformCache = new Map<string, string>();
const MAX_LOCAL_CACHE_ENTRIES = 16;
let lastPrewarmedImportSignature = '';
const pyodideWarmListeners = new Set<(state: PyodideWarmState) => void>();

interface CachedMainPyFns {
  runSync: any;
  prepareAsync: any;
  finishAsync: any;
  transformSleep: any;
  flushIo: any;
  getIoState: any;
}
let cachedMainPyFns: CachedMainPyFns | null = null;

function extractImportSignature(code: string): string {
  if (!code || !code.includes('import')) return '';
  const mods = new Set<string>();
  const importRegex = /^\s*(?:import|from)\s+([a-zA-Z0-9_]+)/gm;
  let match: RegExpExecArray | null;
  while ((match = importRegex.exec(code)) !== null) {
    if (match[1]) mods.add(match[1]);
  }
  if (mods.size === 0) return '';
  return Array.from(mods).sort().join(',');
}

export function extractCodeImportSignature(code: string): string {
  return extractImportSignature(code);
}

// --- Dedicated Web Worker Controller for 60fps Non-Blocking UI & Hard Cancel ---
let pyodideWorker: Worker | null = null;
let workerUnavailable = typeof Worker === 'undefined';
let workerReqSeq = 0;
let workerRunCount = 0;
let workerHeavyRun = false;
let lastWorkerRunEndedAt = 0;
let lastKnownWasmHeapBytes = 0;
let lastIdbBudgetCheckAt = 0;
let lastWorkerDiagnosticsCache: {
  initialized: boolean;
  wasmHeapBytes: number;
  loadedPackages: string[];
  pythonModulesCount: number;
  pythonCodeCacheCount: number;
  matplotlibFiguresCount: number;
  gcTrackedCount: number;
  ramAssetCacheBytes: number;
  ramAssetCacheCount: number;
  localJsCacheEntries: number;
  execCount: number;
} | null = null;

interface WorkerPendingRequest {
  resolve: (val: any) => void;
  reject: (err: any) => void;
  onStdout?: (chunk: string) => void;
  onStderr?: (chunk: string) => void;
  onStatus?: (msg: string) => void;
}

const workerPendingRequests = new Map<number, WorkerPendingRequest>();

function getSavedPkgSnapshot(): Array<{ name: string; source: 'pyodide' | 'micropip' | 'cpython' }> {
  return getSavedUserPipPackages().map((p) => ({ name: p.name, source: p.source }));
}

function terminatePyodideWorker(reason?: Error): void {
  if (pyodideWorker) {
    try {
      pyodideWorker.terminate();
    } catch {}
    pyodideWorker = null;
  }
  workerRunCount = 0;
  workerHeavyRun = false;
  lastWorkerRunEndedAt = 0;
  lastKnownWasmHeapBytes = 0;
  lastWorkerDiagnosticsCache = null;
  for (const [, pending] of workerPendingRequests) {
    pending.reject(reason || new DOMException('Đã dừng thực thi.', 'AbortError'));
  }
  workerPendingRequests.clear();
  if (!window.pyodideInstance) {
    setPyodideWarmState('idle');
  }
}

function ensurePyodideWorker(): Worker | null {
  if (workerUnavailable || typeof Worker === 'undefined') return null;
  if (pyodideWorker) return pyodideWorker;

  try {
    const worker = new Worker(new URL('../workers/pyodideWorker.ts', import.meta.url), {
      type: 'module',
    });

    worker.onmessage = (ev: MessageEvent) => {
      const data = ev.data || {};
      if (data.type === 'warmState') {
        if (data.state === 'ready' || data.state === 'error' || data.state === 'warming') {
          setPyodideWarmState(data.state);
        }
        return;
      }

      const pending = typeof data.reqId === 'number' ? workerPendingRequests.get(data.reqId) : undefined;
      if (!pending) return;

      if (data.type === 'stdout') {
        pending.onStdout?.(data.chunk || '');
        return;
      }
      if (data.type === 'stderr') {
        pending.onStderr?.(data.chunk || '');
        return;
      }
      if (data.type === 'status') {
        pending.onStatus?.(data.message || '');
        return;
      }

      workerPendingRequests.delete(data.reqId);
      pending.resolve(data);
    };

    worker.onerror = () => {
      workerUnavailable = true;
      terminatePyodideWorker(new Error('Pyodide Worker fallback'));
    };

    pyodideWorker = worker;
    return worker;
  } catch {
    workerUnavailable = true;
    return null;
  }
}

function callPyodideWorker<T = any>(
  payload: Record<string, any>,
  callbacks?: {
    signal?: AbortSignal;
    onStdout?: (chunk: string) => void;
    onStderr?: (chunk: string) => void;
    onStatus?: (msg: string) => void;
  }
): Promise<T> {
  const worker = ensurePyodideWorker();
  if (!worker) {
    return Promise.reject(new Error('Worker unavailable'));
  }

  return new Promise<T>((resolve, reject) => {
    const reqId = ++workerReqSeq;
    const signal = callbacks?.signal;

    const onAbort = () => {
      workerPendingRequests.delete(reqId);
      // Hard-terminate worker to instantly stop even infinite loops like `while True: pass`
      terminatePyodideWorker(new DOMException('Đã dừng thực thi.', 'AbortError'));
      // Quietly re-warm a clean Worker from IndexedDB cache so next run is fast
      setTimeout(() => {
        if (!workerUnavailable) {
          prewarmPyodide();
        }
      }, 250);
      reject(new DOMException('Đã dừng thực thi.', 'AbortError'));
    };

    if (signal) {
      if (signal.aborted) {
        reject(new DOMException('Đã dừng thực thi.', 'AbortError'));
        return;
      }
      signal.addEventListener('abort', onAbort, { once: true });
    }

    workerPendingRequests.set(reqId, {
      resolve: (val) => {
        if (signal) signal.removeEventListener('abort', onAbort);
        resolve(val);
      },
      reject: (err) => {
        if (signal) signal.removeEventListener('abort', onAbort);
        reject(err);
      },
      onStdout: callbacks?.onStdout,
      onStderr: callbacks?.onStderr,
      onStatus: callbacks?.onStatus,
    });

    worker.postMessage({ ...payload, reqId });
  });
}

function setPyodideWarmState(next: PyodideWarmState): void {
  if (pyodideWarmState === next) return;
  pyodideWarmState = next;
  for (const listener of pyodideWarmListeners) {
    try {
      listener(pyodideWarmState);
    } catch {}
  }
}

export function getPyodideWarmState(): PyodideWarmState {
  if (typeof window !== 'undefined' && window.pyodideInstance && runtimeBootstrapped) {
    return 'ready';
  }
  return pyodideWarmState;
}

export function subscribePyodideWarmState(
  listener: (state: PyodideWarmState) => void
): () => void {
  pyodideWarmListeners.add(listener);
  listener(getPyodideWarmState());
  return () => pyodideWarmListeners.delete(listener);
}

// --- LocalStorage Registry for Installed Packages (survives APK & browser restarts) ---

export function getSavedUserPipPackages(): PersistedPipEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(PIP_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    const normalized: PersistedPipEntry[] = [];
    const seen = new Set<string>();
    for (const item of parsed) {
      if (typeof item === 'string') {
        const clean = item.trim().toLowerCase();
        if (clean && !BUILTIN_SET.has(clean) && !seen.has(clean)) {
          seen.add(clean);
          normalized.push({
            name: clean,
            source: 'micropip',
            installedAt: new Date().toISOString(),
          });
        }
      } else if (item && typeof item.name === 'string') {
        const clean = item.name.trim().toLowerCase();
        if (clean && !BUILTIN_SET.has(clean) && !seen.has(clean)) {
          seen.add(clean);
          normalized.push({
            name: clean,
            source:
              item.source === 'pyodide' || item.source === 'cpython' ? item.source : 'micropip',
            installedAt: item.installedAt || new Date().toISOString(),
          });
        }
      }
    }
    return normalized;
  } catch {
    return [];
  }
}

export function saveUserPipPackage(
  packageName: string,
  source: 'pyodide' | 'micropip' | 'cpython' = 'micropip'
): PersistedPipEntry[] {
  if (typeof window === 'undefined') return [];
  const clean = normalizePackageName(packageName);
  if (!clean || BUILTIN_SET.has(clean)) return getSavedUserPipPackages();

  const existing = getSavedUserPipPackages().filter((p) => p.name !== clean);
  const next: PersistedPipEntry[] = [
    ...existing,
    {
      name: clean,
      source,
      installedAt: new Date().toISOString(),
    },
  ];
  try {
    localStorage.setItem(PIP_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // ignore storage quota errors
  }
  return next;
}

export function mergeSavedPipPackages(
  packageNames: string[],
  source: 'pyodide' | 'micropip' | 'cpython' = 'cpython'
): PersistedPipEntry[] {
  if (typeof window === 'undefined') return [];
  const existing = getSavedUserPipPackages();
  const map = new Map<string, PersistedPipEntry>(existing.map((e) => [e.name, e]));
  let changed = false;

  for (const raw of packageNames) {
    const clean = normalizePackageName(raw);
    if (!clean || BUILTIN_SET.has(clean)) continue;
    if (!map.has(clean)) {
      map.set(clean, {
        name: clean,
        source,
        installedAt: new Date().toISOString(),
      });
      changed = true;
    }
  }

  const next = Array.from(map.values());
  if (changed) {
    try {
      localStorage.setItem(PIP_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // ignore
    }
  }
  return next;
}

export async function removeUserPipPackage(packageName: string): Promise<PersistedPipEntry[]> {
  const clean = normalizePackageName(packageName);
  const next = getSavedUserPipPackages().filter((p) => p.name !== clean);
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(PIP_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // ignore
    }
  }

  verifiedImportableModules.clear();
  verifiedImportSignatureCache.clear();
  lastPrewarmedImportSignature = '';

  if (next.length === 0) {
    await clearSitePackagesCache().catch(() => {});
  } else {
    await removePackageBundleFromIDB(clean).catch(() => {});
    await removeMatchingLegacyEntries(clean).catch(() => {});
  }

  if (pyodideWorker && !workerUnavailable) {
    void callPyodideWorker({ type: 'syncPackages', action: 'clear', packageName: clean }).catch(() => {});
  }
  return next;
}

export function normalizePackageName(raw: string): string {
  // Strip version specifiers like requests==2.31.0 or rich>=13
  return raw
    .trim()
    .split(/[=<>!~\[]/)[0]
    .trim()
    .toLowerCase();
}

export function getInstalledPackagesList(): string[] {
  const saved = getSavedUserPipPackages().map((p) => p.name);
  return Array.from(new Set([...BUILTIN_STDLIB_PACKAGES, ...saved]));
}

export function getUserInstalledPackageNames(): string[] {
  return getSavedUserPipPackages().map((p) => p.name);
}

// --- Pooled IndexedDB v2 Cache (Package Bundles + CDN WASM/Wheel Assets) ---

interface CachedFileEntry {
  path: string;
  data: Uint8Array;
}

interface CachedPackageBundle {
  packageName: string;
  files: CachedFileEntry[];
  totalBytes: number;
  cachedAt: number;
}

interface CachedCdnAsset {
  url: string;
  data: ArrayBuffer;
  contentType: string;
  size: number;
  cachedAt: number;
}

function getPipDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      dbPromise = null;
      reject(new Error('IndexedDB unavailable'));
      return;
    }

    const req = indexedDB.open(IDB_NAME, IDB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_LEGACY_FILES_STORE)) {
        db.createObjectStore(IDB_LEGACY_FILES_STORE, { keyPath: 'path' });
      }
      if (!db.objectStoreNames.contains(IDB_BUNDLES_STORE)) {
        db.createObjectStore(IDB_BUNDLES_STORE, { keyPath: 'packageName' });
      }
      if (!db.objectStoreNames.contains(IDB_ASSETS_STORE)) {
        const assetStore = db.createObjectStore(IDB_ASSETS_STORE, { keyPath: 'url' });
        assetStore.createIndex('cachedAt', 'cachedAt', { unique: false });
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      db.onclose = () => {
        dbPromise = null;
      };
      db.onversionchange = () => {
        db.close();
        dbPromise = null;
      };
      resolve(db);
    };
    req.onerror = () => {
      dbPromise = null;
      reject(req.error || new Error('Failed to open IndexedDB'));
    };
  });

  return dbPromise;
}

function inferContentType(url: string): string {
  const lower = url.toLowerCase().split('?')[0];
  if (lower.endsWith('.wasm')) return 'application/wasm';
  if (lower.endsWith('.js') || lower.endsWith('.mjs')) return 'application/javascript; charset=utf-8';
  if (lower.endsWith('.json')) return 'application/json; charset=utf-8';
  if (lower.endsWith('.zip') || lower.endsWith('.whl')) return 'application/zip';
  return 'application/octet-stream';
}

function isCacheablePyodideAssetUrl(url: string): boolean {
  if (url.startsWith(PYODIDE_CDN_BASE)) return true;
  if (url.startsWith(PYPI_WHEEL_PREFIX) && url.split('?')[0].endsWith('.whl')) return true;
  return false;
}

function setBoundedMemoryAsset(url: string, asset: CachedCdnAsset): void {
  if (asset.size > MAX_RAM_ASSET_BYTES) return;
  const existing = memoryAssetCache.get(url);
  if (existing) {
    memoryAssetCacheBytes = Math.max(0, memoryAssetCacheBytes - (existing.size || 0));
    memoryAssetCache.delete(url);
  }
  while (
    memoryAssetCacheBytes + asset.size > MAX_RAM_CACHE_TOTAL_BYTES &&
    memoryAssetCache.size > 0
  ) {
    const oldestKey = memoryAssetCache.keys().next().value;
    if (!oldestKey) break;
    const oldestVal = memoryAssetCache.get(oldestKey);
    memoryAssetCache.delete(oldestKey);
    memoryAssetCacheBytes = Math.max(0, memoryAssetCacheBytes - (oldestVal?.size || 0));
  }
  memoryAssetCache.set(url, asset);
  memoryAssetCacheBytes += asset.size;
}

function clearMemoryAssetCache(): void {
  memoryAssetCache.clear();
  memoryAssetCacheBytes = 0;
}

async function getCdnAssetFromIDB(url: string): Promise<CachedCdnAsset | null> {
  const memHit = memoryAssetCache.get(url);
  if (memHit) return memHit;

  try {
    const db = await getPipDB();
    const record = await new Promise<CachedCdnAsset | undefined>((resolve, reject) => {
      const tx = db.transaction(IDB_ASSETS_STORE, 'readonly');
      const req = tx.objectStore(IDB_ASSETS_STORE).get(url);
      req.onsuccess = () => resolve(req.result as CachedCdnAsset | undefined);
      req.onerror = () => reject(req.error);
    });
    if (record && record.data && record.data.byteLength > 0) {
      // Keep tiny manifests/scripts in RAM for instant repeat reads without duplicating large WASM buffers
      if (record.size <= MAX_RAM_ASSET_BYTES) {
        setBoundedMemoryAsset(url, record);
      }
      return record;
    }
  } catch {
    // ignore IDB read failures
  }
  return null;
}

async function evictOldestCdnAssetsIfNeeded(db: IDBDatabase, bytesToFree: number): Promise<void> {
  try {
    await new Promise<void>((resolve) => {
      const tx = db.transaction(IDB_ASSETS_STORE, 'readwrite');
      const store = tx.objectStore(IDB_ASSETS_STORE);
      const index = store.index('cachedAt');
      let freed = 0;

      const cursorReq = index.openCursor();
      cursorReq.onsuccess = () => {
        const cursor = cursorReq.result;
        if (!cursor || freed >= bytesToFree) {
          return;
        }
        const entry = cursor.value as CachedCdnAsset;
        // Never evict core bootstrap files unless required
        const isCoreFile =
          entry.url === PYODIDE_SCRIPT_URL ||
          entry.url === `${PYODIDE_CDN_BASE}pyodide.mjs` ||
          entry.url === `${PYODIDE_CDN_BASE}pyodide.asm.js` ||
          entry.url.endsWith('pyodide.asm.wasm') ||
          entry.url.endsWith('python_stdlib.zip') ||
          entry.url.endsWith('pyodide-lock.json');

        if (!isCoreFile) {
          freed += entry.size || 0;
          const memOld = memoryAssetCache.get(entry.url);
          if (memOld) {
            memoryAssetCacheBytes = Math.max(0, memoryAssetCacheBytes - (memOld.size || 0));
            memoryAssetCache.delete(entry.url);
          }
          cursor.delete();
        }
        cursor.continue();
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    // ignore eviction failure
  }
}

async function enforceCdnCacheBudget(db: IDBDatabase): Promise<void> {
  try {
    const entries: Array<{ url: string; size: number; cachedAt: number; isCore: boolean }> = [];
    let totalBytes = 0;

    await new Promise<void>((resolve) => {
      const tx = db.transaction(IDB_ASSETS_STORE, 'readonly');
      const store = tx.objectStore(IDB_ASSETS_STORE);
      const cursorReq = store.openCursor();
      cursorReq.onsuccess = () => {
        const cursor = cursorReq.result;
        if (!cursor) return;
        const val = cursor.value as CachedCdnAsset;
        const sz = val?.size || val?.data?.byteLength || 0;
        totalBytes += sz;
        const isCore =
          val.url === PYODIDE_SCRIPT_URL ||
          val.url === `${PYODIDE_CDN_BASE}pyodide.mjs` ||
          val.url === `${PYODIDE_CDN_BASE}pyodide.asm.js` ||
          val.url.endsWith('pyodide.asm.wasm') ||
          val.url.endsWith('python_stdlib.zip') ||
          val.url.endsWith('pyodide-lock.json');
        entries.push({ url: val.url, size: sz, cachedAt: val.cachedAt || 0, isCore });
        cursor.continue();
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });

    if (totalBytes <= MAX_CDN_CACHE_BYTES) return;

    const targetBytes = Math.floor(MAX_CDN_CACHE_BYTES * 0.85);
    const nonCoreOldest = entries
      .filter((e) => !e.isCore)
      .sort((a, b) => a.cachedAt - b.cachedAt);

    const toDelete: string[] = [];
    for (const item of nonCoreOldest) {
      if (totalBytes <= targetBytes) break;
      toDelete.push(item.url);
      totalBytes -= item.size;
    }

    if (toDelete.length === 0) return;

    await new Promise<void>((resolve) => {
      const tx = db.transaction(IDB_ASSETS_STORE, 'readwrite');
      const store = tx.objectStore(IDB_ASSETS_STORE);
      for (const url of toDelete) {
        const memOld = memoryAssetCache.get(url);
        if (memOld) {
          memoryAssetCacheBytes = Math.max(0, memoryAssetCacheBytes - (memOld.size || 0));
          memoryAssetCache.delete(url);
        }
        store.delete(url);
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {}
}

let cdnIdbWriteQueue: Promise<void> = Promise.resolve();
let cdnWritesSinceBudgetCheck = 0;

function putCdnAssetToIDB(asset: CachedCdnAsset): Promise<void> {
  if (!asset.data || asset.data.byteLength === 0 || asset.data.byteLength > 45 * 1024 * 1024) {
    return Promise.resolve();
  }

  if (asset.size <= MAX_RAM_ASSET_BYTES) {
    setBoundedMemoryAsset(asset.url, asset);
  }

  const nextWrite = cdnIdbWriteQueue.then(async () => {
    try {
      const db = await getPipDB();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(IDB_ASSETS_STORE, 'readwrite');
        tx.objectStore(IDB_ASSETS_STORE).put(asset);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      cdnWritesSinceBudgetCheck++;
      if (cdnWritesSinceBudgetCheck >= 6 || asset.size > 1024 * 1024) {
        cdnWritesSinceBudgetCheck = 0;
        await enforceCdnCacheBudget(db);
      }
    } catch (err: any) {
      // Retry once after evicting if browser quota was exceeded
      if (err?.name === 'QuotaExceededError') {
        try {
          const db = await getPipDB();
          await evictOldestCdnAssetsIfNeeded(db, Math.max(asset.size * 2, 20 * 1024 * 1024));
          await new Promise<void>((resolve, reject) => {
            const tx = db.transaction(IDB_ASSETS_STORE, 'readwrite');
            tx.objectStore(IDB_ASSETS_STORE).put(asset);
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
          });
        } catch {
          // graceful degradation if device storage is full
        }
      }
    }
  });

  cdnIdbWriteQueue = nextWrite.catch(() => {});
  return nextWrite;
}

async function fetchAndCachePyodideAsset(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<CachedCdnAsset | null> {
  const url =
    typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;

  const cached = await getCdnAssetFromIDB(url);
  if (cached) return cached;

  const inflight = inflightAssetFetches.get(url);
  if (inflight) return inflight;

  const networkPromise = (async (): Promise<CachedCdnAsset | null> => {
    const fetcher = originalFetchRef || window.fetch.bind(window);
    const res = await fetcher(input, init);
    if (!res.ok) return null;

    const buffer = await res.arrayBuffer();
    const contentType = res.headers.get('content-type') || inferContentType(url);
    const asset: CachedCdnAsset = {
      url,
      data: buffer,
      contentType,
      size: buffer.byteLength,
      cachedAt: Date.now(),
    };

    // Persist asynchronously without blocking WASM compilation/execution
    void putCdnAssetToIDB(asset);
    return asset;
  })();

  inflightAssetFetches.set(url, networkPromise);
  try {
    return await networkPromise;
  } finally {
    inflightAssetFetches.delete(url);
  }
}

function installPyodideFetchCache(): void {
  if (typeof window === 'undefined' || fetchInterceptorInstalled) return;
  fetchInterceptorInstalled = true;

  try {
    const rawFetch = window.fetch;
    if (typeof rawFetch !== 'function') return;
    originalFetchRef = rawFetch.bind(window);
    const baseFetch = originalFetchRef;

    const wrappedFetch = async (
      input: RequestInfo | URL,
      init?: RequestInit
    ): Promise<Response> => {
      const method = (
        init?.method ||
        (typeof Request !== 'undefined' && input instanceof Request ? input.method : 'GET')
      ).toUpperCase();

      const url =
        typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;

      if (method !== 'GET' || !isCacheablePyodideAssetUrl(url)) {
        return baseFetch(input, init);
      }

      try {
        const cached = await getCdnAssetFromIDB(url);
        if (cached) {
          return new Response(cached.data, {
            status: 200,
            statusText: 'OK',
            headers: {
              'Content-Type': cached.contentType || inferContentType(url),
              'X-Pydroid-Cache': 'HIT',
            },
          });
        }

        const inflight = inflightAssetFetches.get(url);
        if (inflight) {
          const asset = await inflight;
          if (asset) {
            return new Response(asset.data, {
              status: 200,
              statusText: 'OK',
              headers: {
                'Content-Type': asset.contentType || inferContentType(url),
              },
            });
          }
        }

        const res = await baseFetch(input, init);
        if (!res.ok) return res;

        const contentType = res.headers.get('content-type') || inferContentType(url);
        const buffer = await res.arrayBuffer();
        const asset: CachedCdnAsset = {
          url,
          data: buffer,
          contentType,
          size: buffer.byteLength,
          cachedAt: Date.now(),
        };
        void putCdnAssetToIDB(asset);

        return new Response(buffer, {
          status: res.status,
          statusText: res.statusText,
          headers: {
            'Content-Type': contentType,
          },
        });
      } catch {
        // Fallback to direct fetch if IndexedDB throws unexpectedly
        return baseFetch(input, init);
      }
    };

    const ownDesc = Object.getOwnPropertyDescriptor(window, 'fetch');
    if (!ownDesc || ownDesc.configurable) {
      Object.defineProperty(window, 'fetch', {
        value: wrappedFetch,
        configurable: true,
        writable: true,
      });
    } else if (ownDesc.writable) {
      window.fetch = wrappedFetch;
    }
  } catch {
    // Host environment locks window.fetch (getter-only); skip gracefully while keeping IDB bundle/script caches active
  }
}

// --- Bundled Site-Packages IndexedDB Persistence (1 record per package = ultra-fast restore) ---

async function savePackageBundleToIDB(
  packageName: string,
  files: CachedFileEntry[]
): Promise<void> {
  if (files.length === 0) return;
  const totalBytes = files.reduce((sum, f) => sum + (f.data?.byteLength || 0), 0);
  const bundle: CachedPackageBundle = {
    packageName: normalizePackageName(packageName),
    files,
    totalBytes,
    cachedAt: Date.now(),
  };

  const db = await getPipDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(IDB_BUNDLES_STORE, 'readwrite');
    tx.objectStore(IDB_BUNDLES_STORE).put(bundle);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function preloadCachedPackagesFromIDB(): Promise<{
  bundles: CachedPackageBundle[];
  legacyFiles: CachedFileEntry[];
}> {
  try {
    const db = await getPipDB();
    const storeNames = [IDB_BUNDLES_STORE, IDB_LEGACY_FILES_STORE].filter((name) =>
      db.objectStoreNames.contains(name)
    );
    if (storeNames.length === 0) return { bundles: [], legacyFiles: [] };

    return await new Promise((resolve) => {
      const tx = db.transaction(storeNames, 'readonly');
      let bundles: CachedPackageBundle[] = [];
      let legacyFiles: CachedFileEntry[] = [];

      if (storeNames.includes(IDB_BUNDLES_STORE)) {
        const bReq = tx.objectStore(IDB_BUNDLES_STORE).getAll();
        bReq.onsuccess = () => {
          bundles = Array.isArray(bReq.result) ? bReq.result : [];
        };
      }
      if (storeNames.includes(IDB_LEGACY_FILES_STORE)) {
        const lReq = tx.objectStore(IDB_LEGACY_FILES_STORE).getAll();
        lReq.onsuccess = () => {
          legacyFiles = Array.isArray(lReq.result) ? lReq.result : [];
        };
      }

      tx.oncomplete = () => resolve({ bundles, legacyFiles });
      tx.onerror = () => resolve({ bundles: [], legacyFiles: [] });
    });
  } catch {
    return { bundles: [], legacyFiles: [] };
  }
}

async function clearSitePackagesCache(): Promise<void> {
  const db = await getPipDB();
  const stores = [IDB_BUNDLES_STORE, IDB_LEGACY_FILES_STORE].filter((s) =>
    db.objectStoreNames.contains(s)
  );
  if (stores.length === 0) return;

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(stores, 'readwrite');
    for (const storeName of stores) {
      tx.objectStore(storeName).clear();
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function removePackageBundleFromIDB(pkgName: string): Promise<void> {
  const db = await getPipDB();
  if (!db.objectStoreNames.contains(IDB_BUNDLES_STORE)) return;
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(IDB_BUNDLES_STORE, 'readwrite');
    tx.objectStore(IDB_BUNDLES_STORE).delete(normalizePackageName(pkgName));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function removeMatchingLegacyEntries(pkgName: string): Promise<void> {
  const db = await getPipDB();
  if (!db.objectStoreNames.contains(IDB_LEGACY_FILES_STORE)) return;
  const rows = await new Promise<CachedFileEntry[]>((resolve, reject) => {
    const tx = db.transaction(IDB_LEGACY_FILES_STORE, 'readonly');
    const req = tx.objectStore(IDB_LEGACY_FILES_STORE).getAll();
    req.onsuccess = () => resolve(Array.isArray(req.result) ? req.result : []);
    req.onerror = () => reject(req.error);
  });
  if (rows.length === 0) return;

  const normalizedPkg = pkgName.replace(/-/g, '_');
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(IDB_LEGACY_FILES_STORE, 'readwrite');
    const store = tx.objectStore(IDB_LEGACY_FILES_STORE);
    for (const row of rows) {
      const lower = row.path.toLowerCase();
      if (lower.includes(`/${pkgName}`) || lower.includes(`/${normalizedPkg}`)) {
        store.delete(row.path);
      }
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function getSitePackagesRoot(pyodide: any): string {
  try {
    const dir = pyodide.runPython('import site; site.getsitepackages()[0]');
    if (typeof dir === 'string' && dir) return dir;
  } catch {
    // fallback
  }
  return '/lib/python3.12/site-packages';
}

function collectFilesRecursive(FS: any, dirPath: string, out: Set<string>) {
  try {
    const names: string[] = FS.readdir(dirPath);
    for (const name of names) {
      if (name === '.' || name === '..' || name === '__pycache__') continue;
      const full = `${dirPath}/${name}`;
      try {
        const stat = FS.stat(full);
        if (FS.isDir(stat.mode)) {
          collectFilesRecursive(FS, full, out);
        } else if (FS.isFile(stat.mode)) {
          out.add(full);
        }
      } catch {
        // ignore stat errors
      }
    }
  } catch {
    // ignore missing dir
  }
}

function ensureDirMemoized(FS: any, dirPath: string, createdDirs: Set<string>) {
  if (!dirPath || createdDirs.has(dirPath)) return;
  const parts = dirPath.split('/').filter(Boolean);
  let cur = '';
  for (const part of parts) {
    cur += `/${part}`;
    if (createdDirs.has(cur)) continue;
    try {
      FS.stat(cur);
    } catch {
      try {
        FS.mkdir(cur);
      } catch {
        // ignore if already exists
      }
    }
    createdDirs.add(cur);
  }
}

function writeCachedPackagesToPyodideFS(
  pyodide: any,
  preloaded: { bundles: CachedPackageBundle[]; legacyFiles: CachedFileEntry[] }
): number {
  const FS = pyodide.FS;
  const createdDirs = new Set<string>();
  const writtenPaths = new Set<string>();
  let restoredCount = 0;

  const writeEntry = (entry: CachedFileEntry) => {
    if (!entry?.path || writtenPaths.has(entry.path)) return;
    writtenPaths.add(entry.path);
    const lastSlash = entry.path.lastIndexOf('/');
    if (lastSlash > 0) {
      ensureDirMemoized(FS, entry.path.slice(0, lastSlash), createdDirs);
    }
    const bytes = entry.data instanceof Uint8Array ? entry.data : new Uint8Array(entry.data);
    FS.writeFile(entry.path, bytes);
    restoredCount++;
  };

  for (const bundle of preloaded.bundles) {
    if (Array.isArray(bundle.files)) {
      for (const file of bundle.files) {
        writeEntry(file);
      }
    }
  }

  for (const legacyFile of preloaded.legacyFiles) {
    writeEntry(legacyFile);
  }

  if (restoredCount > 0) {
    try {
      pyodide.runPython('import importlib; importlib.invalidate_caches()');
    } catch {
      // ignore
    }
  }

  return restoredCount;
}

async function restoreCachedSitePackages(
  pyodide: any,
  preloadedPromise?: Promise<{ bundles: CachedPackageBundle[]; legacyFiles: CachedFileEntry[] }>
): Promise<void> {
  if (sitePackagesRestored) return;
  sitePackagesRestored = true;
  try {
    const preloaded = preloadedPromise
      ? await preloadedPromise
      : await preloadCachedPackagesFromIDB();
    writeCachedPackagesToPyodideFS(pyodide, preloaded);
  } catch (err) {
    console.warn('Could not restore cached site-packages from IndexedDB:', err);
  }
}

function uint8ToBase64(bytes: Uint8Array): string {
  const CHUNK_SIZE = 8192;
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
    const chunk = bytes.subarray(i, Math.min(i + CHUNK_SIZE, bytes.length));
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

function base64ToUint8(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export async function exportPipBackupData(
  maxBundleBytes: number = 24 * 1024 * 1024
): Promise<{
  packages: PersistedPipEntry[];
  bundles: SerializedPipBundle[];
  skippedBundlePackages: string[];
}> {
  const packages = getSavedUserPipPackages();
  const { bundles } = await preloadCachedPackagesFromIDB();

  const serializedBundles: SerializedPipBundle[] = [];
  const skippedBundlePackages: string[] = [];
  let runningBytes = 0;

  for (const bundle of bundles) {
    if (!bundle?.packageName || !Array.isArray(bundle.files) || bundle.files.length === 0) {
      continue;
    }
    const bundleBytes =
      typeof bundle.totalBytes === 'number' && bundle.totalBytes > 0
        ? bundle.totalBytes
        : bundle.files.reduce((sum, f) => sum + (f.data?.byteLength || 0), 0);

    if (runningBytes + bundleBytes > maxBundleBytes) {
      skippedBundlePackages.push(bundle.packageName);
      continue;
    }

    const encodedFiles: Array<{ path: string; dataBase64: string }> = [];
    for (const file of bundle.files) {
      if (!file?.path || !file.data) continue;
      const bytes = file.data instanceof Uint8Array ? file.data : new Uint8Array(file.data);
      encodedFiles.push({
        path: file.path,
        dataBase64: uint8ToBase64(bytes),
      });
    }

    if (encodedFiles.length > 0) {
      runningBytes += bundleBytes;
      serializedBundles.push({
        packageName: normalizePackageName(bundle.packageName),
        totalBytes: bundleBytes,
        cachedAt: bundle.cachedAt || Date.now(),
        files: encodedFiles,
      });
    }
  }

  return {
    packages,
    bundles: serializedBundles,
    skippedBundlePackages,
  };
}

export async function restorePipBackupData(
  packages: PersistedPipEntry[],
  bundles?: SerializedPipBundle[]
): Promise<{ restoredPackages: number; restoredBundles: number }> {
  const normalizedList: PersistedPipEntry[] = [];
  const seen = new Set<string>();

  for (const item of Array.isArray(packages) ? packages : []) {
    if (!item || typeof item.name !== 'string') continue;
    const clean = normalizePackageName(item.name);
    if (!clean || BUILTIN_SET.has(clean) || seen.has(clean)) continue;
    seen.add(clean);
    normalizedList.push({
      name: clean,
      source:
        item.source === 'pyodide' || item.source === 'cpython' ? item.source : 'micropip',
      installedAt: item.installedAt || new Date().toISOString(),
    });
  }

  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(PIP_STORAGE_KEY, JSON.stringify(normalizedList));
    } catch {
      // ignore quota errors
    }
  }

  verifiedImportableModules.clear();

  const decodedBundles: CachedPackageBundle[] = [];
  if (Array.isArray(bundles)) {
    for (const rawBundle of bundles) {
      if (!rawBundle?.packageName || !Array.isArray(rawBundle.files)) continue;
      const entries: CachedFileEntry[] = [];
      for (const f of rawBundle.files) {
        if (!f?.path || typeof f.dataBase64 !== 'string') continue;
        try {
          entries.push({
            path: f.path,
            data: base64ToUint8(f.dataBase64),
          });
        } catch {
          // skip corrupted base64 entry
        }
      }
      if (entries.length > 0) {
        const cleanPkg = normalizePackageName(rawBundle.packageName);
        await savePackageBundleToIDB(cleanPkg, entries).catch(() => {});
        decodedBundles.push({
          packageName: cleanPkg,
          files: entries,
          totalBytes: entries.reduce((sum, e) => sum + e.data.byteLength, 0),
          cachedAt: rawBundle.cachedAt || Date.now(),
        });
      }
    }
  }

  if (pyodideWorker && !workerUnavailable) {
    void callPyodideWorker({ type: 'syncPackages', action: 'restore' }).catch(() => {});
  }

  if (typeof window !== 'undefined' && window.pyodideInstance) {
    sitePackagesRestored = true;
    if (decodedBundles.length > 0) {
      writeCachedPackagesToPyodideFS(window.pyodideInstance, {
        bundles: decodedBundles,
        legacyFiles: [],
      });
    }
  } else {
    sitePackagesRestored = false;
  }

  return {
    restoredPackages: normalizedList.length,
    restoredBundles: decodedBundles.length,
  };
}

// --- Core One-Time Pyodide Boot & Runtime Setup ---

const CORE_BOOTSTRAP_SCRIPT = `
import sys
import io
import os
import builtins
import json
import ast
import time
from collections import deque

class _PydroidWaitingInput(BaseException):
    """Raised to yield execution back to JS runtime when input queue is empty"""
    def __init__(self, prompt=""):
        self.prompt = prompt
        super().__init__(prompt)

_pydroid_input_queue = deque()
_pydroid_stderr_buffer = deque(maxlen=200)
_pydroid_last_prompt = ""
_pydroid_is_waiting_input = False
_pydroid_echo_enabled = True
_pydroid_js_stdout_cb = None
_pydroid_js_stderr_cb = None
_pydroid_code_cache = {}
_pydroid_monotonic = time.monotonic

class _PydroidTTYStream:
    encoding = 'utf-8'
    errors = 'replace'

    def __init__(self, stream_type='stdout'):
        self.stream_type = stream_type
        self._is_stdout = (stream_type == 'stdout')
        self._pending = []
        self._pending_len = 0
        self._pending_count = 0
        self._last_flush = 0.0

    def _emit(self, text):
        if not text:
            return
        cb = _pydroid_js_stdout_cb if self._is_stdout else _pydroid_js_stderr_cb
        if cb is not None:
            try:
                cb(text)
            except Exception:
                pass

    def write(self, s):
        if s is None:
            return 0
        text = s if type(s) is str else str(s)
        n = len(text)
        if n == 0:
            return 0
        if not self._is_stdout:
            _pydroid_stderr_buffer.append(text)
        self._pending.append(text)
        self._pending_len += n
        self._pending_count += 1
        if self._pending_len >= 4096 or not self._is_stdout:
            self.flush()
        elif '\\n' in text or (self._pending_count & 31) == 0:
            now = _pydroid_monotonic()
            if (now - self._last_flush) >= 0.016:
                self.flush()
        return n

    def flush(self):
        if not self._pending:
            return
        joined = "".join(self._pending)
        self._pending.clear()
        self._pending_len = 0
        self._pending_count = 0
        self._last_flush = _pydroid_monotonic()
        self._emit(joined)

    def isatty(self):
        return True

    def readable(self):
        return False

    def writable(self):
        return True

    def seekable(self):
        return False

    def fileno(self):
        return 1 if self._is_stdout else 2

class _PydroidTTYStdin:
    encoding = 'utf-8'
    errors = 'replace'

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
        sys.stdout.flush()
        if _pydroid_input_queue:
            val = str(_pydroid_input_queue.popleft())
            if _pydroid_echo_enabled:
                sys.stdout.write(val + "\\n")
                sys.stdout.flush()
            return val + "\\n"

        _pydroid_is_waiting_input = True
        raise _PydroidWaitingInput(_pydroid_last_prompt or "")

    def read(self, size=-1):
        if size is None or size < 0:
            chunks = []
            while _pydroid_input_queue:
                chunks.append(self.readline())
            return "".join(chunks)
        res = self.readline()
        return res[:size] if len(res) > size else res

    def readlines(self, hint=-1):
        lines = []
        while _pydroid_input_queue:
            lines.append(self.readline())
        return lines

    def __iter__(self):
        return self

    def __next__(self):
        if _pydroid_input_queue:
            return self.readline()
        raise StopIteration

sys.stdout = _PydroidTTYStream('stdout')
sys.stderr = _PydroidTTYStream('stderr')
sys.stdin = _PydroidTTYStdin()

def _custom_input(prompt=""):
    global _pydroid_last_prompt, _pydroid_is_waiting_input
    p_str = "" if prompt is None else (prompt if type(prompt) is str else str(prompt))
    _pydroid_last_prompt = p_str
    if p_str:
        sys.stdout.write(p_str)
    sys.stdout.flush()

    if _pydroid_input_queue:
        val = str(_pydroid_input_queue.popleft())
        if _pydroid_echo_enabled:
            sys.stdout.write(val + "\\n")
            sys.stdout.flush()
        return val

    _pydroid_is_waiting_input = True
    raise _PydroidWaitingInput(_pydroid_last_prompt)

builtins.input = _custom_input

def _pydroid_prepare_io(inputs_json, stdout_cb, stderr_cb):
    global _pydroid_input_queue, _pydroid_last_prompt, _pydroid_is_waiting_input
    global _pydroid_js_stdout_cb, _pydroid_js_stderr_cb
    _pydroid_input_queue = deque(json.loads(inputs_json))
    _pydroid_stderr_buffer.clear()
    _pydroid_last_prompt = ""
    _pydroid_is_waiting_input = False
    _pydroid_js_stdout_cb = stdout_cb
    _pydroid_js_stderr_cb = stderr_cb
    sys.stdout._pending.clear()
    sys.stdout._pending_len = 0
    sys.stdout._pending_count = 0
    sys.stdout._last_flush = 0.0
    sys.stderr._pending.clear()
    sys.stderr._pending_len = 0
    sys.stderr._pending_count = 0
    sys.stderr._last_flush = 0.0

def _pydroid_flush_io():
    sys.stdout.flush()
    sys.stderr.flush()

def _pydroid_get_io_state():
    return json.dumps({
        "waiting": bool(_pydroid_is_waiting_input),
        "prompt": _pydroid_last_prompt or "",
        "stderrTail": "".join(_pydroid_stderr_buffer)
    })

_pydroid_run_counter = 0

def _pydroid_cleanup_after_run(force_gc=False):
    global _pydroid_run_counter
    _pydroid_run_counter += 1
    if 'matplotlib.pyplot' in sys.modules:
        try:
            import matplotlib.pyplot as plt
            plt.close('all')
        except Exception:
            pass
    if force_gc or (_pydroid_run_counter % 4 == 0) or ('numpy' in sys.modules) or ('pandas' in sys.modules):
        try:
            import gc
            gc.collect()
        except Exception:
            pass

def _pydroid_capture_plots():
    _captured_plots = []
    if 'matplotlib.pyplot' in sys.modules:
        try:
            import matplotlib.pyplot as plt
            import base64
            for fig_num in list(plt.get_fignums())[:6]:
                fig = plt.figure(fig_num)
                buf = io.BytesIO()
                fig.savefig(buf, format='png', bbox_inches='tight', dpi=120)
                buf.seek(0)
                _captured_plots.append(base64.b64encode(buf.read()).decode('utf-8'))
                buf.close()
                plt.close(fig)
            plt.close('all')
        except Exception:
            try:
                import matplotlib.pyplot as plt
                plt.close('all')
            except Exception:
                pass
    return _captured_plots

def _pydroid_run_sync(src, inputs_json, stdout_cb, stderr_cb, capture_plots):
    _pydroid_prepare_io(inputs_json, stdout_cb, stderr_cb)
    can_cache = len(src) <= 80000
    cached = _pydroid_code_cache.get(src) if can_cache else None
    if cached is None:
        try:
            code_obj = compile(src, 'main.py', 'exec')
        except SyntaxError as syn_err:
            err_msg = str(syn_err)
            if "'await' outside" in err_msg or "'async for' outside" in err_msg or "'async with' outside" in err_msg:
                if can_cache:
                    if len(_pydroid_code_cache) >= 12:
                        _pydroid_code_cache.pop(next(iter(_pydroid_code_cache)))
                    _pydroid_code_cache[src] = ("ASYNC", None)
                return json.dumps({"status": "need_async"})
            _pydroid_flush_io()
            import traceback
            tb = "".join(traceback.format_exception_only(type(syn_err), syn_err))
            return json.dumps({"status": "error", "error": tb})
        if can_cache:
            if len(_pydroid_code_cache) >= 12:
                _pydroid_code_cache.pop(next(iter(_pydroid_code_cache)))
            _pydroid_code_cache[src] = ("SYNC", code_obj)
    else:
        kind, code_obj = cached
        if kind == "ASYNC":
            return json.dumps({"status": "need_async"})

    ns = {"__name__": "__main__", "__file__": "main.py"}
    try:
        exec(code_obj, ns)
    except _PydroidWaitingInput as wait_exc:
        _pydroid_flush_io()
        _pydroid_cleanup_after_run(False)
        return json.dumps({
            "status": "waiting_input",
            "prompt": wait_exc.prompt or _pydroid_last_prompt or "input():"
        })
    except EOFError:
        _pydroid_flush_io()
        _pydroid_cleanup_after_run(False)
        return json.dumps({
            "status": "waiting_input",
            "prompt": _pydroid_last_prompt or "input():"
        })
    except BaseException as exc:
        _pydroid_flush_io()
        import traceback
        tb = "".join(traceback.format_exception(type(exc), exc, exc.__traceback__))
        _pydroid_cleanup_after_run(True)
        return json.dumps({"status": "error", "error": tb})
    finally:
        ns.clear()

    _pydroid_flush_io()
    plots = _pydroid_capture_plots() if capture_plots else []
    _pydroid_cleanup_after_run(bool(plots))
    return json.dumps({"status": "ok", "plots": plots})

def _pydroid_finish_async(capture_plots):
    _pydroid_flush_io()
    plots = _pydroid_capture_plots() if capture_plots else []
    _pydroid_cleanup_after_run(bool(plots))
    return json.dumps(plots)

def _pydroid_transform_sleep(src):
    try:
        tree = ast.parse(src)
        has_asyncio = False
        has_sleep_calls = False
        for node in tree.body:
            if isinstance(node, ast.Import):
                for alias in node.names:
                    if alias.name == 'asyncio':
                        has_asyncio = True

        class _SleepToAwait(ast.NodeTransformer):
            def __init__(self):
                self.in_sync_func = False
            def visit_FunctionDef(self, node):
                old = self.in_sync_func
                self.in_sync_func = True
                self.generic_visit(node)
                self.in_sync_func = old
                return node
            def visit_AsyncFunctionDef(self, node):
                old = self.in_sync_func
                self.in_sync_func = True
                self.generic_visit(node)
                self.in_sync_func = old
                return node
            def visit_Call(self, node):
                nonlocal has_sleep_calls
                self.generic_visit(node)
                if self.in_sync_func:
                    return node
                is_sleep = False
                if isinstance(node.func, ast.Attribute) and isinstance(node.func.value, ast.Name) and node.func.value.id == 'time' and node.func.attr == 'sleep':
                    is_sleep = True
                elif isinstance(node.func, ast.Name) and node.func.id == 'sleep':
                    is_sleep = True
                if is_sleep:
                    has_sleep_calls = True
                    return ast.Await(
                        value=ast.Call(
                            func=ast.Attribute(
                                value=ast.Name(id='asyncio', ctx=ast.Load()),
                                attr='sleep',
                                ctx=ast.Load()
                            ),
                            args=node.args,
                            keywords=node.keywords
                        )
                    )
                return node

        new_tree = _SleepToAwait().visit(tree)
        if has_sleep_calls:
            if not has_asyncio:
                new_tree.body.insert(0, ast.Import(names=[ast.alias(name='asyncio', asname=None)]))
            ast.fix_missing_locations(new_tree)
            return ast.unparse(new_tree)
        return src
    except Exception:
        return src

# Pre-warm lightweight stdlib dependencies used in starter programs
for _mod_name in ("math", "random", "time", "datetime"):
    try:
        __import__(_mod_name)
    except Exception:
        pass
`;

export type PyodideStatus = 'unloaded' | 'loading' | 'ready' | 'running' | 'error';

export interface PyodideRunOptions {
  code: string;
  inputs?: string[];
  signal?: AbortSignal;
  onStdout?: (text: string) => void;
  onStderr?: (text: string) => void;
  onStatus?: (message: string) => void;
  onInputPrompt?: (promptText: string) => Promise<string>;
}

async function ensureMicropipLoaded(pyodide: any, onProgress?: (msg: string) => void) {
  if (micropipLoaded) return;
  onProgress?.('Đang nạp trình cài đặt micropip...');
  await pyodide.loadPackage('micropip');
  micropipLoaded = true;
}

async function loadPyodideScript(): Promise<void> {
  if (window.loadPyodide) return;

  // Prefer IndexedDB-cached pyodide.js via Blob script for fast offline startup on APK
  try {
    const asset = await fetchAndCachePyodideAsset(PYODIDE_SCRIPT_URL);
    if (asset && asset.data.byteLength > 0) {
      const blobUrl = URL.createObjectURL(
        new Blob([asset.data], { type: 'application/javascript' })
      );
      try {
        await new Promise<void>((resolve, reject) => {
          const script = document.createElement('script');
          script.src = blobUrl;
          script.async = true;
          script.setAttribute('data-pydroid-pyodide', 'true');
          script.onload = () => resolve();
          script.onerror = () => reject(new Error('Blob script load failed'));
          document.head.appendChild(script);
        });
        if (window.loadPyodide) return;
      } finally {
        URL.revokeObjectURL(blobUrl);
      }
    }
  } catch {
    // Fall back to direct CDN <script> tag below
  }

  await new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      'script[data-pydroid-pyodide="true"]:not([src^="blob:"])'
    );
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener(
        'error',
        () => reject(new Error('Không thể tải Pyodide từ CDN. Vui lòng kiểm tra kết nối mạng.')),
        { once: true }
      );
      return;
    }
    const script = document.createElement('script');
    script.src = PYODIDE_SCRIPT_URL;
    script.async = true;
    script.setAttribute('data-pydroid-pyodide', 'true');
    script.onload = () => resolve();
    script.onerror = () =>
      reject(new Error('Không thể tải Pyodide từ CDN. Vui lòng kiểm tra kết nối mạng.'));
    document.head.appendChild(script);
  });
}

// Silently pre-cache core Pyodide CDN assets into IndexedDB during idle time
// (especially helpful when CPython is primary so switching to Pyodide is instant)
export function precachePyodideCoreAssets(): void {
  if (typeof window === 'undefined' || coreAssetsPrecached) return;
  coreAssetsPrecached = true;
  installPyodideFetchCache();

  const coreUrls = [
    PYODIDE_SCRIPT_URL,
    `${PYODIDE_CDN_BASE}pyodide.mjs`,
    `${PYODIDE_CDN_BASE}pyodide-lock.json`,
    `${PYODIDE_CDN_BASE}pyodide.asm.js`,
    `${PYODIDE_CDN_BASE}python_stdlib.zip`,
    `${PYODIDE_CDN_BASE}pyodide.asm.wasm`,
  ];

  const runPrefetch = async () => {
    for (const url of coreUrls) {
      try {
        await fetchAndCachePyodideAsset(url);
        // Yield briefly between core assets so WebView GC reclaims ArrayBuffers without spikes
        await new Promise((resolve) => setTimeout(resolve, 80));
      } catch {
        // Best-effort idle pre-cache
      }
    }
  };

  if (typeof (window as any).requestIdleCallback === 'function') {
    (window as any).requestIdleCallback(() => void runPrefetch(), { timeout: 2500 });
  } else {
    setTimeout(() => void runPrefetch(), 600);
  }
}

export async function getPyodideInstance(onProgress?: (message: string) => void): Promise<any> {
  installPyodideFetchCache();

  if (window.pyodideInstance) {
    if (!sitePackagesRestored) {
      await restoreCachedSitePackages(window.pyodideInstance);
    }
    setPyodideWarmState('ready');
    return window.pyodideInstance;
  }

  if (pyodideLoadingPromise) {
    return pyodideLoadingPromise;
  }

  setPyodideWarmState('warming');
  pyodideLoadingPromise = (async () => {
    try {
      // Read IndexedDB package bundles IN PARALLEL while Pyodide script & WASM initialize
      const preloadedBundlesPromise = preloadCachedPackagesFromIDB();

      onProgress?.('Đang nạp nhân Python 3.12 WebAssembly...');
      await loadPyodideScript();

      onProgress?.('Khởi tạo môi trường Python 3.12...');
      const pyodide = await window.loadPyodide!({
        indexURL: PYODIDE_CDN_BASE,
      });

      // Restore cached site-packages before running user imports
      await restoreCachedSitePackages(pyodide, preloadedBundlesPromise);

      if (!runtimeBootstrapped) {
        await pyodide.runPythonAsync(CORE_BOOTSTRAP_SCRIPT);
        cachedMainPyFns = {
          runSync: pyodide.globals.get('_pydroid_run_sync'),
          prepareAsync: pyodide.globals.get('_pydroid_prepare_io'),
          finishAsync: pyodide.globals.get('_pydroid_finish_async'),
          transformSleep: pyodide.globals.get('_pydroid_transform_sleep'),
          flushIo: pyodide.globals.get('_pydroid_flush_io'),
          getIoState: pyodide.globals.get('_pydroid_get_io_state'),
        };
        runtimeBootstrapped = true;
      }

      window.pyodideInstance = pyodide;
      coreAssetsPrecached = true;
      setPyodideWarmState('ready');

      return pyodide;
    } catch (err) {
      pyodideLoadingPromise = null;
      setPyodideWarmState('error');
      throw err;
    }
  })();

  return pyodideLoadingPromise;
}

// Pre-cache any packages/dependencies referenced in default_main_py or the active editor code
export async function prewarmCodeDependencies(code: string): Promise<void> {
  if (typeof window === 'undefined' || !code || !code.trim()) return;
  const sig = extractImportSignature(code);
  if (!sig || sig === lastPrewarmedImportSignature) return;
  lastPrewarmedImportSignature = sig;

  if (!workerUnavailable) {
    try {
      await callPyodideWorker({
        type: 'prewarmDeps',
        code,
        savedPackages: getSavedPkgSnapshot(),
      });
      return;
    } catch {
      // fall through to main thread if worker errored
    }
  }
  try {
    const pyodide = await getPyodideInstance();
    await ensureCodePackagesReady(pyodide, code);
  } catch {
    // Silent background pre-caching; errors surface only on explicit RUN
  }
}

// Silently warm up Pyodide + common dependencies in background so first RUN feels instantaneous
export function prewarmPyodide(initialCode?: string): void {
  if (typeof window === 'undefined') return;
  installPyodideFetchCache();

  if (!workerUnavailable) {
    if (getPyodideWarmState() === 'ready') {
      if (initialCode) void prewarmCodeDependencies(initialCode);
      return;
    }
    if (getPyodideWarmState() === 'warming') {
      return;
    }
    setPyodideWarmState('warming');
    void callPyodideWorker({
      type: 'init',
      initialCode: initialCode || '',
      savedPackages: getSavedPkgSnapshot(),
    })
      .then((res: any) => {
        if (res?.ok) {
          setPyodideWarmState('ready');
        } else {
          workerUnavailable = true;
          terminatePyodideWorker(new Error(res?.error || 'Worker init failed'));
          prewarmPyodide(initialCode);
        }
      })
      .catch(() => {
        workerUnavailable = true;
        terminatePyodideWorker(new Error('Worker init failed'));
        prewarmPyodide(initialCode);
      });
    return;
  }

  if (window.pyodideInstance && runtimeBootstrapped) {
    setPyodideWarmState('ready');
    if (initialCode) {
      void prewarmCodeDependencies(initialCode);
    }
    return;
  }

  if (pyodideLoadingPromise) {
    if (initialCode) {
      void pyodideLoadingPromise.then(() => prewarmCodeDependencies(initialCode)).catch(() => {});
    }
    return;
  }

  void getPyodideInstance()
    .then((pyodide) => {
      if (initialCode) {
        return ensureCodePackagesReady(pyodide, initialCode);
      }
      return undefined;
    })
    .catch(() => {
      // Silent background warmup; errors surface when user explicitly runs code
    });
}

function isPyodidePackageLoaded(pyodide: any, pkgName: string): boolean {
  try {
    const loaded = pyodide.loadedPackages || {};
    return !!loaded[pkgName] || !!loaded[pkgName.toLowerCase()];
  } catch {
    return false;
  }
}

export async function installPyodidePackage(
  packageName: string,
  onProgress?: (msg: string) => void
): Promise<boolean> {
  const trimmed = packageName.trim();
  const normalized = normalizePackageName(trimmed);
  if (!normalized) {
    throw new Error('Tên thư viện không hợp lệ.');
  }

  verifiedImportableModules.clear();
  verifiedImportSignatureCache.clear();
  lastPrewarmedImportSignature = '';

  if (!workerUnavailable) {
    try {
      const res = await callPyodideWorker<any>(
        {
          type: 'installPackage',
          packageName: trimmed,
          savedPackages: getSavedPkgSnapshot(),
        },
        { onStatus: onProgress }
      );
      if (res?.ok) {
        saveUserPipPackage(normalized, res.source === 'pyodide' ? 'pyodide' : 'micropip');
        return true;
      }
      if (!workerUnavailable) {
        throw new Error(res?.error || `Không thể cài đặt ${trimmed}`);
      }
    } catch (err: any) {
      if (!workerUnavailable) {
        throw new Error(`Không thể cài đặt ${trimmed}: ${err?.message || err}`);
      }
    }
  }

  const pyodide = await getPyodideInstance(onProgress);
  onProgress?.(`Đang tải và cài đặt ${trimmed}...`);

  try {
    if (PYODIDE_PREBUILT_PACKAGES.has(normalized)) {
      await pyodide.loadPackage(normalized);
      saveUserPipPackage(normalized, 'pyodide');
      return true;
    }

    // Try built-in Pyodide package first in case it's in Pyodide repodata
    try {
      await pyodide.loadPackage(normalized);
      saveUserPipPackage(normalized, 'pyodide');
      return true;
    } catch {
      // Fall back to micropip + store newly added site-packages as 1 compressed bundle record in IndexedDB
      await ensureMicropipLoaded(pyodide, onProgress);
      const siteDir = getSitePackagesRoot(pyodide);
      const FS = pyodide.FS;
      const beforeFiles = new Set<string>();
      collectFilesRecursive(FS, siteDir, beforeFiles);

      const micropip = pyodide.pyimport('micropip');
      await micropip.install(trimmed);

      const afterFiles = new Set<string>();
      collectFilesRecursive(FS, siteDir, afterFiles);

      const addedEntries: CachedFileEntry[] = [];
      for (const filePath of afterFiles) {
        if (!beforeFiles.has(filePath)) {
          try {
            const bytes: Uint8Array = FS.readFile(filePath, { encoding: 'binary' });
            addedEntries.push({
              path: filePath,
              data: new Uint8Array(bytes),
            });
          } catch {
            // ignore unreadable file
          }
        }
      }

      if (addedEntries.length > 0) {
        onProgress?.(`Đang lưu gói ${normalized} vào bộ nhớ đệm IndexedDB...`);
        await savePackageBundleToIDB(normalized, addedEntries).catch(() => {});
      }

      saveUserPipPackage(normalized, 'micropip');
      return true;
    }
  } catch (err: any) {
    console.error(`Lỗi cài đặt ${trimmed}:`, err);
    throw new Error(`Không thể cài đặt ${trimmed}: ${err?.message || err}`);
  }
}

// Scan Python imports in code and ensure required prebuilt / persisted packages are loaded
async function ensureCodePackagesReady(
  pyodide: any,
  code: string,
  onStatus?: (msg: string) => void
): Promise<void> {
  if (!code.includes('import')) return;

  const importedModules = new Set<string>();
  const importRegex = /^\s*(?:import|from)\s+([a-zA-Z0-9_]+)/gm;
  let match: RegExpExecArray | null;
  while ((match = importRegex.exec(code)) !== null) {
    if (match[1]) importedModules.add(match[1]);
  }

  if (importedModules.size === 0) return;

  const savedEntries = getSavedUserPipPackages();
  const sortedMods = Array.from(importedModules).sort();
  const sigKey = `${sortedMods.join(',')}|${savedEntries.length}`;
  if (verifiedImportSignatureCache.has(sigKey)) {
    const cachedPkgs = verifiedImportSignatureCache.get(sigKey)!;
    if (cachedPkgs.every((pkg) => isPyodidePackageLoaded(pyodide, pkg))) {
      return;
    }
  }

  const savedMap = new Map(savedEntries.map((e) => [e.name, e]));

  const packagesToLoad = new Set<string>();
  const modsNeedingSpecCheck: Array<{ mod: string; pkgName: string }> = [];

  for (const mod of importedModules) {
    const mapped = IMPORT_TO_PACKAGE_MAP[mod] || IMPORT_TO_PACKAGE_MAP[mod.toLowerCase()];
    if (mapped && PYODIDE_PREBUILT_PACKAGES.has(mapped) && !isPyodidePackageLoaded(pyodide, mapped)) {
      packagesToLoad.add(mapped);
      continue;
    }

    const modLower = mod.toLowerCase();
    const modDash = modLower.replace(/_/g, '-');
    const saved =
      savedMap.get(modLower) || savedMap.get(modDash) || (mapped ? savedMap.get(mapped) : undefined);

    if (saved && !isPyodidePackageLoaded(pyodide, saved.name) && !verifiedImportableModules.has(mod)) {
      modsNeedingSpecCheck.push({ mod, pkgName: saved.name });
    }
  }

  // Batched single JS->WASM find_spec check for all unknown imported modules
  if (modsNeedingSpecCheck.length > 0) {
    try {
      const modNames = modsNeedingSpecCheck.map((m) => m.mod);
      const missingJson = pyodide.runPython(
        `import importlib.util, json; json.dumps([m for m in ${JSON.stringify(modNames)} if importlib.util.find_spec(m) is None])`
      );
      const missingSet = new Set<string>(JSON.parse(missingJson));
      for (const item of modsNeedingSpecCheck) {
        if (missingSet.has(item.mod)) {
          packagesToLoad.add(item.pkgName);
        } else {
          verifiedImportableModules.add(item.mod);
        }
      }
    } catch {
      for (const item of modsNeedingSpecCheck) {
        packagesToLoad.add(item.pkgName);
      }
    }
  }

  if (packagesToLoad.size === 0) {
    if (verifiedImportSignatureCache.size >= MAX_LOCAL_CACHE_ENTRIES) {
      const firstKey = verifiedImportSignatureCache.keys().next().value;
      if (firstKey) verifiedImportSignatureCache.delete(firstKey);
    }
    verifiedImportSignatureCache.set(
      sigKey,
      sortedMods
        .map((m) => IMPORT_TO_PACKAGE_MAP[m] || IMPORT_TO_PACKAGE_MAP[m.toLowerCase()] || '')
        .filter(Boolean)
    );
    return;
  }

  const prebuiltBatch: string[] = [];
  const customList: string[] = [];

  for (const pkg of packagesToLoad) {
    if (PYODIDE_PREBUILT_PACKAGES.has(pkg)) {
      prebuiltBatch.push(pkg);
    } else {
      customList.push(pkg);
    }
  }

  if (prebuiltBatch.length > 0) {
    onStatus?.(`Đang nạp ${prebuiltBatch.join(', ')} từ bộ nhớ đệm...`);
    try {
      await pyodide.loadPackage(prebuiltBatch);
    } catch (err) {
      console.warn('Batch prebuilt load skipped:', err);
    }
  }

  for (const pkg of customList) {
    onStatus?.(`Đang nạp thư viện ${pkg}...`);
    try {
      await installPyodidePackage(pkg, onStatus);
    } catch (err) {
      console.warn(`Auto-load skipped for ${pkg}:`, err);
    }
  }
}

export async function checkPythonSyntaxWithPyodide(code: string): Promise<{
  checked: boolean;
  error?: string;
}> {
  if (!workerUnavailable && pyodideWorker && getPyodideWarmState() === 'ready') {
    try {
      const res = await callPyodideWorker<any>({ type: 'checkSyntax', code });
      if (res?.supported) {
        return res.ok ? { checked: true } : { checked: true, error: res.error };
      }
    } catch {}
  }

  const pyodide = typeof window !== 'undefined' ? window.pyodideInstance : undefined;
  if (pyodide) {
    try {
      pyodide.globals.set('__apk_syntax_check', code);
      pyodide.runPython(`
import ast
try:
    ast.parse(__apk_syntax_check)
finally:
    del __apk_syntax_check
`);
      return { checked: true };
    } catch (err: any) {
      return { checked: true, error: String(err?.message || err || '') };
    }
  }

  return { checked: false };
}

export interface PyodideMemorySnapshot {
  timestamp: number;
  warmState: PyodideWarmState;
  runtimeMode: 'worker' | 'main-thread' | 'unloaded';
  workerBusy: boolean;
  execCount: number;
  wasmHeapBytes: number;
  pythonModulesCount: number;
  pythonCodeCacheCount: number;
  matplotlibFiguresCount: number;
  gcTrackedCount: number;
  loadedPackages: string[];
  ramAssetCacheBytes: number;
  ramAssetCacheCount: number;
  localJsCacheEntries: number;
  jsHeapUsedBytes: number | null;
  jsHeapTotalBytes: number | null;
  jsHeapLimitBytes: number | null;
  idbCdnAssetsBytes: number;
  idbCdnAssetsCount: number;
  idbCdnBudgetBytes: number;
  idbPackageBundlesBytes: number;
  idbPackageBundlesCount: number;
  storageUsageBytes: number | null;
  storageQuotaBytes: number | null;
  terminalBufferBytes: number;
  terminalPlotCount: number;
}

export interface RamHistorySample {
  timestamp: number;
  wasmHeapMb: number;
  jsHeapMb: number | null;
  terminalMb: number;
  idbCdnMb: number;
  event?: 'cleanup-light' | 'cleanup-deep';
}

const MAX_RAM_HISTORY_SAMPLES = 28;
const ramHistorySamples: RamHistorySample[] = [];
let cachedIdbScan: {
  scannedAt: number;
  cdnAssetsBytes: number;
  cdnAssetsCount: number;
  packageBundlesBytes: number;
  packageBundlesCount: number;
} | null = null;

export function getRamHistorySamples(): RamHistorySample[] {
  return [...ramHistorySamples];
}

export function clearRamHistorySamples(): void {
  ramHistorySamples.length = 0;
}

async function callPyodideWorkerWithTimeout<T = any>(
  payload: Record<string, any>,
  timeoutMs = 750
): Promise<T | null> {
  if (!pyodideWorker || workerUnavailable) return null;
  try {
    return await Promise.race([
      callPyodideWorker<T>(payload),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
    ]);
  } catch {
    return null;
  }
}

async function scanIdbStorageStats(forceScan = false): Promise<{
  cdnAssetsBytes: number;
  cdnAssetsCount: number;
  packageBundlesBytes: number;
  packageBundlesCount: number;
}> {
  if (!forceScan && cachedIdbScan && Date.now() - cachedIdbScan.scannedAt < 10000) {
    return {
      cdnAssetsBytes: cachedIdbScan.cdnAssetsBytes,
      cdnAssetsCount: cachedIdbScan.cdnAssetsCount,
      packageBundlesBytes: cachedIdbScan.packageBundlesBytes,
      packageBundlesCount: cachedIdbScan.packageBundlesCount,
    };
  }

  let cdnAssetsBytes = 0;
  let cdnAssetsCount = 0;
  let packageBundlesBytes = 0;
  let packageBundlesCount = 0;

  try {
    const db = await getPipDB();
    const storeNames: string[] = [];
    if (db.objectStoreNames.contains(IDB_ASSETS_STORE)) storeNames.push(IDB_ASSETS_STORE);
    if (db.objectStoreNames.contains(IDB_BUNDLES_STORE)) storeNames.push(IDB_BUNDLES_STORE);

    if (storeNames.length > 0) {
      await new Promise<void>((resolve) => {
        const tx = db.transaction(storeNames, 'readonly');

        if (db.objectStoreNames.contains(IDB_ASSETS_STORE)) {
          const assetCursor = tx.objectStore(IDB_ASSETS_STORE).openCursor();
          assetCursor.onsuccess = () => {
            const cursor = assetCursor.result;
            if (!cursor) return;
            const val = cursor.value as CachedCdnAsset;
            cdnAssetsCount++;
            cdnAssetsBytes += val?.size || val?.data?.byteLength || 0;
            cursor.continue();
          };
        }

        if (db.objectStoreNames.contains(IDB_BUNDLES_STORE)) {
          const bundleCursor = tx.objectStore(IDB_BUNDLES_STORE).openCursor();
          bundleCursor.onsuccess = () => {
            const cursor = bundleCursor.result;
            if (!cursor) return;
            const val = cursor.value as CachedPackageBundle;
            packageBundlesCount++;
            packageBundlesBytes += val?.totalBytes || 0;
            cursor.continue();
          };
        }

        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      });
    }
  } catch {}

  cachedIdbScan = {
    scannedAt: Date.now(),
    cdnAssetsBytes,
    cdnAssetsCount,
    packageBundlesBytes,
    packageBundlesCount,
  };

  return {
    cdnAssetsBytes,
    cdnAssetsCount,
    packageBundlesBytes,
    packageBundlesCount,
  };
}

function collectMainThreadPyodideStats(): {
  initialized: boolean;
  wasmHeapBytes: number;
  loadedPackages: string[];
  pythonModulesCount: number;
  pythonCodeCacheCount: number;
  matplotlibFiguresCount: number;
  gcTrackedCount: number;
  ramAssetCacheBytes: number;
  ramAssetCacheCount: number;
  localJsCacheEntries: number;
  execCount: number;
} {
  const py = typeof window !== 'undefined' ? window.pyodideInstance : undefined;
  let wasmHeapBytes = 0;
  let loadedPackages: string[] = [];
  let pythonModulesCount = 0;
  let pythonCodeCacheCount = 0;
  let matplotlibFiguresCount = 0;
  let gcTrackedCount = 0;

  if (py) {
    try {
      const mod = py._module;
      wasmHeapBytes =
        mod?.HEAPU8?.byteLength ||
        mod?.HEAP8?.byteLength ||
        mod?.wasmMemory?.buffer?.byteLength ||
        0;
    } catch {}

    try {
      if (py.loadedPackages && typeof py.loadedPackages === 'object') {
        loadedPackages = Object.keys(py.loadedPackages);
      }
    } catch {}

    if (runtimeBootstrapped) {
      try {
        const statsJson: string = py.runPython(
          `(lambda _sys, _gc, _json: _json.dumps({"modules": len(_sys.modules), "codeCache": len(_pydroid_code_cache), "figures": len(_sys.modules['matplotlib.pyplot'].get_fignums()) if 'matplotlib.pyplot' in _sys.modules else 0, "gcObjects": sum(_gc.get_count())}))(__import__('sys'), __import__('gc'), __import__('json'))`
        );
        const parsed = JSON.parse(statsJson);
        pythonModulesCount = Number(parsed?.modules) || 0;
        pythonCodeCacheCount = Number(parsed?.codeCache) || 0;
        matplotlibFiguresCount = Number(parsed?.figures) || 0;
        gcTrackedCount = Number(parsed?.gcObjects) || 0;
      } catch {}
    }
  }

  return {
    initialized: !!py,
    wasmHeapBytes,
    loadedPackages,
    pythonModulesCount,
    pythonCodeCacheCount,
    matplotlibFiguresCount,
    gcTrackedCount,
    ramAssetCacheBytes: memoryAssetCacheBytes,
    ramAssetCacheCount: memoryAssetCache.size,
    localJsCacheEntries:
      verifiedImportableModules.size +
      verifiedImportSignatureCache.size +
      sleepTransformCache.size,
    execCount: workerRunCount,
  };
}

export async function getPyodideMemoryDiagnostics(
  options: {
    terminalBufferBytes?: number;
    terminalPlotCount?: number;
    forceIdbScan?: boolean;
    recordSample?: boolean;
    event?: 'cleanup-light' | 'cleanup-deep';
  } = {}
): Promise<PyodideMemorySnapshot> {
  const workerBusy = workerPendingRequests.size > 0;
  let runtimeMode: 'worker' | 'main-thread' | 'unloaded' = 'unloaded';
  let stats = collectMainThreadPyodideStats();

  if (typeof window !== 'undefined' && window.pyodideInstance) {
    runtimeMode = 'main-thread';
  } else if (pyodideWorker && !workerUnavailable) {
    if (!workerBusy) {
      const res = await callPyodideWorkerWithTimeout<any>({ type: 'getMemoryDiagnostics' }, 750);
      if (res?.diagnostics) {
        lastWorkerDiagnosticsCache = res.diagnostics;
      }
    }
    if (lastWorkerDiagnosticsCache?.initialized) {
      runtimeMode = 'worker';
      stats = {
        ...lastWorkerDiagnosticsCache,
        ramAssetCacheBytes: lastWorkerDiagnosticsCache.ramAssetCacheBytes + memoryAssetCacheBytes,
        ramAssetCacheCount: lastWorkerDiagnosticsCache.ramAssetCacheCount + memoryAssetCache.size,
      };
    } else if (lastWorkerDiagnosticsCache) {
      stats = {
        ...lastWorkerDiagnosticsCache,
        ramAssetCacheBytes: lastWorkerDiagnosticsCache.ramAssetCacheBytes + memoryAssetCacheBytes,
        ramAssetCacheCount: lastWorkerDiagnosticsCache.ramAssetCacheCount + memoryAssetCache.size,
      };
    }
  }

  const perfMem =
    typeof performance !== 'undefined' ? (performance as any).memory : undefined;
  const jsHeapUsedBytes =
    typeof perfMem?.usedJSHeapSize === 'number' ? perfMem.usedJSHeapSize : null;
  const jsHeapTotalBytes =
    typeof perfMem?.totalJSHeapSize === 'number' ? perfMem.totalJSHeapSize : null;
  const jsHeapLimitBytes =
    typeof perfMem?.jsHeapSizeLimit === 'number' ? perfMem.jsHeapSizeLimit : null;

  let storageUsageBytes: number | null = null;
  let storageQuotaBytes: number | null = null;
  if (typeof navigator !== 'undefined' && navigator.storage?.estimate) {
    try {
      const est = await navigator.storage.estimate();
      if (typeof est.usage === 'number') storageUsageBytes = est.usage;
      if (typeof est.quota === 'number') storageQuotaBytes = est.quota;
    } catch {}
  }

  const idbStats = await scanIdbStorageStats(Boolean(options.forceIdbScan));
  const terminalBufferBytes = Math.max(0, options.terminalBufferBytes || 0);
  const terminalPlotCount = Math.max(0, options.terminalPlotCount || 0);

  const snapshot: PyodideMemorySnapshot = {
    timestamp: Date.now(),
    warmState: getPyodideWarmState(),
    runtimeMode,
    workerBusy,
    execCount: stats.execCount || workerRunCount,
    wasmHeapBytes: stats.wasmHeapBytes,
    pythonModulesCount: stats.pythonModulesCount,
    pythonCodeCacheCount: stats.pythonCodeCacheCount,
    matplotlibFiguresCount: stats.matplotlibFiguresCount,
    gcTrackedCount: stats.gcTrackedCount,
    loadedPackages: stats.loadedPackages,
    ramAssetCacheBytes: stats.ramAssetCacheBytes,
    ramAssetCacheCount: stats.ramAssetCacheCount,
    localJsCacheEntries: stats.localJsCacheEntries,
    jsHeapUsedBytes,
    jsHeapTotalBytes,
    jsHeapLimitBytes,
    idbCdnAssetsBytes: idbStats.cdnAssetsBytes,
    idbCdnAssetsCount: idbStats.cdnAssetsCount,
    idbCdnBudgetBytes: MAX_CDN_CACHE_BYTES,
    idbPackageBundlesBytes: idbStats.packageBundlesBytes,
    idbPackageBundlesCount: idbStats.packageBundlesCount,
    storageUsageBytes,
    storageQuotaBytes,
    terminalBufferBytes,
    terminalPlotCount,
  };

  if (options.recordSample !== false) {
    const toMb = (b: number) => Math.round((b / (1024 * 1024)) * 100) / 100;
    ramHistorySamples.push({
      timestamp: snapshot.timestamp,
      wasmHeapMb: toMb(snapshot.wasmHeapBytes),
      jsHeapMb: snapshot.jsHeapUsedBytes !== null ? toMb(snapshot.jsHeapUsedBytes) : null,
      terminalMb: toMb(snapshot.terminalBufferBytes),
      idbCdnMb: toMb(snapshot.idbCdnAssetsBytes),
      event: options.event,
    });
    if (ramHistorySamples.length > MAX_RAM_HISTORY_SAMPLES) {
      ramHistorySamples.splice(0, ramHistorySamples.length - MAX_RAM_HISTORY_SAMPLES);
    }
  }

  return snapshot;
}

export async function trimPyodideMemory(
  options: { recycleIdleWorker?: boolean; forceRecycle?: boolean } = {}
): Promise<{ recycled: boolean }> {
  clearMemoryAssetCache();
  verifiedImportableModules.clear();
  verifiedImportSignatureCache.clear();
  sleepTransformCache.clear();
  lastPrewarmedImportSignature = '';

  const workerBusy = workerPendingRequests.size > 0;
  const shouldRecycleWorker =
    !workerBusy &&
    !!pyodideWorker &&
    (options.forceRecycle ||
      (options.recycleIdleWorker && (workerRunCount >= 12 || workerHeavyRun)));

  if (shouldRecycleWorker) {
    terminatePyodideWorker(new Error('Worker recycled to free WASM memory'));
    return { recycled: true };
  }

  if (pyodideWorker && !workerUnavailable && !workerBusy) {
    try {
      const res = await callPyodideWorkerWithTimeout<any>({ type: 'trimMemory' }, 1200);
      if (res?.diagnostics) {
        lastWorkerDiagnosticsCache = res.diagnostics;
      }
    } catch {}
  }

  if (typeof window !== 'undefined' && window.pyodideInstance && runtimeBootstrapped) {
    try {
      window.pyodideInstance.runPython(
        '_pydroid_code_cache.clear()\n_pydroid_cleanup_after_run(True)'
      );
    } catch {}
  }

  return { recycled: false };
}

export async function prunePyodideTransientCache(clearAllCdnAssets = false): Promise<void> {
  clearMemoryAssetCache();
  cachedIdbScan = null;
  lastIdbBudgetCheckAt = Date.now();
  try {
    const db = await getPipDB();
    if (!db.objectStoreNames.contains(IDB_ASSETS_STORE)) return;
    if (clearAllCdnAssets) {
      await new Promise<void>((resolve) => {
        const tx = db.transaction(IDB_ASSETS_STORE, 'readwrite');
        tx.objectStore(IDB_ASSETS_STORE).clear();
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      });
    } else {
      await enforceCdnCacheBudget(db);
    }
  } catch {}
}

export async function runPeriodicPyodideMaintenance(
  options: { isPythonRunning?: boolean } = {}
): Promise<{ action: 'none' | 'trimmed' | 'recycled' }> {
  const now = Date.now();

  if (now - lastIdbBudgetCheckAt >= 120_000) {
    void prunePyodideTransientCache(false);
  }

  if (options.isPythonRunning || workerPendingRequests.size > 0) {
    return { action: 'none' };
  }

  const idleMs = lastWorkerRunEndedAt > 0 ? now - lastWorkerRunEndedAt : Number.MAX_SAFE_INTEGER;
  const wasmThresholdBytes = IS_MOBILE_RUNTIME ? 110 * 1024 * 1024 : 220 * 1024 * 1024;
  const perfMem = typeof performance !== 'undefined' ? (performance as any).memory : undefined;
  const jsHeapRatio =
    typeof perfMem?.usedJSHeapSize === 'number' &&
    typeof perfMem?.jsHeapSizeLimit === 'number' &&
    perfMem.jsHeapSizeLimit > 0
      ? perfMem.usedJSHeapSize / perfMem.jsHeapSizeLimit
      : 0;

  const hasLoadedWorker = !!pyodideWorker && getPyodideWarmState() === 'ready';
  const shouldRecycle =
    hasLoadedWorker &&
    idleMs >= 45_000 &&
    (lastKnownWasmHeapBytes >= wasmThresholdBytes ||
      jsHeapRatio >= 0.72 ||
      workerRunCount >= 10 ||
      (workerHeavyRun && idleMs >= 60_000));

  if (shouldRecycle) {
    await trimPyodideMemory({ forceRecycle: true });
    return { action: 'recycled' };
  }

  if (
    idleMs >= 20_000 &&
    (hasLoadedWorker ||
      (typeof window !== 'undefined' && !!window.pyodideInstance && runtimeBootstrapped) ||
      memoryAssetCacheBytes > 0)
  ) {
    await trimPyodideMemory({ recycleIdleWorker: false, forceRecycle: false });
    return { action: 'trimmed' };
  }

  return { action: 'none' };
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
  const { code, inputs = [], signal, onStdout, onStderr, onStatus } = options;

  if (signal?.aborted) {
    throw new DOMException('Đã dừng thực thi.', 'AbortError');
  }

  const isHeavyScript =
    code.includes('matplotlib') ||
    code.includes('plt.') ||
    code.includes('numpy') ||
    code.includes('pandas') ||
    code.includes('scipy');

  // Prefer dedicated Web Worker for 60fps UI responsiveness & instant hard-cancel of infinite loops
  if (!workerUnavailable) {
    try {
      workerRunCount++;
      if (isHeavyScript) workerHeavyRun = true;
      const res = await callPyodideWorker<any>(
        {
          type: 'runCode',
          code,
          inputs,
          savedPackages: getSavedPkgSnapshot(),
        },
        { signal, onStdout, onStderr, onStatus }
      );
      if (res?.type === 'runResult' && res.workerBootFailed) {
        console.warn('Pyodide Worker boot failed, falling back to main thread:', res.error);
        workerUnavailable = true;
        terminatePyodideWorker(new Error(res.error || 'Worker boot failed'));
      } else if (res?.type === 'runResult' && res.result) {
        lastWorkerRunEndedAt = Date.now();
        if (typeof res.wasmHeapBytes === 'number' && res.wasmHeapBytes > 0) {
          lastKnownWasmHeapBytes = res.wasmHeapBytes;
        }
        if ((res.result.stdout?.length || 0) > 120000 || (res.result.plotImages?.length || 0) > 0) {
          workerHeavyRun = true;
        }
        return res.result;
      }
    } catch (err: any) {
      if (err?.name === 'AbortError' || signal?.aborted) {
        throw err;
      }
      // Only fall back to main thread if Worker itself became unavailable
      if (!workerUnavailable) {
        throw err;
      }
    }
  }

  const pyodide = await getPyodideInstance(onStatus);

  if (signal?.aborted) {
    throw new DOMException('Đã dừng thực thi.', 'AbortError');
  }

  if (!runtimeBootstrapped) {
    await pyodide.runPythonAsync(CORE_BOOTSTRAP_SCRIPT);
    cachedMainPyFns = {
      runSync: pyodide.globals.get('_pydroid_run_sync'),
      prepareAsync: pyodide.globals.get('_pydroid_prepare_io'),
      finishAsync: pyodide.globals.get('_pydroid_finish_async'),
      transformSleep: pyodide.globals.get('_pydroid_transform_sleep'),
      flushIo: pyodide.globals.get('_pydroid_flush_io'),
      getIoState: pyodide.globals.get('_pydroid_get_io_state'),
    };
    runtimeBootstrapped = true;
  }

  const normalizedInputs: string[] = [];
  for (const item of inputs) {
    if (typeof item === 'string') {
      const lines = item.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
      normalizedInputs.push(...lines);
    } else if (item !== undefined && item !== null) {
      normalizedInputs.push(String(item));
    }
  }
  const inputsJson = JSON.stringify(normalizedInputs);

  const MAX_FALLBACK_STDOUT_CHARS = 380000;
  const MAX_FALLBACK_STDERR_CHARS = 80000;
  const stdoutChunks: string[] = [];
  let stdoutCharsTotal = 0;
  const stderrChunks: string[] = [];
  let stderrCharsTotal = 0;
  let pendingStdout: string[] = [];
  let lastEmitTs = 0;

  const pushBoundedChunk = (
    chunks: string[],
    chunk: string,
    currentTotal: number,
    maxChars: number
  ): number => {
    chunks.push(chunk);
    let nextTotal = currentTotal + chunk.length;
    while (nextTotal > maxChars && chunks.length > 1) {
      const removed = chunks.shift()!;
      nextTotal -= removed.length;
    }
    return nextTotal;
  };

  const flushFallbackStdout = () => {
    if (pendingStdout.length === 0) return;
    const joined = pendingStdout.join('');
    pendingStdout = [];
    lastEmitTs = performance.now();
    onStdout?.(joined);
  };

  const handleStdoutChunk = (chunk: string) => {
    if (!chunk) return;
    stdoutCharsTotal = pushBoundedChunk(stdoutChunks, chunk, stdoutCharsTotal, MAX_FALLBACK_STDOUT_CHARS);
    pendingStdout.push(chunk);
    const now = performance.now();
    if (chunk.length >= 4096 || now - lastEmitTs >= 16) {
      flushFallbackStdout();
    }
  };

  const handleStderrChunk = (chunk: string) => {
    if (!chunk) return;
    stderrCharsTotal = pushBoundedChunk(stderrChunks, chunk, stderrCharsTotal, MAX_FALLBACK_STDERR_CHARS);
    onStderr?.(chunk);
  };

  const cleanTracebackLines = (rawErr: string): string => {
    const errLines = rawErr.split('\n');
    const filteredLines: string[] = [];
    let skippingInternal = false;
    for (const line of errLines) {
      if (
        line.includes('_pyodide') ||
        line.includes('eval_code_async') ||
        line.includes('CodeRunner') ||
        line.includes('_pydroid_run_sync')
      ) {
        skippingInternal = true;
        continue;
      }
      if (
        skippingInternal &&
        (line.trim().startsWith('await ') ||
          line.trim().startsWith('self.') ||
          line.trim().startsWith('mod = ') ||
          line.trim().startsWith('exec(code_obj') ||
          line.trim().startsWith('^^^^'))
      ) {
        continue;
      }
      skippingInternal = false;
      filteredLines.push(line.replace('File "<exec>"', 'File "main.py"'));
    }
    return filteredLines.join('\n').trim() || rawErr;
  };

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

  try {
    await ensureCodePackagesReady(pyodide, code, onStatus);

    if (signal?.aborted) {
      throw new DOMException('Đã dừng thực thi.', 'AbortError');
    }

    if (!matplotlibConfigured && (code.includes('matplotlib') || code.includes('plt'))) {
      try {
        await pyodide.runPythonAsync(`
try:
    import matplotlib
    matplotlib.use("module://matplotlib.backends.backend_agg")
    import matplotlib.pyplot as plt
    plt.show = lambda *args, **kwargs: None
except Exception:
    pass
`);
        matplotlibConfigured = true;
      } catch {}
    }

    let runnableCode = code;
    if (/\b(?:time\.)?sleep\s*\(/.test(code)) {
      const cachedTransformed = sleepTransformCache.get(code);
      if (cachedTransformed !== undefined) {
        runnableCode = cachedTransformed;
      } else if (cachedMainPyFns?.transformSleep) {
        try {
          const transformed = cachedMainPyFns.transformSleep(code);
          if (transformed && typeof transformed === 'string') {
            runnableCode = transformed;
            if (sleepTransformCache.size >= MAX_LOCAL_CACHE_ENTRIES) {
              const firstKey = sleepTransformCache.keys().next().value;
              if (firstKey) sleepTransformCache.delete(firstKey);
            }
            sleepTransformCache.set(code, transformed);
          }
        } catch {
          runnableCode = code;
        }
      }
    }

    const capturePlots = code.includes('matplotlib') || code.includes('plt.');

    // Fast Single-FFI Sync Execution Path (cached bytecode + zero JS exception overhead on input())
    if (cachedMainPyFns?.runSync) {
      const syncResJson: string = cachedMainPyFns.runSync(
        runnableCode,
        inputsJson,
        handleStdoutChunk,
        handleStderrChunk,
        capturePlots
      );
      const syncRes = JSON.parse(syncResJson);

      if (syncRes.status === 'ok') {
        flushFallbackStdout();
        return {
          stdout: stdoutChunks.join(''),
          stderr: stderrChunks.join(''),
          exitCode: 0,
          duration: Math.round(performance.now() - startTime),
          engine: `Pyodide ${PYODIDE_VERSION} (WASM TTY Emulated)`,
          plotImages: Array.isArray(syncRes.plots) ? syncRes.plots : [],
          isWaitingInput: false,
        };
      }

      if (syncRes.status === 'waiting_input') {
        flushFallbackStdout();
        return {
          stdout: stdoutChunks.join(''),
          stderr: '',
          exitCode: 0,
          duration: Math.round(performance.now() - startTime),
          engine: `Pyodide ${PYODIDE_VERSION} (WASM TTY Emulated)`,
          plotImages: [],
          isWaitingInput: true,
          prompt: syncRes.prompt || 'input():',
        };
      }

      if (syncRes.status === 'error') {
        flushFallbackStdout();
        const cleanErr = cleanTracebackLines(String(syncRes.error || ''));
        onStderr?.(cleanErr);
        stderrChunks.push(cleanErr);
        return {
          stdout: stdoutChunks.join(''),
          stderr: stderrChunks.join('\n'),
          exitCode: 1,
          duration: Math.round(performance.now() - startTime),
          engine: `Pyodide ${PYODIDE_VERSION} (WASM TTY Emulated)`,
          plotImages: [],
          isWaitingInput: false,
        };
      }
    }

    if (cachedMainPyFns?.prepareAsync) {
      cachedMainPyFns.prepareAsync(inputsJson, handleStdoutChunk, handleStderrChunk);
    }

    const execNamespace = pyodide.toPy({ __name__: '__main__', __file__: 'main.py' });
    try {
      await pyodide.runPythonAsync(runnableCode, { globals: execNamespace });
    } finally {
      execNamespace.destroy?.();
    }

    if (cachedMainPyFns?.finishAsync) {
      const plotsJson: string = cachedMainPyFns.finishAsync(capturePlots);
      try {
        plotImages = JSON.parse(plotsJson);
      } catch {
        plotImages = [];
      }
    }
    flushFallbackStdout();
  } catch (err: any) {
    try {
      cachedMainPyFns?.flushIo?.();
    } catch {}
    flushFallbackStdout();

    if (err?.name === 'AbortError') {
      exitCode = 130;
      const cancelMsg = 'Đã dừng thực thi bởi người dùng.';
      stderrChunks.push(cancelMsg);
      onStderr?.(cancelMsg);
      return {
        stdout: stdoutChunks.join(''),
        stderr: stderrChunks.join('\n'),
        exitCode,
        duration: Math.round(performance.now() - startTime),
        engine: `Pyodide ${PYODIDE_VERSION} (WASM TTY Emulated)`,
        plotImages,
        isWaitingInput: false,
      };
    }

    let ioState: { waiting?: boolean; prompt?: string; stderrTail?: string } = {};
    try {
      if (cachedMainPyFns?.getIoState) {
        ioState = JSON.parse(cachedMainPyFns.getIoState());
      }
    } catch {}

    const errStr = String(err?.message || err || '');
    const errType = String(err?.type || '');
    const isWaiting =
      !!ioState.waiting ||
      errType === '_PydroidWaitingInput' ||
      errType === 'EOFError' ||
      errStr.includes('_PydroidWaitingInput') ||
      errStr.includes('EOFError') ||
      errStr.includes('EOF when reading a line');

    if (isWaiting) {
      return {
        stdout: stdoutChunks.join(''),
        stderr: '',
        exitCode: 0,
        duration: Math.round(performance.now() - startTime),
        engine: `Pyodide ${PYODIDE_VERSION} (WASM TTY Emulated)`,
        plotImages,
        isWaitingInput: true,
        prompt: ioState.prompt || 'input():',
      };
    }

    exitCode = 1;
    let cleanErr = errStr;
    if (cleanErr === 'PythonError' && ioState.stderrTail) {
      cleanErr = ioState.stderrTail;
    }
    cleanErr = cleanTracebackLines(cleanErr);

    stderrChunks.push(cleanErr);
    onStderr?.(cleanErr);
  }

  const duration = Math.round(performance.now() - startTime);

  return {
    stdout: stdoutChunks.join(''),
    stderr: stderrChunks.join('\n'),
    exitCode,
    duration,
    engine: `Pyodide ${PYODIDE_VERSION} (WASM TTY Emulated)`,
    plotImages,
    isWaitingInput: false,
  };
}
