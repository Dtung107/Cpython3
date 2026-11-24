import React from 'react';
import { BookOpen, X, Play, Code, Sparkles, Terminal, Gamepad2, LineChart, Smartphone } from 'lucide-react';

interface SampleCode {
  id: string;
  title: string;
  description: string;
  category: 'starter' | 'interactive' | 'visual' | 'mobile' | 'debug';
  icon: any;
  code: string;
}

export const SAMPLE_CODES: SampleCode[] = [
  {
    id: 'hello',
    title: 'Xin Chào Pydroid 3 & Cấu Hình',
    description: 'Chương trình khởi động in thông tin phiên bản Python, hệ thống và kiến trúc.',
    category: 'starter',
    icon: Code,
    code: `# Pydroid 3 Web - Python Starter
import sys
import platform
import math
from datetime import datetime

print("=" * 45)
print("  PYDROID 3 WEB - PYTHON IDE FOR ANDROID")
print("=" * 45)

print(f"Phiên bản Python: {platform.python_version()}")
print(f"Hệ điều hành:     {platform.system()} ({platform.machine()})")
print(f"Thời gian:        {datetime.now().strftime('%d/%m/%Y %H:%M:%S')}")
print("-" * 45)

# Tính toán toán học
pi = math.pi
print(f"Số Pi: {pi:.6f}")
print(f"Sin(90°): {math.sin(math.radians(90))}")
print(f"Căn bậc hai của 2026: {math.sqrt(2026):.4f}")

print("-" * 45)
print("Sẵn sàng cho việc lập trình Python trên Android! 🐍")
`,
  },
  {
    id: 'calculator_multi_input',
    title: 'Máy Tính Cá Nhân (Nhiều lần input liên tiếp)',
    description: 'Chương trình máy tính bỏ túi yêu cầu nhập số thứ nhất, số thứ hai và phép tính một cách tuần tự.',
    category: 'interactive',
    icon: Terminal,
    code: `# Máy Tính Bỏ Túi Đa Năng - Kiểm thử nhiều lệnh input() liên tiếp
def nhap_so(prompt):
    while True:
        try:
            return float(input(prompt))
        except ValueError:
            print("⚠️ Vui lòng chỉ nhập số hợp lệ!")

def may_tinh():
    print("=" * 40)
    print("      MÁY TÍNH BỎ TÚI PYDROID 3")
    print("=" * 40)
    
    so_1 = nhap_so("Nhập số thứ nhất: ")
    so_2 = nhap_so("Nhập số thứ hai: ")
    phep_tinh = input("Chọn phép toán (+, -, *, /): ").strip()
    
    if phep_tinh == "+":
        ket_qua = so_1 + so_2
    elif phep_tinh == "-":
        ket_qua = so_1 - so_2
    elif phep_tinh == "*":
        ket_qua = so_1 * so_2
    elif phep_tinh == "/":
        if so_2 == 0:
            print("❌ Lỗi: Không thể chia cho số 0!")
            return
        ket_qua = so_1 / so_2
    else:
        print(f"❌ Phép toán '{phep_tinh}' không hợp lệ!")
        return
        
    print("-" * 40)
    print(f"🎉 Kết quả: {so_1} {phep_tinh} {so_2} = {ket_qua}")
    print("=" * 40)

if __name__ == '__main__':
    may_tinh()
`,
  },
  {
    id: 'guess_game',
    title: 'Game Đoán Số Tương Tác (input)',
    description: 'Trò chơi đoán số ngẫu nhiên minh họa tính năng nhập liệu input() trực tiếp trong terminal.',
    category: 'interactive',
    icon: Gamepad2,
    code: `# Trò Chơi Đoán Số Bí Ẩn (Thử nghiệm input() tương tác)
import random

print("🎮 Chào mừng bạn đến với Game Đoán Số Bí Ẩn!")
print("Máy tính đã chọn một số ngẫu nhiên từ 1 đến 50.")
print("-" * 45)

secret_number = random.randint(1, 50)
attempts = 0
max_attempts = 6

while attempts < max_attempts:
    attempts += 1
    remaining = max_attempts - attempts + 1
    
    try:
        user_input = input(f"Lần đoán {attempts}/{max_attempts} - Nhập số của bạn: ")
        guess = int(user_input.strip())
        
        if guess < secret_number:
            print("👉 Số bí ẩn LỚN HƠN số bạn vừa đoán!")
        elif guess > secret_number:
            print("👉 Số bí ẩn NHỎ HƠN số bạn vừa đoán!")
        else:
            print(f"🎉 CHÍNH XÁC! Bạn đã đoán đúng số {secret_number} sau {attempts} lần!")
            break
    except ValueError:
        print("⚠️ Vui lòng chỉ nhập số nguyên hợp lệ!")

if guess != secret_number:
    print(f"😢 Hết lượt! Số bí ẩn là: {secret_number}. Chúc bạn may mắn lần sau!")
`,
  },
  {
    id: 'matplotlib_sin',
    title: 'Vẽ Đồ Thị Sóng Sin (Matplotlib & Numpy)',
    description: 'Vẽ đồ thị 2D sóng hình sin và cosin, hiển thị ngay trên màn hình terminal Pydroid 3.',
    category: 'visual',
    icon: LineChart,
    code: `# Vẽ đồ thị sóng Sin & Cosin với Matplotlib và Numpy
import numpy as np
import matplotlib.pyplot as plt

print("Đang tính toán mảng sóng lượng giác với Numpy...")
# Tạo mảng giá trị x từ 0 đến 4*pi
x = np.linspace(0, 4 * np.pi, 200)
y1 = np.sin(x)
y2 = np.cos(x)

# Thiết lập biểu đồ với chủ đề tối Dark Theme đẹp mắt
plt.figure(figsize=(8, 4.5), facecolor='#161a24')
ax = plt.axes()
ax.set_facecolor('#0f1118')

plt.plot(x, y1, label='Sóng Sin: y = sin(x)', color='#38bdf8', linewidth=2.5)
plt.plot(x, y2, label='Sóng Cos: y = cos(x)', color='#fbbf24', linewidth=2.5, linestyle='--')

plt.title('Đồ Thị Dao Động Sóng Sin & Cosin (Pydroid 3)', color='#f8fafc', fontsize=13, pad=12)
plt.xlabel('Trục thời gian x (rad)', color='#94a3b8', fontsize=10)
plt.ylabel('Biên độ dao động y', color='#94a3b8', fontsize=10)

plt.grid(True, linestyle=':', alpha=0.3, color='#64748b')
plt.tick_params(colors='#94a3b8')
plt.legend(facecolor='#1e2330', edgecolor='#475569', labelcolor='#e2e8f0')

print("Đang dựng biểu đồ Matplotlib... Xem kết quả bên dưới:")
plt.show()
`,
  },
  {
    id: 'kivy_mobile',
    title: 'Giao Diện Ứng Dụng Android (Kivy)',
    description: 'Mã nguồn mẫu ứng dụng di động Android dùng Kivy để đóng gói thành file APK qua GitHub Actions.',
    category: 'mobile',
    icon: Smartphone,
    code: `# Ứng dụng Android Kivy - Chuẩn bị đóng gói APK
from kivy.app import App
from kivy.uix.boxlayout import BoxLayout
from kivy.uix.label import Label
from kivy.uix.button import Button
from kivy.core.window import Window

# Thiết lập màu nền Dark Theme
Window.clearcolor = (0.09, 0.11, 0.15, 1)

class AndroidDemoApp(App):
    def build(self):
        self.title = "Ứng Dụng Di Động Pydroid 3"
        layout = BoxLayout(orientation='vertical', padding=20, spacing=15)
        
        self.lbl = Label(
            text="[b]Xin Chào Android![/b]\\nChạm nút bên dưới để tăng đếm",
            markup=True,
            font_size='20sp',
            color=(0.22, 0.74, 0.97, 1)
        )
        layout.add_widget(self.lbl)
        
        self.count = 0
        btn = Button(
            text="Chạm Vào Đây! 🚀",
            font_size='18sp',
            size_hint_y=0.35,
            background_normal='',
            background_color=(0.2, 0.7, 0.4, 1)
        )
        btn.bind(on_press=self.on_button_click)
        layout.add_widget(btn)
        
        return layout

    def on_button_click(self, instance):
        self.count += 1
        self.lbl.text = f"[b]Tuyệt vời![/b]\\nBạn đã chạm {self.count} lần trên Android! 🎉"

if __name__ == '__main__':
    AndroidDemoApp().run()
`,
  },
  {
    id: 'test_debugger',
    title: 'Kiểm Thử Trợ Lý Gỡ Lỗi AI (Cố tình có lỗi)',
    description: 'Đoạn mã có lỗi cú pháp và logic cố ý để bạn kiểm nghiệm khả năng chẩn đoán & tự sửa lỗi của Gemini 3.8 Flash.',
    category: 'debug',
    icon: Sparkles,
    code: `# Đoạn mã thử nghiệm AI Debugger (Cố tình có lỗi cú pháp và logic)
def tinh_trung_binh(danh_sach):
    # Lỗi 1: Cố tình quên dấu hai chấm và sai thụt lề
    tong = 0
    for so in danh_sach
        tong += so
    
    # Lỗi 2: Lỗi chia cho 0 nếu danh sách rỗng
    ket_qua = tong / len(danh_sach)
    return ket_qua

# Thử gọi hàm
du_lieu = [10, 25, 30, 45, 50]
tb = tinh_trung_binh(du_lieu)
print(f"Giá trị trung bình là: " + tb) # Lỗi 3: TypeError cộng chuỗi với float!
`,
  },
];

interface SampleCodesModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectCode: (code: string) => void;
}

export const SampleCodesModal: React.FC<SampleCodesModalProps> = ({
  isOpen,
  onClose,
  onSelectCode,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 animate-in fade-in duration-200">
      <div
        className="w-full max-w-2xl max-h-[90vh] bg-[#161a24] border border-slate-700/80 rounded-2xl shadow-2xl flex flex-col overflow-hidden text-slate-100"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-4 py-3 bg-[#1d2230] border-b border-slate-700/80 flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-2">
            <div className="p-1.5 rounded-lg bg-amber-500/20 text-amber-400 border border-amber-500/30">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-bold text-base text-slate-100">
                Kho Mã Mẫu Python Sẵn Có
              </h2>
              <p className="text-[11px] text-slate-400">
                Chọn mẫu mã sẵn để học tập hoặc thử nghiệm các tính năng Pydroid 3 Web
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-white transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* List of samples */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
          {SAMPLE_CODES.map((sample) => {
            const Icon = sample.icon;
            return (
              <div
                key={sample.id}
                className="p-3.5 rounded-xl bg-[#1a1f2b] border border-slate-700/60 hover:border-slate-500 transition flex items-start justify-between space-x-3 group"
              >
                <div className="flex items-start space-x-3 min-w-0 flex-1">
                  <div className="p-2 rounded-lg bg-[#222838] text-amber-400 shrink-0 group-hover:scale-105 transition">
                    <Icon className="w-5 h-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center space-x-2">
                      <h3 className="font-bold text-sm text-slate-100">
                        {sample.title}
                      </h3>
                      {sample.category === 'debug' && (
                        <span className="px-1.5 py-0.2 rounded text-[10px] bg-rose-500/20 text-rose-300 font-semibold border border-rose-500/30">
                          Thử lỗi AI
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-400 mt-1">
                      {sample.description}
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => {
                    onSelectCode(sample.code);
                    onClose();
                  }}
                  className="px-3 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500 text-amber-300 hover:text-slate-950 font-semibold text-xs flex items-center space-x-1 shrink-0 transition active:scale-95 border border-amber-500/40"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>Dùng mẫu</span>
                </button>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="px-4 py-2.5 bg-[#1d2230] border-t border-slate-700/80 flex items-center justify-end">
          <button
            onClick={onClose}
            className="px-3.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs transition"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
};
