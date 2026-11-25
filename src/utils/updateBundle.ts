import { Capacitor } from '@capacitor/core';
import { getApiUrl, isAiStudioPreviewUrl, isMobileOrApk } from './apiConfig';
import { writeBinaryFileToDefaultFolder } from '../services/deviceStorageService';

export interface ProjectUpdateSnapshotData {
  generatedAt: string;
  textFiles: Record<string, string>;
  binaryBase64Files: Record<string, string>;
}

function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

export async function getProjectUpdateFileMap(
  includePublicIcon = true
): Promise<ProjectUpdateSnapshotData> {
  const mod = await import('virtual:project-update-snapshot');
  const textFiles: Record<string, string> = { ...(mod.PROJECT_UPDATE_FILES || {}) };
  const binaryBase64Files: Record<string, string> = {
    ...(mod.PROJECT_UPDATE_BINARY_FILES || {}),
  };

  if (includePublicIcon && !binaryBase64Files['public/app-icon.jpg']) {
    const iconCandidates = ['./app-icon.jpg', '/app-icon.jpg'];
    for (const iconUrl of iconCandidates) {
      try {
        const res = await fetch(iconUrl, { cache: 'no-store' });
        if (res.ok) {
          const buf = await res.arrayBuffer();
          if (buf.byteLength > 0) {
            binaryBase64Files['public/app-icon.jpg'] = uint8ArrayToBase64(new Uint8Array(buf));
            break;
          }
        }
      } catch {
        // try next candidate
      }
    }
  }

  return {
    generatedAt: mod.PROJECT_UPDATE_GENERATED_AT || new Date().toISOString(),
    textFiles,
    binaryBase64Files,
  };
}

export async function buildProjectUpdateZipBlob(
  onProgress?: (msg: string) => void
): Promise<{
  zip: import('jszip');
  fileCount: number;
  generatedAt: string;
}> {
  onProgress?.('Đang chuẩn bị danh sách mã nguồn mới nhất...');
  const { default: JSZip } = await import('jszip');
  const snapshot = await getProjectUpdateFileMap(true);
  const zip = new JSZip();

  const textEntries = Object.entries(snapshot.textFiles).sort(([a], [b]) => a.localeCompare(b));
  const binaryEntries = Object.entries(snapshot.binaryBase64Files).sort(([a], [b]) =>
    a.localeCompare(b)
  );

  for (const [relPath, content] of textEntries) {
    zip.file(relPath, content);
  }
  for (const [relPath, base64Data] of binaryEntries) {
    zip.file(relPath, base64Data, { base64: true });
  }

  const allPaths = [
    ...textEntries.map(([p]) => p),
    ...binaryEntries.map(([p]) => p),
  ].sort();

  zip.file(
    'UPDATE_MANIFEST.json',
    JSON.stringify(
      {
        app: 'Pydroid 3 Web',
        generatedAt: snapshot.generatedAt,
        fileCount: allPaths.length,
        files: allPaths,
      },
      null,
      2
    )
  );

  return {
    zip,
    fileCount: allPaths.length,
    generatedAt: snapshot.generatedAt,
  };
}

export async function downloadProjectUpdateZip(
  onProgress?: (msg: string) => void
): Promise<{ ok: boolean; message: string }> {
  try {
    // 1. On Capacitor Android APK: build ZIP directly offline from bundled snapshot & save natively
    if (Capacitor.isNativePlatform()) {
      onProgress?.('Đang nén toàn bộ mã nguồn cập nhật (src/, icon, build-apk.yml)...');
      const { zip, fileCount } = await buildProjectUpdateZipBlob(onProgress);
      const base64Zip = await zip.generateAsync({
        type: 'base64',
        compression: 'DEFLATE',
        compressionOptions: { level: 6 },
      });

      onProgress?.('Đang lưu file Pydroid3-Web-Update-Files.zip vào bộ nhớ điện thoại...');
      const saved = await writeBinaryFileToDefaultFolder(
        'Pydroid3-Web-Update-Files.zip',
        base64Zip
      );
      if (saved.ok) {
        return {
          ok: true,
          message: `Đã lưu Pydroid3-Web-Update-Files.zip (${fileCount} tệp) tại ${saved.displayPath}. Giải nén giữ nguyên cấu trúc thư mục khi đưa lên GitHub hoặc dùng nút "Đẩy thẳng lên GitHub bằng Token".`,
        };
      }
      return {
        ok: false,
        message:
          saved.error ||
          'Không thể lưu file .ZIP vào bộ nhớ thiết bị. Bạn có thể dùng mục "Đẩy thẳng lên GitHub bằng Token" trong bảng Đóng gói APK.',
      };
    }

    // 2. On Web: prefer live server endpoint if same-origin non-preview, otherwise generate client-side ZIP
    const endpointUrl = getApiUrl('/api/project/update-bundle');
    let downloadedBlob: Blob | null = null;
    let fileCountLabel = '';

    if (!isMobileOrApk() && (!endpointUrl.startsWith('http') || !isAiStudioPreviewUrl(endpointUrl))) {
      try {
        onProgress?.('Đang nén các tệp mã nguồn cập nhật từ máy chủ...');
        const res = await fetch(endpointUrl, { cache: 'no-store' });
        if (res.ok) {
          const ct = res.headers.get('content-type') || '';
          if (ct.includes('zip') || ct.includes('octet-stream')) {
            downloadedBlob = await res.blob();
          }
        }
      } catch {
        // Fallback smoothly to client-side bundled ZIP generation
      }
    }

    if (!downloadedBlob) {
      onProgress?.('Đang đóng gói Pydroid3-Web-Update-Files.zip...');
      const { zip, fileCount } = await buildProjectUpdateZipBlob(onProgress);
      downloadedBlob = await zip.generateAsync({
        type: 'blob',
        compression: 'DEFLATE',
        compressionOptions: { level: 6 },
      });
      fileCountLabel = ` (${fileCount} tệp)`;
    }

    const blobUrl = URL.createObjectURL(downloadedBlob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = 'Pydroid3-Web-Update-Files.zip';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(blobUrl), 2500);

    return {
      ok: true,
      message: `Đã tải xong Pydroid3-Web-Update-Files.zip${fileCountLabel} — sẵn sàng cập nhật lên GitHub!`,
    };
  } catch (err: any) {
    return {
      ok: false,
      message: `Không thể tạo file cập nhật (${err?.message || 'Lỗi không xác định'}).`,
    };
  }
}
