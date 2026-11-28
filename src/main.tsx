import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import {
  initBootRecoveryGuard,
  clearTransientCachesPreservingUserCode,
} from './utils/apkRecovery';

// Initialize boot heartbeat & Safe Mode detection before app mount
initBootRecoveryGuard();

interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
  cleaning: boolean;
}

class AppErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, errorMessage: '', cleaning: false };
  }

  static getDerivedStateFromError(error: unknown): Partial<ErrorBoundaryState> {
    return {
      hasError: true,
      errorMessage: error instanceof Error ? error.message : String(error || 'Lỗi không xác định'),
    };
  }

  override componentDidCatch(error: unknown) {
    console.error('Unhandled UI error caught by AppErrorBoundary:', error);
  }

  private handleSafeCacheCleanReload = async () => {
    this.setState({ cleaning: true });
    await clearTransientCachesPreservingUserCode().catch(() => {});
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('safe_mode', '1');
      window.location.replace(url.toString());
    } catch {
      window.location.reload();
    }
  };

  override render() {
    if (this.state.hasError) {
      return (
        <div className="h-screen w-screen bg-[#070b14] text-slate-100 flex flex-col items-center justify-center p-6 text-center space-y-4">
          <div className="max-w-sm w-full bg-[#111726] border border-rose-500/40 rounded-2xl p-5 space-y-3 shadow-2xl">
            <h2 className="text-base font-bold text-rose-300">
              Ứng dụng gặp sự cố tạm thời
            </h2>
            <p className="text-xs text-slate-300 leading-relaxed break-words">
              {this.state.errorMessage || 'Đã xảy ra lỗi giao diện bất ngờ.'}
            </p>
            <div className="space-y-2 pt-1">
              <button
                type="button"
                disabled={this.state.cleaning}
                onClick={() => window.location.reload()}
                className="w-full py-2.5 px-4 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs transition disabled:opacity-60"
              >
                Khởi động lại giao diện
              </button>
              <button
                type="button"
                disabled={this.state.cleaning}
                onClick={() => void this.handleSafeCacheCleanReload()}
                className="w-full py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-600 text-amber-200 font-semibold text-xs transition disabled:opacity-60"
              >
                {this.state.cleaning
                  ? 'Đang dọn bộ nhớ đệm...'
                  : 'Dọn bộ nhớ đệm & Chế độ An toàn (Giữ tệp .py)'}
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById('root')!).render(
  <AppErrorBoundary>
    <App />
  </AppErrorBoundary>
);


