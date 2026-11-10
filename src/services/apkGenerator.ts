import JSZip from 'jszip';
import { ApkConfig } from '../types';

export function detectRequirements(code: string): string[] {
  // Always include core Python Android runtime requirements
  const reqs = new Set<string>(['python3', 'kivy==2.3.0', 'pillow', 'certifi', 'android']);

  // Standard library modules that are already built-in and must not be passed to pip
  const stdlib = new Set([
    'sys', 'os', 'math', 'random', 'time', 'json', 'datetime', 're',
    'string', 'io', 'collections', 'itertools', 'functools', 'copy',
    'threading', 'queue', 'traceback', 'builtins', 'typing', 'enum',
    'pathlib', 'shutil', 'tempfile', 'subprocess', 'platform', 'hashlib',
    'base64', 'urllib', 'http', 'socket', 'sqlite3', 'csv', 'logging',
    'unittest', 'decimal', 'fractions', 'struct', 'pickle', 'gzip'
  ]);

  const importRegex = /(?:from|import)\s+([a-zA-Z0-9_]+)/g;
  let match;
  while ((match = importRegex.exec(code)) !== null) {
    const pkg = match[1].toLowerCase();
    if (!stdlib.has(pkg)) {
      if (pkg === 'numpy') reqs.add('numpy');
      else if (pkg === 'requests') reqs.add('requests');
      else if (pkg === 'colorama') reqs.add('colorama');
      else if (pkg === 'pyfiglet') reqs.add('pyfiglet');
      else if (pkg === 'matplotlib') reqs.add('matplotlib');
      else if (pkg === 'pandas') reqs.add('pandas');
      else if (pkg === 'bs4' || pkg === 'beautifulsoup4') reqs.add('beautifulsoup4');
      else if (pkg !== 'kivy') reqs.add(pkg);
    }
  }

  return Array.from(reqs);
}

export function generateBuildozerSpec(config: ApkConfig, requirements: string[] = []): string {
  const baseReqs = requirements.length > 0
    ? requirements
    : ['python3', 'kivy==2.3.0', 'pillow', 'certifi', 'android'];
  const reqStr = Array.from(new Set(baseReqs)).join(',');
  const permStr = config.permissions.join(',');

  return `[app]

# (str) Title of your application
title = ${config.appName}

# (str) Package name
package.name = ${config.packageName.toLowerCase().replace(/[^a-z0-9_]/g, '_')}

# (str) Package domain (needed for android/ios packaging)
package.domain = org.pydroid

# (str) Source code where the main.py lives
source.dir = .

# (list) Source files to include (let empty to include all the files)
source.include_exts = py,png,jpg,kv,atlas,json,txt,md,ttf,otf

# (str) Application versioning
version = ${config.version || '1.0.0'}

# (list) Application requirements
# Core requirements include kivy, pillow, certifi, and android for crash-free startup
requirements = ${reqStr}

# (str) Supported orientation (one of landscape, sensorLandscape, portrait or all)
orientation = ${config.orientation}

# (list) Permissions
android.permissions = ${permStr || 'INTERNET,VIBRATE'}

# (int) Target Android API
android.api = 33

# (int) Minimum API your APK will support.
android.minapi = 21

# (str) Android NDK version to use
android.ndk = 25b

# (bool) If True, automatically accept SDK license agreements (mandatory for CI / GitHub Actions)
android.accept_sdk_license = True

# (bool) Use --private data storage (True) or --dir public storage (False)
android.private_storage = True

# (list) The Android architectures to build for.
# arm64-v8a is the modern 64-bit standard for Android 9 - 15, preventing 32-bit crashes.
android.archs = arm64-v8a

# (bool) enables Android auto backup feature (Android API >=23)
android.allow_backup = True

# (str) The format used to package the app for release mode (aab or apk or default).
android.release_artifact = apk

# (str) Android logcat filters to aid troubleshooting
android.logcat_filters = *:S python:D

[buildozer]

# (int) Log level (0 = error only, 1 = info, 2 = debug with command-line)
log_level = 2

# (int) Display warning if buildozer is run as root (0 = False, 1 = True)
warn_on_root = 1
`;
}

export function generateGitHubWorkflow(appName: string): string {
  return `name: Build Android APK (Pydroid 3)

on:
  push:
    branches: [ main, master ]
  workflow_dispatch:

jobs:
  build:
    name: Biên Dịch APK Android với Buildozer
    runs-on: ubuntu-22.04

    steps:
      - name: Kiểm tra mã nguồn (Checkout)
        uses: actions/checkout@v4

      - name: Cài đặt JDK 17
        uses: actions/setup-java@v4
        with:
          distribution: 'zulu'
          java-version: '17'

      - name: Cài đặt Python 3.10
        uses: actions/setup-python@v5
        with:
          python-version: '3.10'

      - name: Cài đặt các gói phụ thuộc hệ thống Linux
        run: |
          sudo apt-get update
          sudo apt-get install -y git zip unzip autoconf libtool pkg-config zlib1g-dev libncurses5-dev libncursesw5-dev libtinfo5 cmake libffi-dev libssl-dev libltdl-dev build-essential ccache

      - name: Cài đặt Buildozer và Cython
        run: |
          pip install --upgrade pip
          pip install Cython==0.29.36 buildozer virtualenv

      - name: Bộ nhớ đệm Buildozer Cache (Tăng tốc độ build)
        uses: actions/cache@v4
        with:
          path: |
            ~/.buildozer
            .buildozer
          key: buildozer-v2-\${{ runner.os }}-\${{ hashFiles('buildozer.spec') }}
          restore-keys: |
            buildozer-v2-\${{ runner.os }}-

      - name: Thiết lập chấp nhận giấy phép Android SDK
        run: |
          mkdir -p ~/.android
          touch ~/.android/repositories.cfg

      - name: Biên dịch file app-debug.apk
        run: |
          yes | buildozer -v android debug

      - name: Tải tập tin APK thành phẩm lên GitHub Artifacts
        uses: actions/upload-artifact@v4
        with:
          name: ${appName.replace(/[^a-zA-Z0-9_-]/g, '_')}-debug-apk
          path: bin/*.apk
          retention-days: 14
`;
}

export function generateReadme(appName: string, packageName: string): string {
  return `# 📱 ${appName} - Ứng Dụng Android Python (Pydroid 3)

Dự án này được tạo tự động bởi **Pydroid 3 Web IDE**. Bạn có thể đóng gói thành file cài đặt **\`app-debug.apk\`** trên Android hoàn toàn miễn phí trên đám mây thông qua **GitHub Actions** mà không cần cài đặt Linux hay Buildozer trên máy tính!

---

## 🚀 Hướng Dẫn Đóng Gói Thành File APK Trên Điện Thoại (3 Phút)

### Bước 1: Tạo Kho Lưu Trữ (Repository) Trên GitHub
1. Mở trình duyệt trên điện thoại hoặc máy tính, truy cập: [https://github.com/new](https://github.com/new)
2. Đặt tên kho lưu trữ (ví dụ: \`${packageName}\`).
3. Chọn chế độ **Public** (để dùng GitHub Actions miễn phí không giới hạn phút) hoặc **Private**.
4. Bấm **"Create repository"**.

### Bước 2: Tải Toàn Bộ Mã Nguồn Lên GitHub
- Giải nén file \`.zip\` này trên điện thoại của bạn.
- Trên trang GitHub vừa tạo, chọn **"uploading an existing file"** (Tải lên file có sẵn).
- Chọn tất cả các file và thư mục:
  - Thư mục \`.github/workflows/build-apk.yml\`
  - File \`buildozer.spec\`
  - File \`main.py\`
  - File \`README.md\`
- Bấm **"Commit changes"**.

### Bước 3: Xem Quá Trình Biên Dịch Tự Động
1. Nhấn vào tab **"Actions"** trên thanh menu GitHub của bạn.
2. Bạn sẽ thấy quy trình: **"Biên Dịch APK Android với Buildozer"** đang tự động chạy (hình vòng tròn vàng xoay).
3. Chờ khoảng 3 - 5 phút (lần đầu có thể mất 6 phút để tải Android NDK).
4. Khi xuất hiện dấu tích xanh lá cây ✅ **thành công**, nhấn vào workflow đó.

### Bước 4: Tải File APK Về Điện Thoại & Cài Đặt
1. Kéo xuống mục **"Artifacts"** ở cuối trang.
2. Bấm vào tệp **\`${appName.replace(/[^a-zA-Z0-9_-]/g, '_')}-debug-apk\`** để tải về máy.
3. Giải nén file zip vừa tải, bạn sẽ có ngay tệp **\`app-debug.apk\`**!
4. Nhấn mở tệp trên điện thoại Android, cho phép "Cài đặt ứng dụng không rõ nguồn gốc" và trải nghiệm ngay! 🎉

---

### 💡 Lưu Ý Xử Lý Lỗi Android SDK License (Nếu Gặp Lại)
- Tệp \`buildozer.spec\` đã được cấu hình sẵn \`android.accept_sdk_license = True\`.
- Quy trình \`build-apk.yml\` đã được cấu hình tự động chấp nhận giấy phép (\`yes | buildozer -v android debug\`) và tạo cache key mới để tránh lỗi thiếu \`aidl\`.
- Nếu quy trình cũ bị lưu cache hỏng, bạn chỉ cần vào mục **Actions** > **Caches** trên GitHub và bấm **Delete all caches** rồi chạy lại.
`;
}

export async function createApkZipPackage(
  config: ApkConfig,
  pythonCode: string,
  extraRequirements: string[] = []
): Promise<Blob> {
  const zip = new JSZip();

  // Auto-detect any imported modules from python code
  const detectedReqs = detectRequirements(pythonCode);
  const combinedReqs = Array.from(new Set([...detectedReqs, ...extraRequirements]));

  // 1. Add .github/workflows/build-apk.yml
  const workflowContent = generateGitHubWorkflow(config.appName);
  zip.file('.github/workflows/build-apk.yml', workflowContent);

  // 2. Add buildozer.spec with verified requirements
  const specContent = generateBuildozerSpec(config, combinedReqs);
  zip.file('buildozer.spec', specContent);

  // 3. Add user_script.py: clean unmodified user source code
  zip.file('user_script.py', pythonCode);

  // 4. Add main.py: Crash-Resistant Android Runner
  const isNativeKivy = pythonCode.includes('from kivy') || pythonCode.includes('import kivy');
  let finalMainCode = '';

  if (isNativeKivy) {
    // If user wrote their own Kivy app, run it with an on-screen crash guard
    finalMainCode = `# -*- coding: utf-8 -*-
"""
Native Kivy App with Crash Guard for Android
Generated by Pydroid 3 Web
"""
import sys, os, traceback

try:
${pythonCode}
except Exception as e:
    err_tb = traceback.format_exc()
    print("FATAL ERROR ON ANDROID:", err_tb)
    try:
        import kivy
        from kivy.app import App
        from kivy.uix.boxlayout import BoxLayout
        from kivy.uix.textinput import TextInput
        from kivy.uix.label import Label
        from kivy.core.window import Window
        from kivy.utils import get_color_from_hex

        Window.clearcolor = get_color_from_hex('#0d1117')
        class CrashGuardApp(App):
            def build(self):
                self.title = "${config.appName} - Lỗi Khởi Chạy"
                layout = BoxLayout(orientation='vertical', padding=10, spacing=8)
                lbl = Label(
                    text="[b][color=ef4444]⚠️ PHÁT HIỆN LỖI KHI MỞ ỨNG DỤNG[/color][/b]",
                    markup=True,
                    size_hint_y=None,
                    height=45,
                    font_size='18sp'
                )
                txt = TextInput(
                    text="Ứng dụng gặp lỗi ngoại lệ khi khởi động:\\n\\n" + err_tb,
                    readonly=True,
                    background_color=get_color_from_hex('#161b22'),
                    foreground_color=get_color_from_hex('#fca5a5'),
                    font_size='13sp'
                )
                layout.add_widget(lbl)
                layout.add_widget(txt)
                return layout
        CrashGuardApp().run()
    except Exception:
        sys.exit(1)
`;
  } else {
    // Standard Python script: Run in Android Terminal Emulator with input() support & background thread
    finalMainCode = `# -*- coding: utf-8 -*-
"""
Crash-Resistant Android Terminal Emulator for ${config.appName}
Generated by Pydroid 3 Web
"""
import os
import sys
import io
import threading
import queue
import traceback
import builtins

# Force UTF-8 encoding
os.environ['PYTHONIOENCODING'] = 'utf-8'

import kivy
from kivy.app import App
from kivy.clock import Clock, mainthread
from kivy.uix.boxlayout import BoxLayout
from kivy.uix.textinput import TextInput
from kivy.uix.button import Button
from kivy.uix.label import Label
from kivy.core.window import Window
from kivy.utils import get_color_from_hex

Window.clearcolor = get_color_from_hex('#0d1117')
Window.softinput_mode = 'below_target'

class AndroidTerminalApp(App):
    def build(self):
        self.title = "${config.appName}"
        self.input_queue = queue.Queue()
        self.is_running = False
        
        root = BoxLayout(orientation='vertical', padding=[8, 8, 8, 8], spacing=6)
        
        # Header bar
        header = BoxLayout(orientation='horizontal', size_hint_y=None, height=44, spacing=6)
        
        header_title = Label(
            text="[b]🐍 ${config.appName}[/b]",
            markup=True,
            font_size='17sp',
            color=get_color_from_hex('#38bdf8'),
            size_hint_x=0.72,
            halign='left',
            valign='middle'
        )
        header_title.bind(size=header_title.setter('text_size'))
        header.add_widget(header_title)
        
        btn_rerun = Button(
            text="🔄 Chạy lại",
            size_hint_x=0.28,
            font_size='13sp',
            bold=True,
            background_normal='',
            background_color=get_color_from_hex('#1e293b'),
            color=get_color_from_hex('#f1f5f9')
        )
        btn_rerun.bind(on_release=self.restart_execution)
        header.add_widget(btn_rerun)
        root.add_widget(header)
        
        # Terminal Output Screen
        self.terminal = TextInput(
            text="[ Khởi chạy ${config.appName} trên Android ]\\n\\n",
            readonly=True,
            font_size='13sp',
            font_name='Roboto',
            background_color=get_color_from_hex('#161b22'),
            foreground_color=get_color_from_hex('#f0f6fc'),
            size_hint=(1, 1),
            padding=[10, 10, 10, 10]
        )
        root.add_widget(self.terminal)
        
        # Interactive input bar (for input() support)
        self.input_bar = BoxLayout(orientation='horizontal', size_hint_y=None, height=48, spacing=6)
        
        self.txt_input = TextInput(
            hint_text="Nhập dữ liệu vào đây (cho input())...",
            multiline=False,
            font_size='14sp',
            background_color=get_color_from_hex('#21262d'),
            foreground_color=get_color_from_hex('#ffffff'),
            size_hint_x=0.74,
            padding=[10, 12, 10, 12]
        )
        self.txt_input.bind(on_text_validate=self.on_send_input)
        self.input_bar.add_widget(self.txt_input)
        
        self.btn_send = Button(
            text="Gửi ✈",
            size_hint_x=0.26,
            font_size='14sp',
            bold=True,
            background_normal='',
            background_color=get_color_from_hex('#0ea5e9'),
            color=get_color_from_hex('#ffffff')
        )
        self.btn_send.bind(on_release=self.on_send_input)
        self.input_bar.add_widget(self.btn_send)
        root.add_widget(self.input_bar)
        
        # Run code on background thread once UI has displayed
        Clock.schedule_once(lambda dt: self.start_execution(), 0.3)
        return root

    @mainthread
    def append_text(self, text):
        self.terminal.text += text
        self.terminal.cursor = (0, len(self.terminal.text))

    def on_send_input(self, instance=None):
        val = self.txt_input.text
        self.txt_input.text = ""
        self.append_text(val + "\\n")
        self.input_queue.put(val)

    def custom_input(self, prompt=""):
        p_str = str(prompt) if prompt is not None else ""
        if p_str:
            self.append_text(p_str)
        # Block worker thread safely until user sends input via Android UI
        return self.input_queue.get()

    def start_execution(self):
        if self.is_running:
            return
        self.is_running = True
        
        class OutputRedirector:
            def __init__(self, write_fn):
                self.write_fn = write_fn
            def write(self, s):
                if s:
                    self.write_fn(str(s))
                return len(s) if s else 0
            def flush(self):
                pass
            def isatty(self):
                return True

        def worker():
            sys.stdout = OutputRedirector(self.append_text)
            sys.stderr = OutputRedirector(self.append_text)
            builtins.input = self.custom_input
            
            script_path = os.path.join(os.path.dirname(__file__), 'user_script.py')
            try:
                if os.path.exists(script_path):
                    with open(script_path, 'r', encoding='utf-8') as f:
                        code_content = f.read()
                else:
                    code_content = """${pythonCode.replace(/\\/g, '\\\\').replace(/"""/g, '\\"\\"\\"')}"""
                
                # Execute in top-level __main__ namespace without function indentation limitations
                ns = {
                    '__name__': '__main__',
                    '__file__': script_path,
                    '__builtins__': builtins.__dict__,
                }
                compiled = compile(code_content, 'user_script.py', 'exec')
                exec(compiled, ns)
                self.append_text("\\n\\n[ Chương trình đã kết thúc ]\\n")
            except Exception as e:
                tb = traceback.format_exc()
                self.append_text("\\n\\n[!] LỖI THỰC THI TRÊN ANDROID:\\n" + tb + "\\n")
            finally:
                self.is_running = False

        self.thread = threading.Thread(target=worker, daemon=True)
        self.thread.start()

    def restart_execution(self, instance=None):
        self.terminal.text = "[ Đang khởi động lại chương trình... ]\\n\\n"
        self.start_execution()

if __name__ == '__main__':
    try:
        AndroidTerminalApp().run()
    except Exception as e:
        import traceback
        traceback.print_exc()
`;
  }

  zip.file('main.py', finalMainCode);

  // 5. Add README.md
  const readmeContent = generateReadme(config.appName, config.packageName);
  zip.file('README.md', readmeContent);

  // 6. Add .gitignore
  zip.file('.gitignore', `.buildozer/
bin/
*.pyc
__pycache__/
`);

  return await zip.generateAsync({ type: 'blob' });
}
