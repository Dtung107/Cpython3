// Dedicated Web Worker for Pyodide WASM execution, IndexedDB asset caching, and non-blocking UI
/// <reference lib="webworker" />

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

interface SavedPkgInfo {
  name: string;
  source: 'pyodide' | 'micropip' | 'cpython';
}

const PYODIDE_VERSION = '0.26.4';
const PYODIDE_CDN_BASE = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`;
const PYODIDE_SCRIPT_URL = `${PYODIDE_CDN_BASE}pyodide.js`;
const PYODIDE_MJS_URL = `${PYODIDE_CDN_BASE}pyodide.mjs`;
const PYODIDE_ASM_JS_URL = `${PYODIDE_CDN_BASE}pyodide.asm.js`;
const PYPI_WHEEL_PREFIX = 'https://files.pythonhosted.org/packages/';

const IDB_NAME = 'pydroid_pip_cache_db';
const IDB_LEGACY_FILES_STORE = 'site_packages';
const IDB_BUNDLES_STORE = 'package_bundles';
const IDB_ASSETS_STORE = 'cdn_assets';
const IDB_VERSION = 2;
const IS_MOBILE_WORKER =
  typeof navigator !== 'undefined' &&
  /android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent || '');
const MAX_CDN_CACHE_BYTES = IS_MOBILE_WORKER ? 90 * 1024 * 1024 : 180 * 1024 * 1024;
const MAX_RAM_ASSET_BYTES = 512 * 1024; // Only keep small manifests/scripts in RAM; never duplicate large WASM/wheels in WebView heap
const MAX_RAM_CACHE_TOTAL_BYTES = 4 * 1024 * 1024;

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

let dbPromise: Promise<IDBDatabase> | null = null;
let pyodideInstance: any = null;
let pyodideInitPromise: Promise<any> | null = null;
let runtimeBootstrapped = false;
let micropipLoaded = false;
let sitePackagesRestored = false;
let matplotlibConfigured = false;
let fetchInterceptorInstalled = false;
let importScriptsPatched = false;
let originalFetchRef: typeof fetch | null = null;
let workerExecCount = 0;

const memoryAssetCache = new Map<string, CachedCdnAsset>();
let memoryAssetCacheBytes = 0;
const inflightAssetFetches = new Map<string, Promise<CachedCdnAsset | null>>();
const verifiedImportableModules = new Set<string>();
const verifiedImportSignatureCache = new Map<string, string[]>();
const sleepTransformCache = new Map<string, string>();
const MAX_LOCAL_CACHE_ENTRIES = 16;

interface CachedPyFns {
  runSync: any;
  prepareAsync: any;
  finishAsync: any;
  transformSleep: any;
  flushIo: any;
  getIoState: any;
}
let cachedPyFns: CachedPyFns | null = null;

function normalizePkgName(raw: string): string {
  return raw.trim().split(/[=<>!~\[]/)[0].trim().toLowerCase();
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
      if (record.size <= MAX_RAM_ASSET_BYTES) {
        setBoundedMemoryAsset(url, record);
      }
      return record;
    }
  } catch {}
  return null;
}

async function evictOldestCdnAssetsIfNeeded(db: IDBDatabase, bytesToFree: number): Promise<void> {
  try {
    await new Promise<void>((resolve) => {
      const tx = db.transaction(IDB_ASSETS_STORE, 'readwrite');
      const index = tx.objectStore(IDB_ASSETS_STORE).index('cachedAt');
      let freed = 0;

      const cursorReq = index.openCursor();
      cursorReq.onsuccess = () => {
        const cursor = cursorReq.result;
        if (!cursor || freed >= bytesToFree) return;
        const entry = cursor.value as CachedCdnAsset;
        const isCoreFile =
          entry.url === PYODIDE_SCRIPT_URL ||
          entry.url === PYODIDE_MJS_URL ||
          entry.url === PYODIDE_ASM_JS_URL ||
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
  } catch {}
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
          val.url === PYODIDE_MJS_URL ||
          val.url === PYODIDE_ASM_JS_URL ||
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

  // Serialize IDB writes so concurrent asset fetches never spike Android WebView memory
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
        } catch {}
      }
    }
  });

  cdnIdbWriteQueue = nextWrite.catch(() => {});
  return nextWrite;
}

async function fetchAndCachePyodideAsset(url: string): Promise<CachedCdnAsset | null> {
  const cached = await getCdnAssetFromIDB(url);
  if (cached) return cached;

  const inflight = inflightAssetFetches.get(url);
  if (inflight) return inflight;

  const networkPromise = (async (): Promise<CachedCdnAsset | null> => {
    const fetcher = originalFetchRef || self.fetch.bind(self);
    const res = await fetcher(url);
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

function installWorkerFetchCache(): void {
  if (fetchInterceptorInstalled) return;
  fetchInterceptorInstalled = true;

  try {
    const rawFetch = self.fetch;
    if (typeof rawFetch !== 'function') return;
    originalFetchRef = rawFetch.bind(self);
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
        return baseFetch(input, init);
      }
    };

    const ownDesc = Object.getOwnPropertyDescriptor(self, 'fetch');
    if (!ownDesc || ownDesc.configurable) {
      Object.defineProperty(self, 'fetch', {
        value: wrappedFetch,
        configurable: true,
        writable: true,
      });
    } else if (ownDesc.writable) {
      (self as any).fetch = wrappedFetch;
    }
  } catch {}
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

async function savePackageBundleToIDB(packageName: string, files: CachedFileEntry[]): Promise<void> {
  if (files.length === 0) return;
  const totalBytes = files.reduce((sum, f) => sum + (f.data?.byteLength || 0), 0);
  const bundle: CachedPackageBundle = {
    packageName: normalizePkgName(packageName),
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
      } catch {}
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
      for (const file of bundle.files) writeEntry(file);
    }
  }
  for (const legacyFile of preloaded.legacyFiles) {
    writeEntry(legacyFile);
  }

  if (restoredCount > 0) {
    try {
      pyodide.runPython('import importlib; importlib.invalidate_caches()');
    } catch {}
  }

  return restoredCount;
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
      } catch {}
    }
  } catch {}
}

function getSitePackagesRoot(pyodide: any): string {
  try {
    const dir = pyodide.runPython('import site; site.getsitepackages()[0]');
    if (typeof dir === 'string' && dir) return dir;
  } catch {}
  return '/lib/python3.12/site-packages';
}

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
        if self._pending:
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
            needs_async = False
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

for _mod_name in ("math", "random", "time", "datetime"):
    try:
        __import__(_mod_name)
    except Exception:
        pass
`;

function normalizeModuleWorkerImportScripts(): void {
  if (importScriptsPatched) return;
  importScriptsPatched = true;

  try {
    const nativeImportScripts = (self as any).importScripts;
    if (typeof nativeImportScripts !== 'function') return;

    // Pyodide 0.26.4 uses `typeof importScripts === 'function'` to detect Worker mode,
    // and its loadScript() only falls back to `await import(url)` if importScripts throws TypeError.
    // Chromium & Android WebView throw DOMException in Module Workers, so convert that to TypeError.
    const wrappedImportScripts = (...urls: string[]) => {
      try {
        return nativeImportScripts.apply(self, urls);
      } catch (err: any) {
        const msg = String(err?.message || err || '');
        if (
          !(err instanceof TypeError) &&
          (msg.includes('Module scripts') ||
            msg.includes('importScripts') ||
            err?.name === 'NetworkError' ||
            err?.name === 'NotSupportedError')
        ) {
          throw new TypeError(msg || 'Module scripts do not support importScripts()');
        }
        throw err;
      }
    };

    const ownDesc = Object.getOwnPropertyDescriptor(self, 'importScripts');
    if (!ownDesc || ownDesc.configurable) {
      Object.defineProperty(self, 'importScripts', {
        value: wrappedImportScripts,
        configurable: true,
        writable: true,
      });
    } else if (ownDesc.writable) {
      (self as any).importScripts = wrappedImportScripts;
    }
  } catch {
    // Best-effort shim; preloading pyodide.asm.js below avoids calling loadScript for pyodide.asm.js
  }
}

async function loadPyodideScriptInWorker(): Promise<void> {
  normalizeModuleWorkerImportScripts();

  if (typeof (self as any).loadPyodide !== 'function') {
    // 1. Prefer IndexedDB-cached pyodide.mjs loaded as ES Module (zero importScripts, offline-ready)
    try {
      const mjsAsset = await fetchAndCachePyodideAsset(PYODIDE_MJS_URL);
      if (mjsAsset && mjsAsset.data.byteLength > 0) {
        const blobUrl = URL.createObjectURL(
          new Blob([mjsAsset.data], { type: 'application/javascript' })
        );
        try {
          const pyodideMjs = await import(/* @vite-ignore */ blobUrl);
          if (typeof pyodideMjs?.loadPyodide === 'function') {
            (self as any).loadPyodide = pyodideMjs.loadPyodide;
          }
        } finally {
          URL.revokeObjectURL(blobUrl);
        }
      }
    } catch {}
  }

  // 2. Fallback to direct CDN ES module import of pyodide.mjs
  if (typeof (self as any).loadPyodide !== 'function') {
    try {
      const pyodideMjs = await import(/* @vite-ignore */ PYODIDE_MJS_URL);
      if (typeof pyodideMjs?.loadPyodide === 'function') {
        (self as any).loadPyodide = pyodideMjs.loadPyodide;
      }
    } catch {}
  }

  // 3. Fallback to pyodide.js evaluated via global indirect eval (never calls importScripts)
  if (typeof (self as any).loadPyodide !== 'function') {
    try {
      const jsAsset = await fetchAndCachePyodideAsset(PYODIDE_SCRIPT_URL);
      if (jsAsset && jsAsset.data.byteLength > 0) {
        const scriptText = new TextDecoder().decode(jsAsset.data);
        (0, eval)(scriptText);
      }
    } catch {}
  }

  if (typeof (self as any).loadPyodide !== 'function') {
    const fetcher = originalFetchRef || self.fetch.bind(self);
    const res = await fetcher(PYODIDE_SCRIPT_URL);
    if (res.ok) {
      const scriptText = await res.text();
      (0, eval)(scriptText);
    }
  }

  // Preload pyodide.asm.js from IndexedDB / fetch so Pyodide skips internal loadScript(pyodide.asm.js)
  if (typeof (self as any)._createPyodideModule !== 'function') {
    try {
      const asmAsset = await fetchAndCachePyodideAsset(PYODIDE_ASM_JS_URL);
      if (asmAsset && asmAsset.data.byteLength > 0) {
        const asmText = new TextDecoder().decode(asmAsset.data);
        (0, eval)(asmText);
      }
    } catch {}
  }
}

function isPyodidePackageLoaded(pyodide: any, pkgName: string): boolean {
  try {
    const loaded = pyodide.loadedPackages || {};
    return !!loaded[pkgName] || !!loaded[pkgName.toLowerCase()];
  } catch {
    return false;
  }
}

async function ensurePyodideReady(
  savedPackages: SavedPkgInfo[] = [],
  onStatus?: (msg: string) => void
): Promise<any> {
  normalizeModuleWorkerImportScripts();
  installWorkerFetchCache();

  if (pyodideInstance && runtimeBootstrapped) {
    return pyodideInstance;
  }
  if (pyodideInitPromise) {
    return pyodideInitPromise;
  }

  pyodideInitPromise = (async () => {
    try {
      onStatus?.('Đang nạp nhân Python 3.12 WebAssembly...');
      await loadPyodideScriptInWorker();

      onStatus?.('Khởi tạo môi trường Python 3.12...');
      const loader = (self as any).loadPyodide;
      if (typeof loader !== 'function') {
        throw new Error('Không thể nạp loadPyodide trong Worker.');
      }

      const pyodide = await loader({ indexURL: PYODIDE_CDN_BASE });

      if (!sitePackagesRestored) {
        sitePackagesRestored = true;
        try {
          const preloaded = await preloadCachedPackagesFromIDB();
          writeCachedPackagesToPyodideFS(pyodide, preloaded);
        } catch {}
      }

      if (!runtimeBootstrapped) {
        await pyodide.runPythonAsync(CORE_BOOTSTRAP_SCRIPT);
        cachedPyFns = {
          runSync: pyodide.globals.get('_pydroid_run_sync'),
          prepareAsync: pyodide.globals.get('_pydroid_prepare_io'),
          finishAsync: pyodide.globals.get('_pydroid_finish_async'),
          transformSleep: pyodide.globals.get('_pydroid_transform_sleep'),
          flushIo: pyodide.globals.get('_pydroid_flush_io'),
          getIoState: pyodide.globals.get('_pydroid_get_io_state'),
        };
        runtimeBootstrapped = true;
      }

      pyodideInstance = pyodide;

      // Lazily restore saved prebuilt Pyodide packages during idle time
      const savedPrebuilt = savedPackages
        .filter((p) => p.source === 'pyodide' && PYODIDE_PREBUILT_PACKAGES.has(p.name))
        .map((p) => p.name)
        .filter((n) => !isPyodidePackageLoaded(pyodide, n));
      if (savedPrebuilt.length > 0) {
        setTimeout(() => {
          pyodide.loadPackage(savedPrebuilt).catch(() => {});
        }, 120);
      }

      self.postMessage({ type: 'warmState', state: 'ready' });

      // Lazily enforce IndexedDB cache quota shortly after boot so prolonged sessions never bloat storage
      setTimeout(() => {
        getPipDB().then((db) => enforceCdnCacheBudget(db)).catch(() => {});
      }, 3500);

      return pyodide;
    } catch (err) {
      pyodideInitPromise = null;
      self.postMessage({ type: 'warmState', state: 'error' });
      throw err;
    }
  })();

  return pyodideInitPromise;
}

async function installPkgInWorker(
  pyodide: any,
  packageName: string,
  onStatus?: (msg: string) => void
): Promise<string> {
  const trimmed = packageName.trim();
  const normalized = normalizePkgName(trimmed);
  if (!normalized) throw new Error('Tên thư viện không hợp lệ.');

  onStatus?.(`Đang tải và cài đặt ${trimmed}...`);
  verifiedImportableModules.clear();
  verifiedImportSignatureCache.clear();

  if (PYODIDE_PREBUILT_PACKAGES.has(normalized)) {
    await pyodide.loadPackage(normalized);
    return 'pyodide';
  }

  try {
    await pyodide.loadPackage(normalized);
    return 'pyodide';
  } catch {
    if (!micropipLoaded) {
      onStatus?.('Đang nạp trình cài đặt micropip...');
      await pyodide.loadPackage('micropip');
      micropipLoaded = true;
    }
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
        } catch {}
      }
    }

    if (addedEntries.length > 0) {
      onStatus?.(`Đang lưu gói ${normalized} vào bộ nhớ đệm IndexedDB...`);
      await savePackageBundleToIDB(normalized, addedEntries).catch(() => {});
    }
    return 'micropip';
  }
}

async function ensureCodePackagesReady(
  pyodide: any,
  code: string,
  savedPackages: SavedPkgInfo[],
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

  const sortedMods = Array.from(importedModules).sort();
  const sigKey = `${sortedMods.join(',')}|${savedPackages.length}`;
  if (verifiedImportSignatureCache.has(sigKey)) {
    const cachedPkgs = verifiedImportSignatureCache.get(sigKey)!;
    if (cachedPkgs.every((pkg) => isPyodidePackageLoaded(pyodide, pkg))) {
      return;
    }
  }

  const savedMap = new Map(savedPackages.map((e) => [e.name, e]));
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
    if (PYODIDE_PREBUILT_PACKAGES.has(pkg)) prebuiltBatch.push(pkg);
    else customList.push(pkg);
  }

  if (prebuiltBatch.length > 0) {
    onStatus?.(`Đang nạp ${prebuiltBatch.join(', ')} từ bộ nhớ đệm...`);
    try {
      await pyodide.loadPackage(prebuiltBatch);
    } catch {}
  }

  for (const pkg of customList) {
    try {
      await installPkgInWorker(pyodide, pkg, onStatus);
    } catch {}
  }
}

self.onmessage = async (ev: MessageEvent) => {
  const msg = ev.data || {};
  const { reqId, type } = msg;

  if (type === 'init') {
    try {
      await ensurePyodideReady(msg.savedPackages || []);
      if (msg.initialCode) {
        await ensureCodePackagesReady(pyodideInstance, msg.initialCode, msg.savedPackages || []);
      }
      self.postMessage({ reqId, type: 'initResult', ok: true });
    } catch (err: any) {
      self.postMessage({
        reqId,
        type: 'initResult',
        ok: false,
        error: err?.message || String(err),
      });
    }
    return;
  }

  if (type === 'prewarmDeps') {
    try {
      const pyodide = await ensurePyodideReady(msg.savedPackages || []);
      if (msg.code) {
        await ensureCodePackagesReady(pyodide, msg.code, msg.savedPackages || []);
      }
      self.postMessage({ reqId, type: 'prewarmDepsResult', ok: true });
    } catch {
      self.postMessage({ reqId, type: 'prewarmDepsResult', ok: false });
    }
    return;
  }

  if (type === 'syncPackages') {
    verifiedImportableModules.clear();
    verifiedImportSignatureCache.clear();
    if (msg.action === 'restore' && pyodideInstance) {
      try {
        const preloaded = await preloadCachedPackagesFromIDB();
        writeCachedPackagesToPyodideFS(pyodideInstance, preloaded);
      } catch {}
    }
    self.postMessage({ reqId, type: 'syncPackagesResult', ok: true });
    return;
  }

  if (type === 'checkSyntax') {
    try {
      if (!pyodideInstance) {
        self.postMessage({ reqId, type: 'checkSyntaxResult', supported: false });
        return;
      }
      pyodideInstance.globals.set('__apk_syntax_check', msg.code || '');
      pyodideInstance.runPython(`
import ast
try:
    ast.parse(__apk_syntax_check)
finally:
    del __apk_syntax_check
`);
      self.postMessage({ reqId, type: 'checkSyntaxResult', supported: true, ok: true });
    } catch (err: any) {
      self.postMessage({
        reqId,
        type: 'checkSyntaxResult',
        supported: true,
        ok: false,
        error: err?.message || String(err),
      });
    }
    return;
  }

  if (type === 'installPackage') {
    try {
      const pyodide = await ensurePyodideReady(msg.savedPackages || [], (statusMsg) => {
        self.postMessage({ reqId, type: 'status', message: statusMsg });
      });
      const source = await installPkgInWorker(pyodide, msg.packageName, (statusMsg) => {
        self.postMessage({ reqId, type: 'status', message: statusMsg });
      });
      self.postMessage({ reqId, type: 'installResult', ok: true, source });
    } catch (err: any) {
      self.postMessage({
        reqId,
        type: 'installResult',
        ok: false,
        error: err?.message || String(err),
      });
    }
    return;
  }

  if (type === 'trimMemory') {
    clearMemoryAssetCache();
    verifiedImportableModules.clear();
    verifiedImportSignatureCache.clear();
    sleepTransformCache.clear();
    if (pyodideInstance && runtimeBootstrapped) {
      try {
        pyodideInstance.runPython(
          '_pydroid_code_cache.clear()\nimport gc\ngc.collect()'
        );
      } catch {}
    }
    self.postMessage({ reqId, type: 'trimMemoryResult', ok: true, execCount: workerExecCount });
    return;
  }

  if (type === 'runCode') {
    workerExecCount++;
    const code: string = msg.code || '';
    const inputs: string[] = Array.isArray(msg.inputs) ? msg.inputs : [];
    const savedPackages: SavedPkgInfo[] = Array.isArray(msg.savedPackages) ? msg.savedPackages : [];

    const MAX_WORKER_STDOUT_CHARS = 380000;
    const MAX_WORKER_STDERR_CHARS = 80000;
    const stdoutChunks: string[] = [];
    let stdoutCharsTotal = 0;
    const stderrChunks: string[] = [];
    let stderrCharsTotal = 0;
    let pendingStdout: string[] = [];
    let pendingStderr: string[] = [];
    let lastPostTime = 0;
    let flushTimer: ReturnType<typeof setTimeout> | null = null;
    const startTime = performance.now();

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

    const flushWorkerStreams = () => {
      if (flushTimer) {
        clearTimeout(flushTimer);
        flushTimer = null;
      }
      if (pendingStdout.length > 0) {
        self.postMessage({ reqId, type: 'stdout', chunk: pendingStdout.join('') });
        pendingStdout = [];
      }
      if (pendingStderr.length > 0) {
        self.postMessage({ reqId, type: 'stderr', chunk: pendingStderr.join('') });
        pendingStderr = [];
      }
      lastPostTime = performance.now();
    };

    const onStdoutChunk = (chunk: string) => {
      if (!chunk) return;
      stdoutCharsTotal = pushBoundedChunk(stdoutChunks, chunk, stdoutCharsTotal, MAX_WORKER_STDOUT_CHARS);
      pendingStdout.push(chunk);
      const now = performance.now();
      // Post immediately across Worker boundary at >=16ms or >=8KB so synchronous WASM loops never starve UI updates
      if (chunk.length >= 4096 || now - lastPostTime >= 16) {
        flushWorkerStreams();
      } else if (!flushTimer) {
        flushTimer = setTimeout(flushWorkerStreams, 16);
      }
    };

    const onStderrChunk = (chunk: string) => {
      if (!chunk) return;
      stderrCharsTotal = pushBoundedChunk(stderrChunks, chunk, stderrCharsTotal, MAX_WORKER_STDERR_CHARS);
      pendingStderr.push(chunk);
      flushWorkerStreams();
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

    try {
      let pyodide: any;
      try {
        pyodide = await ensurePyodideReady(savedPackages, (statusMsg) => {
          self.postMessage({ reqId, type: 'status', message: statusMsg });
        });
      } catch (bootErr: any) {
        self.postMessage({
          reqId,
          type: 'runResult',
          workerBootFailed: true,
          error: bootErr?.message || String(bootErr),
        });
        return;
      }

      const normalizedInputs: string[] = [];
      for (const item of inputs) {
        if (typeof item === 'string') {
          normalizedInputs.push(...item.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n'));
        } else if (item !== undefined && item !== null) {
          normalizedInputs.push(String(item));
        }
      }
      const inputsJson = JSON.stringify(normalizedInputs);

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

      await ensureCodePackagesReady(pyodide, code, savedPackages, (statusMsg) => {
        self.postMessage({ reqId, type: 'status', message: statusMsg });
      });

      const usesMatplotlib = code.includes('matplotlib') || code.includes('plt');
      if (!matplotlibConfigured && usesMatplotlib) {
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
        } else if (cachedPyFns?.transformSleep) {
          try {
            const transformed = cachedPyFns.transformSleep(code);
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
      let plotImages: string[] = [];

      // Fast Single-FFI Sync Execution Path (cached bytecode + zero JS exception overhead on input())
      if (cachedPyFns?.runSync) {
        const syncResJson: string = cachedPyFns.runSync(
          runnableCode,
          inputsJson,
          onStdoutChunk,
          onStderrChunk,
          capturePlots
        );
        const syncRes = JSON.parse(syncResJson);

        if (syncRes.status === 'ok') {
          flushWorkerStreams();
          self.postMessage({
            reqId,
            type: 'runResult',
            result: {
              stdout: stdoutChunks.join(''),
              stderr: stderrChunks.join(''),
              exitCode: 0,
              duration: Math.round(performance.now() - startTime),
              engine: `Pyodide ${PYODIDE_VERSION} (WASM Worker)`,
              plotImages: Array.isArray(syncRes.plots) ? syncRes.plots : [],
              isWaitingInput: false,
            },
          });
          return;
        }

        if (syncRes.status === 'waiting_input') {
          flushWorkerStreams();
          self.postMessage({
            reqId,
            type: 'runResult',
            result: {
              stdout: stdoutChunks.join(''),
              stderr: '',
              exitCode: 0,
              duration: Math.round(performance.now() - startTime),
              engine: `Pyodide ${PYODIDE_VERSION} (WASM Worker)`,
              plotImages: [],
              isWaitingInput: true,
              prompt: syncRes.prompt || 'input():',
            },
          });
          return;
        }

        if (syncRes.status === 'error') {
          flushWorkerStreams();
          const stderrJoined = stderrChunks.join('');
          const cleanedErr = cleanTracebackLines(String(syncRes.error || ''));
          self.postMessage({
            reqId,
            type: 'runResult',
            result: {
              stdout: stdoutChunks.join(''),
              stderr: stderrJoined ? `${stderrJoined}\n${cleanedErr}` : cleanedErr,
              exitCode: 1,
              duration: Math.round(performance.now() - startTime),
              engine: `Pyodide ${PYODIDE_VERSION} (WASM Worker)`,
              plotImages: [],
              isWaitingInput: false,
            },
          });
          return;
        }
        // syncRes.status === 'need_async' -> fall through to async execution below
      }

      if (cachedPyFns?.prepareAsync) {
        cachedPyFns.prepareAsync(inputsJson, onStdoutChunk, onStderrChunk);
      }

      const execNamespace = pyodide.toPy({ __name__: '__main__', __file__: 'main.py' });
      try {
        await pyodide.runPythonAsync(runnableCode, { globals: execNamespace });
      } finally {
        execNamespace.destroy?.();
      }

      if (cachedPyFns?.finishAsync) {
        const plotsJson: string = cachedPyFns.finishAsync(capturePlots);
        try {
          plotImages = JSON.parse(plotsJson);
        } catch {
          plotImages = [];
        }
      }

      flushWorkerStreams();

      self.postMessage({
        reqId,
        type: 'runResult',
        result: {
          stdout: stdoutChunks.join(''),
          stderr: stderrChunks.join(''),
          exitCode: 0,
          duration: Math.round(performance.now() - startTime),
          engine: `Pyodide ${PYODIDE_VERSION} (WASM Worker)`,
          plotImages,
          isWaitingInput: false,
        },
      });
    } catch (err: any) {
      try {
        cachedPyFns?.flushIo?.();
      } catch {}
      flushWorkerStreams();

      let ioState: { waiting?: boolean; prompt?: string; stderrTail?: string } = {};
      try {
        if (cachedPyFns?.getIoState) {
          ioState = JSON.parse(cachedPyFns.getIoState());
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
        self.postMessage({
          reqId,
          type: 'runResult',
          result: {
            stdout: stdoutChunks.join(''),
            stderr: '',
            exitCode: 0,
            duration: Math.round(performance.now() - startTime),
            engine: `Pyodide ${PYODIDE_VERSION} (WASM Worker)`,
            plotImages: [],
            isWaitingInput: true,
            prompt: ioState.prompt || 'input():',
          },
        });
        return;
      }

      let cleanErr = errStr;
      if (cleanErr === 'PythonError' && ioState.stderrTail) {
        cleanErr = ioState.stderrTail;
      }
      cleanErr = cleanTracebackLines(cleanErr);
      const stderrJoined = stderrChunks.join('');

      self.postMessage({
        reqId,
        type: 'runResult',
        result: {
          stdout: stdoutChunks.join(''),
          stderr: stderrJoined ? `${stderrJoined}\n${cleanErr}` : cleanErr,
          exitCode: 1,
          duration: Math.round(performance.now() - startTime),
          engine: `Pyodide ${PYODIDE_VERSION} (WASM Worker)`,
          plotImages: [],
          isWaitingInput: false,
        },
      });
    }
  }
};
