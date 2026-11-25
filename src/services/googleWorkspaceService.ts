import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  signInWithPopup,
  signInWithRedirect,
  signInWithCredential,
  getRedirectResult,
  GoogleAuthProvider,
  onAuthStateChanged,
  User,
} from 'firebase/auth';
import { Capacitor, PluginListenerHandle } from '@capacitor/core';
import { App as CapacitorApp } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import firebaseConfig from '../../firebase-applet-config.json';
import { CodeFile } from '../types';
import { SyntaxTheme, TerminalTheme } from '../types/theme';
import { ShortcutKey, KeySize } from '../types/shortcuts';
import {
  getApiBaseUrl,
  hasReachablePublicBackendOnApk,
  isMobileOrApk,
  fetchWithTimeout,
  wakeBackendServer,
} from '../utils/apiConfig';

export const SCOPES = [
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
  'https://www.googleapis.com/auth/drive',
] as const;

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);

const provider = new GoogleAuthProvider();
for (const scope of SCOPES) {
  provider.addScope(scope);
}
provider.setCustomParameters({
  prompt: 'select_account',
});

// In-memory ONLY OAuth access token cache (never store in localStorage or sessionStorage)
let isSigningIn = false;
let cachedAccessToken: string | null = null;
let pendingApkAuthState: string | null = null;
let pendingApkBackendBase: string | null = null;
let authSuccessHandler: ((user: User, token: string) => void) | undefined;
let authFailureHandler: ((user: User | null) => void) | undefined;
let apkEventHandler: ((evt: { type: 'success' | 'error'; message: string }) => void) | undefined;

export const isNativeCapacitor = (): boolean => {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
};

export const shouldUseApkBrowserAuth = (): boolean => {
  return isNativeCapacitor() || isMobileOrApk();
};

export const hasPendingApkAuth = (): boolean => !!pendingApkAuthState;

export const setApkAuthEventListener = (
  listener?: (evt: { type: 'success' | 'error'; message: string }) => void
) => {
  apkEventHandler = listener;
};

function generateRandomState(): string {
  const bytes = new Uint8Array(16);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

async function claimApkHandoff(params: {
  code?: string;
  state?: string;
  baseUrl?: string;
  silentIfNotReady?: boolean;
}): Promise<{ user: User; accessToken: string } | null> {
  const baseUrl = (params.baseUrl || pendingApkBackendBase || getApiBaseUrl()).trim().replace(/\/+$/, '');
  if (!baseUrl) {
    if (!params.silentIfNotReady) {
      throw new Error('Chưa cấu hình URL máy chủ Backend công khai.');
    }
    return null;
  }

  const query = new URLSearchParams();
  if (params.code) query.set('code', params.code);
  if (params.state) query.set('state', params.state);

  const res = await fetchWithTimeout(
    `${baseUrl}/api/apk-auth/handoff?${query.toString()}`,
    {
      method: 'GET',
      cache: 'no-store',
    },
    12000
  );

  if (res.status === 404) {
    if (params.silentIfNotReady) return null;
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData?.error || 'Mã xác nhận không đúng hoặc đã hết hạn.');
  }

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData?.error || `Không thể xác thực phiên APK (${res.status}).`);
  }

  const data = await res.json();
  if (!data?.ready || !data?.accessToken) {
    if (params.silentIfNotReady) return null;
    throw new Error('Phiên Google chưa trả về mã truy cập hợp lệ.');
  }

  try {
    isSigningIn = true;
    cachedAccessToken = data.accessToken;
    pendingApkAuthState = null;
    pendingApkBackendBase = null;

    if (isNativeCapacitor()) {
      Browser.close().catch(() => {});
    }

    const cred = GoogleAuthProvider.credential(data.idToken || null, data.accessToken);
    const userCred = await signInWithCredential(auth, cred);

    authSuccessHandler?.(userCred.user, cachedAccessToken!);
    apkEventHandler?.({
      type: 'success',
      message: `Đã đăng nhập Google thành công (${userCred.user.email || userCred.user.displayName || 'Google Account'}).`,
    });

    return { user: userCred.user, accessToken: cachedAccessToken! };
  } finally {
    isSigningIn = false;
  }
}

export const submitManualApkAuthCode = async (
  code: string
): Promise<{ user: User; accessToken: string } | null> => {
  const cleanCode = code.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  if (cleanCode.length < 6) {
    throw new Error('Vui lòng nhập đầy đủ mã xác nhận 8 ký tự hiển thị trên trình duyệt.');
  }
  return await claimApkHandoff({
    code: cleanCode,
    state: pendingApkAuthState || undefined,
    silentIfNotReady: false,
  });
};

export const pollPendingApkAuth = async (): Promise<{ user: User; accessToken: string } | null> => {
  if (!pendingApkAuthState) return null;
  return await claimApkHandoff({
    state: pendingApkAuthState,
    silentIfNotReady: true,
  });
};

export interface DriveFileItem {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime?: string;
  size?: string;
  parents?: string[];
  webViewLink?: string;
}

export interface WorkspaceSyncPayload {
  version: number;
  updatedAt: string;
  sourcePlatform: string;
  activeFileId: string;
  files: CodeFile[];
  syntaxTheme?: SyntaxTheme;
  terminalTheme?: TerminalTheme;
  shortcuts?: ShortcutKey[];
  keySize?: KeySize;
  fontSize?: number;
}

export interface DriveNoteItem {
  id: string;
  title: string;
  content: string;
  color: 'amber' | 'sky' | 'emerald' | 'rose' | 'slate';
  updatedAt: string;
}

export const initGoogleAuth = (
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthFailure?: (user: User | null) => void
) => {
  authSuccessHandler = onAuthSuccess;
  authFailureHandler = onAuthFailure;

  // Check for redirect sign-in result on Web browsers (not inside Android WebView container)
  if (!shouldUseApkBrowserAuth()) {
    getRedirectResult(auth)
      .then((result) => {
        if (result) {
          const cred = GoogleAuthProvider.credentialFromResult(result);
          if (cred?.accessToken) {
            cachedAccessToken = cred.accessToken;
            onAuthSuccess?.(result.user, cred.accessToken);
          }
        }
      })
      .catch((err) => {
        console.warn('Google redirect sign-in check failed:', err);
      });
  }

  const unsubAuth = onAuthStateChanged(auth, (user: User | null) => {
    if (user) {
      if (cachedAccessToken) {
        onAuthSuccess?.(user, cachedAccessToken);
      } else if (!isSigningIn) {
        cachedAccessToken = null;
        onAuthFailure?.(user);
      }
    } else {
      cachedAccessToken = null;
      onAuthFailure?.(null);
    }
  });

  const capListeners: Promise<PluginListenerHandle>[] = [];

  if (isNativeCapacitor()) {
    // 1. Deep-link callback from Chrome Custom Tab: org.pydroid3.web://auth?code=...&state=...
    capListeners.push(
      CapacitorApp.addListener('appUrlOpen', async ({ url }) => {
        if (!url || !url.startsWith('org.pydroid3.web://auth')) return;
        try {
          const parsed = new URL(url);
          const code = parsed.searchParams.get('code') || '';
          const state = parsed.searchParams.get('state') || '';
          if (pendingApkAuthState && state && state !== pendingApkAuthState) {
            apkEventHandler?.({
              type: 'error',
              message: 'Phiên đăng nhập không khớp state bảo mật. Vui lòng thử lại.',
            });
            return;
          }
          await claimApkHandoff({
            code: code || undefined,
            state: state || pendingApkAuthState || undefined,
            silentIfNotReady: false,
          });
        } catch (err: any) {
          apkEventHandler?.({
            type: 'error',
            message: err?.message || 'Không thể hoàn tất đăng nhập Google từ liên kết trả về.',
          });
        }
      })
    );

    // 2. Resume fallback: if user closed Chrome Custom Tab or switched back manually
    capListeners.push(
      CapacitorApp.addListener('appStateChange', ({ isActive }) => {
        if (isActive && pendingApkAuthState) {
          claimApkHandoff({
            state: pendingApkAuthState,
            silentIfNotReady: true,
          }).catch(() => {});
        }
      })
    );

    capListeners.push(
      Browser.addListener('browserFinished', () => {
        if (pendingApkAuthState) {
          claimApkHandoff({
            state: pendingApkAuthState,
            silentIfNotReady: true,
          }).catch(() => {});
        }
      })
    );
  }

  return () => {
    unsubAuth();
    for (const handlePromise of capListeners) {
      handlePromise.then((h) => h.remove()).catch(() => {});
    }
  };
};

export interface GoogleSignInResult {
  user: User;
  accessToken: string;
  idToken?: string;
}

export const googleSignIn = async (options: {
  switchAccount?: boolean;
  bypassWakeCheck?: boolean;
  onProgress?: (msg: string) => void;
} = {}): Promise<GoogleSignInResult | null> => {
  if (options.switchAccount) {
    cachedAccessToken = null;
    pendingApkAuthState = null;
    pendingApkBackendBase = null;
    await auth.signOut().catch(() => {});
  }

  // On Capacitor / Android APK, NEVER call signInWithPopup/signInWithRedirect inside WebView
  // because Firebase opens /__/auth/handler in external Chrome without window.opener -> "The requested action is invalid."
  if (shouldUseApkBrowserAuth()) {
    if (!hasReachablePublicBackendOnApk()) {
      const err: any = new Error(
        'APK_BACKEND_REQUIRED: Bản APK cần URL máy chủ Backend công khai (Render / Cloud Run / Railway hoặc LAN) để mở trang đăng nhập Google qua Chrome Custom Tabs.'
      );
      err.code = 'APK_BACKEND_REQUIRED';
      throw err;
    }

    const baseUrl = getApiBaseUrl();
    if (!options.bypassWakeCheck) {
      options.onProgress?.(`Đang kết nối tới máy chủ ${baseUrl}...`);
      const wake = await wakeBackendServer(baseUrl, {
        timeoutMs: 60000,
        onProgress: options.onProgress,
      });
      if (!wake.ok) {
        const err: any = new Error(
          `Không thể kết nối tới máy chủ (${baseUrl}): ${wake.errorDetail}. Bạn có thể chờ 10 giây rồi thử lại, hoặc bấm "Mở Chrome đăng nhập trực tiếp".`
        );
        err.code = 'APK_BACKEND_UNREACHABLE';
        throw err;
      }
    }

    const state = generateRandomState();
    pendingApkAuthState = state;
    pendingApkBackendBase = baseUrl;

    const switchFlag = options.switchAccount ? '&switch=1' : '';
    const authBridgeUrl = `${baseUrl}/?apk_auth=1&state=${encodeURIComponent(state)}&scheme=${encodeURIComponent('org.pydroid3.web')}${switchFlag}`;

    if (isNativeCapacitor()) {
      await Browser.open({ url: authBridgeUrl });
    } else {
      window.open(authBridgeUrl, '_blank', 'noopener,noreferrer');
    }
    return null;
  }

  // Standard Web / Chrome browser flow
  try {
    isSigningIn = true;
    provider.setCustomParameters({ prompt: 'select_account' });
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Không lấy được mã truy cập Google từ phiên đăng nhập.');
    }
    cachedAccessToken = credential.accessToken;
    return {
      user: result.user,
      accessToken: cachedAccessToken,
      idToken: credential.idToken,
    };
  } catch (error: any) {
    const code = error?.code || '';
    if (
      code === 'auth/popup-blocked' ||
      code === 'auth/operation-not-supported-in-this-environment'
    ) {
      await signInWithRedirect(auth, provider);
      return null;
    }
    throw error;
  } finally {
    isSigningIn = false;
  }
};

export const getAccessToken = (): string | null => {
  return cachedAccessToken;
};

export const getCurrentFirebaseUser = (): User | null => {
  return auth.currentUser;
};

export const googleLogout = async (): Promise<void> => {
  cachedAccessToken = null;
  pendingApkAuthState = null;
  pendingApkBackendBase = null;
  await auth.signOut();
};

async function driveFetch(url: string, accessToken: string, init: RequestInit = {}): Promise<Response> {
  const res = await fetch(url, {
    ...init,
    headers: {
      ...(init.headers || {}),
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (res.status === 401) {
    cachedAccessToken = null;
    throw new Error('Phiên truy cập Google Drive đã hết hạn. Vui lòng đăng nhập lại bằng Google.');
  }

  return res;
}

export async function fetchGoogleProfile(accessToken: string): Promise<{
  displayName?: string;
  email?: string;
  photoUrl?: string;
}> {
  const res = await driveFetch(
    'https://people.googleapis.com/v1/people/me?personFields=names,emailAddresses,photos',
    accessToken
  );
  if (!res.ok) {
    return {};
  }
  const data = await res.json();
  return {
    displayName: data?.names?.[0]?.displayName,
    email: data?.emailAddresses?.[0]?.value,
    photoUrl: data?.photos?.[0]?.url,
  };
}

const PYDROID_FOLDER_NAME = 'Pydroid 3 Web';
const WORKSPACE_SYNC_FILENAME = 'pydroid_workspace_sync.json';
const NOTES_FILENAME = 'pydroid_notes.json';

export async function ensurePydroidFolder(accessToken: string): Promise<string> {
  const q = encodeURIComponent(
    `name = '${PYDROID_FOLDER_NAME}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`
  );
  const res = await driveFetch(
    `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)&pageSize=5`,
    accessToken
  );
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Không thể truy cập Google Drive (${res.status}): ${errText}`);
  }
  const data = await res.json();
  if (data.files && data.files.length > 0) {
    return data.files[0].id;
  }

  const createRes = await driveFetch('https://www.googleapis.com/drive/v3/files', accessToken, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: PYDROID_FOLDER_NAME,
      mimeType: 'application/vnd.google-apps.folder',
    }),
  });
  if (!createRes.ok) {
    const errText = await createRes.text();
    throw new Error(`Không thể tạo thư mục Pydroid 3 Web trên Drive: ${errText}`);
  }
  const created = await createRes.json();
  return created.id;
}

export async function listDriveFiles(
  accessToken: string,
  options: { search?: string; onlyPydroidFolder?: boolean } = {}
): Promise<DriveFileItem[]> {
  const clauses: string[] = ['trashed = false', "mimeType != 'application/vnd.google-apps.folder'"];

  if (options.onlyPydroidFolder) {
    const folderId = await ensurePydroidFolder(accessToken);
    clauses.push(`'${folderId}' in parents`);
  }

  if (options.search && options.search.trim()) {
    const escaped = options.search.trim().replace(/'/g, "\\'");
    clauses.push(`name contains '${escaped}'`);
  }

  const q = encodeURIComponent(clauses.join(' and '));
  const fields = encodeURIComponent('files(id,name,mimeType,modifiedTime,size,parents,webViewLink)');
  const url = `https://www.googleapis.com/drive/v3/files?q=${q}&orderBy=modifiedTime desc&pageSize=30&fields=${fields}`;

  const res = await driveFetch(url, accessToken);
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Không thể tải danh sách tệp Drive (${res.status}): ${errText}`);
  }
  const data = await res.json();
  return (data.files || []) as DriveFileItem[];
}

export async function findFileByNameInFolder(
  accessToken: string,
  fileName: string,
  folderId: string
): Promise<DriveFileItem | null> {
  const escaped = fileName.replace(/'/g, "\\'");
  const q = encodeURIComponent(`name = '${escaped}' and '${folderId}' in parents and trashed = false`);
  const fields = encodeURIComponent('files(id,name,mimeType,modifiedTime,size,parents)');
  const res = await driveFetch(
    `https://www.googleapis.com/drive/v3/files?q=${q}&fields=${fields}&pageSize=1`,
    accessToken
  );
  if (!res.ok) return null;
  const data = await res.json();
  return data.files?.[0] || null;
}

export async function readDriveFileContent(accessToken: string, fileId: string): Promise<string> {
  const res = await driveFetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`,
    accessToken
  );
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Không thể đọc nội dung tệp từ Drive (${res.status}): ${errText}`);
  }
  return await res.text();
}

export async function saveFileToDrive(
  accessToken: string,
  params: {
    fileId?: string;
    fileName: string;
    content: string;
    folderId?: string;
    mimeType?: string;
  }
): Promise<DriveFileItem> {
  const mimeType = params.mimeType || 'text/plain';
  const boundary = 'pydroid_drive_boundary_' + Date.now();

  const metadata: Record<string, any> = {
    name: params.fileName,
    mimeType,
  };
  if (!params.fileId && params.folderId) {
    metadata.parents = [params.folderId];
  }

  const body =
    `--${boundary}\r\n` +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\n` +
    `Content-Type: ${mimeType}; charset=UTF-8\r\n\r\n` +
    `${params.content}\r\n` +
    `--${boundary}--`;

  const url = params.fileId
    ? `https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(params.fileId)}?uploadType=multipart&fields=id,name,mimeType,modifiedTime,size`
    : `https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType,modifiedTime,size`;

  const res = await driveFetch(url, accessToken, {
    method: params.fileId ? 'PATCH' : 'POST',
    headers: {
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    body,
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Không thể lưu tệp lên Google Drive (${res.status}): ${errText}`);
  }
  return (await res.json()) as DriveFileItem;
}

export async function deleteDriveFile(accessToken: string, fileId: string): Promise<void> {
  const res = await driveFetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}`,
    accessToken,
    { method: 'DELETE' }
  );
  if (!res.ok && res.status !== 204) {
    const errText = await res.text();
    throw new Error(`Không thể xóa tệp trên Drive (${res.status}): ${errText}`);
  }
}

export async function checkWorkspaceSyncExists(accessToken: string): Promise<DriveFileItem | null> {
  const folderId = await ensurePydroidFolder(accessToken);
  return await findFileByNameInFolder(accessToken, WORKSPACE_SYNC_FILENAME, folderId);
}

export async function syncWorkspaceToDrive(
  accessToken: string,
  payload: WorkspaceSyncPayload
): Promise<DriveFileItem> {
  const folderId = await ensurePydroidFolder(accessToken);
  const existing = await findFileByNameInFolder(accessToken, WORKSPACE_SYNC_FILENAME, folderId);
  return await saveFileToDrive(accessToken, {
    fileId: existing?.id,
    fileName: WORKSPACE_SYNC_FILENAME,
    content: JSON.stringify(payload, null, 2),
    folderId,
    mimeType: 'application/json',
  });
}

export async function loadWorkspaceFromDrive(
  accessToken: string
): Promise<WorkspaceSyncPayload | null> {
  const folderId = await ensurePydroidFolder(accessToken);
  const existing = await findFileByNameInFolder(accessToken, WORKSPACE_SYNC_FILENAME, folderId);
  if (!existing) return null;
  const raw = await readDriveFileContent(accessToken, existing.id);
  return JSON.parse(raw) as WorkspaceSyncPayload;
}

export async function loadDriveNotes(accessToken: string): Promise<{
  fileId: string | null;
  notes: DriveNoteItem[];
}> {
  const folderId = await ensurePydroidFolder(accessToken);
  const existing = await findFileByNameInFolder(accessToken, NOTES_FILENAME, folderId);
  if (!existing) {
    return { fileId: null, notes: [] };
  }
  const raw = await readDriveFileContent(accessToken, existing.id);
  try {
    const parsed = JSON.parse(raw);
    return {
      fileId: existing.id,
      notes: Array.isArray(parsed) ? parsed : [],
    };
  } catch {
    return { fileId: existing.id, notes: [] };
  }
}

export async function saveDriveNotes(
  accessToken: string,
  notes: DriveNoteItem[],
  existingFileId?: string | null
): Promise<DriveFileItem> {
  const folderId = await ensurePydroidFolder(accessToken);
  const resolvedId =
    existingFileId || (await findFileByNameInFolder(accessToken, NOTES_FILENAME, folderId))?.id;
  return await saveFileToDrive(accessToken, {
    fileId: resolvedId,
    fileName: NOTES_FILENAME,
    content: JSON.stringify(notes, null, 2),
    folderId,
    mimeType: 'application/json',
  });
}
