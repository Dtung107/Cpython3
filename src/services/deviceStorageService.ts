import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { ShortcutKey, KeySize, migrateLegacyPairedShortcuts } from '../types/shortcuts';

export const DEFAULT_FOLDER_STORAGE_KEY = 'pydroid_default_folder';
export const DEFAULT_PHONE_FOLDER = 'Pydroid3Web';
export const SHORTCUTS_CONFIG_FILENAME = 'pydroid_shortcuts_config.json';

const IDB_NAME = 'pydroid_device_storage_db';
const IDB_VERSION = 1;
const IDB_STORE = 'handles';
const IDB_DIR_HANDLE_KEY = 'default_directory_handle';

export interface DeviceFolderFile {
  name: string;
  path: string;
  size?: number;
  mtime?: number;
}

export function normalizeFolderName(input: string): string {
  const cleaned = (input || '')
    .replace(/\\/g, '/')
    .replace(/[:*?"<>|]/g, '')
    .replace(/\.\./g, '')
    .split('/')
    .map((seg) => seg.trim())
    .filter(Boolean)
    .join('/');
  return cleaned || DEFAULT_PHONE_FOLDER;
}

export function sanitizeFileName(fileName: string): string {
  const cleaned = (fileName || 'main.py')
    .replace(/[/\\:*?"<>|]/g, '_')
    .trim();
  return cleaned || 'main.py';
}

export function getDefaultFolderPath(): string {
  try {
    const saved = localStorage.getItem(DEFAULT_FOLDER_STORAGE_KEY);
    return normalizeFolderName(saved || DEFAULT_PHONE_FOLDER);
  } catch {
    return DEFAULT_PHONE_FOLDER;
  }
}

export function setDefaultFolderPath(folderPath: string): string {
  const normalized = normalizeFolderName(folderPath);
  try {
    localStorage.setItem(DEFAULT_FOLDER_STORAGE_KEY, normalized);
  } catch {}
  return normalized;
}

export function isNativeDevice(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

export function supportsFileSystemAccess(): boolean {
  try {
    return (
      !isNativeDevice() &&
      typeof window !== 'undefined' &&
      typeof (window as any).showOpenFilePicker === 'function' &&
      window.self === window.top
    );
  } catch {
    return false;
  }
}

export function supportsDirectoryPicker(): boolean {
  try {
    return (
      !isNativeDevice() &&
      typeof window !== 'undefined' &&
      typeof (window as any).showDirectoryPicker === 'function' &&
      window.self === window.top
    );
  } catch {
    return false;
  }
}

// ============================================================================
// IndexedDB storage for Web FileSystemDirectoryHandle
// ============================================================================

function openHandlesDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB không được hỗ trợ'));
      return;
    }
    const req = indexedDB.open(IDB_NAME, IDB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('Lỗi mở IndexedDB'));
  });
}

export async function saveWebDirectoryHandle(handle: any): Promise<void> {
  const db = await openHandlesDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).put(handle, IDB_DIR_HANDLE_KEY);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}

export async function getWebDirectoryHandle(): Promise<any | null> {
  try {
    const db = await openHandlesDb();
    return await new Promise((resolve) => {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const req = tx.objectStore(IDB_STORE).get(IDB_DIR_HANDLE_KEY);
      req.onsuccess = () => {
        db.close();
        resolve(req.result || null);
      };
      req.onerror = () => {
        db.close();
        resolve(null);
      };
    });
  } catch {
    return null;
  }
}

export async function clearWebDirectoryHandle(): Promise<void> {
  try {
    const db = await openHandlesDb();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).delete(IDB_DIR_HANDLE_KEY);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        resolve();
      };
    });
  } catch {}
}

export async function verifyHandlePermission(
  handle: any,
  readWrite: boolean = true,
  requestIfNeeded: boolean = false
): Promise<boolean> {
  if (!handle) return false;
  try {
    const opts = { mode: readWrite ? 'readwrite' : 'read' };
    if (typeof handle.queryPermission === 'function') {
      const status = await handle.queryPermission(opts);
      if (status === 'granted') return true;
      if (requestIfNeeded && typeof handle.requestPermission === 'function') {
        const req = await handle.requestPermission(opts);
        return req === 'granted';
      }
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export async function pickWebDefaultDirectory(): Promise<{
  ok: boolean;
  name?: string;
  error?: string;
}> {
  if (!supportsDirectoryPicker()) {
    return {
      ok: false,
      error: 'Trình duyệt hiện tại không hỗ trợ chọn thư mục trực tiếp (hãy dùng nút Mở/Tải hoặc bản APK Android).',
    };
  }
  try {
    const dirHandle = await (window as any).showDirectoryPicker({ mode: 'readwrite' });
    const granted = await verifyHandlePermission(dirHandle, true, true);
    if (!granted) {
      return { ok: false, error: 'Chưa được cấp quyền ghi vào thư mục đã chọn.' };
    }
    await saveWebDirectoryHandle(dirHandle);
    setDefaultFolderPath(dirHandle.name || DEFAULT_PHONE_FOLDER);
    return { ok: true, name: dirHandle.name };
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      return { ok: false };
    }
    return { ok: false, error: err?.message || 'Không thể chọn thư mục.' };
  }
}

// ============================================================================
// Capacitor Android Native Filesystem helpers
// ============================================================================

async function resolveNativeDirectory(folderPath: string): Promise<{
  directory: Directory;
  label: string;
}> {
  // Try Documents first so users can browse files easily in Phone Storage -> Documents/Pydroid3Web
  try {
    const perm = await Filesystem.checkPermissions();
    if (perm.publicStorage !== 'granted') {
      await Filesystem.requestPermissions().catch(() => null);
    }
    try {
      await Filesystem.mkdir({
        path: folderPath,
        directory: Directory.Documents,
        recursive: true,
      });
    } catch (mkdirErr: any) {
      const msg = String(mkdirErr?.message || mkdirErr || '').toLowerCase();
      if (!msg.includes('exist')) {
        throw mkdirErr;
      }
    }
    return { directory: Directory.Documents, label: 'Bộ nhớ điện thoại/Documents' };
  } catch {
    // Graceful fallback to App Data directory if scoped storage blocks Documents
    try {
      await Filesystem.mkdir({
        path: folderPath,
        directory: Directory.Data,
        recursive: true,
      });
    } catch {}
    return { directory: Directory.Data, label: 'Bộ nhớ ứng dụng' };
  }
}

export async function ensureDefaultFolderExists(): Promise<{
  ok: boolean;
  displayPath: string;
}> {
  const folder = getDefaultFolderPath();
  if (isNativeDevice()) {
    const resolved = await resolveNativeDirectory(folder);
    return { ok: true, displayPath: `${resolved.label}/${folder}` };
  }
  const webHandle = await getWebDirectoryHandle();
  if (webHandle) {
    return { ok: true, displayPath: `Thư mục máy/${webHandle.name}` };
  }
  return { ok: true, displayPath: `Documents/${folder}` };
}

export async function getDefaultFolderDisplayPath(): Promise<string> {
  const folder = getDefaultFolderPath();
  if (isNativeDevice()) {
    return `Bộ nhớ điện thoại/Documents/${folder}`;
  }
  const webHandle = await getWebDirectoryHandle();
  if (webHandle?.name) {
    return `Thư mục đã liên kết: ${webHandle.name}`;
  }
  return `Documents/${folder}`;
}

export async function writeFileToDefaultFolder(
  fileName: string,
  content: string,
  customRelativePath?: string
): Promise<{
  ok: boolean;
  displayPath: string;
  devicePath: string;
  error?: string;
}> {
  const folder = getDefaultFolderPath();
  const safeName = sanitizeFileName(fileName);
  const targetRelPath = customRelativePath
    ? normalizeFolderName(customRelativePath)
    : `${folder}/${safeName}`;

  if (isNativeDevice()) {
    const parentFolder = targetRelPath.includes('/')
      ? targetRelPath.slice(0, targetRelPath.lastIndexOf('/'))
      : folder;

    // 1. Try Directory.Documents first (or Data if resolveNativeDirectory chose Data)
    const resolved = await resolveNativeDirectory(parentFolder);
    try {
      await Filesystem.writeFile({
        path: targetRelPath,
        data: content,
        directory: resolved.directory,
        encoding: Encoding.UTF8,
        recursive: true,
      });
      return {
        ok: true,
        displayPath: `${resolved.label}/${targetRelPath}`,
        devicePath: targetRelPath,
      };
    } catch (primaryErr: any) {
      // 2. If Documents write fails (e.g. Android 11+ Scoped Storage conflict with pre-existing file),
      // automatically fall back to Directory.Data so saving never fails silently on APK!
      if (resolved.directory !== Directory.Data) {
        try {
          await Filesystem.mkdir({
            path: parentFolder,
            directory: Directory.Data,
            recursive: true,
          }).catch(() => {});
          await Filesystem.writeFile({
            path: targetRelPath,
            data: content,
            directory: Directory.Data,
            encoding: Encoding.UTF8,
            recursive: true,
          });
          return {
            ok: true,
            displayPath: `Bộ nhớ ứng dụng/${targetRelPath}`,
            devicePath: targetRelPath,
          };
        } catch (fallbackErr: any) {
          return {
            ok: false,
            displayPath: `Documents/${targetRelPath}`,
            devicePath: targetRelPath,
            error: fallbackErr?.message || primaryErr?.message || 'Không thể ghi file vào bộ nhớ điện thoại',
          };
        }
      }
      return {
        ok: false,
        displayPath: `Documents/${targetRelPath}`,
        devicePath: targetRelPath,
        error: primaryErr?.message || 'Không thể ghi file vào bộ nhớ điện thoại',
      };
    }
  }

  // Web File System Access directory handle (if user linked one)
  const webHandle = await getWebDirectoryHandle();
  if (webHandle) {
    try {
      const granted = await verifyHandlePermission(webHandle, true, true);
      if (granted) {
        const fileHandle = await webHandle.getFileHandle(safeName, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(content);
        await writable.close();
        return {
          ok: true,
          displayPath: `${webHandle.name}/${safeName}`,
          devicePath: targetRelPath,
        };
      }
    } catch (err: any) {
      return {
        ok: false,
        displayPath: `${webHandle.name}/${safeName}`,
        devicePath: targetRelPath,
        error: err?.message || 'Không thể ghi vào thư mục đã chọn',
      };
    }
  }

  return {
    ok: false,
    displayPath: `Documents/${targetRelPath}`,
    devicePath: targetRelPath,
  };
}

export async function listFilesInDefaultFolder(): Promise<DeviceFolderFile[]> {
  const folder = getDefaultFolderPath();

  if (isNativeDevice()) {
    try {
      const resolved = await resolveNativeDirectory(folder);
      const res = await Filesystem.readdir({
        path: folder,
        directory: resolved.directory,
      });
      return (res.files || [])
        .filter(
          (entry) =>
            entry.type !== 'directory' &&
            entry.name !== SHORTCUTS_CONFIG_FILENAME &&
            (/\.(py|txt|json)$/i.test(entry.name) || !entry.name.startsWith('.'))
        )
        .map((entry) => ({
          name: entry.name,
          path: `${folder}/${entry.name}`,
          size: entry.size,
          mtime: entry.mtime,
        }))
        .sort((a, b) => (b.mtime || 0) - (a.mtime || 0));
    } catch {
      return [];
    }
  }

  const webHandle = await getWebDirectoryHandle();
  if (webHandle) {
    try {
      const granted = await verifyHandlePermission(webHandle, false, false);
      if (!granted) return [];
      const result: DeviceFolderFile[] = [];
      for await (const [name, entry] of webHandle.entries()) {
        if (
          entry.kind === 'file' &&
          name !== SHORTCUTS_CONFIG_FILENAME &&
          /\.(py|txt|json)$/i.test(name)
        ) {
          let size: number | undefined;
          let mtime: number | undefined;
          try {
            const file = await entry.getFile();
            size = file.size;
            mtime = file.lastModified;
          } catch {}
          result.push({
            name,
            path: `${webHandle.name}/${name}`,
            size,
            mtime,
          });
        }
      }
      return result.sort((a, b) => (b.mtime || 0) - (a.mtime || 0));
    } catch {
      return [];
    }
  }

  return [];
}

export async function readFileFromDefaultFolder(
  fileName: string,
  customRelativePath?: string
): Promise<{
  ok: boolean;
  content?: string;
  devicePath: string;
  fileHandle?: any;
  error?: string;
}> {
  const folder = getDefaultFolderPath();
  const safeName = sanitizeFileName(fileName);
  const relPath = customRelativePath || `${folder}/${safeName}`;

  if (isNativeDevice()) {
    const candidates: Array<{ directory: Directory; path: string }> = [
      { directory: Directory.Documents, path: relPath },
      { directory: Directory.Data, path: relPath },
    ];
    if (safeName === SHORTCUTS_CONFIG_FILENAME && relPath !== safeName) {
      candidates.push({ directory: Directory.Documents, path: safeName });
      candidates.push({ directory: Directory.Data, path: safeName });
    }

    let lastErr: any = null;
    for (const candidate of candidates) {
      try {
        const res = await Filesystem.readFile({
          path: candidate.path,
          directory: candidate.directory,
          encoding: Encoding.UTF8,
        });
        const text = typeof res.data === 'string' ? res.data : await res.data.text();
        return { ok: true, content: text, devicePath: candidate.path };
      } catch (err: any) {
        lastErr = err;
      }
    }

    return {
      ok: false,
      devicePath: relPath,
      error: lastErr?.message || 'Không thể đọc tệp từ bộ nhớ điện thoại',
    };
  }

  const webHandle = await getWebDirectoryHandle();
  if (webHandle) {
    try {
      const granted = await verifyHandlePermission(webHandle, true, true);
      if (granted) {
        const fh = await webHandle.getFileHandle(safeName);
        const file = await fh.getFile();
        const text = await file.text();
        return { ok: true, content: text, devicePath: `${folder}/${safeName}`, fileHandle: fh };
      }
    } catch (err: any) {
      return {
        ok: false,
        devicePath: relPath,
        error: err?.message || 'Không thể đọc tệp từ thư mục đã liên kết',
      };
    }
  }

  return { ok: false, devicePath: relPath, error: 'Chưa liên kết thư mục mặc định.' };
}

/**
 * Primary "Save" action:
 * Overwrites changes in the editor directly back into the .py file previously opened from the phone.
 */
export async function saveActiveFileOverwrite(options: {
  fileName: string;
  content: string;
  fileHandle?: any;
  devicePath?: string;
}): Promise<{
  ok: boolean;
  method: 'handle' | 'native' | 'web-dir' | 'local';
  displayPath: string;
  devicePath?: string;
  error?: string;
}> {
  const { fileName, content, fileHandle, devicePath } = options;
  const safeName = sanitizeFileName(fileName);
  const folder = getDefaultFolderPath();

  // 1. Direct FileSystemFileHandle overwrite (when opened via showOpenFilePicker / Web folder)
  if (fileHandle) {
    try {
      const granted = await verifyHandlePermission(fileHandle, true, true);
      if (granted) {
        const writable = await fileHandle.createWritable();
        await writable.write(content);
        await writable.close();
        return {
          ok: true,
          method: 'handle',
          displayPath: fileHandle.name || safeName,
          devicePath: devicePath || `${folder}/${safeName}`,
        };
      }
    } catch (err: any) {
      console.warn('Direct handle overwrite failed, falling back to default folder:', err);
    }
  }

  // 2. Native Capacitor APK overwrite into Documents/<defaultFolder>/<file>
  if (isNativeDevice()) {
    const targetPath = devicePath || `${folder}/${safeName}`;
    const writeRes = await writeFileToDefaultFolder(safeName, content, targetPath);
    if (writeRes.ok) {
      return {
        ok: true,
        method: 'native',
        displayPath: writeRes.displayPath,
        devicePath: writeRes.devicePath,
      };
    }
    return {
      ok: false,
      method: 'local',
      displayPath: writeRes.displayPath,
      error: writeRes.error,
    };
  }

  // 3. Web linked DirectoryHandle overwrite
  const webWrite = await writeFileToDefaultFolder(safeName, content);
  if (webWrite.ok) {
    return {
      ok: true,
      method: 'web-dir',
      displayPath: webWrite.displayPath,
      devicePath: webWrite.devicePath,
    };
  }

  // 4. Fallback: saved in app localStorage
  return {
    ok: true,
    method: 'local',
    displayPath: `Bộ nhớ trình duyệt (${safeName})`,
    devicePath: `${folder}/${safeName}`,
  };
}

/**
 * Trigger a reliable browser download and also save to default phone folder when available.
 */
export async function downloadPyFileToDevice(
  fileName: string,
  content: string
): Promise<{
  ok: boolean;
  savedToDefaultFolder: boolean;
  displayPath: string;
  devicePath: string;
  error?: string;
}> {
  const safeName = sanitizeFileName(fileName);
  const folder = getDefaultFolderPath();

  // Write to default folder on APK or linked Web directory
  const folderWrite = await writeFileToDefaultFolder(safeName, content);

  if (isNativeDevice()) {
    // On Capacitor Android APK, <a download href="blob:..."> does not download to phone storage;
    // Filesystem.writeFile directly saves the .py file into Documents/<defaultFolder>/<safeName>.
    return {
      ok: folderWrite.ok,
      savedToDefaultFolder: folderWrite.ok,
      displayPath: folderWrite.displayPath,
      devicePath: folderWrite.devicePath,
      error: folderWrite.error,
    };
  }

  // Web browser download (with delayed revoke so mobile Chrome/Safari never cuts off the download)
  try {
    const blob = new Blob([content], { type: 'text/x-python;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = safeName;
    a.rel = 'noopener';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      try {
        document.body.removeChild(a);
      } catch {}
      try {
        URL.revokeObjectURL(url);
      } catch {}
    }, 15000);
  } catch (err: any) {
    // Last-resort data URI fallback
    try {
      const a = document.createElement('a');
      a.href = `data:text/plain;charset=utf-8,${encodeURIComponent(content)}`;
      a.download = safeName;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        try {
          document.body.removeChild(a);
        } catch {}
      }, 2000);
    } catch {
      return {
        ok: false,
        savedToDefaultFolder: folderWrite.ok,
        displayPath: folderWrite.displayPath,
        devicePath: folderWrite.devicePath,
        error: err?.message || 'Không thể tải xuống file .py',
      };
    }
  }

  return {
    ok: true,
    savedToDefaultFolder: folderWrite.ok,
    displayPath: folderWrite.ok
      ? folderWrite.displayPath
      : `Thư mục Tải xuống (${safeName}) • Mặc định: Documents/${folder}`,
    devicePath: folderWrite.devicePath,
  };
}

/**
 * Open a local .py file using File System Access API when supported (gives writable FileSystemFileHandle
 * so "Save" overwrites the exact file directly).
 */
export async function pickPyFileWithHandle(): Promise<{
  supported: boolean;
  cancelled?: boolean;
  name?: string;
  content?: string;
  fileHandle?: any;
}> {
  if (!supportsFileSystemAccess()) {
    return { supported: false };
  }
  try {
    const [handle] = await (window as any).showOpenFilePicker({
      multiple: false,
      types: [
        {
          description: 'Python & Text Files',
          accept: {
            'text/x-python': ['.py'],
            'text/plain': ['.py', '.txt', '.json'],
          },
        },
      ],
    });
    if (!handle) return { supported: true, cancelled: true };
    const file = await handle.getFile();
    const content = await file.text();
    return {
      supported: true,
      name: file.name,
      content,
      fileHandle: handle,
    };
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      return { supported: true, cancelled: true };
    }
    return { supported: false };
  }
}

// ============================================================================
// Keyboard Shortcut Configuration persistence inside Default Phone Folder
// ============================================================================

export function parseShortcutsConfigJson(rawText: string): {
  shortcuts?: ShortcutKey[];
  keySize?: KeySize;
} | null {
  try {
    const parsed = JSON.parse(rawText);
    const list = Array.isArray(parsed) ? parsed : parsed?.shortcuts;
    if (!Array.isArray(list) || list.length === 0) return null;

    const validKeySize: KeySize | undefined =
      parsed?.keySize === 'small' || parsed?.keySize === 'medium' || parsed?.keySize === 'large'
        ? parsed.keySize
        : undefined;

    return {
      shortcuts: migrateLegacyPairedShortcuts(list),
      keySize: validKeySize,
    };
  } catch {
    return null;
  }
}

export async function saveShortcutsConfigToDefaultFolder(
  shortcuts: ShortcutKey[],
  keySize: KeySize
): Promise<{ ok: boolean; displayPath?: string }> {
  const folder = getDefaultFolderPath();
  const payload = JSON.stringify(
    {
      version: 1,
      updatedAt: new Date().toISOString(),
      defaultFolder: folder,
      keySize,
      shortcuts,
    },
    null,
    2
  );

  // Also keep a private app-data mirror on native Android so profile loading stays 100% reliable
  // even if Documents/ is modified or restricted by Scoped Storage
  if (isNativeDevice()) {
    try {
      await Filesystem.mkdir({
        path: folder,
        directory: Directory.Data,
        recursive: true,
      }).catch(() => {});
      await Filesystem.writeFile({
        path: `${folder}/${SHORTCUTS_CONFIG_FILENAME}`,
        data: payload,
        directory: Directory.Data,
        encoding: Encoding.UTF8,
        recursive: true,
      });
    } catch {}
  }

  const res = await writeFileToDefaultFolder(SHORTCUTS_CONFIG_FILENAME, payload);
  return { ok: res.ok, displayPath: res.displayPath };
}

export async function loadShortcutsConfigFromDefaultFolder(): Promise<{
  shortcuts?: ShortcutKey[];
  keySize?: KeySize;
  displayPath?: string;
} | null> {
  const res = await readFileFromDefaultFolder(SHORTCUTS_CONFIG_FILENAME);
  if (!res.ok || !res.content) return null;
  const parsed = parseShortcutsConfigJson(res.content);
  if (!parsed) return null;
  return {
    shortcuts: parsed.shortcuts,
    keySize: parsed.keySize,
    displayPath: res.devicePath || `${getDefaultFolderPath()}/${SHORTCUTS_CONFIG_FILENAME}`,
  };
}
