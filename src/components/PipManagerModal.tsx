import React, { useState } from 'react';
import {
  Package,
  X,
  Search,
  Check,
  Download,
  RotateCw,
  Sparkles,
  ExternalLink,
  Layers,
  AlertCircle,
} from 'lucide-react';
import { PipPackage } from '../types';

interface PipManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  installedPackages: string[];
  onInstallPackage: (packageName: string) => Promise<void>;
  isInstalling: boolean;
  installMessage?: string;
}

const POPULAR_PACKAGES: Omit<PipPackage, 'installed'>[] = [
  {
    name: 'numpy',
    description: 'Tính toán ma trận, mảng đa chiều & hàm số học hiệu năng cao.',
    category: 'math',
    isPopular: true,
  },
  {
    name: 'matplotlib',
    description: 'Vẽ đồ thị 2D, biểu đồ hình sin, cột, phân tán (xem trực tiếp trên Pydroid 3).',
    category: 'visual',
    isPopular: true,
  },
  {
    name: 'pandas',
    description: 'Cấu trúc dữ liệu DataFrame, phân tích bảng tính & chuỗi thời gian.',
    category: 'data',
    isPopular: true,
  },
  {
    name: 'pyfiglet',
    description: 'Tạo chữ nghệ thuật ASCII banner đồ họa cho terminal.',
    category: 'cli',
    isPopular: true,
  },
  {
    name: 'colorama',
    description: 'Định dạng màu sắc ANSI và kiểu chữ nổi bật trong Terminal.',
    category: 'cli',
    isPopular: true,
  },
  {
    name: 'requests',
    description: 'Gửi HTTP GET/POST request đơn giản và thân thiện cho lập trình viên.',
    category: 'utility',
    isPopular: true,
  },
  {
    name: 'sympy',
    description: 'Hệ thống toán học ký hiệu, giải phương trình, vi phân tích phân.',
    category: 'math',
    isPopular: true,
  },
  {
    name: 'beautifulsoup4',
    description: 'Trích xuất và bóc tách dữ liệu từ file HTML & XML web scraping.',
    category: 'utility',
  },
  {
    name: 'scipy',
    description: 'Thuật toán toán học, khoa học & kỹ thuật tối ưu hóa.',
    category: 'math',
  },
  {
    name: 'rich',
    description: 'Tô màu bảng biểu, thanh tiến trình và markdown trong terminal.',
    category: 'cli',
  },
  {
    name: 'pillow',
    description: 'Xử lý hình ảnh, cắt ghép, xoay và bộ lọc filter.',
    category: 'visual',
  },
];

export const PipManagerModal: React.FC<PipManagerModalProps> = ({
  isOpen,
  onClose,
  installedPackages,
  onInstallPackage,
  isInstalling,
  installMessage,
}) => {
  const [search, setSearch] = useState('');
  const [customPkg, setCustomPkg] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleInstall = async (pkgName: string) => {
    setErrorMsg(null);
    try {
      await onInstallPackage(pkgName);
    } catch (err: any) {
      setErrorMsg(err?.message || `Lỗi cài đặt ${pkgName}`);
    }
  };

  const handleCustomInstall = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customPkg.trim()) return;
    handleInstall(customPkg.trim());
    setCustomPkg('');
  };

  const filteredPackages = POPULAR_PACKAGES.filter(
    (p) =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.description.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 animate-in fade-in duration-200">
      <div
        className="w-full max-w-2xl max-h-[90vh] bg-[#161a24] border border-slate-700/80 rounded-2xl shadow-2xl flex flex-col overflow-hidden text-slate-100"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-4 py-3 bg-[#1d2230] border-b border-slate-700/80 flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-2">
            <div className="p-1.5 rounded-lg bg-purple-600/30 text-purple-400 border border-purple-500/30">
              <Package className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-bold text-base text-slate-100 flex items-center space-x-2">
                <span>Quản Lý Thư Viện Pip</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] bg-purple-500/20 text-purple-300 font-semibold border border-purple-500/30">
                  PyPI / Micropip
                </span>
              </h2>
              <p className="text-[11px] text-slate-400">
                Cài đặt các gói thư viện Python bổ trợ cho WASM & CPython
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-white transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Custom Pip Install Bar */}
        <div className="p-3 bg-[#12141c] border-b border-slate-800 shrink-0">
          <form onSubmit={handleCustomInstall} className="flex items-center space-x-2">
            <span className="text-slate-400 text-xs font-mono font-semibold pl-1">
              pip install
            </span>
            <input
              type="text"
              placeholder="Tên gói (vd: pyfiglet, requests, sympy)..."
              value={customPkg}
              onChange={(e) => setCustomPkg(e.target.value)}
              disabled={isInstalling}
              className="flex-1 bg-[#1a1e2a] border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-purple-400 font-mono"
            />
            <button
              type="submit"
              disabled={isInstalling || !customPkg.trim()}
              className="px-3.5 py-1.5 bg-purple-600 hover:bg-purple-500 active:bg-purple-700 disabled:opacity-40 text-white rounded-lg text-xs font-medium flex items-center space-x-1.5 shadow transition"
            >
              {isInstalling ? (
                <RotateCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Download className="w-3.5 h-3.5" />
              )}
              <span>Cài đặt</span>
            </button>
          </form>

          {/* Search filter */}
          <div className="relative mt-2.5">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Tìm kiếm trong danh sách gói phổ biến..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-[#181c26] border border-slate-700/60 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-purple-400 placeholder-slate-500"
            />
          </div>
        </div>

        {/* Installation Progress Alert */}
        {isInstalling && (
          <div className="mx-3 mt-3 p-3 rounded-xl bg-purple-950/40 border border-purple-800/60 flex items-center space-x-3 text-purple-300">
            <RotateCw className="w-5 h-5 animate-spin text-purple-400 shrink-0" />
            <div className="text-xs">
              <div className="font-semibold text-purple-200">
                Đang tiến hành tải & cài đặt...
              </div>
              <div className="text-[11px] text-purple-300/80">
                {installMessage || 'Vui lòng chờ trong giây lát...'}
              </div>
            </div>
          </div>
        )}

        {/* Error notification */}
        {errorMsg && (
          <div className="mx-3 mt-3 p-3 rounded-xl bg-rose-950/40 border border-rose-800/60 flex items-center space-x-2 text-rose-300 text-xs">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Package list */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {filteredPackages.map((pkg) => {
            const isInstalled = installedPackages.includes(pkg.name.toLowerCase());

            return (
              <div
                key={pkg.name}
                className="p-3 rounded-xl bg-[#1a1f2b] border border-slate-700/60 hover:border-slate-600 transition flex items-center justify-between space-x-3"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center space-x-2">
                    <span className="font-mono font-bold text-sm text-slate-100">
                      {pkg.name}
                    </span>
                    {pkg.isPopular && (
                      <span className="px-1.5 py-0.2 rounded text-[9px] bg-amber-500/20 text-amber-300 font-semibold border border-amber-500/30">
                        Khuyên dùng
                      </span>
                    )}
                    <span className="text-[10px] text-slate-400 uppercase tracking-wider">
                      {pkg.category}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-1 line-clamp-2">
                    {pkg.description}
                  </p>
                </div>

                <div className="shrink-0">
                  {isInstalled ? (
                    <div className="px-2.5 py-1 rounded-lg bg-emerald-950/40 border border-emerald-600/40 text-emerald-400 text-xs font-semibold flex items-center space-x-1">
                      <Check className="w-3.5 h-3.5" />
                      <span>Đã có</span>
                    </div>
                  ) : (
                    <button
                      onClick={() => handleInstall(pkg.name)}
                      disabled={isInstalling}
                      className="px-3 py-1 rounded-lg bg-purple-600/30 hover:bg-purple-600 text-purple-200 hover:text-white border border-purple-500/40 text-xs font-medium flex items-center space-x-1 transition disabled:opacity-40"
                    >
                      <Download className="w-3 h-3" />
                      <span>Cài đặt</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer info */}
        <div className="px-4 py-2.5 bg-[#1d2230] border-t border-slate-700/80 flex items-center justify-between text-xs text-slate-400">
          <span>{installedPackages.length} thư viện đã sẵn sàng</span>
          <button
            onClick={onClose}
            className="px-3 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs transition"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
};
