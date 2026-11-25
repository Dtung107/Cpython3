import React, { useState, useEffect } from 'react';
import { Palette, X, RotateCcw, Sparkles, Code2, Terminal as TerminalIcon, Sliders } from 'lucide-react';
import {
  SyntaxTheme,
  DEFAULT_SYNTAX_THEME,
  TerminalTheme,
  DEFAULT_TERMINAL_THEME,
  normalizeTerminalTheme,
  hexToRgba,
  QUICK_SWATCHES,
} from '../types/theme';

interface SyntaxColorModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentTheme: SyntaxTheme;
  onSaveTheme: (theme: SyntaxTheme) => void;
  currentTerminalTheme?: TerminalTheme;
  onSaveTerminalTheme?: (theme: TerminalTheme) => void;
}

type ThemeKey = keyof SyntaxTheme;
type TerminalColorKey = Exclude<keyof TerminalTheme, 'backgroundOpacity'>;

interface ElementConfig {
  key: ThemeKey;
  label: string;
  sublabel: string;
  example: string;
}

interface TerminalElementConfig {
  key: TerminalColorKey;
  label: string;
  sublabel: string;
}

const THEME_ELEMENTS: ElementConfig[] = [
  {
    key: 'keywords',
    label: 'Từ khóa (Keywords)',
    sublabel: 'def, class, if, for, import, return...',
    example: 'def, class, import, return',
  },
  {
    key: 'builtins',
    label: 'Hàm & Hằng có sẵn (Builtins)',
    sublabel: 'print, len, range, int, str, True, False...',
    example: 'print(), len(), int, str',
  },
  {
    key: 'strings',
    label: 'Chuỗi văn bản (Strings)',
    sublabel: '"hello", \'world\', """docstring"""...',
    example: '"Xin chào Python"',
  },
  {
    key: 'numbers',
    label: 'Số học (Numbers)',
    sublabel: '123, 3.14, 0xFF, 1e-5...',
    example: '42, 3.14159',
  },
  {
    key: 'comments',
    label: 'Chú thích (Comments)',
    sublabel: '# ghi chú giải thích mã nguồn...',
    example: '# Ghi chú giải thích',
  },
  {
    key: 'functions',
    label: 'Tên hàm (Functions)',
    sublabel: 'tên định nghĩa sau def my_func()...',
    example: 'calc_circle, process_data',
  },
  {
    key: 'variables',
    label: 'Biến & Định danh (Variables)',
    sublabel: 'tên biến, tham số self, name, radius...',
    example: 'self, name, radius',
  },
  {
    key: 'operators',
    label: 'Toán tử (Operators)',
    sublabel: '+, -, *, /, =, ==, !=, ->, :, v.v...',
    example: '+, -, *, ==, ->, :',
  },
  {
    key: 'background',
    label: 'Màu nền Editor (Background)',
    sublabel: 'Màu nền khung soạn thảo mã...',
    example: 'Khung nền editor',
  },
  {
    key: 'foreground',
    label: 'Văn bản thường (Foreground)',
    sublabel: 'Dấu chấm, ngoặc đơn, văn bản cơ bản...',
    example: 'Ký tự thường',
  },
];

const TERMINAL_ELEMENTS: TerminalElementConfig[] = [
  {
    key: 'background',
    label: 'Màu nền Terminal',
    sublabel: 'Nền khung hiển thị kết quả và ô nhập lệnh',
  },
  {
    key: 'foreground',
    label: 'Màu chữ đầu ra (Output)',
    sublabel: 'Văn bản print() và kết quả chạy thông thường',
  },
  {
    key: 'promptColor',
    label: 'Màu dấu nhắc (Prompt >>>)',
    sublabel: 'Ký hiệu >>>, con trỏ nhấp nháy & trạng thái chạy',
  },
  {
    key: 'errorColor',
    label: 'Màu chữ lỗi (Error / Stderr)',
    sublabel: 'Thông báo lỗi cú pháp & traceback Python',
  },
  {
    key: 'highlightBg',
    label: 'Màu nền Highlight',
    sublabel: 'Màu nền khi bôi đen chữ & nhãn nổi bật Terminal',
  },
  {
    key: 'highlightText',
    label: 'Màu chữ Highlight',
    sublabel: 'Màu chữ nằm trên vùng bôi đen / nhãn nổi bật',
  },
];

const OPACITY_PRESETS = [0.4, 0.7, 0.9, 1];

export const SyntaxColorModal: React.FC<SyntaxColorModalProps> = ({
  isOpen,
  onClose,
  currentTheme,
  onSaveTheme,
  currentTerminalTheme = DEFAULT_TERMINAL_THEME,
  onSaveTerminalTheme,
}) => {
  const [activeTab, setActiveTab] = useState<'editor' | 'terminal'>('editor');
  const [theme, setTheme] = useState<SyntaxTheme>(currentTheme);
  const [selectedKey, setSelectedKey] = useState<ThemeKey>('keywords');
  const [terminalTheme, setTerminalTheme] = useState<TerminalTheme>(() =>
    normalizeTerminalTheme(currentTerminalTheme)
  );
  const [selectedTerminalKey, setSelectedTerminalKey] = useState<TerminalColorKey>('foreground');

  useEffect(() => {
    if (isOpen) {
      setTheme(currentTheme);
      setTerminalTheme(normalizeTerminalTheme(currentTerminalTheme));
    }
  }, [isOpen, currentTheme, currentTerminalTheme]);

  if (!isOpen) return null;

  const currentElement = THEME_ELEMENTS.find((el) => el.key === selectedKey) || THEME_ELEMENTS[0];
  const currentTerminalElement =
    TERMINAL_ELEMENTS.find((el) => el.key === selectedTerminalKey) || TERMINAL_ELEMENTS[0];

  const handleColorChange = (color: string) => {
    setTheme((prev) => ({
      ...prev,
      [selectedKey]: color,
    }));
  };

  const handleTerminalColorChange = (color: string) => {
    setTerminalTheme((prev) => ({
      ...prev,
      [selectedTerminalKey]: color,
    }));
  };

  const handleTerminalOpacityChange = (opacity: number) => {
    const clamped = Math.min(1, Math.max(0.2, Math.round(opacity * 100) / 100));
    setTerminalTheme((prev) => ({
      ...prev,
      backgroundOpacity: clamped,
    }));
  };

  const handleReset = () => {
    if (activeTab === 'editor') {
      setTheme(DEFAULT_SYNTAX_THEME);
    } else {
      setTerminalTheme(DEFAULT_TERMINAL_THEME);
    }
  };

  const handleSave = () => {
    onSaveTheme(theme);
    onSaveTerminalTheme?.(normalizeTerminalTheme(terminalTheme));
    onClose();
  };

  const opacityPercent = Math.round(terminalTheme.backgroundOpacity * 100);

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 animate-in fade-in duration-200">
      <div
        className="w-full max-w-xl max-h-[94vh] bg-[#1a1d29] border border-slate-700/80 rounded-2xl shadow-2xl flex flex-col overflow-hidden text-slate-100"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-4 py-3 bg-[#202534] border-b border-slate-700/80 flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-xl bg-gradient-to-tr from-amber-500 via-rose-500 to-indigo-500 text-white shadow-lg">
              <Palette className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-bold text-base text-amber-400">
                Tô Màu Giao Diện (Color Designer)
              </h2>
              <p className="text-[11px] text-slate-400">
                Tùy chỉnh màu mã nguồn Python &amp; giao diện Terminal đầu ra
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

        {/* Mode Switcher: Editor vs Terminal */}
        <div className="px-4 pt-3 pb-2 bg-[#1a1d29] border-b border-slate-800/80 shrink-0">
          <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-[#111520] border border-slate-800">
            <button
              onClick={() => setActiveTab('editor')}
              className={`py-2 px-3 rounded-lg text-xs font-bold flex items-center justify-center space-x-1.5 transition ${
                activeTab === 'editor'
                  ? 'bg-amber-400 text-slate-950 shadow'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              <Code2 className="w-3.5 h-3.5" />
              <span>Trình soạn thảo</span>
            </button>
            <button
              onClick={() => setActiveTab('terminal')}
              className={`py-2 px-3 rounded-lg text-xs font-bold flex items-center justify-center space-x-1.5 transition ${
                activeTab === 'terminal'
                  ? 'bg-cyan-400 text-slate-950 shadow'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              <TerminalIcon className="w-3.5 h-3.5" />
              <span>Terminal (Đầu ra)</span>
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3.5">
          {activeTab === 'editor' ? (
            <>
              {/* Editor Live Preview Box */}
              <div className="rounded-xl border border-slate-700/70 overflow-hidden bg-[#12141c]">
                <div className="px-3 py-1.5 bg-[#171b26] border-b border-slate-800 flex items-center justify-between text-xs">
                  <span className="flex items-center space-x-1 text-amber-300 font-semibold text-[11px]">
                    <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                    <span>Khung Xem Trước Trực Tiếp (Editor)</span>
                  </span>
                  <span className="text-[10px] text-slate-400">
                    Đổi màu tức thì theo thời gian thực
                  </span>
                </div>

                <div
                  className="p-3.5 font-mono text-xs leading-relaxed overflow-x-auto select-none"
                  style={{ backgroundColor: theme.background }}
                >
                  <div style={{ color: theme.comments }}># Xem trước bộ màu Python tùy chỉnh</div>
                  <div>
                    <span style={{ color: theme.keywords }}>import</span>{' '}
                    <span style={{ color: theme.variables }}>math</span>
                  </div>
                  <div className="h-1.5" />
                  <div>
                    <span style={{ color: theme.keywords }}>class</span>{' '}
                    <span style={{ color: theme.functions }}>Calculator</span>
                    <span style={{ color: theme.operators }}>:</span>
                  </div>
                  <div className="pl-4">
                    <span style={{ color: theme.keywords }}>def</span>{' '}
                    <span style={{ color: theme.functions }}>__init__</span>
                    <span style={{ color: theme.foreground }}>(</span>
                    <span style={{ color: theme.variables }}>self</span>
                    <span style={{ color: theme.operators }}>, </span>
                    <span style={{ color: theme.variables }}>name</span>
                    <span style={{ color: theme.operators }}>: </span>
                    <span style={{ color: theme.builtins }}>str</span>
                    <span style={{ color: theme.foreground }}>)</span>
                    <span style={{ color: theme.operators }}>:</span>
                  </div>
                  <div className="pl-8">
                    <span style={{ color: theme.variables }}>self.name</span>{' '}
                    <span style={{ color: theme.operators }}>=</span>{' '}
                    <span style={{ color: theme.variables }}>name</span>{' '}
                    <span style={{ color: theme.comments }}># Tên thiết bị</span>
                  </div>
                  <div className="h-1.5" />
                  <div className="pl-4">
                    <span style={{ color: theme.keywords }}>def</span>{' '}
                    <span style={{ color: theme.functions }}>calc_circle</span>
                    <span style={{ color: theme.foreground }}>(</span>
                    <span style={{ color: theme.variables }}>self</span>
                    <span style={{ color: theme.operators }}>, </span>
                    <span style={{ color: theme.variables }}>radius</span>
                    <span style={{ color: theme.operators }}>: </span>
                    <span style={{ color: theme.builtins }}>float</span>
                    <span style={{ color: theme.foreground }}>) </span>
                    <span style={{ color: theme.operators }}>-&gt; </span>
                    <span style={{ color: theme.builtins }}>float</span>
                    <span style={{ color: theme.operators }}>:</span>
                  </div>
                  <div className="pl-8">
                    <span style={{ color: theme.strings }}>&quot;&quot;&quot;Tính diện tích hình tròn.&quot;&quot;&quot;</span>
                  </div>
                  <div className="pl-8">
                    <span style={{ color: theme.keywords }}>return</span>{' '}
                    <span style={{ color: theme.variables }}>math.pi</span>{' '}
                    <span style={{ color: theme.operators }}>*</span>{' '}
                    <span style={{ color: theme.foreground }}>(</span>
                    <span style={{ color: theme.variables }}>radius</span>{' '}
                    <span style={{ color: theme.operators }}>**</span>{' '}
                    <span style={{ color: theme.numbers }}>2</span>
                    <span style={{ color: theme.foreground }}>)</span>
                  </div>
                </div>
              </div>

              {/* Active Editor Element Color Picker Card */}
              <div className="p-3.5 rounded-xl bg-[#202534] border border-slate-700/80 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-bold text-sm text-slate-100">{currentElement.label}</h3>
                    <p className="text-[11px] text-slate-400 mt-0.5">{currentElement.sublabel}</p>
                  </div>
                  <div className="flex items-center space-x-2">
                    <span className="font-mono text-xs font-semibold text-amber-400 uppercase">
                      {theme[selectedKey]}
                    </span>
                    <label className="w-8 h-8 rounded-lg cursor-pointer border border-slate-600 shadow-md relative overflow-hidden block">
                      <input
                        type="color"
                        value={theme[selectedKey]}
                        onChange={(e) => handleColorChange(e.target.value)}
                        className="opacity-0 absolute inset-0 w-full h-full cursor-pointer"
                      />
                      <div
                        className="w-full h-full rounded"
                        style={{ backgroundColor: theme[selectedKey] }}
                      />
                    </label>
                  </div>
                </div>

                {/* Quick Swatches Row */}
                <div>
                  <div className="text-[10px] font-semibold text-slate-400 mb-1.5 uppercase tracking-wide">
                    Bảng màu nhanh 1 chạm (Quick Swatches):
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {QUICK_SWATCHES.map((hex) => {
                      const isCurrent = theme[selectedKey].toLowerCase() === hex.toLowerCase();
                      return (
                        <button
                          key={hex}
                          onClick={() => handleColorChange(hex)}
                          className={`w-6 h-6 rounded-md transition-all active:scale-95 border ${
                            isCurrent
                              ? 'border-white scale-110 shadow-lg ring-2 ring-amber-400/50'
                              : 'border-slate-700/80 hover:scale-105'
                          }`}
                          style={{ backgroundColor: hex }}
                          title={hex}
                        />
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Editor Elements Grid */}
              <div>
                <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                  Chọn thành phần Editor cần đổi màu:
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {THEME_ELEMENTS.map((el) => {
                    const isSelected = selectedKey === el.key;
                    const colorVal = theme[el.key];

                    return (
                      <button
                        key={el.key}
                        onClick={() => setSelectedKey(el.key)}
                        className={`p-2.5 rounded-xl border text-left flex items-center justify-between transition-all ${
                          isSelected
                            ? 'bg-[#222838] border-amber-400/80 shadow-md'
                            : 'bg-[#181c27] border-slate-800 hover:border-slate-700'
                        }`}
                      >
                        <div className="min-w-0 flex-1 pr-2">
                          <div
                            className={`text-xs font-semibold truncate ${
                              isSelected ? 'text-amber-300' : 'text-slate-200'
                            }`}
                          >
                            {el.label}
                          </div>
                          <div className="font-mono text-[10px] text-slate-400 mt-0.5 uppercase">
                            {colorVal}
                          </div>
                        </div>

                        <div
                          className="w-6 h-6 rounded-md shrink-0 border border-slate-600 shadow-sm"
                          style={{ backgroundColor: colorVal }}
                        />
                      </button>
                    );
                  })}
                </div>
              </div>
            </>
          ) : (
            <>
              {/* Terminal Live Preview Box (with subtle ambient grid behind to visualize opacity) */}
              <div className="rounded-xl border border-slate-700/70 overflow-hidden bg-[#12141c]">
                <div className="px-3 py-1.5 bg-[#171b26] border-b border-slate-800 flex items-center justify-between text-xs">
                  <span className="flex items-center space-x-1 text-cyan-300 font-semibold text-[11px]">
                    <TerminalIcon className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Xem Trước Terminal (Độ mờ nền: {opacityPercent}%)</span>
                  </span>
                  <span
                    className="px-2 py-0.5 rounded-md text-[10px] font-bold"
                    style={{
                      backgroundColor: terminalTheme.highlightBg,
                      color: terminalTheme.highlightText,
                    }}
                  >
                    • WASM
                  </span>
                </div>

                {/* Subtle checkerboard/ambient backdrop to make backgroundOpacity visually clear */}
                <div
                  className="relative"
                  style={{
                    backgroundImage:
                      'radial-gradient(circle at 20% 25%, rgba(56, 189, 248, 0.35) 0%, transparent 45%), radial-gradient(circle at 80% 75%, rgba(168, 85, 247, 0.30) 0%, transparent 45%), repeating-conic-gradient(#1e293b 0% 25%, #0f172a 0% 50%)',
                    backgroundSize: '100% 100%, 100% 100%, 16px 16px',
                  }}
                >
                  <div
                    className="p-3.5 font-mono text-xs leading-relaxed space-y-1.5 select-none transition-colors"
                    style={{
                      backgroundColor: hexToRgba(
                        terminalTheme.background,
                        terminalTheme.backgroundOpacity
                      ),
                      color: terminalTheme.foreground,
                    }}
                  >
                    <div>========================================</div>
                    <div>
                      Xin chào! Kết quả: <strong>42</strong>{' '}
                      <span
                        className="px-1.5 py-0.5 rounded font-semibold"
                        style={{
                          backgroundColor: terminalTheme.highlightBg,
                          color: terminalTheme.highlightText,
                        }}
                      >
                        Vùng chữ được Highlight
                      </span>
                    </div>
                    <div className="flex items-center space-x-1.5 pt-0.5">
                      <span className="font-bold" style={{ color: terminalTheme.promptColor }}>
                        &gt;&gt;&gt;
                      </span>
                      <span>Nhập tên của bạn:</span>
                      <span
                        className="inline-block w-2 h-3.5 align-middle animate-pulse"
                        style={{ backgroundColor: terminalTheme.promptColor }}
                      />
                    </div>
                    <div
                      className="border-l-2 pl-2 py-0.5 rounded-r text-[11px]"
                      style={{
                        color: terminalTheme.errorColor,
                        borderColor: terminalTheme.errorColor,
                        backgroundColor: hexToRgba(terminalTheme.errorColor, 0.14),
                      }}
                    >
                      ZeroDivisionError: division by zero
                    </div>
                  </div>
                </div>
              </div>

              {/* Terminal Background Opacity Control */}
              <div className="p-3.5 rounded-xl bg-[#202534] border border-slate-700/80 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Sliders className="w-4 h-4 text-cyan-400" />
                    <div>
                      <h3 className="font-bold text-xs sm:text-sm text-slate-100">
                        Độ mờ nền Terminal (Background Opacity)
                      </h3>
                      <p className="text-[10.5px] text-slate-400">
                        Điều chỉnh độ trong suốt của khung nền đầu ra (20% – 100%)
                      </p>
                    </div>
                  </div>
                  <span className="font-mono text-xs font-bold px-2 py-0.5 rounded-lg bg-cyan-500/15 border border-cyan-500/35 text-cyan-300">
                    {opacityPercent}%
                  </span>
                </div>

                <input
                  type="range"
                  min={20}
                  max={100}
                  step={5}
                  value={opacityPercent}
                  onChange={(e) => handleTerminalOpacityChange(Number(e.target.value) / 100)}
                  className="w-full accent-cyan-400 cursor-pointer h-2 rounded-lg bg-slate-800"
                />

                <div className="grid grid-cols-4 gap-1.5">
                  {OPACITY_PRESETS.map((preset) => {
                    const pct = Math.round(preset * 100);
                    const isActive = opacityPercent === pct;
                    return (
                      <button
                        key={pct}
                        onClick={() => handleTerminalOpacityChange(preset)}
                        className={`py-1 rounded-lg text-[11px] font-semibold border transition ${
                          isActive
                            ? 'bg-cyan-500/20 border-cyan-400 text-cyan-200'
                            : 'bg-[#171b26] border-slate-700 text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        {pct}%
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Active Terminal Element Color Picker Card */}
              <div className="p-3.5 rounded-xl bg-[#202534] border border-slate-700/80 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-bold text-sm text-slate-100">
                      {currentTerminalElement.label}
                    </h3>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      {currentTerminalElement.sublabel}
                    </p>
                  </div>
                  <div className="flex items-center space-x-2">
                    <span className="font-mono text-xs font-semibold text-cyan-400 uppercase">
                      {terminalTheme[selectedTerminalKey]}
                    </span>
                    <label className="w-8 h-8 rounded-lg cursor-pointer border border-slate-600 shadow-md relative overflow-hidden block">
                      <input
                        type="color"
                        value={terminalTheme[selectedTerminalKey]}
                        onChange={(e) => handleTerminalColorChange(e.target.value)}
                        className="opacity-0 absolute inset-0 w-full h-full cursor-pointer"
                      />
                      <div
                        className="w-full h-full rounded"
                        style={{ backgroundColor: terminalTheme[selectedTerminalKey] }}
                      />
                    </label>
                  </div>
                </div>

                {/* Quick Swatches Row */}
                <div>
                  <div className="text-[10px] font-semibold text-slate-400 mb-1.5 uppercase tracking-wide">
                    Bảng màu nhanh 1 chạm (Quick Swatches):
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {QUICK_SWATCHES.map((hex) => {
                      const isCurrent =
                        terminalTheme[selectedTerminalKey].toLowerCase() === hex.toLowerCase();
                      return (
                        <button
                          key={hex}
                          onClick={() => handleTerminalColorChange(hex)}
                          className={`w-6 h-6 rounded-md transition-all active:scale-95 border ${
                            isCurrent
                              ? 'border-white scale-110 shadow-lg ring-2 ring-cyan-400/50'
                              : 'border-slate-700/80 hover:scale-105'
                          }`}
                          style={{ backgroundColor: hex }}
                          title={hex}
                        />
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Terminal Elements Grid */}
              <div>
                <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                  Chọn thành phần Terminal cần đổi màu:
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {TERMINAL_ELEMENTS.map((el) => {
                    const isSelected = selectedTerminalKey === el.key;
                    const colorVal = terminalTheme[el.key];

                    return (
                      <button
                        key={el.key}
                        onClick={() => setSelectedTerminalKey(el.key)}
                        className={`p-2.5 rounded-xl border text-left flex items-center justify-between transition-all ${
                          isSelected
                            ? 'bg-[#222838] border-cyan-400/80 shadow-md'
                            : 'bg-[#181c27] border-slate-800 hover:border-slate-700'
                        }`}
                      >
                        <div className="min-w-0 flex-1 pr-2">
                          <div
                            className={`text-xs font-semibold truncate ${
                              isSelected ? 'text-cyan-300' : 'text-slate-200'
                            }`}
                          >
                            {el.label}
                          </div>
                          <div className="font-mono text-[10px] text-slate-400 mt-0.5 uppercase">
                            {colorVal}
                          </div>
                        </div>

                        <div
                          className="w-6 h-6 rounded-md shrink-0 border border-slate-600 shadow-sm"
                          style={{ backgroundColor: colorVal }}
                        />
                      </button>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 bg-[#202534] border-t border-slate-700/80 flex items-center justify-between shrink-0">
          <button
            onClick={handleReset}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs transition"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>
              {activeTab === 'editor' ? 'Mặc định Editor' : 'Mặc định Terminal'}
            </span>
          </button>

          <button
            onClick={handleSave}
            className="px-5 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 active:bg-amber-500 text-slate-950 font-bold text-xs sm:text-sm shadow-lg transition active:scale-95"
          >
            Xong &amp; Lưu
          </button>
        </div>
      </div>
    </div>
  );
};

