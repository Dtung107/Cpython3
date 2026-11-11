# 📱 PydroidApp - Ứng Dụng Android Python (Pydroid 3)

Dự án này được tạo tự động bởi **Pydroid 3 Web IDE**. Bạn có thể đóng gói thành file cài đặt **`app-debug.apk`** trên Android hoàn toàn miễn phí trên đám mây thông qua **GitHub Actions** mà không cần cài đặt Linux hay Buildozer trên máy tính!

---

## 🚀 Hướng Dẫn Đóng Gói Thành File APK Trên Điện Thoại (3 Phút)

### Bước 1: Tạo Kho Lưu Trữ (Repository) Trên GitHub
1. Mở trình duyệt trên điện thoại hoặc máy tính, truy cập: [https://github.com/new](https://github.com/new)
2. Đặt tên kho lưu trữ (ví dụ: `pydroid_app`).
3. Chọn chế độ **Public** (để dùng GitHub Actions miễn phí không giới hạn phút) hoặc **Private**.
4. Bấm **"Create repository"**.

### Bước 2: Tải Toàn Bộ Mã Nguồn Lên GitHub
- Giải nén file `.zip` này trên điện thoại của bạn.
- Trên trang GitHub vừa tạo, chọn **"uploading an existing file"** (Tải lên file có sẵn).
- Chọn tất cả các file và thư mục:
  - Thư mục `.github/workflows/build-apk.yml`
  - File `buildozer.spec`
  - File `main.py`
  - File `README.md`
- Bấm **"Commit changes"**.

### Bước 3: Xem Quá Trình Biên Dịch Tự Động
1. Nhấn vào tab **"Actions"** trên thanh menu GitHub của bạn.
2. Bạn sẽ thấy quy trình: **"Biên Dịch APK Android với Buildozer"** đang tự động chạy (hình vòng tròn vàng xoay).
3. Chờ khoảng 3 - 5 phút (lần đầu có thể mất 6 phút để tải Android NDK).
4. Khi xuất hiện dấu tích xanh lá cây ✅ **thành công**, nhấn vào workflow đó.

### Bước 4: Tải File APK Về Điện Thoại & Cài Đặt
1. Kéo xuống mục **"Artifacts"** ở cuối trang.
2. Bấm vào tệp **`PydroidApp-debug-apk`** để tải về máy.
3. Giải nén file zip vừa tải, bạn sẽ có ngay tệp **`app-debug.apk`**!
4. Nhấn mở tệp trên điện thoại Android, cho phép "Cài đặt ứng dụng không rõ nguồn gốc" và trải nghiệm ngay! 🎉

---

### 💡 Lưu Ý Xử Lý Lỗi Android SDK License (Nếu Gặp Lại)
- Tệp `buildozer.spec` đã được cấu hình sẵn `android.accept_sdk_license = True`.
- Quy trình `build-apk.yml` đã được cấu hình tự động chấp nhận giấy phép (`yes | buildozer -v android debug`) và tạo cache key mới để tránh lỗi thiếu `aidl`.
- Nếu quy trình cũ bị lưu cache hỏng, bạn chỉ cần vào mục **Actions** > **Caches** trên GitHub và bấm **Delete all caches** rồi chạy lại.
