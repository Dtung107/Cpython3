    # ==========================================
# 🐍 Chào mừng bạn đến với Pydroid 3 Web!
# Môi trường IDE Python tối ưu cho Android
# ==========================================

import sys
import math

def main():
    print("✨ Đang khởi chạy Pydroid 3 trên Android...")
    print(f"Phiên bản Python: {sys.version.split()[0]}")
    print("-" * 40)
    
    # Kiểm tra tính năng input() tương tác thời gian thực
    ten = input("Nhập họ và tên của bạn: ")
    print(f"👋 Xin chào {ten}! Chúc bạn lập trình vui vẻ!")
    
    # Tính toán hình học
    ban_kinh = 7.5
    chu_vi = 2 * math.pi * ban_kinh
    dien_tich = math.pi * (ban_kinh ** 2)
    
    print(f"📐 Hình tròn bán kính r = {ban_kinh}:")
    print(f"   - Chu vi:    {chu_vi:.2f}")
    print(f"   - Diện tích: {dien_tich:.2f}")
    print("-" * 40)
    print("🎉 Hoàn tất chương trình thành công!")

if __name__ == "__main__":
    main()
