import React, { useEffect, useState } from 'react';
import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  GoogleAuthProvider,
  UserCredential,
} from 'firebase/auth';
import { CheckCircle2, AlertTriangle, Copy, ExternalLink, RefreshCw, Smartphone } from 'lucide-react';
import firebaseConfig from '../../firebase-applet-config.json';
import { SCOPES } from '../services/googleWorkspaceService';

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);

const provider = new GoogleAuthProvider();
for (const scope of SCOPES) {
  provider.addScope(scope);
}
provider.setCustomParameters({ prompt: 'select_account' });

export const ApkGoogleAuthBridge: React.FC = () => {
  const params = new URLSearchParams(window.location.search);
  const state = params.get('state') || '';
  const scheme = params.get('scheme') || 'org.pydroid3.web';
  const isSwitchAccount = params.get('switch') === '1';

  const [status, setStatus] = useState<'idle' | 'signing_in' | 'completing' | 'done' | 'error'>('idle');
  const [errorCode, setErrorCode] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [handoffCode, setHandoffCode] = useState<string>('');
  const [userEmail, setUserEmail] = useState<string>('');
  const [copied, setCopied] = useState(false);

  const deepLinkUrl = handoffCode
    ? `${scheme}://auth?code=${encodeURIComponent(handoffCode)}&state=${encodeURIComponent(state)}`
    : '';

  const finalizeCredential = async (result: UserCredential) => {
    setStatus('completing');
    const cred = GoogleAuthProvider.credentialFromResult(result);
    if (!cred?.accessToken) {
      throw new Error('Không nhận được mã truy cập Google Drive từ phiên đăng nhập.');
    }

    const res = await fetch('/api/apk-auth/handoff', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        state,
        idToken: cred.idToken,
        accessToken: cred.accessToken,
        email: result.user.email,
        displayName: result.user.displayName,
        photoURL: result.user.photoURL,
      }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.code) {
      throw new Error(data.error || 'Không thể tạo mã bàn giao phiên về APK.');
    }

    setUserEmail(result.user.email || result.user.displayName || '');
    setHandoffCode(data.code);
    setStatus('done');

    const targetUrl = `${scheme}://auth?code=${encodeURIComponent(data.code)}&state=${encodeURIComponent(state)}`;
    setTimeout(() => {
      window.location.href = targetUrl;
    }, 350);
  };

  useEffect(() => {
    if (!state || state.length < 12) {
      setStatus('error');
      setErrorMessage('Thiếu tham số bảo mật từ ứng dụng APK. Hãy quay lại APK và bấm Đăng nhập lại.');
      return;
    }

    getRedirectResult(auth)
      .then((result) => {
        if (result) {
          return finalizeCredential(result);
        }
      })
      .catch((err: any) => {
        setStatus('error');
        setErrorCode(err?.code || '');
        setErrorMessage(err?.message || 'Đăng nhập Google không thành công.');
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSignInClick = async (forceSwitch = false) => {
    if (!state || state.length < 12) return;
    setStatus('signing_in');
    setErrorCode('');
    setErrorMessage('');
    try {
      if (isSwitchAccount || forceSwitch) {
        await auth.signOut().catch(() => {});
      }
      provider.setCustomParameters({ prompt: 'select_account' });
      const result = await signInWithPopup(auth, provider);
      await finalizeCredential(result);
    } catch (err: any) {
      const code = err?.code || '';
      if (
        code === 'auth/popup-blocked' ||
        code === 'auth/operation-not-supported-in-this-environment'
      ) {
        provider.setCustomParameters({ prompt: 'select_account' });
        await signInWithRedirect(auth, provider);
        return;
      }
      setStatus('error');
      setErrorCode(code);
      setErrorMessage(err?.message || 'Đăng nhập Google thất bại.');
    }
  };

  const copyText = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {}
  };

  const formattedCode = handoffCode.length === 8 ? `${handoffCode.slice(0, 4)}-${handoffCode.slice(4)}` : handoffCode;
  const currentHost = window.location.hostname;
  const audienceConsoleUrl = `https://console.cloud.google.com/auth/audience?project=${firebaseConfig.projectId}`;
  const isAccessDeniedError =
    errorCode.includes('access_denied') ||
    errorMessage.toLowerCase().includes('access_denied') ||
    errorMessage.includes('403');

  return (
    <div className="min-h-screen bg-[#0f121a] text-slate-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-[#161b28] border border-sky-700/50 rounded-2xl p-6 shadow-2xl space-y-5">
        <div className="flex items-center space-x-3">
          <div className="p-2.5 rounded-xl bg-gradient-to-br from-sky-500 to-indigo-600 text-white shadow">
            <Smartphone className="w-6 h-6" />
          </div>
          <div>
            <h1 className="font-bold text-base text-white">Đăng nhập Google cho Pydroid 3 APK</h1>
            <p className="text-xs text-slate-400">
              Xác thực an toàn qua Chrome và trả quyền Google Drive về ứng dụng
            </p>
          </div>
        </div>

        {status === 'done' ? (
          <div className="space-y-4">
            <div className="p-4 rounded-xl bg-emerald-950/40 border border-emerald-500/50 text-emerald-200 space-y-1.5 text-xs">
              <div className="flex items-center space-x-2 font-bold text-sm text-emerald-300">
                <CheckCircle2 className="w-5 h-5 shrink-0" />
                <span>Đăng nhập thành công!</span>
              </div>
              {userEmail && <div>Tài khoản: <strong>{userEmail}</strong></div>}
              <p className="text-emerald-200/80">
                Trình duyệt đang tự động chuyển về ứng dụng Pydroid 3 APK. Nếu không tự chuyển, hãy bấm nút bên dưới hoặc sao chép mã 1 lần:
              </p>
            </div>

            {deepLinkUrl && (
              <a
                href={deepLinkUrl}
                className="w-full py-2.5 px-4 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-bold text-sm flex items-center justify-center space-x-2 transition"
              >
                <ExternalLink className="w-4 h-4" />
                <span>Mở lại Pydroid 3 APK</span>
              </a>
            )}

            <div className="p-3 rounded-xl bg-[#111520] border border-slate-700 flex items-center justify-between">
              <div>
                <div className="text-[11px] text-slate-400">Mã xác nhận 1 lần (hết hạn sau 3 phút)</div>
                <div className="font-mono font-bold text-lg tracking-wider text-amber-300">{formattedCode}</div>
              </div>
              <button
                onClick={() => copyText(handoffCode)}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 flex items-center space-x-1.5 border border-slate-600"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>{copied ? 'Đã chép' : 'Sao chép'}</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-xs text-slate-300 leading-relaxed">
              Bấm nút bên dưới để chọn tài khoản Google và cấp quyền truy cập <strong>Google Drive</strong> cho ứng dụng Pydroid 3 Web trên điện thoại của bạn.
            </p>

            <button
              onClick={() => void handleSignInClick(false)}
              disabled={status === 'signing_in' || status === 'completing' || !state}
              className="gsi-material-button w-full inline-flex items-center justify-center bg-white hover:bg-slate-100 active:bg-slate-200 text-[#1f1f1f] font-semibold text-sm px-4 py-3 rounded-xl border border-slate-300 shadow transition disabled:opacity-60"
            >
              <div className="gsi-material-button-content-wrapper flex items-center space-x-2.5">
                <div className="gsi-material-button-icon w-5 h-5 shrink-0">
                  <svg version="1.1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" style={{ display: 'block' }}>
                    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
                    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
                    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
                    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
                    <path fill="none" d="M0 0h48v48H0z" />
                  </svg>
                </div>
                <span className="gsi-material-button-contents">
                  {status === 'signing_in'
                    ? 'Đang mở cửa sổ Google...'
                    : status === 'completing'
                    ? 'Đang chuyển phiên về APK...'
                    : 'Sign in with Google'}
                </span>
                {(status === 'signing_in' || status === 'completing') && (
                  <RefreshCw className="w-4 h-4 animate-spin text-slate-600" />
                )}
              </div>
            </button>

            <div className="p-3 rounded-xl bg-[#111520] border border-slate-700/80 text-[11px] text-slate-300 space-y-1.5">
              <div className="font-bold text-amber-300">
                Đăng nhập tài khoản Gmail khác bị lỗi 403: access_denied?
              </div>
              <p className="text-slate-400 leading-relaxed">
                Do ứng dụng Google OAuth đang ở chế độ <strong>Kiểm thử (Testing)</strong>, chỉ email trong danh sách <strong>Test users</strong> mới đăng nhập được.
              </p>
              <a
                href={audienceConsoleUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center space-x-1 text-sky-400 underline font-semibold"
              >
                <ExternalLink className="w-3 h-3" />
                <span>Mở Google Cloud Audience để thêm Gmail / Xuất bản app</span>
              </a>
            </div>

            {errorMessage && (
              <div className="p-3.5 rounded-xl bg-rose-950/50 border border-rose-500/60 text-xs text-rose-200 space-y-2">
                <div className="flex items-start space-x-2">
                  <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                  <span>{errorMessage}</span>
                </div>
                {isAccessDeniedError && (
                  <div className="p-2.5 rounded-lg bg-[#111520] border border-amber-500/40 text-amber-100 space-y-1 text-[11px]">
                    <div className="font-bold text-amber-300">Cách mở khóa Gmail khác:</div>
                    <ol className="list-decimal list-inside space-y-1">
                      <li>Mở link <strong>Google Cloud Audience</strong> ở trên bằng tài khoản chủ dự án.</li>
                      <li>Bấm <strong>+ ADD USERS</strong> ở mục Test users để thêm email mới, hoặc bấm <strong>PUBLISH APP</strong>.</li>
                    </ol>
                  </div>
                )}
                {errorCode === 'auth/unauthorized-domain' && (
                  <div className="p-2.5 rounded-lg bg-[#111520] border border-amber-500/40 text-amber-100 space-y-1.5">
                    <div className="font-bold text-amber-300">Cần thêm tên miền vào Firebase Authorized Domains:</div>
                    <ol className="list-decimal list-inside space-y-1 text-[11px]">
                      <li>
                        Sao chép tên miền: <code className="text-sky-300">{currentHost}</code>{' '}
                        <button
                          onClick={() => copyText(currentHost)}
                          className="underline text-sky-400 ml-1"
                        >
                          {copied ? 'Đã chép' : 'Sao chép'}
                        </button>
                      </li>
                      <li>
                        Mở{' '}
                        <a
                          href={`https://console.firebase.google.com/project/${firebaseConfig.projectId}/authentication/settings`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-sky-400 underline"
                        >
                          Firebase Console → Authentication → Settings → Authorized domains
                        </a>
                      </li>
                      <li>Bấm <strong>Add domain</strong>, dán tên miền trên rồi quay lại thử lại.</li>
                    </ol>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
