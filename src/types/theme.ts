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
