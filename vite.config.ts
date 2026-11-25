import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import { defineConfig, type Plugin } from 'vite';

const VIRTUAL_SNAPSHOT_ID = 'virtual:project-update-snapshot';
const RESOLVED_VIRTUAL_SNAPSHOT_ID = '\0' + VIRTUAL_SNAPSHOT_ID;

const SNAPSHOT_ROOT_FILES = [
  '.github/workflows/build-apk.yml',
  'index.html',
  'package.json',
  'server.ts',
  'capacitor.config.json',
  'tsconfig.json',
  'vite.config.ts',
  'metadata.json',
  'firebase-applet-config.json',
  'Dockerfile',
  '.env.example',
];

const BINARY_EXTENSIONS = new Set([
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
  '.gif',
  '.ico',
  '.wasm',
  '.woff',
  '.woff2',
  '.ttf',
  '.zip',
  '.apk',
]);

function collectProjectSnapshot(rootDir: string): {
  generatedAt: string;
  files: Record<string, string>;
  binaryFiles: Record<string, string>;
} {
  const files: Record<string, string> = {};
  const binaryFiles: Record<string, string> = {};

  for (const rel of SNAPSHOT_ROOT_FILES) {
    const abs = path.join(rootDir, rel);
    if (fs.existsSync(abs) && fs.statSync(abs).isFile()) {
      files[rel] = fs.readFileSync(abs, 'utf-8');
    }
  }

  const walkSrc = (dirPath: string) => {
    if (!fs.existsSync(dirPath)) return;
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      if (
        entry.name === 'node_modules' ||
        entry.name === 'dist' ||
        entry.name === '.git' ||
        entry.name === '.DS_Store'
      ) {
        continue;
      }
      const full = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        walkSrc(full);
      } else if (entry.isFile()) {
        const rel = path.relative(rootDir, full).replace(/\\/g, '/');
        const ext = path.extname(entry.name).toLowerCase();
        if (BINARY_EXTENSIONS.has(ext)) {
          const stat = fs.statSync(full);
          if (stat.size <= 512 * 1024) {
            binaryFiles[rel] = fs.readFileSync(full).toString('base64');
          }
        } else {
          files[rel] = fs.readFileSync(full, 'utf-8');
        }
      }
    }
  };

  walkSrc(path.join(rootDir, 'src'));

  return {
    generatedAt: new Date().toISOString(),
    files,
    binaryFiles,
  };
}

function pydroidUpdateSnapshotPlugin(rootDir: string): Plugin {
  return {
    name: 'pydroid-update-snapshot',
    resolveId(id) {
      if (id === VIRTUAL_SNAPSHOT_ID) {
        return RESOLVED_VIRTUAL_SNAPSHOT_ID;
      }
    },
    load(id) {
      if (id === RESOLVED_VIRTUAL_SNAPSHOT_ID) {
        const snapshot = collectProjectSnapshot(rootDir);
        return [
          `export const PROJECT_UPDATE_GENERATED_AT = ${JSON.stringify(snapshot.generatedAt)};`,
          `export const PROJECT_UPDATE_FILES = ${JSON.stringify(snapshot.files)};`,
          `export const PROJECT_UPDATE_BINARY_FILES = ${JSON.stringify(snapshot.binaryFiles)};`,
        ].join('\n');
      }
    },
  };
}

export default defineConfig(() => {
  const rootDir = path.resolve(import.meta.dirname || '.', '.');
  return {
    base: './',
    plugins: [react(), tailwindcss(), pydroidUpdateSnapshotPlugin(rootDir)],
    resolve: {
      alias: {
        '@': rootDir,
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
