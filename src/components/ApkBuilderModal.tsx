import React, { useState } from 'react';
import {
  Smartphone,
  X,
  Download,
  Github,
  CheckCircle2,
  Cpu,
  Layers,
  FileCode,
  Shield,
  HelpCircle,
  Copy,
  Check,
  Sparkles,
} from 'lucide-react';
import { ApkConfig } from '../types';
import {
  createApkZipPackage,
  generateBuildozerSpec,
  generateGitHubWorkflow,
  generateReadme,
  detectRequirements,
} from '../services/apkGenerator';

interface ApkBuilderModalProps {
  isOpen: boolean;
  onClose: () => void;
  pythonCode: string;
}

export const ApkBuilderModal: React.FC<ApkBuilderModalProps> = ({
  isOpen,
  onClose,
  pythonCode,
}) => {
  const [config, setConfig] = useState<ApkConfig>({
    appName: 'PydroidApp',
    packageName: 'pydroid_app',
    version: '1.0.0',
    author: 'Pydroid User',
    orientation: 'portrait',
    permissions: ['INTERNET', 'VIBRATE'],
    includeKivyTemplate: true,
  });

  const [activeTab, setActiveTab] = useState<'guide' | 'spec' | 'workflow' | 'readme'>('guide');
  const [isGenerating, setIsGenerating] = useState(false);
  const [downloadSuccess, setDownloadSuccess] = useState(false);
  const [copied, setCopied] = useState(false);

  const detectedRequirements = detectRequirements(pythonCode);

  if (!isOpen) return null;

  const togglePermission = (perm: string) => {
    setConfig((prev) => {
      const exists = prev.permissions.includes(perm);
      return {
        ...prev,
        permissions: exists
          ? prev.permissions.filter((p) => p !== perm)
          : [...prev.permissions, perm],
      };
    });
  };

  const handleDownloadZip = async () => {
    setIsGenerating(true);
    setDownloadSuccess(false);

    try {
      const zipBlob = await createApkZipPackage(config, pythonCode, detectedRequirements);
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${config.appName.replace(/[^a-zA-Z0-9_-]/g, '_')}_Android_APK_Source.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setDownloadSuccess(true);
      setTimeout(() => setDownloadSuccess(false), 5000);
    } catch (err) {
      console.error('Error generating APK zip:', err);
      alert('Không thể tạo file zip đóng gói: ' + err);
    } finally {
      setIsGenerating(false);
    }
  };

  const copyContent = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 animate-in fade-in duration-200">
      <div
        className="w-full max-w-3xl max-h-[92vh] bg-[#161a24] border border-indigo-700/60 rounded-2xl shadow-2xl flex flex-col overflow-hidden text-slate-100"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-4 py-3 bg-[#1d2232] border-b border-indigo-800/60 flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-xl bg-gradient-to-br from-indigo-500 to-sky-600 text-white shadow-lg">
              <Smartphone className="w-5 h-5 text-indigo-100" />
            </div>
            <div>
              <h2 className="font-bold text-base text-slate-100 flex items-center space-x-2">
                <span>Đóng Gói Android APK Miễn Phí</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] bg-indigo-500/20 text-indigo-300 font-semibold border border-indigo-500/30">
                  GitHub Actions Cloud
                </span>
              </h2>
              <p className="text-[11px] text-slate-400">
                Tự động tạo tệp app-debug.apk trên đám mây, không cần cài đặt Linux trên máy tính
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

        {/* Tab switcher */}
        <div className="flex items-center bg-[#131620] px-4 pt-2 border-b border-slate-800 text-xs shrink-0 overflow-x-auto">
          <button
            onClick={() => setActiveTab('guide')}
            className={`pb-2 px-3 font-semibold border-b-2 flex items-center space-x-1.5 transition ${
              activeTab === 'guide'
                ? 'border-indigo-500 text-indigo-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Quy Trình 4 Bước</span>
          </button>
          <button
            onClick={() => setActiveTab('spec')}
            className={`pb-2 px-3 font-semibold border-b-2 flex items-center space-x-1.5 transition ${
              activeTab === 'spec'
                ? 'border-sky-500 text-sky-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <FileCode className="w-3.5 h-3.5" />
            <span>buildozer.spec</span>
          </button>
          <button
            onClick={() => setActiveTab('workflow')}
            className={`pb-2 px-3 font-semibold border-b-2 flex items-center space-x-1.5 transition ${
              activeTab === 'workflow'
                ? 'border-emerald-500 text-emerald-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Github className="w-3.5 h-3.5" />
            <span>build-apk.yml</span>
          </button>
          <button
            onClick={() => setActiveTab('readme')}
            className={`pb-2 px-3 font-semibold border-b-2 flex items-center space-x-1.5 transition ${
              activeTab === 'readme'
                ? 'border-amber-500 text-amber-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <HelpCircle className="w-3.5 h-3.5" />
            <span>Hướng Dẫn Chi Tiết</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {activeTab === 'guide' ? (
            <>
              {/* App Configuration Form */}
              <div className="p-3.5 rounded-xl bg-[#191d29] border border-slate-700/70 space-y-3">
                <h3 className="text-xs font-bold text-sky-400 uppercase tracking-wider flex items-center space-x-1.5">
                  <Layers className="w-3.5 h-3.5" />
                  <span>Cấu Hình Thông Tin Ứng Dụng Android</span>
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                  <div>
                    <label className="block text-slate-400 mb-1">Tên ứng dụng</label>
                    <input
                      type="text"
                      value={config.appName}
                      onChange={(e) => setConfig({ ...config, appName: e.target.value })}
                      className="w-full bg-[#11141c] border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-100 font-medium focus:outline-none focus:border-indigo-400"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 mb-1">Mã gói (Package Name)</label>
                    <input
                      type="text"
                      value={config.packageName}
                      onChange={(e) => setConfig({ ...config, packageName: e.target.value })}
                      className="w-full bg-[#11141c] border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-100 font-mono focus:outline-none focus:border-indigo-400"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 mb-1">Phiên bản (Version)</label>
                    <input
                      type="text"
                      value={config.version}
                      onChange={(e) => setConfig({ ...config, version: e.target.value })}
                      className="w-full bg-[#11141c] border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-100 font-mono focus:outline-none focus:border-indigo-400"
                    />
                  </div>
                </div>

                {/* Orientation & Permissions */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs pt-1">
                  <div>
                    <label className="block text-slate-400 mb-1">Hướng màn hình</label>
                    <select
                      value={config.orientation}
                      onChange={(e) =>
                        setConfig({
                          ...config,
                          orientation: e.target.value as ApkConfig['orientation'],
                        })
                      }
                      className="w-full bg-[#11141c] border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-100 focus:outline-none focus:border-indigo-400"
                    >
                      <option value="portrait">Dọc (Portrait - Khuyên dùng)</option>
                      <option value="landscape">Ngang (Landscape - Cho game/đồ thị)</option>
                      <option value="all">Tự động xoay (All)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-slate-400 mb-1">Quyền Android</label>
                    <div className="flex flex-wrap gap-1.5">
                      {['INTERNET', 'VIBRATE', 'READ_EXTERNAL_STORAGE', 'CAMERA', 'WAKE_LOCK'].map(
                        (perm) => {
                          const active = config.permissions.includes(perm);
                          return (
                            <button
                              key={perm}
                              type="button"
                              onClick={() => togglePermission(perm)}
                              className={`px-2 py-0.5 rounded text-[11px] font-mono transition ${
                                active
                                  ? 'bg-indigo-600/40 text-indigo-300 border border-indigo-500/50'
                                  : 'bg-slate-800 text-slate-400 border border-slate-700/60'
                              }`}
                            >
                              {perm}
                            </button>
                          );
                        }
                      )}
                    </div>
                  </div>
                </div>

                {/* Anti-Crash Guard Banner */}
                <div className="pt-2 border-t border-slate-800 space-y-2">
                  <div className="p-2.5 rounded-lg bg-emerald-950/40 border border-emerald-500/50 flex items-start space-x-2 text-xs">
                    <Shield className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                    <div>
                      <div className="font-semibold text-emerald-300">
                        🛡️ Công nghệ chống văng (Anti-Crash Guard):
                      </div>
                      <div className="text-slate-300 text-[11px] mt-0.5">
                        Tự động bọc mã nguồn vào Terminal Android, hỗ trợ lệnh <code className="text-amber-300 font-mono">input()</code> tương tác, phím Gửi dữ liệu, nút chạy lại và bắt mọi ngoại lệ trên màn hình (không bao giờ bị văng app ra ngoài).
                      </div>
                    </div>
                  </div>

                  <div className="text-[11px] text-slate-400 flex items-center gap-1.5 flex-wrap">
                    <span className="text-slate-300 font-semibold">Gói phụ thuộc tự động:</span>
                    {detectedRequirements.map((pkg) => (
                      <span key={pkg} className="px-1.5 py-0.5 rounded bg-slate-800 text-sky-300 font-mono text-[10px] border border-slate-700">
                        {pkg}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {/* 4-Step Visual Roadmap */}
              <div className="p-4 rounded-xl bg-[#191d29] border border-slate-700/70 space-y-3">
                <h3 className="text-xs font-bold text-amber-400 uppercase tracking-wider flex items-center space-x-1.5">
                  <Smartphone className="w-3.5 h-3.5" />
                  <span>Quy Trình Đóng Gói Thành Tệp APK Trên Điện Thoại (3 Phút)</span>
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  {/* Step 1 */}
                  <div className="p-3 rounded-lg bg-[#12151e] border border-slate-800 flex items-start space-x-3">
                    <div className="w-6 h-6 rounded-full bg-indigo-600 text-white font-bold flex items-center justify-center shrink-0 text-xs">
                      1
                    </div>
                    <div>
                      <div className="font-semibold text-slate-200">
                        Tải Toàn Bộ Mã Nguồn (.ZIP)
                      </div>
                      <p className="text-slate-400 text-[11px] mt-0.5">
                        Nhấn nút "Tải mã nguồn APK (.ZIP)" bên dưới để tải gói cấu hình đầy đủ.
                      </p>
                    </div>
                  </div>

                  {/* Step 2 */}
                  <div className="p-3 rounded-lg bg-[#12151e] border border-slate-800 flex items-start space-x-3">
                    <div className="w-6 h-6 rounded-full bg-sky-600 text-white font-bold flex items-center justify-center shrink-0 text-xs">
                      2
                    </div>
                    <div>
                      <div className="font-semibold text-slate-200">
                        Tải Lên Kho Lưu Trữ GitHub
                      </div>
                      <p className="text-slate-400 text-[11px] mt-0.5">
                        Tạo repo mới trên github.com và tải toàn bộ các file trong zip lên.
                      </p>
                    </div>
                  </div>

                  {/* Step 3 */}
                  <div className="p-3 rounded-lg bg-[#12151e] border border-slate-800 flex items-start space-x-3">
                    <div className="w-6 h-6 rounded-full bg-amber-600 text-white font-bold flex items-center justify-center shrink-0 text-xs">
                      3
                    </div>
                    <div>
                      <div className="font-semibold text-slate-200">
                        GitHub Actions Biên Dịch Tự Động
                      </div>
                      <p className="text-slate-400 text-[11px] mt-0.5">
                        Quy trình build-apk.yml tự động build Buildozer trên Ubuntu cloud (~3 phút).
                      </p>
                    </div>
                  </div>

                  {/* Step 4 */}
                  <div className="p-3 rounded-lg bg-[#12151e] border border-slate-800 flex items-start space-x-3">
                    <div className="w-6 h-6 rounded-full bg-emerald-600 text-white font-bold flex items-center justify-center shrink-0 text-xs">
                      4
                    </div>
                    <div>
                      <div className="font-semibold text-slate-200">
                        Tải File app-debug.apk & Cài Đặt
                      </div>
                      <p className="text-slate-400 text-[11px] mt-0.5">
                        Vào mục Artifacts tải file APK về điện thoại Android và mở cài đặt ngay!
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </>
          ) : activeTab === 'spec' ? (
            <div className="relative rounded-xl bg-[#0f1118] border border-slate-800 p-3">
              <button
                onClick={() => copyContent(generateBuildozerSpec(config, detectedRequirements))}
                className="absolute top-3 right-3 px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-xs flex items-center space-x-1"
              >
                {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                <span>{copied ? 'Đã sao chép' : 'Sao chép'}</span>
              </button>
              <pre className="text-xs font-mono text-sky-200 overflow-x-auto max-h-[55vh] select-text">
                {generateBuildozerSpec(config, detectedRequirements)}
              </pre>
            </div>
          ) : activeTab === 'workflow' ? (
            <div className="relative rounded-xl bg-[#0f1118] border border-slate-800 p-3">
              <button
                onClick={() => copyContent(generateGitHubWorkflow(config.appName))}
                className="absolute top-3 right-3 px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-xs flex items-center space-x-1"
              >
                {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                <span>{copied ? 'Đã sao chép' : 'Sao chép'}</span>
              </button>
              <pre className="text-xs font-mono text-emerald-200 overflow-x-auto max-h-[55vh] select-text">
                {generateGitHubWorkflow(config.appName)}
              </pre>
            </div>
          ) : (
            <div className="relative rounded-xl bg-[#0f1118] border border-slate-800 p-4">
              <div className="text-xs sm:text-sm text-slate-300 leading-relaxed whitespace-pre-line select-text">
                {generateReadme(config.appName, config.packageName)}
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-4 py-3 bg-[#1d2232] border-t border-indigo-800/60 flex items-center justify-between shrink-0">
          <button
            onClick={onClose}
            className="px-3.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs transition"
          >
            Đóng
          </button>

          <button
            onClick={handleDownloadZip}
            disabled={isGenerating}
            className="px-4 py-2 rounded-xl bg-gradient-to-r from-indigo-600 via-sky-600 to-emerald-600 hover:from-indigo-500 hover:to-emerald-500 text-white font-bold text-xs sm:text-sm flex items-center space-x-2 shadow-xl active:scale-95 transition disabled:opacity-50"
          >
            <Download className="w-4 h-4" />
            <span>
              {isGenerating
                ? 'Đang tạo gói ZIP...'
                : downloadSuccess
                ? 'Đã tải xong gói APK (.ZIP)!'
                : 'Đóng Gói APK & Tải Mã Nguồn (.ZIP)'}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};
