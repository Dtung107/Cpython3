import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';
import { getApiBaseUrl, getApiUrl, testBackendServerUrl } from './apiConfig';

export async function downloadProjectUpdateZip(
  onProgress?: (msg: string) => void
): Promise<{ ok: boolean; message: string }> {
  const endpointUrl = getApiUrl('/api/project/update-bundle');
  const baseUrl = getApiBaseUrl();

  try {
    // On Capacitor Android APK, verify backend connectivity first and hand off direct download to Android Chrome/Download Manager
    if (Capacitor.isNativePlatform()) {
      if (!baseUrl) {
        return {
          ok: false,
          message: 'Chưa có URL máy chủ backend để tải gói cập nhật. Hãy đặt URL máy chủ ở mục "Máy chủ tùy chỉnh".',
        };
      }
      onProgress?.('Đang kiểm tra kết nối máy chủ...');
      const check = await testBackendServerUrl(baseUrl, 30000, onProgress);
      if (!check.ok) {
        return {
          ok: false,
          message: check.message,
        };
      }
      await Browser.open({ url: endpointUrl });
      return {
        ok: true,
        message: 'Đã mở trình tải xuống gói cập nhật Pydroid3-Web-Update-Files.zip!',
      };
    }

    onProgress?.('Đang nén các tệp mã nguồn cập nhật...');
    const res = await fetch(endpointUrl, { cache: 'no-store' });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    const blob = await res.blob();
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = 'Pydroid3-Web-Update-Files.zip';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(blobUrl), 2500);

    return {
      ok: true,
      message: 'Đã tải xong Pydroid3-Web-Update-Files.zip — sẵn sàng tải lên GitHub!',
    };
  } catch (err: any) {
    return {
      ok: false,
      message: `Không thể tải file cập nhật (${err?.message || 'Lỗi kết nối máy chủ'}).`,
    };
  }
}
