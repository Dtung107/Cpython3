/// <reference types="vite/client" />

declare module 'virtual:project-update-snapshot' {
  export const PROJECT_UPDATE_GENERATED_AT: string;
  export const PROJECT_UPDATE_FILES: Record<string, string>;
  export const PROJECT_UPDATE_BINARY_FILES: Record<string, string>;
}
