import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  X,
  Activity,
  RefreshCw,
  Trash2,
  Zap,
  CheckCircle2,
  AlertCircle,
  HardDrive,
  Cpu,
  Layers,
} from 'lucide-react';
import {
  PyodideMemorySnapshot,
  RamHistorySample,
  getPyodideMemoryDiagnostics,
  getRamHistorySamples,
} from '../services/pyodideService';

interface RamDiagnosticsModalProps {
  isOpen: boolean;
  onClose: () => void;
  isPythonRunning: boolean;
  getTerminalMemoryStats: () => { terminalBufferBytes: number; terminalPlotCount: number };
  onLightCleanup: () => Promise<{ ok: boolean; message: string }>;
  onDeepCleanup: () => Promise<{ ok: boolean; message: string }>;
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 KB';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatMb(bytes: number | null): string {
  if (bytes === null || !Number.isFinite(bytes)) return 'N/A';
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatTime(ts: number): string {
  try {
    const d = new Date(ts);
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    const ss = String(d.getSeconds()).padStart(2, '0');
    return `${hh}:${mm}:${ss}`;
  } catch {
    return '--:--:--';
  }
}

export const RamDiagnosticsModal: React.FC<RamDiagnosticsModalProps> = ({
  isOpen,
  onClose,
  isPythonRunning,
  getTerminalMemoryStats,
  onLightCleanup,
  onDeepCleanup,
}) => {
  const [snapshot, setSnapshot] = useState<PyodideMemorySnapshot | null>(null);
  const [history, setHistory] = useState<RamHistorySample[]>([]);
  const [loading, setLoading] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [cleanupBusy, setCleanupBusy] = useState<'light' | 'deep' | null>(null);
  const [cleanupReport, setCleanupReport] = useState<{
    ok: boolean;
    message: string;
    detail?: string;
  } | null>(null);
  const [selectedSampleIdx, setSelectedSampleIdx] = useState<number | null>(null);

  const refreshDiagnostics = useCallback(
    async (opts?: { forceIdbScan?: boolean; event?: 'cleanup-light' | 'cleanup-deep' }) => {
      setLoading(true);
      try {
        const termStats = getTerminalMemoryStats();
        const next = await getPyodideMemoryDiagnostics({
          terminalBufferBytes: termStats.terminalBufferBytes,
          terminalPlotCount: termStats.terminalPlotCount,
          forceIdbScan: opts?.forceIdbScan,
          recordSample: true,
          event: opts?.event,
        });
        setSnapshot(next);
        const samples = getRamHistorySamples();
        setHistory(samples);
        setSelectedSampleIdx(samples.length > 0 ? samples.length - 1 : null);
      } finally {
        setLoading(false);
      }
    },
    [getTerminalMemoryStats]
  );

  useEffect(() => {
    if (!isOpen) return;
    setCleanupReport(null);
    void refreshDiagnostics({ forceIdbScan: true });
  }, [isOpen, refreshDiagnostics]);

  useEffect(() => {
    if (!isOpen || !autoRefresh) return;
    const timer = window.setInterval(() => {
      if (cleanupBusy) return;
      void refreshDiagnostics({ forceIdbScan: false });
    }, 2500);
    return () => window.clearInterval(timer);
  }, [isOpen, autoRefresh, cleanupBusy, refreshDiagnostics]);

  const handleLightCleanupClick = async () => {
    if (cleanupBusy) return;
    const before = snapshot;
    setCleanupBusy('light');
    setCleanupReport(null);
    try {
      const res = await onLightCleanup();
      const termStats = getTerminalMemoryStats();
      const after = await getPyodideMemoryDiagnostics({
        terminalBufferBytes: termStats.terminalBufferBytes,
        terminalPlotCount: termStats.terminalPlotCount,
        forceIdbScan: true,
        recordSample: true,
        event: 'cleanup-light',
      });
      setSnapshot(after);
      const samples = getRamHistorySamples();
      setHistory(samples);
      setSelectedSampleIdx(samples.length > 0 ? samples.length - 1 : null);

      const parts: string[] = [];
      if (before) {
        const cacheDelta = before.ramAssetCacheBytes - after.ramAssetCacheBytes;
        const idbDelta = before.idbCdnAssetsBytes - after.idbCdnAssetsBytes;
        const jsDelta =
          before.jsHeapUsedBytes !== null && after.jsHeapUsedBytes !== null
            ? before.jsHeapUsedBytes - after.jsHeapUsedBytes
            : 0;
        if (cacheDelta > 1024) parts.push(`RAM cache -${formatBytes(cacheDelta)}`);
        if (idbDelta > 1024) parts.push(`IDB -${formatBytes(idbDelta)}`);
        if (jsDelta > 64 * 1024) parts.push(`JS Heap -${formatBytes(jsDelta)}`);
      }
      setCleanupReport({
        ok: res.ok,
        message: res.message,
        detail:
          parts.length > 0
            ? `Đã thu hồi: ${parts.join(' · ')}`
            : 'Đã chạy Python gc.collect(), đóng đồ thị Matplotlib & làm sạch cache JS.',
      });
    } finally {
      setCleanupBusy(null);
    }
  };

  const handleDeepCleanupClick = async () => {
    if (cleanupBusy) return;
    const before = snapshot;
    setCleanupBusy('deep');
    setCleanupReport(null);
    try {
      const res = await onDeepCleanup();
      const termStats = getTerminalMemoryStats();
      const after = await getPyodideMemoryDiagnostics({
        terminalBufferBytes: termStats.terminalBufferBytes,
        terminalPlotCount: termStats.terminalPlotCount,
        forceIdbScan: true,
        recordSample: true,
        event: 'cleanup-deep',
      });
      setSnapshot(after);
      const samples = getRamHistorySamples();
      setHistory(samples);
      setSelectedSampleIdx(samples.length > 0 ? samples.length - 1 : null);

      const parts: string[] = [];
      if (before) {
        const wasmDelta = before.wasmHeapBytes - after.wasmHeapBytes;
        const termDelta = before.terminalBufferBytes - after.terminalBufferBytes;
        const idbDelta = before.idbCdnAssetsBytes - after.idbCdnAssetsBytes;
        if (wasmDelta > 0) parts.push(`WASM -${formatBytes(wasmDelta)}`);
        if (termDelta > 0) parts.push(`Terminal -${formatBytes(termDelta)}`);
        if (idbDelta > 0) parts.push(`Cache đĩa -${formatBytes(idbDelta)}`);
      }
      setCleanupReport({
        ok: res.ok,
        message: res.message,
        detail:
          parts.length > 0
            ? `Giải phóng tức thì: ${parts.join(' · ')} (không khởi động lại ứng dụng)`
            : 'Đã thu hồi toàn bộ WASM Worker nhàn rỗi và bộ đệm tạm (không khởi động lại ứng dụng).',
      });
    } finally {
      setCleanupBusy(null);
    }
  };

  // Compute RAM allocation breakdown segments
  const allocation = useMemo(() => {
    if (!snapshot) {
      return { totalBytes: 0, segments: [] as Array<{ id: string; label: string; bytes: number; color: string; pct: number }> };
    }
    const wasmBytes = snapshot.wasmHeapBytes;
    const jsBytes = snapshot.jsHeapUsedBytes ?? 0;
    const termBytes = snapshot.terminalBufferBytes;
    const ramCacheBytes = snapshot.ramAssetCacheBytes;
    const total = Math.max(1, wasmBytes + jsBytes + termBytes + ramCacheBytes);

    const raw = [
      { id: 'wasm', label: 'Pyodide WASM Heap', bytes: wasmBytes, color: '#22d3ee' },
      ...(snapshot.jsHeapUsedBytes !== null
        ? [{ id: 'js', label: 'WebView JS Heap', bytes: jsBytes, color: '#34d399' }]
        : []),
      { id: 'term', label: 'Terminal & Đồ thị', bytes: termBytes, color: '#f59e0b' },
      { id: 'cache', label: 'Cache tài sản RAM', bytes: ramCacheBytes, color: '#a855f7' },
    ];

    return {
      totalBytes: wasmBytes + jsBytes + termBytes + ramCacheBytes,
      segments: raw.map((seg) => ({
        ...seg,
        pct: Math.round((seg.bytes / total) * 1000) / 10,
      })),
    };
  }, [snapshot]);

  // SVG Trend Chart geometry
  const trendChart = useMemo(() => {
    const width = 560;
    const height = 160;
    const padL = 44;
    const padR = 14;
    const padT = 14;
    const padB = 26;
    const plotW = width - padL - padR;
    const plotH = height - padT - padB;

    const maxVal = Math.max(
      16,
      ...history.map((s) => Math.max(s.wasmHeapMb, s.jsHeapMb ?? 0))
    );
    const niceMax = Math.ceil(maxVal / 10) * 10;

    const toX = (idx: number, count: number) => {
      if (count <= 1) return padL + plotW / 2;
      return padL + (idx / (count - 1)) * plotW;
    };
    const toY = (valMb: number) => {
      const clamped = Math.max(0, Math.min(niceMax, valMb));
      return padT + plotH - (clamped / niceMax) * plotH;
    };

    const wasmPoints = history.map((s, idx) => ({
      x: toX(idx, history.length),
      y: toY(s.wasmHeapMb),
      val: s.wasmHeapMb,
      ts: s.timestamp,
      event: s.event,
    }));

    const jsPoints = history
      .map((s, idx) =>
        s.jsHeapMb !== null
          ? {
              x: toX(idx, history.length),
              y: toY(s.jsHeapMb),
              val: s.jsHeapMb,
            }
          : null
      )
      .filter((p): p is { x: number; y: number; val: number } => p !== null);

    const wasmLinePath =
      wasmPoints.length > 0
        ? wasmPoints.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
        : '';

    const wasmAreaPath =
      wasmPoints.length > 1
        ? `${wasmLinePath} L${wasmPoints[wasmPoints.length - 1].x.toFixed(1)},${(padT + plotH).toFixed(1)} L${wasmPoints[0].x.toFixed(1)},${(padT + plotH).toFixed(1)} Z`
        : '';

    const jsLinePath =
      jsPoints.length > 1
        ? jsPoints.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
        : '';

    return {
      width,
      height,
      padL,
      padR,
      padT,
      padB,
      plotW,
      plotH,
      niceMax,
      wasmPoints,
      jsPoints,
      wasmLinePath,
      wasmAreaPath,
      jsLinePath,
      yTicks: [0, Math.round(niceMax / 2), niceMax],
    };
  }, [history]);

  if (!isOpen) return null;

  const activeSample =
    selectedSampleIdx !== null && history[selectedSampleIdx]
      ? history[selectedSampleIdx]
      : history[history.length - 1] || null;

  const idbUsedPct = snapshot
    ? Math.min(100, Math.round((snapshot.idbCdnAssetsBytes / Math.max(1, snapshot.idbCdnBudgetBytes)) * 1000) / 10)
    : 0;

  const runtimeLabel = !snapshot
    ? 'Đang đo...'
    : snapshot.workerBusy
    ? 'Đang thực thi Python'
    : snapshot.runtimeMode === 'worker'
    ? 'Pyodide Worker đang nạp'
    : snapshot.runtimeMode === 'main-thread'
    ? 'Pyodide Main-Thread đang nạp'
    : 'Pyodide chưa nạp (0 MB WASM)';

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl max-h-[92vh] bg-[#070b14] border border-cyan-500/30 rounded-2xl shadow-[0_12px_48px_rgba(0,0,0,0.85)] flex flex-col overflow-hidden text-slate-100"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-4 py-3 bg-[#0b1324] border-b border-cyan-500/20 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center space-x-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-cyan-500/15 border border-cyan-400/40 flex items-center justify-center shrink-0">
              <Activity className="w-5 h-5 text-cyan-300" />
            </div>
            <div className="min-w-0">
              <h2 className="text-[15px] font-bold text-white leading-tight truncate">
                Chẩn đoán RAM Pyodide
              </h2>
              <div className="text-[11px] text-slate-400 flex items-center gap-1.5 truncate mt-0.5">
                <span>{runtimeLabel}</span>
                {snapshot && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono tabular-nums text-cyan-300">
                      {snapshot.execCount} lần chạy
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => void refreshDiagnostics({ forceIdbScan: true })}
              disabled={loading || !!cleanupBusy}
              className="min-h-[44px] px-3 rounded-xl bg-[#0e192f] hover:bg-[#162748] border border-cyan-500/30 text-cyan-200 text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0 transition disabled:opacity-60"
              aria-label="Làm mới số liệu RAM"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Làm mới</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="min-h-[44px] min-w-[44px] rounded-xl bg-[#0e192f] hover:bg-[#162748] border border-slate-700 text-slate-300 hover:text-white flex items-center justify-center transition shrink-0"
              aria-label="Đóng chẩn đoán RAM"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          {/* Top KPI Strip */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="p-3.5 rounded-xl bg-[#0b1324] border border-cyan-500/20">
              <div className="text-[11px] text-slate-400 font-medium flex items-center justify-between">
                <span>Pyodide WASM Heap</span>
                <Cpu className="w-3.5 h-3.5 text-cyan-400" />
              </div>
              <div className="mt-1 text-xl font-bold text-cyan-300 font-mono tabular-nums">
                {snapshot ? formatBytes(snapshot.wasmHeapBytes) : '...'}
              </div>
              <div className="mt-1 text-[11px] text-slate-400 font-mono tabular-nums truncate">
                {snapshot
                  ? snapshot.wasmHeapBytes > 0
                    ? `${snapshot.pythonModulesCount} modules · ${snapshot.loadedPackages.length} gói`
                    : 'Động cơ đang ngủ (0 MB)'
                  : 'Đang kiểm tra'}
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-[#0b1324] border border-emerald-500/20">
              <div className="text-[11px] text-slate-400 font-medium flex items-center justify-between">
                <span>WebView JS Heap</span>
                <Layers className="w-3.5 h-3.5 text-emerald-400" />
              </div>
              <div className="mt-1 text-xl font-bold text-emerald-300 font-mono tabular-nums">
                {snapshot
                  ? snapshot.jsHeapUsedBytes !== null
                    ? formatMb(snapshot.jsHeapUsedBytes)
                    : 'Không hỗ trợ'
                  : '...'}
              </div>
              <div className="mt-1 text-[11px] text-slate-400 font-mono tabular-nums truncate">
                {snapshot?.jsHeapLimitBytes
                  ? `Giới hạn ${formatMb(snapshot.jsHeapLimitBytes)}`
                  : 'Chỉ có trên WebView / Chrome'}
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-[#0b1324] border border-amber-500/20">
              <div className="text-[11px] text-slate-400 font-medium flex items-center justify-between">
                <span>Cache Đĩa IndexedDB</span>
                <HardDrive className="w-3.5 h-3.5 text-amber-400" />
              </div>
              <div className="mt-1 text-xl font-bold text-amber-300 font-mono tabular-nums">
                {snapshot ? formatBytes(snapshot.idbCdnAssetsBytes) : '...'}
              </div>
              <div className="mt-1 text-[11px] text-slate-400 font-mono tabular-nums truncate">
                {snapshot
                  ? `Ngưỡng ${formatMb(snapshot.idbCdnBudgetBytes)} (${idbUsedPct}%)`
                  : 'Đang quét bộ nhớ đệm'}
              </div>
            </div>
          </div>

          {/* Chart 1: Memory Allocation Breakdown */}
          <div className="p-4 rounded-xl bg-[#0b1324] border border-slate-800 space-y-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-[13px] font-bold text-slate-100">
                  Phân bổ bộ nhớ đang chiếm dụng
                </h3>
                <p className="text-[11px] text-slate-400">
                  Tổng RAM đo được:{' '}
                  <span className="font-mono tabular-nums text-slate-200 font-semibold">
                    {formatBytes(allocation.totalBytes)}
                  </span>
                </p>
              </div>
              <span className="text-[11px] font-mono tabular-nums text-slate-400">
                Terminal: {snapshot ? formatBytes(snapshot.terminalBufferBytes) : '0 KB'} ·{' '}
                {snapshot?.terminalPlotCount ?? 0} ảnh
              </span>
            </div>

            {/* Stacked Horizontal SVG Bar */}
            <div className="w-full h-4 rounded-lg bg-[#060911] border border-slate-800 overflow-hidden flex">
              {allocation.totalBytes > 0 ? (
                allocation.segments.map((seg) =>
                  seg.bytes > 0 ? (
                    <div
                      key={seg.id}
                      style={{
                        width: `${Math.max(1.5, seg.pct)}%`,
                        backgroundColor: seg.color,
                      }}
                      title={`${seg.label}: ${formatBytes(seg.bytes)} (${seg.pct}%)`}
                      className="h-full transition-all duration-300 first:rounded-l-md last:rounded-r-md"
                    />
                  ) : null
                )
              ) : (
                <div className="w-full h-full bg-slate-800/40" />
              )}
            </div>

            {/* Detailed Allocation Rows */}
            <div className="divide-y divide-slate-800/80 text-xs">
              {allocation.segments.map((seg) => (
                <div
                  key={seg.id}
                  className="py-2 flex items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className="w-2.5 h-2.5 rounded-sm shrink-0"
                      style={{ backgroundColor: seg.color }}
                      aria-hidden="true"
                    />
                    <span className="text-slate-200 font-medium truncate">{seg.label}</span>
                  </div>
                  <div className="flex items-center gap-3 font-mono tabular-nums shrink-0">
                    <span className="text-slate-400 text-[11px]">{seg.pct.toFixed(1)}%</span>
                    <span className="text-slate-100 font-semibold w-20 text-right">
                      {formatBytes(seg.bytes)}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {/* IndexedDB Budget Progress Bar */}
            {snapshot && (
              <div className="pt-2 border-t border-slate-800/80 space-y-1.5">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-slate-300 font-medium">
                    Bộ nhớ đệm Pyodide WASM/Wheel ({snapshot.idbCdnAssetsCount} tệp · Pip:{' '}
                    {formatBytes(snapshot.idbPackageBundlesBytes)})
                  </span>
                  <span className="font-mono tabular-nums text-amber-300 font-semibold">
                    {formatBytes(snapshot.idbCdnAssetsBytes)} / {formatMb(snapshot.idbCdnBudgetBytes)}
                  </span>
                </div>
                <div className="w-full h-2 rounded-full bg-[#060911] overflow-hidden border border-slate-800">
                  <div
                    className={`h-full transition-all duration-300 ${
                      idbUsedPct > 85
                        ? 'bg-rose-400'
                        : idbUsedPct > 65
                        ? 'bg-amber-400'
                        : 'bg-cyan-400'
                    }`}
                    style={{ width: `${Math.min(100, Math.max(2, idbUsedPct))}%` }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Chart 2: Real-Time Memory Trend SVG Chart */}
          <div className="p-4 rounded-xl bg-[#0b1324] border border-slate-800 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-[13px] font-bold text-slate-100">
                  Biểu đồ theo dõi bộ nhớ theo thời gian
                </h3>
                <div className="text-[11px] text-slate-400 flex flex-wrap items-center gap-2 mt-0.5 font-mono tabular-nums">
                  {activeSample ? (
                    <>
                      <span>{formatTime(activeSample.timestamp)}</span>
                      <span aria-hidden="true">·</span>
                      <span className="text-cyan-300">WASM {activeSample.wasmHeapMb.toFixed(1)} MB</span>
                      {activeSample.jsHeapMb !== null && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="text-emerald-300">JS {activeSample.jsHeapMb.toFixed(1)} MB</span>
                        </>
                      )}
                      {activeSample.event && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="text-amber-300">
                            {activeSample.event === 'cleanup-deep' ? 'Sau dọn sâu' : 'Sau dọn GC'}
                          </span>
                        </>
                      )}
                    </>
                  ) : (
                    <span>Đang thu thập mẫu...</span>
                  )}
                </div>
              </div>

              <button
                type="button"
                onClick={() => setAutoRefresh((v) => !v)}
                className={`min-h-[36px] px-3 rounded-lg border text-[11px] font-semibold whitespace-nowrap shrink-0 transition ${
                  autoRefresh
                    ? 'bg-cyan-500/15 border-cyan-500/40 text-cyan-200'
                    : 'bg-[#0e192f] border-slate-700 text-slate-400 hover:text-slate-200'
                }`}
              >
                {autoRefresh ? 'Tự cập nhật: Bật (2.5s)' : 'Tự cập nhật: Tắt'}
              </button>
            </div>

            <div className="w-full overflow-hidden rounded-lg bg-[#060911] border border-slate-800/90 p-2">
              <svg
                viewBox={`0 0 ${trendChart.width} ${trendChart.height}`}
                className="w-full h-40 select-none"
                role="img"
                aria-label="Biểu đồ sử dụng RAM Pyodide theo thời gian"
              >
                <defs>
                  <linearGradient id="wasmAreaGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.32" />
                    <stop offset="100%" stopColor="#22d3ee" stopOpacity="0.02" />
                  </linearGradient>
                </defs>

                {/* Horizontal Y-Axis Gridlines */}
                {trendChart.yTicks.map((tick) => {
                  const yPos =
                    trendChart.padT +
                    trendChart.plotH -
                    (tick / trendChart.niceMax) * trendChart.plotH;
                  return (
                    <g key={tick}>
                      <line
                        x1={trendChart.padL}
                        y1={yPos}
                        x2={trendChart.width - trendChart.padR}
                        y2={yPos}
                        stroke="rgba(148, 163, 184, 0.16)"
                        strokeDasharray="3 3"
                      />
                      <text
                        x={trendChart.padL - 6}
                        y={yPos + 3.5}
                        textAnchor="end"
                        fill="#94a3b8"
                        fontSize="10"
                        fontFamily="monospace"
                      >
                        {tick}M
                      </text>
                    </g>
                  );
                })}

                {/* Cleanup Event Vertical Guides */}
                {trendChart.wasmPoints.map((pt, idx) =>
                  pt.event ? (
                    <line
                      key={`evt-${idx}`}
                      x1={pt.x}
                      y1={trendChart.padT}
                      x2={pt.x}
                      y2={trendChart.padT + trendChart.plotH}
                      stroke="#f59e0b"
                      strokeWidth="1.2"
                      strokeDasharray="2 2"
                    />
                  ) : null
                )}

                {/* WASM Area + Line */}
                {trendChart.wasmAreaPath && (
                  <path d={trendChart.wasmAreaPath} fill="url(#wasmAreaGrad)" />
                )}
                {trendChart.wasmLinePath && (
                  <path
                    d={trendChart.wasmLinePath}
                    fill="none"
                    stroke="#22d3ee"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                )}

                {/* JS Heap Line */}
                {trendChart.jsLinePath && (
                  <path
                    d={trendChart.jsLinePath}
                    fill="none"
                    stroke="#34d399"
                    strokeWidth="1.8"
                    strokeDasharray="4 3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                )}

                {/* Interactive Sample Points */}
                {trendChart.wasmPoints.map((pt, idx) => {
                  const isSelected =
                    selectedSampleIdx === idx ||
                    (selectedSampleIdx === null && idx === trendChart.wasmPoints.length - 1);
                  return (
                    <g
                      key={idx}
                      className="cursor-pointer"
                      onClick={() => setSelectedSampleIdx(idx)}
                    >
                      <circle cx={pt.x} cy={pt.y} r={10} fill="transparent" />
                      <circle
                        cx={pt.x}
                        cy={pt.y}
                        r={isSelected ? 4.5 : pt.event ? 3.5 : 2.5}
                        fill={pt.event ? '#f59e0b' : '#22d3ee'}
                        stroke="#060911"
                        strokeWidth="1.5"
                      />
                    </g>
                  );
                })}

                {/* X-axis start/end labels */}
                {history.length > 0 && (
                  <>
                    <text
                      x={trendChart.padL}
                      y={trendChart.height - 6}
                      textAnchor="start"
                      fill="#64748b"
                      fontSize="10"
                      fontFamily="monospace"
                    >
                      {formatTime(history[0].timestamp)}
                    </text>
                    <text
                      x={trendChart.width - trendChart.padR}
                      y={trendChart.height - 6}
                      textAnchor="end"
                      fill="#64748b"
                      fontSize="10"
                      fontFamily="monospace"
                    >
                      {formatTime(history[history.length - 1].timestamp)}
                    </text>
                  </>
                )}
              </svg>
            </div>

            {/* Chart Legend */}
            <div className="flex flex-wrap items-center gap-4 text-[11px] text-slate-300">
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-0.5 bg-cyan-400 inline-block" aria-hidden="true" />
                <span>Pyodide WASM Heap (MB)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span
                  className="w-3 h-0.5 border-t-2 border-dashed border-emerald-400 inline-block"
                  aria-hidden="true"
                />
                <span>WebView JS Heap (MB)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-amber-400 inline-block" aria-hidden="true" />
                <span>Mốc dọn dẹp</span>
              </div>
            </div>
          </div>

          {/* Python Runtime Details */}
          {snapshot && (
            <div className="p-4 rounded-xl bg-[#0b1324] border border-slate-800 space-y-2.5">
              <h3 className="text-[13px] font-bold text-slate-100">
                Thông số Runtime Python hiện tại
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
                <div className="p-2.5 rounded-lg bg-[#070c17] border border-slate-800/80">
                  <div className="text-[10.5px] text-slate-400">Modules nạp</div>
                  <div className="font-mono tabular-nums font-bold text-slate-100 mt-0.5">
                    {snapshot.pythonModulesCount}
                  </div>
                </div>
                <div className="p-2.5 rounded-lg bg-[#070c17] border border-slate-800/80">
                  <div className="text-[10.5px] text-slate-400">Bytecode cache</div>
                  <div className="font-mono tabular-nums font-bold text-slate-100 mt-0.5">
                    {snapshot.pythonCodeCacheCount} / 12
                  </div>
                </div>
                <div className="p-2.5 rounded-lg bg-[#070c17] border border-slate-800/80">
                  <div className="text-[10.5px] text-slate-400">Figure Matplotlib</div>
                  <div className="font-mono tabular-nums font-bold text-slate-100 mt-0.5">
                    {snapshot.matplotlibFiguresCount}
                  </div>
                </div>
                <div className="p-2.5 rounded-lg bg-[#070c17] border border-slate-800/80">
                  <div className="text-[10.5px] text-slate-400">Cache JS cục bộ</div>
                  <div className="font-mono tabular-nums font-bold text-slate-100 mt-0.5">
                    {snapshot.localJsCacheEntries} mục
                  </div>
                </div>
              </div>

              <div className="text-[11px] text-slate-400 pt-1">
                Thư viện Pyodide đang giữ trong RAM:{' '}
                <span className="font-mono text-slate-200">
                  {snapshot.loadedPackages.length > 0
                    ? snapshot.loadedPackages.join(', ')
                    : 'Chưa nạp gói bổ sung'}
                </span>
              </div>
            </div>
          )}

          {/* Cleanup Result Banner */}
          {cleanupReport && (
            <div
              className={`p-3 rounded-xl border text-xs flex items-start gap-2.5 ${
                cleanupReport.ok
                  ? 'bg-emerald-950/35 border-emerald-500/40 text-emerald-200'
                  : 'bg-rose-950/35 border-rose-500/40 text-rose-200'
              }`}
            >
              {cleanupReport.ok ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              )}
              <div className="min-w-0 space-y-0.5">
                <div className="font-semibold">{cleanupReport.message}</div>
                {cleanupReport.detail && (
                  <div className="text-[11px] opacity-90 font-mono tabular-nums">
                    {cleanupReport.detail}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Bottom Active Cleanup Controls (No App Restart) */}
        <div className="px-4 py-3 bg-[#0b1324] border-t border-cyan-500/20 space-y-2 shrink-0">
          {isPythonRunning && (
            <div className="text-[11px] text-amber-300 flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              <span>Đang chạy script Python — dọn sâu WASM sẽ khóa tạm cho tới khi script dừng.</span>
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <button
              type="button"
              disabled={!!cleanupBusy}
              onClick={handleLightCleanupClick}
              className="min-h-[44px] px-4 py-2 rounded-xl bg-[#0e192f] hover:bg-[#162748] border border-cyan-500/40 text-cyan-100 font-semibold text-xs flex items-center justify-center gap-2 whitespace-nowrap shrink-0 active:scale-[0.99] transition disabled:opacity-50"
            >
              <Zap className={`w-4 h-4 text-cyan-300 ${cleanupBusy === 'light' ? 'animate-pulse' : ''}`} />
              <span>
                {cleanupBusy === 'light'
                  ? 'Đang chạy GC & Dọn Cache...'
                  : 'Dọn rác GC & Cache (Giữ Pyodide)'}
              </span>
            </button>

            <button
              type="button"
              disabled={!!cleanupBusy || isPythonRunning}
              onClick={handleDeepCleanupClick}
              className="min-h-[44px] px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500/25 to-orange-500/20 hover:from-amber-500/35 hover:to-orange-500/30 border border-amber-400/50 text-amber-100 font-bold text-xs flex items-center justify-center gap-2 whitespace-nowrap shrink-0 active:scale-[0.99] transition disabled:opacity-50"
            >
              <Trash2 className={`w-4 h-4 text-amber-300 ${cleanupBusy === 'deep' ? 'animate-spin' : ''}`} />
              <span>
                {cleanupBusy === 'deep'
                  ? 'Đang giải phóng WASM...'
                  : 'Giải phóng sâu WASM & Output'}
              </span>
            </button>
          </div>
          <p className="text-[10.5px] text-slate-400 text-center">
            Mọi tệp <span className="font-mono text-slate-300">.py</span> và thư viện Pip đã cài được giữ nguyên, không cần khởi động lại ứng dụng.
          </p>
        </div>
      </div>
    </div>
  );
};
