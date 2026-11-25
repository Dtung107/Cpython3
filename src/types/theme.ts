export interface SyntaxTheme {
  keywords: string;
  builtins: string;
  strings: string;
  numbers: string;
  comments: string;
  functions: string;
  variables: string;
  operators: string;
  background: string;
  foreground: string;
}

export const DEFAULT_SYNTAX_THEME: SyntaxTheme = {
  keywords: '#f43f5e',
  builtins: '#38bdf8',
  strings: '#34d399',
  numbers: '#fbbf24',
  comments: '#94a3b8',
  functions: '#a855f7',
  variables: '#f1f5f9',
  operators: '#fb923c',
  background: '#141720',
  foreground: '#f8fafc',
};

export const QUICK_SWATCHES = [
  '#ef4444',
  '#f43f5e',
  '#f97316',
  '#fb923c',
  '#eab308',
  '#fbbf24',
  '#22c55e',
  '#34d399',
  '#14b8a6',
  '#06b6d4',
  '#0ea5e9',
  '#38bdf8',
  '#3b82f6',
  '#6366f1',
  '#8b5cf6',
  '#a855f7',
  '#ec4899',
  '#ffffff',
  '#94a3b8',
  '#1e293b',
];

export interface TerminalTheme {
  background: string;
  backgroundOpacity: number; // 0.2 to 1.0
  foreground: string;
  promptColor: string;
  errorColor: string;
  highlightBg: string;
  highlightText: string;
}

export const DEFAULT_TERMINAL_THEME: TerminalTheme = {
  background: '#0a0d14',
  backgroundOpacity: 1,
  foreground: '#f1f5f9',
  promptColor: '#fbbf24',
  errorColor: '#fb7185',
  highlightBg: '#0284c7',
  highlightText: '#f8fafc',
};

export function normalizeTerminalTheme(raw?: Partial<TerminalTheme> | null): TerminalTheme {
  const opacityRaw = Number(raw?.backgroundOpacity);
  const backgroundOpacity = Number.isFinite(opacityRaw)
    ? Math.min(1, Math.max(0.2, Math.round(opacityRaw * 100) / 100))
    : DEFAULT_TERMINAL_THEME.backgroundOpacity;

  return {
    background: typeof raw?.background === 'string' && raw.background ? raw.background : DEFAULT_TERMINAL_THEME.background,
    backgroundOpacity,
    foreground: typeof raw?.foreground === 'string' && raw.foreground ? raw.foreground : DEFAULT_TERMINAL_THEME.foreground,
    promptColor: typeof raw?.promptColor === 'string' && raw.promptColor ? raw.promptColor : DEFAULT_TERMINAL_THEME.promptColor,
    errorColor: typeof raw?.errorColor === 'string' && raw.errorColor ? raw.errorColor : DEFAULT_TERMINAL_THEME.errorColor,
    highlightBg: typeof raw?.highlightBg === 'string' && raw.highlightBg ? raw.highlightBg : DEFAULT_TERMINAL_THEME.highlightBg,
    highlightText: typeof raw?.highlightText === 'string' && raw.highlightText ? raw.highlightText : DEFAULT_TERMINAL_THEME.highlightText,
  };
}

export function hexToRgba(hex: string, alpha: number = 1): string {
  const clampedAlpha = Math.min(1, Math.max(0, alpha));
  const clean = (hex || '').trim().replace(/^#/, '');
  let r = 10;
  let g = 13;
  let b = 20;

  if (/^[0-9a-fA-F]{3}$/.test(clean)) {
    r = parseInt(clean[0] + clean[0], 16);
    g = parseInt(clean[1] + clean[1], 16);
    b = parseInt(clean[2] + clean[2], 16);
  } else if (/^[0-9a-fA-F]{6}$/.test(clean)) {
    r = parseInt(clean.slice(0, 2), 16);
    g = parseInt(clean.slice(2, 4), 16);
    b = parseInt(clean.slice(4, 6), 16);
  } else {
    return hex || `rgba(10, 13, 20, ${clampedAlpha})`;
  }

  return `rgba(${r}, ${g}, ${b}, ${clampedAlpha})`;
}

