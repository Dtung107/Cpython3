import React, { useState } from 'react';
import { Palette, X, RotateCcw, Check, Sparkles } from 'lucide-react';
import { SyntaxTheme, DEFAULT_SYNTAX_THEME, QUICK_SWATCHES } from '../types/theme';

interface SyntaxColorModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentTheme: SyntaxTheme;
  onSaveTheme: (theme: SyntaxTheme) => void;
}

type ThemeKey = keyof SyntaxTheme;

interface ElementConfig {
  key: ThemeKey;
  label: string;
  sublabel: string;
  example: string;
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

export const SyntaxColorModal: React.FC<SyntaxColorModalProps> = ({
  isOpen,
  onClose,
  currentTheme,
  onSaveTheme,
}) => {
  const [theme, setTheme] = useState<SyntaxTheme>(currentTheme);
  const [selectedKey, setSelectedKey] = useState<ThemeKey>('keywords');

  if (!isOpen) return null;

  const currentElement = THEME_ELEMENTS.find((el) => el.key === selectedKey) || THEME_ELEMENTS[0];

  const handleColorChange = (color: string) => {
    setTheme((prev) => ({
      ...prev,
      [selectedKey]: color,
    }));
  };

  const handleReset = () => {
    setTheme(DEFAULT_SYNTAX_THEME);
  };

  const handleSave = () => {
    onSaveTheme(theme);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 animate-in fade-in duration-200">
      <div
        className="w-full max-w-xl max-h-[94vh] bg-[#1a1d29] border border-slate-700/80 rounded-2xl shadow-2xl flex flex-col overflow-hidden text-slate-100"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header (Screenshot 3) */}
        <div className="px-4 py-3 bg-[#202534] border-b border-slate-700/80 flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-xl bg-gradient-to-tr from-amber-500 via-rose-500 to-indigo-500 text-white shadow-lg">
              <Palette className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-bold text-base text-amber-400">
                Tô Màu Văn Bản (Custom Color Designer)
              </h2>
              <p className="text-[11px] text-slate-400">
                Tự do cá nhân hóa màu sắc từng thành phần mã Python
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

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3.5">
          {/* Live Preview Box (Screenshot 3) */}
          <div className="rounded-xl border border-slate-700/70 overflow-hidden bg-[#12141c]">
            <div className="px-3 py-1.5 bg-[#171b26] border-b border-slate-800 flex items-center justify-between text-xs">
              <span className="flex items-center space-x-1 text-amber-300 font-semibold text-[11px]">
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                <span>Khung Xem Trước Trực Tiếp (Live Preview)</span>
              </span>
              <span className="text-[10px] text-slate-400">
                Đổi màu tức thì theo thời gian thực
              </span>
            </div>

            {/* Code Snippet in Python with real-time custom colors */}
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

          {/* Active Element Color Picker Card (Screenshot 3) */}
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

          {/* Grid: Chọn thành phần cần đổi màu (Screenshot 3) */}
          <div>
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">
              Chọn thành phần cần đổi màu:
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
        </div>

        {/* Footer (Screenshot 3) */}
        <div className="px-4 py-3 bg-[#202534] border-t border-slate-700/80 flex items-center justify-between shrink-0">
          <button
            onClick={handleReset}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs transition"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Khôi phục mặc định</span>
          </button>

          <button
            onClick={handleSave}
            className="px-5 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 active:bg-amber-500 text-slate-950 font-bold text-xs sm:text-sm shadow-lg transition active:scale-95"
          >
            Xong & Lưu
          </button>
        </div>
      </div>
    </div>
  );
};
