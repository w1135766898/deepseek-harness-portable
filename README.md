# DeepSeek Harness portable Windows distributions

English | [中文](README.zh.md)

This directory documents the personal Windows distribution channel for DeepSeek Harness. The release is an unpacked Electron desktop shell that starts the local Web runtime in its own window. It is not an official signed release.

## Quick Installation (3 Options)

### Option 1: Standard Windows Setup Installer (Setup.exe - Recommended)
Download **`DeepSeek-Harness-Setup-0.1.0-rc.6-win32-x64.exe`** from the Releases page:
- **Zero Configuration**: Double-click to install in seconds. No archive extraction needed.
- **Standard Program Directory**: Automatically installed into `%LOCALAPPDATA%\Programs\DeepSeek Harness` (zero admin/UAC elevation required).
- **Full OS Integration**: Automatically creates Desktop & Start Menu shortcuts, and registers under Windows "Installed Apps" / "Add or Remove Programs" for 1-click clean uninstallation.
- **Built-in Security Trust**: Automatically provisions local code-signing trust to prevent Windows 11 Smart App Control (SAC) blocks.

---

### Option 2: OneLine Online Installation (PowerShell)
Paste and run in PowerShell to automatically download, unpack, configure shortcuts, and set up PATH:

- **🇨🇳 Mainland China (Built-in High-Speed Mirror)**:
  ```powershell
  irm https://ghfast.top/https://raw.githubusercontent.com/w1135766898/deepseek-harness-portable/main/install.ps1 | iex
  ```
- **🌍 Global / Direct**:
  ```powershell
  irm https://raw.githubusercontent.com/w1135766898/deepseek-harness-portable/main/install.ps1 | iex
  ```

---

### Option 3: Portable ZIP Archive
Download **`DeepSeek-Harness-0.1.0-rc.6-win32-x64.zip`**, extract to any directory, and double-click **`启动网页版.bat`** to run instantly without altering system settings.

---

## Fast In-Place Updates
When a new release is published, update seamlessly in seconds through multi-mirror acceleration while preserving all workspace data and settings:
- **Option A**: Double-click **`在线更新.bat`** in the application directory.
- **Option B**: Run the update command in any terminal:
  ```powershell
  dsh update
  ```

---

## Clean Portable Distribution Layout

If you download the standalone release zip (`DeepSeek-Harness-*-win32-x64.zip`), the extracted directory is organized cleanly, with all 29,000+ underlying runtime files isolated under `runtime/`:

```text
📦 DeepSeek Harness-win32-x64/
 ├── 启动网页版.bat                             <-- Primary Web Launcher (100% immune to SAC)
 ├── 启动桌面窗口.bat                           <-- Standalone Native Window
 ├── 在线更新.bat                               <-- One-Click In-Place Auto-Updater
 ├── 创建桌面快捷方式.bat                       <-- Desktop Shortcut & Security Trust Setup
 ├── 使用说明.txt                               <-- Quick User Guide
 ├── dsh.cmd                                   <-- CLI Command Shim
 └── 📂 runtime/                               <-- Isolated engine & dependencies (DO NOT delete)
```

### Launch Options:
1. **Primary Recommendation**: Double-click `启动网页版.bat`
   - Starts the Web engine via the official, Microsoft-trusted Node.js runtime and opens `http://127.0.0.1:3080` in your default browser.
   - **Completely immune to Windows 11 Smart App Control (SAC) and SmartScreen blocks**.
2. **Standalone Desktop Window**: Double-click `启动桌面窗口.bat`
   - Starts the standalone desktop window and system tray.
   - If blocked by Windows 11 SAC, run `创建桌面快捷方式.bat` once to establish local trust.



## Data and portability

The native shell stores preferences and runtime data under Electron's per-user data directory. Copy the complete native directory when moving a portable setup.

Delete the relevant user-data directory to reset a local setup. Do not put API keys in a repository or share them with the executable.

## Rebuild

From a Windows x64 checkout with Node.js `^22.19.0 || >=24` and pnpm:

```powershell
pnpm install
pnpm run build
pnpm run desktop:package:win
```

The native output is written to `dist-desktop/electron/`. The build verifies the Electron runtime before packaging and downloads it when an install skipped lifecycle scripts.

## Security and release status

The local Web server is loopback-only by default. The desktop executable is not code-signed with a commercial CA certificate and may trigger a Windows SmartScreen warning or Windows 11 Smart App Control (SAC) prompt on first launch.

- **Standard SmartScreen**: Click "More info" -> "Run anyway".
- **Smart App Control (SAC)**: Use `start-web.cmd` directly, or run `一键解除拦截(自签名信任).bat` to establish local trust.
- Some antivirus products (observed with Huorong/火绒) silently quarantine unsigned pkg/Electron executables on first write or download. Verify the SHA-256 checksum published with each release; if your antivirus flags the file, restore it from quarantine or add an exclusion for the directory, then re-check the checksum before running. The current release checksums are recorded in [SHA256SUMS.txt](SHA256SUMS.txt).

DeepSeek Harness is licensed under [MIT](LICENSE). Third-party notices are in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

