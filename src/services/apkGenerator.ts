import JSZip from 'jszip';
import { ApkConfig } from '../types';

function stripPythonCommentsAndStrings(code: string): string {
  // Remove triple-quoted strings, single/double-quoted strings, and # comments
  // while preserving newlines so line-anchored import parsing only inspects real code.
  return code
    .replace(/("""[\s\S]*?"""|'''[\s\S]*?''')/g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'/g, '""')
    .replace(/#[^\n]*/g, '');
}

export function detectRequirements(code: string): string[] {
  // Core Python Android runtime requirements (built by p4a v2024.01.21 / Python 3.11)
  const reqs = new Set<string>(['python3', 'kivy', 'certifi', 'android']);

  // Standard library and toolchain built-in modules that must NEVER be passed to pip
  const stdlib = new Set([
    '__future__', 'abc', 'aifc', 'argparse', 'array', 'ast', 'asynchat', 'asyncio',
    'asyncore', 'atexit', 'audioop', 'base64', 'bdb', 'binascii', 'binhex', 'bisect',
    'builtins', 'bz2', 'calendar', 'cgi', 'cgitb', 'chunk', 'cmath', 'cmd', 'code',
    'codecs', 'codeop', 'collections', 'colorsys', 'compileall', 'concurrent',
    'configparser', 'contextlib', 'contextvars', 'copy', 'copyreg', 'cprofile',
    'crypt', 'csv', 'ctypes', 'curses', 'dataclasses', 'datetime', 'dbm', 'decimal',
    'difflib', 'dis', 'distutils', 'doctest', 'email', 'encodings', 'ensurepip',
    'enum', 'errno', 'faulthandler', 'fcntl', 'filecmp', 'fileinput', 'fnmatch',
    'fractions', 'ftplib', 'functools', 'gc', 'getopt', 'getpass', 'gettext', 'glob',
    'graphlib', 'grp', 'gzip', 'hashlib', 'heapq', 'hmac', 'html', 'http', 'idlelib',
    'imaplib', 'imghdr', 'imp', 'importlib', 'inspect', 'io', 'ipaddress', 'itertools',
    'json', 'keyword', 'lib2to3', 'linecache', 'locale', 'logging', 'lzma', 'mailbox',
    'mailcap', 'marshal', 'math', 'mimetypes', 'mmap', 'modulefinder', 'msilib',
    'msvcrt', 'multiprocessing', 'netrc', 'nis', 'nntplib', 'numbers', 'operator',
    'optparse', 'os', 'ossaudiodev', 'pathlib', 'pdb', 'pickle', 'pickletools',
    'pipes', 'pkg_resources', 'pkgutil', 'platform', 'plistlib', 'poplib', 'posix',
    'posixpath', 'pprint', 'profile', 'pstats', 'pty', 'pwd', 'py_compile', 'pyclbr',
    'pydoc', 'queue', 'quopri', 'random', 're', 'readline', 'reprlib', 'resource',
    'rlcompleter', 'runpy', 'sched', 'secrets', 'select', 'selectors', 'setuptools',
    'shelve', 'shlex', 'shutil', 'signal', 'site', 'smtpd', 'smtplib', 'sndhdr',
    'socket', 'socketserver', 'spwd', 'sqlite3', 'sre_compile', 'sre_constants',
    'sre_parse', 'ssl', 'stat', 'statistics', 'string', 'stringprep', 'struct',
    'subprocess', 'sunau', 'symtable', 'sys', 'sysconfig', 'syslog', 'tabnanny',
    'tarfile', 'telnetlib', 'tempfile', 'termios', 'test', 'textwrap', 'threading',
    'time', 'timeit', 'tkinter', 'token', 'tokenize', 'tomllib', 'trace', 'traceback',
    'tracemalloc', 'ttk', 'tty', 'turtle', 'turtledemo', 'types', 'typing',
    'unicodedata', 'unittest', 'urllib', 'uu', 'uuid', 'venv', 'warnings', 'wave',
    'weakref', 'webbrowser', 'wheel', 'winreg', 'winsound', 'wsgiref', 'xdrlib',
    'xml', 'xmlrpc', 'zipapp', 'zipfile', 'zipimport', 'zlib', 'zoneinfo',
    // Built-in p4a / Kivy core modules
    'kivy', 'android', 'certifi', 'python3', 'sdl2', 'pyjnius',
  ]);

  const aliasMap: Record<string, string> = {
    pil: 'pillow',
    pillow: 'pillow',
    bs4: 'beautifulsoup4',
    beautifulsoup4: 'beautifulsoup4',
    yaml: 'pyyaml',
    pyyaml: 'pyyaml',
    jnius: 'pyjnius',
    pyjnius: 'pyjnius',
    dotenv: 'python-dotenv',
    dateutil: 'python-dateutil',
    crypto: 'pycryptodome',
    cryptodome: 'pycryptodome',
    sklearn: 'scikit-learn',
  };

  const cleanCode = stripPythonCommentsAndStrings(code);
  const lines = cleanCode.split('\n');

  const addPackage = (rawName: string) => {
    const pkg = rawName.trim().split('.')[0].toLowerCase();
    if (!pkg || pkg.startsWith('_')) return;
    const mapped = aliasMap[pkg] || pkg;
    if (!stdlib.has(pkg) && !stdlib.has(mapped)) {
      reqs.add(mapped);
    }
  };

  for (const line of lines) {
    // Match `from pkg.sub import ...` (exclude relative `from .foo import ...`)
    const fromMatch = /^[ \t]*from\s+([a-zA-Z_][a-zA-Z0-9_]*)(?:\.[a-zA-Z0-9_]+)*\s+import\b/.exec(line);
    if (fromMatch) {
      addPackage(fromMatch[1]);
      continue;
    }

    // Match `import pkg1, pkg2 as alias, pkg3.sub`
    const importMatch = /^[ \t]*import\s+([^\n;#\\]+)/.exec(line);
    if (importMatch) {
      const parts = importMatch[1].split(',');
      for (const part of parts) {
        const cleaned = part.trim().split(/\s+as\s+/i)[0]?.trim();
        if (cleaned && /^[a-zA-Z_][a-zA-Z0-9_.]*$/.test(cleaned)) {
          addPackage(cleaned);
        }
      }
    }
  }

  return Array.from(reqs);
}

export function generateBuildozerSpec(config: ApkConfig, requirements: string[] = []): string {
  const baseReqs = requirements.length > 0
    ? requirements
    : ['python3', 'kivy', 'certifi', 'android'];
  const reqStr = Array.from(new Set(baseReqs)).join(',');
  const permStr = config.permissions.join(',');
  const safePackageName =
    (config.packageName || 'pydroid_app')
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, '_')
      .replace(/^[^a-z]+/, '') || 'pydroid_app';

  return `[app]

# (str) Title of your application
title = ${config.appName}

# (str) Package name
package.name = ${safePackageName}

# (str) Package domain (needed for android/ios packaging)
package.domain = org.pydroid

# (str) Source code where the main.py lives
source.dir = .

# (list) Source files to include (let empty to include all the files)
source.include_exts = py,png,jpg,kv,atlas,json,txt,md,ttf,otf

# (list) Directories to exclude from the APK package
source.exclude_dirs = tests, bin, .venv, venv, .git, .github, __pycache__

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

# (int) Android NDK API to use (matching minapi)
android.ndk_api = 21

# (str) Android NDK version to use
android.ndk = 25b

# (bool) If True, automatically accept SDK license agreements (mandatory for CI / GitHub Actions)
android.accept_sdk_license = True

# (bool) Use --private data storage (True) or --dir public storage (False)
android.private_storage = True

# (list) The Android architectures to build for.
# arm64-v8a is the modern 64-bit standard for Android 9 - 15, preventing 32-bit crashes.
android.archs = arm64-v8a

# (bool) Enable AndroidX support (required by modern Kivy / python-for-android)
android.enable_androidx = True

# (str) Lock python-for-android to stable tested release (Python 3.11 + NDK r25b)
p4a.branch = v2024.01.21

# (bool) enables Android auto backup feature (Android API >=23)
android.allow_backup = True

# (str) Android logcat filters to aid troubleshooting
android.logcat_filters = *:S python:D

[buildozer]

# (int) Log level (0 = error only, 1 = info, 2 = debug with command-line)
log_level = 2

# (int) Display warning if buildozer is run as root (0 = False, 1 = True)
warn_on_root = 0
`;
}

export function generateGitHubWorkflow(appName: string): string {
  const safeArtifactName = appName.replace(/[^a-zA-Z0-9_-]/g, '_') || 'PydroidApp';
  return `name: Build Android APK (Pydroid 3)

on:
  push:
    branches: [ main, master ]
  workflow_dispatch:

jobs:
  build:
    name: Build Android APK with Buildozer
    runs-on: ubuntu-22.04

    steps:
      - name: 1. Checkout repository
        uses: actions/checkout@v4

      - name: 2. Set up Python 3.10
        uses: actions/setup-python@v5
        with:
          python-version: '3.10'

      - name: 3. Set up Java JDK 17
        uses: actions/setup-java@v4
        with:
          distribution: 'temurin'
          java-version: '17'

      - name: 4. Install Android & Buildozer system dependencies
        run: |
          sudo apt-get update
          sudo apt-get install -y \\
            build-essential ccache git zip unzip patch bzip2 \\
            autoconf automake autopoint gettext libtool libltdl-dev pkg-config \\
            zlib1g-dev libncurses5-dev libncursesw5-dev libtinfo5 \\
            cmake libffi-dev libssl-dev libsqlite3-dev libbz2-dev liblzma-dev \\
            libreadline-dev uuid-dev lld \\
            libsdl2-dev libsdl2-image-dev libsdl2-mixer-dev libsdl2-ttf-dev \\
            libportmidi-dev libswscale-dev libavformat-dev libavcodec-dev

      - name: 5. Cache Buildozer & Android SDK/NDK
        uses: actions/cache@v4
        with:
          path: |
            .buildozer
            ~/.buildozer
          key: \${{ runner.os }}-buildozer-\${{ hashFiles('buildozer.spec') }}
          restore-keys: |
            \${{ runner.os }}-buildozer-

      - name: 6. Install Buildozer and Cython
        run: |
          python -m venv "$HOME/.buildozer-venv"
          source "$HOME/.buildozer-venv/bin/activate"
          pip install --upgrade pip "setuptools<70" wheel virtualenv
          pip install "sh<2.0" packaging appdirs colorama jinja2 toml
          pip install cython==0.29.36
          pip install buildozer==1.5.0

      - name: 7. Build APK with Buildozer
        run: |
          source "$HOME/.buildozer-venv/bin/activate"
          # Kiểm tra nhanh cú pháp Python trước khi mất thời gian biên dịch NDK/Kivy
          if ! python3 -m py_compile main.py user_script.py; then
            echo "❌ LỖI CÚ PHÁP PYTHON: Tệp user_script.py hoặc main.py có lỗi cú pháp (SyntaxError)."
            echo "👉 Vui lòng sửa lỗi cú pháp được báo ở trên rồi tải lại mã nguồn lên GitHub."
            exit 1
          fi
          # Clear pre-installed runner Android SDK/NDK paths (e.g. NDK 27/30) so p4a uses NDK r25b cleanly
          unset ANDROID_NDK ANDROID_NDK_HOME ANDROID_NDK_ROOT ANDROID_NDK_LATEST_HOME ANDROID_HOME ANDROID_SDK_ROOT NDK_ROOT
          if ! buildozer -v android debug > /tmp/buildozer.log 2>&1; then
            echo "❌ Buildozer thất bại — Chi tiết lỗi trước phần liệt kê biến môi trường:"
            python3 -c "lines = open('/tmp/buildozer.log', errors='replace').read().splitlines(); cut = next((i for i in range(len(lines) - 1, -1, -1) if '# ENVIRONMENT:' in lines[i]), len(lines)); print('\\n'.join(lines[max(0, cut - 140):cut] + ['--- TRẠNG THÁI CUỐI ---'] + lines[-8:]))"
            exit 1
          fi
          echo "✅ Buildozer hoàn tất thành công!"
          tail -n 30 /tmp/buildozer.log

      - name: 8. Upload Buildozer Error Log (if failed)
        if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: buildozer-error-log
          path: /tmp/buildozer.log
          retention-days: 7

      - name: 9. Upload APK Artifact
        uses: actions/upload-artifact@v4
        with:
          name: ${safeArtifactName}-debug-apk
          path: bin/*.apk
          retention-days: 14
`;
}

export function generateReadme(appName: string, packageName: string): string {
  return `# 📱 ${appName} - Ứng Dụng Android Python (Pydroid 3)

Dự án này được tạo tự động bởi **Pydroid 3 Web IDE**. Bạn có thể đóng gói thành file cài đặt **\`app-debug.apk\`** trên Android hoàn toàn miễn phí trên đám mây thông qua **GitHub Actions** mà không cần cài đặt Linux hay Buildozer trên máy tính!

---

## ⚠️ CẢNH BÁO CỰC KỲ QUAN TRỌNG VỀ GOOGLE DỊCH (GOOGLE TRANSLATE)
Khi mở trang web GitHub trên điện thoại bằng Google Chrome:
- **BẮT BUỘC TẮT TÍNH NĂNG DỊCH TRANG TỰ ĐỘNG!**
- Nếu Google Chrome tự động dịch trang sang tiếng Việt:
  - Từ khóa \`master\` bị dịch thành \`bậc thầy\` -> **Gây lỗi Docker build exit code 1!**
  - Từ khóa \`uses:\` bị dịch thành \`sử dụng:\` -> **GitHub Actions báo lỗi cú pháp!**
  - File \`buildozer.spec\` bị dịch thành \`[ứng dụng]\`, \`Đúng\` -> **Buildozer không đọc được!**
- **Cách tắt trên điện thoại:** Bấm biểu tượng 3 chấm ⋮ góc phải màn hình Chrome > chọn **Dịch (Translate)** > bấm bánh răng cài đặt > chọn **"Không bao giờ dịch trang web này" (Never translate this site)**.

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
  - File \`user_script.py\`
  - File \`README.md\`
- Bấm **"Commit changes"**.

### Bước 3: Xem Quá Trình Biên Dịch Tự Động
1. Nhấn vào tab **"Actions"** trên thanh menu GitHub của bạn.
2. Bạn sẽ thấy quy trình: **"Build Android APK with Buildozer"** đang tự động chạy (hình vòng tròn vàng xoay).
3. Chờ khoảng 3 - 5 phút (lần đầu có thể mất 6 phút để tải Android NDK).
4. Khi xuất hiện dấu tích xanh lá cây ✅ **thành công**, nhấn vào workflow đó.

### Bước 4: Tải File APK Về Điện Thoại & Cài Đặt
1. Kéo xuống mục **"Artifacts"** ở cuối trang.
2. Bấm vào tệp **\`${appName.replace(/[^a-zA-Z0-9_-]/g, '_')}-debug-apk\`** để tải về máy.
3. Giải nén file zip vừa tải, bạn sẽ có ngay tệp **\`app-debug.apk\`**!
4. Nhấn mở tệp trên điện thoại Android, cho phép "Cài đặt ứng dụng không rõ nguồn gốc" và trải nghiệm ngay! 🎉
`;
}

function toBase64Utf8(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function escapePyDoubleQuoted(str: string): string {
  return str.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\r?\n/g, ' ');
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
  const codeBase64 = toBase64Utf8(pythonCode);
  const safeAppName = escapePyDoubleQuoted(config.appName || 'PydroidApp');
  let finalMainCode = '';

  if (isNativeKivy) {
    // If user wrote their own Kivy app, run user_script.py inside an on-screen crash guard
    finalMainCode = `# -*- coding: utf-8 -*-
"""
Native Kivy App with Crash Guard for Android
Generated by Pydroid 3 Web
"""
import sys, os, traceback, builtins, base64

_FALLBACK_B64 = "${codeBase64}"
script_path = os.path.join(os.path.dirname(__file__), 'user_script.py')
try:
    if os.path.exists(script_path):
        with open(script_path, 'r', encoding='utf-8') as _f:
            _user_code = _f.read()
    else:
        _user_code = base64.b64decode(_FALLBACK_B64).decode('utf-8')
    _ns = {
        '__name__': '__main__',
        '__file__': script_path,
        '__builtins__': builtins.__dict__,
    }
    exec(compile(_user_code, 'user_script.py', 'exec'), _ns)
except Exception as e:
    err_tb = traceback.format_exc()
    print("FATAL ERROR ON ANDROID:", err_tb)
    try:
        import kivy
        from kivy.app import App
        from kivy.metrics import dp, sp
        from kivy.uix.boxlayout import BoxLayout
        from kivy.uix.textinput import TextInput
        from kivy.uix.label import Label
        from kivy.core.window import Window
        from kivy.utils import get_color_from_hex

        Window.clearcolor = get_color_from_hex('#0d1117')
        class CrashGuardApp(App):
            def build(self):
                self.title = "${safeAppName} - Loi Khoi Chay"
                layout = BoxLayout(
                    orientation='vertical',
                    padding=[dp(12), dp(12), dp(12), dp(28)],
                    spacing=dp(10)
                )
                lbl = Label(
                    text="[b][color=ef4444][!] PHAT HIEN LOI KHI MO UNG DUNG[/color][/b]",
                    markup=True,
                    size_hint_y=None,
                    height=dp(44),
                    font_size=sp(16)
                )
                txt = TextInput(
                    text="Ứng dụng gặp lỗi ngoại lệ khi khởi động:\\n\\n" + err_tb,
                    readonly=True,
                    background_color=get_color_from_hex('#161b22'),
                    foreground_color=get_color_from_hex('#fca5a5'),
                    font_size=sp(13),
                    padding=[dp(10), dp(10), dp(10), dp(10)]
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
Crash-Resistant Android Terminal Emulator for ${safeAppName}
Generated by Pydroid 3 Web
"""
import os
import sys
import io
import base64
import threading
import queue
import traceback
import builtins

# Force UTF-8 encoding
os.environ['PYTHONIOENCODING'] = 'utf-8'

import kivy
from kivy.app import App
from kivy.clock import Clock, mainthread
from kivy.core.clipboard import Clipboard
from kivy.core.window import Window
from kivy.graphics import Color, RoundedRectangle
from kivy.metrics import dp, sp
from kivy.uix.boxlayout import BoxLayout
from kivy.uix.button import Button
from kivy.uix.label import Label
from kivy.uix.scrollview import ScrollView
from kivy.uix.textinput import TextInput
from kivy.utils import get_color_from_hex

Window.clearcolor = get_color_from_hex('#0d1117')
Window.softinput_mode = 'below_target'

_FALLBACK_B64 = "${codeBase64}"
_CANCEL_SENTINEL = object()


class _ExecutionCancelled(BaseException):
    pass


class AndroidTerminalApp(App):
    def build(self):
        self.title = "${safeAppName}"
        self.run_id = 0
        self.input_queue = queue.Queue()
        self.output_buffer = ""
        self._scroll_scheduled = False

        root = BoxLayout(
            orientation='vertical',
            padding=[dp(10), dp(10), dp(10), dp(28)],
            spacing=dp(8),
        )

        # Header bar
        header = BoxLayout(
            orientation='horizontal',
            size_hint_y=None,
            height=dp(46),
            spacing=dp(6),
        )

        title_box = BoxLayout(orientation='vertical', size_hint_x=1, spacing=dp(1))
        header_title = Label(
            text="[b]${safeAppName}[/b]",
            markup=True,
            font_size=sp(16),
            color=get_color_from_hex('#38bdf8'),
            halign='left',
            valign='bottom',
        )
        header_title.bind(size=header_title.setter('text_size'))
        title_box.add_widget(header_title)

        self.status_label = Label(
            text="Đang chuẩn bị...",
            font_size=sp(11.5),
            color=get_color_from_hex('#94a3b8'),
            halign='left',
            valign='top',
        )
        self.status_label.bind(size=self.status_label.setter('text_size'))
        title_box.add_widget(self.status_label)
        header.add_widget(title_box)

        btn_copy = Button(
            text="Chép",
            size_hint_x=None,
            width=dp(64),
            font_size=sp(13),
            bold=True,
            background_normal='',
            background_color=get_color_from_hex('#1e293b'),
            color=get_color_from_hex('#cbd5e1'),
        )
        btn_copy.bind(on_release=self.copy_output)
        header.add_widget(btn_copy)

        btn_rerun = Button(
            text="Chạy lại",
            size_hint_x=None,
            width=dp(88),
            font_size=sp(13),
            bold=True,
            background_normal='',
            background_color=get_color_from_hex('#0284c7'),
            color=get_color_from_hex('#ffffff'),
        )
        btn_rerun.bind(on_release=self.restart_execution)
        header.add_widget(btn_rerun)
        root.add_widget(header)

        # Terminal Output Card (ScrollView + Label avoids Android blue selection handles)
        term_card = BoxLayout(orientation='vertical', size_hint=(1, 1), padding=[dp(2), dp(2), dp(2), dp(2)])
        with term_card.canvas.before:
            Color(*get_color_from_hex('#161b22'))
            self._term_bg = RoundedRectangle(pos=term_card.pos, size=term_card.size, radius=[dp(8)])
        term_card.bind(
            pos=lambda inst, v: setattr(self._term_bg, 'pos', v),
            size=lambda inst, v: setattr(self._term_bg, 'size', v),
        )

        self.scroll_view = ScrollView(
            size_hint=(1, 1),
            do_scroll_x=False,
            do_scroll_y=True,
            bar_width=dp(4),
            bar_color=get_color_from_hex('#38bdf8'),
            bar_inactive_color=get_color_from_hex('#334155'),
        )
        self.terminal_label = Label(
            text="[ Khởi chạy ${safeAppName} trên Android ]\\n\\n",
            markup=False,
            font_size=sp(13.5),
            font_name='Roboto',
            color=get_color_from_hex('#e6edf3'),
            size_hint_y=None,
            halign='left',
            valign='top',
            padding=(dp(10), dp(10)),
        )
        self.terminal_label.bind(
            width=lambda inst, w: setattr(inst, 'text_size', (max(w, dp(100)), None)),
            texture_size=lambda inst, ts: setattr(inst, 'height', max(ts[1], self.scroll_view.height)),
        )
        self.scroll_view.bind(
            height=lambda inst, h: setattr(
                self.terminal_label, 'height', max(self.terminal_label.texture_size[1], h)
            )
        )
        self.scroll_view.add_widget(self.terminal_label)
        term_card.add_widget(self.scroll_view)
        root.add_widget(term_card)

        # Interactive input bar (for input() support), lifted cleanly above system gesture bar
        self.input_bar = BoxLayout(
            orientation='horizontal',
            size_hint_y=None,
            height=dp(48),
            spacing=dp(8),
        )

        self.txt_input = TextInput(
            hint_text="Nhập dữ liệu (cho input())...",
            multiline=False,
            font_size=sp(14),
            background_normal='',
            background_active='',
            background_color=get_color_from_hex('#21262d'),
            foreground_color=get_color_from_hex('#ffffff'),
            hint_text_color=get_color_from_hex('#8b949e'),
            cursor_color=get_color_from_hex('#38bdf8'),
            size_hint_x=1,
            padding=[dp(12), dp(13), dp(12), dp(12)],
        )
        self.txt_input.bind(on_text_validate=self.on_send_input)
        self.input_bar.add_widget(self.txt_input)

        self.btn_send = Button(
            text="Gửi",
            size_hint_x=None,
            width=dp(82),
            font_size=sp(14),
            bold=True,
            background_normal='',
            background_color=get_color_from_hex('#0ea5e9'),
            color=get_color_from_hex('#ffffff'),
        )
        self.btn_send.bind(on_release=self.on_send_input)
        self.input_bar.add_widget(self.btn_send)
        root.add_widget(self.input_bar)

        # Run code on background thread once UI has displayed
        Clock.schedule_once(lambda dt: self.start_execution(is_restart=False), 0.25)
        return root

    @mainthread
    def set_status(self, text, color_hex, run_id):
        if run_id != self.run_id:
            return
        self.status_label.text = text
        self.status_label.color = get_color_from_hex(color_hex)

    def _scroll_to_bottom(self, dt=None):
        self._scroll_scheduled = False
        if self.terminal_label.height > self.scroll_view.height:
            self.scroll_view.scroll_y = 0

    @mainthread
    def append_text(self, text, run_id=None):
        if run_id is not None and run_id != self.run_id:
            return
        self.output_buffer += text
        if len(self.output_buffer) > 12000:
            self.output_buffer = "... (đã rút gọn log cũ) ...\\n" + self.output_buffer[-10000:]
        self.terminal_label.text = self.output_buffer
        if not self._scroll_scheduled:
            self._scroll_scheduled = True
            Clock.schedule_once(self._scroll_to_bottom, 0.03)

    def copy_output(self, instance=None):
        try:
            Clipboard.copy(self.output_buffer or "")
            self.status_label.text = "Đã sao chép kết quả!"
            self.status_label.color = get_color_from_hex('#34d399')
        except Exception:
            pass

    def on_send_input(self, instance=None):
        val = self.txt_input.text
        self.txt_input.text = ""
        self.append_text(val + "\\n", self.run_id)
        self.input_queue.put(val)

    def _make_custom_input(self, run_id, my_queue):
        def custom_input(prompt=""):
            if run_id != self.run_id:
                raise _ExecutionCancelled()
            p_str = str(prompt) if prompt is not None else ""
            if p_str:
                self.append_text(p_str, run_id)
            self.set_status("Đang chờ nhập dữ liệu...", "#fbbf24", run_id)
            val = my_queue.get()
            if val is _CANCEL_SENTINEL or run_id != self.run_id:
                raise _ExecutionCancelled()
            self.set_status("Đang chạy...", "#38bdf8", run_id)
            return val
        return custom_input

    def start_execution(self, is_restart=False):
        # Wake up any previous worker blocked on input() before starting a fresh run
        old_queue = self.input_queue
        self.run_id += 1
        my_run_id = self.run_id
        my_queue = queue.Queue()
        self.input_queue = my_queue
        try:
            old_queue.put_nowait(_CANCEL_SENTINEL)
        except Exception:
            pass

        header_msg = (
            "[ Đang khởi động lại chương trình... ]\\n\\n"
            if is_restart
            else "[ Khởi chạy ${safeAppName} trên Android ]\\n\\n"
        )
        self.output_buffer = header_msg
        self.terminal_label.text = header_msg
        self.scroll_view.scroll_y = 1
        self.set_status("Đang chạy...", "#38bdf8", my_run_id)

        class OutputRedirector:
            encoding = 'utf-8'
            def __init__(self, write_fn):
                self.write_fn = write_fn
            def write(self, s):
                if isinstance(s, bytes):
                    s = s.decode('utf-8', 'replace')
                if s:
                    self.write_fn(str(s), my_run_id)
                return len(s) if s else 0
            def writelines(self, lines):
                for line in lines:
                    self.write(line)
            def flush(self):
                pass
            def isatty(self):
                return True

        def worker():
            sys.stdout = OutputRedirector(self.append_text)
            sys.stderr = OutputRedirector(self.append_text)
            builtins.input = self._make_custom_input(my_run_id, my_queue)

            script_path = os.path.join(os.path.dirname(__file__), 'user_script.py')
            try:
                if os.path.exists(script_path):
                    with open(script_path, 'r', encoding='utf-8') as f:
                        code_content = f.read()
                else:
                    code_content = base64.b64decode(_FALLBACK_B64).decode('utf-8')

                ns = {
                    '__name__': '__main__',
                    '__file__': script_path,
                    '__builtins__': builtins.__dict__,
                }
                compiled = compile(code_content, 'user_script.py', 'exec')
                exec(compiled, ns)
                if my_run_id == self.run_id:
                    self.append_text("\\n\\n[ Chương trình đã kết thúc ]\\n", my_run_id)
                    self.set_status("Hoàn tất", "#34d399", my_run_id)
            except _ExecutionCancelled:
                pass
            except SystemExit as se:
                if my_run_id == self.run_id:
                    self.append_text(f"\\n\\n[ Chương trình kết thúc (mã: {se.code}) ]\\n", my_run_id)
                    self.set_status("Hoàn tất", "#34d399", my_run_id)
            except Exception:
                if my_run_id == self.run_id:
                    tb = traceback.format_exc()
                    self.append_text("\\n\\n[!] LỖI THỰC THI TRÊN ANDROID:\\n" + tb + "\\n", my_run_id)
                    self.set_status("Gặp lỗi thực thi", "#f87171", my_run_id)

        threading.Thread(target=worker, daemon=True).start()

    def restart_execution(self, instance=None):
        self.start_execution(is_restart=True)


if __name__ == '__main__':
    try:
        AndroidTerminalApp().run()
    except Exception:
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
