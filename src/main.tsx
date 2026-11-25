import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

class AppErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return {
      hasError: true,
      errorMessage: error instanceof Error ? error.message : String(error || 'Lỗi không xác định'),
    };
  }

  override componentDidCatch(error: unknown) {
    console.error('Unhandled UI error caught by AppErrorBoundary:', error);
  }

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
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="w-full py-2.5 px-4 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs transition"
            >
              Khởi động lại giao diện
            </button>
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

