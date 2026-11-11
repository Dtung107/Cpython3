[app]

# (str) Title of your application
title = Pydroid App

# (str) Package name
package.name = pydroid_app

# (str) Package domain (needed for android/ios packaging)
package.domain = org.pydroid

# (str) Source code where the main.py lives
source.dir = .

# (list) Source files to include (let empty to include all the files)
source.include_exts = py,png,jpg,kv,atlas,json,txt,md,ttf,otf

# (str) Application versioning
version = 1.0.0

# (list) Application requirements
requirements = python3,kivy==2.3.0,pillow,certifi,android

# (str) Supported orientation
orientation = portrait

# (list) Permissions
android.permissions = INTERNET,VIBRATE

# (int) Target Android API
android.api = 33

# (int) Minimum API your APK will support.
android.minapi = 21

# (int) Android NDK API to use (matching minapi)
android.ndk_api = 21

# (str) Android NDK version to use
android.ndk = 25b

# (bool) If True, automatically accept SDK license agreements
android.accept_sdk_license = True

# (bool) Use --private data storage
android.private_storage = True

# (list) The Android architectures to build for.
android.archs = arm64-v8a

# (bool) enables Android auto backup feature
android.allow_backup = True

# (str) Android logcat filters to aid troubleshooting
android.logcat_filters = *:S python:D

[buildozer]

# (int) Log level (0 = error only, 1 = info, 2 = debug with command-line)
log_level = 2

# (int) Display warning if buildozer is run as root
warn_on_root = 1
