import React, { useRef } from 'react';
import { SlidersHorizontal } from 'lucide-react';
import { ShortcutKey, KeySize } from '../types/shortcuts';

interface MobileKeyboardBarProps {
  shortcuts: ShortcutKey[];
  keySize: KeySize;
  onInsertText: (text: string, cursorOffset?: number) => void;
  onOpenConfig: () => void;
}

const BRACKET_OR_QUOTE_IDS = new Set([
  'paren_open',
  'paren_close',
  'bracket_open',
  'bracket_close',
  'brace_open',
  'brace_close',
  'quote_double',
  'quote_single',
  'colon',
]);

export const MobileKeyboardBar: React.FC<MobileKeyboardBarProps> = ({
  shortcuts,
  keySize,
  onInsertText,
  onOpenConfig,
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Subtle haptic feedback on touch devices
  const playHaptic = () => {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate(8);
      } catch (e) {}
    }
  };

  const handleKeyClick = (key: ShortcutKey) => {
    playHaptic();
    onInsertText(key.insertText, key.cursorOffset || 0);
  };

  // Larger mobile-optimized touch dimensions (40px / 46px / 52px)
  const sizeConfig = {
    small: {
      height: 'h-10',
      keyWidth: 'min-w-[40px] px-2.5',
      configWidth: 'w-11',
      text: 'text-[13px]',
      icon: 'w-4 h-4',
    },
    medium: {
      height: 'h-[46px]',
      keyWidth: 'min-w-[46px] px-3',
      configWidth: 'w-12',
      text: 'text-[14.5px]',
      icon: 'w-4.5 h-4.5',
    },
    large: {
      height: 'h-[52px]',
      keyWidth: 'min-w-[52px] px-3.5',
      configWidth: 'w-[52px]',
      text: 'text-[16px]',
      icon: 'w-5 h-5',
    },
  }[keySize];

  const visibleKeys = shortcuts.filter((k) => k.visible);

  return (
    <div className="w-full bg-[#070b14] border-t border-cyan-500/25 px-1.5 sm:px-3 py-1.5 select-none z-20 shrink-0">
      {/* Dark Premium Single-Strip Mobile Keyboard Bar */}
      <div
        className={`w-full ${sizeConfig.height} rounded-2xl bg-gradient-to-b from-[#0d1629] via-[#0a1222] to-[#070c18] border border-cyan-500/40 shadow-[0_0_24px_rgba(6,182,212,0.14),inset_0_1px_0_rgba(255,255,255,0.06)] flex items-stretch overflow-hidden`}
      >
        {/* Horizontally scrollable individual keys — zero gaps, clean vertical dividers */}
        <div
          ref={scrollRef}
          className="flex-1 flex items-stretch overflow-x-auto no-scrollbar scroll-smooth divide-x divide-cyan-950/90"
        >
          {visibleKeys.map((k) => {
            const isTabOrHighlight = k.isHighlight || k.id === 'tab';
            const isBracketOrQuote = BRACKET_OR_QUOTE_IDS.has(k.id);
            const isKeyword = k.category === 'keyword';
            const isOperator = k.category === 'operator';

            let keyColorClass =
              'text-slate-100 hover:bg-[#14223d] active:bg-cyan-500/30 active:text-white';

            if (isTabOrHighlight) {
              keyColorClass =
                'bg-gradient-to-b from-amber-400/22 to-amber-600/12 text-amber-300 font-bold hover:from-amber-400/30 hover:to-amber-500/20 active:bg-amber-400 active:text-slate-950';
            } else if (isBracketOrQuote) {
              keyColorClass =
                'bg-gradient-to-b from-cyan-500/10 to-transparent text-cyan-200 font-bold hover:bg-cyan-500/20 active:bg-cyan-400 active:text-slate-950';
            } else if (isKeyword) {
              keyColorClass =
                'bg-gradient-to-b from-purple-500/10 to-transparent text-purple-200 hover:bg-purple-500/20 active:bg-purple-400 active:text-slate-950';
            } else if (isOperator) {
              keyColorClass =
                'text-amber-200/95 hover:bg-[#17233b] active:bg-amber-400/30 active:text-amber-100';
            }

            return (
              <button
                key={k.id}
                type="button"
                onClick={() => handleKeyClick(k)}
                title={k.description || k.label}
                className={`shrink-0 h-full font-mono font-semibold flex items-center justify-center transition-colors whitespace-nowrap tracking-tight ${sizeConfig.keyWidth} ${sizeConfig.text} ${keyColorClass}`}
              >
                {k.label}
              </button>
            );
          })}
        </div>

        {/* Flush Dark Premium Settings Button on Right Edge */}
        <button
          type="button"
          onClick={() => {
            playHaptic();
            onOpenConfig();
          }}
          title="Cài đặt & Tùy biến thanh phím tắt"
          aria-label="Cài đặt thanh phím tắt"
          className={`relative shrink-0 h-full ${sizeConfig.configWidth} border-l border-cyan-500/35 bg-gradient-to-b from-[#11203d] to-[#0a1326] hover:from-[#172b52] hover:to-[#0f1c38] active:bg-cyan-500/30 text-cyan-300 flex items-center justify-center transition-colors`}
        >
          <SlidersHorizontal className={sizeConfig.icon} />
          <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-amber-400 ring-2 ring-[#0e1930]" />
        </button>
      </div>
    </div>
  );
};
