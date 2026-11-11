import React, { useRef } from 'react';
import { SlidersHorizontal } from 'lucide-react';
import { ShortcutKey, KeySize } from '../types/shortcuts';

interface MobileKeyboardBarProps {
  shortcuts: ShortcutKey[];
  keySize: KeySize;
  onInsertText: (text: string, cursorOffset?: number) => void;
  onOpenConfig: () => void;
}

export const MobileKeyboardBar: React.FC<MobileKeyboardBarProps> = ({
  shortcuts,
  keySize,
  onInsertText,
  onOpenConfig,
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Play subtle haptic feedback on touch devices
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

  // Height and padding based on user's keySize choice
  const heightClasses = {
    small: 'h-[30px] text-[11px] px-2',
    medium: 'h-[35px] text-[13px] px-2.5',
    large: 'h-[42px] text-[15px] px-3',
  }[keySize];

  const visibleKeys = shortcuts.filter((k) => k.visible);

  return (
    <div className="w-full bg-[#151821] border-t border-slate-800/90 px-1 py-1.5 flex items-center select-none shadow-lg z-20">
      {/* Horizontal Scrollable Python Coding Keys (No left < > buttons, matching Screenshot 2) */}
      <div
        ref={scrollRef}
        className="flex-1 flex items-center space-x-1.5 overflow-x-auto no-scrollbar px-1 py-0.5 scroll-smooth"
      >
        {visibleKeys.map((k) => (
          <button
            key={k.id}
            onClick={() => handleKeyClick(k)}
            className={`shrink-0 rounded-lg font-mono font-semibold flex items-center justify-center transition-all active:scale-95 shadow-sm border ${heightClasses} ${
              k.isHighlight || k.id === 'tab'
                ? 'bg-amber-500/20 text-amber-300 border-amber-500/60 active:bg-amber-500/40'
                : 'bg-[#222734] text-slate-200 border-slate-700/70 hover:bg-[#2c3246] active:bg-amber-500 active:text-slate-950'
            }`}
          >
            {k.label}
          </button>
        ))}
      </div>

      {/* Settings / Config Button on the far right with yellow dot indicator (matching Screenshot 2) */}
      <div className="pl-1.5 shrink-0 flex items-center">
        <button
          onClick={() => {
            playHaptic();
            onOpenConfig();
          }}
          title="Cài đặt & Tùy biến thanh phím tắt"
          className="relative px-2.5 h-[35px] rounded-lg bg-[#222734] border border-slate-700/80 hover:bg-[#2c3246] active:bg-amber-500 text-slate-200 active:text-slate-950 flex items-center justify-center transition-all shadow"
        >
          <SlidersHorizontal className="w-4 h-4 text-slate-300" />
          {/* Yellow dot badge */}
          <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-amber-400 animate-pulse ring-1 ring-slate-950" />
        </button>
      </div>
    </div>
  );
};
