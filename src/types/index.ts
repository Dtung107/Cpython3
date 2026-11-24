export type EngineType = 'cpython' | 'pyodide';

export interface CodeFile {
  id: string;
  name: string;
  content: string;
  isModified?: boolean;
}

export interface ExecutionResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  duration: number;
  engine: string;
  error?: string;
  plotImages?: string[]; // Base64 png plots from matplotlib
  timestamp?: number;
  isWaitingInput?: boolean;
  prompt?: string;
}

export interface AIDebugResult {
  summary: string;
  errorType: string;
  lineNumber?: number;
  explanation: string;
  fixedCode: string;
  suggestions: string[];
}

export interface PipPackage {
  name: string;
  description: string;
  category: 'data' | 'visual' | 'cli' | 'utility' | 'math';
  installed: boolean;
  version?: string;
  isPopular?: boolean;
}

export interface ApkConfig {
  appName: string;
  packageName: string;
  version: string;
  author: string;
  orientation: 'portrait' | 'landscape' | 'all';
  permissions: string[];
  includeKivyTemplate: boolean;
}
