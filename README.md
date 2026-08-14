# DeepSeek Harness portable Windows distributions

English | [中文](README.zh.md)

This directory documents the personal Windows distribution channel for DeepSeek Harness. The release is an unpacked Electron desktop shell that starts the local Web runtime in its own window. It is not an official signed release.

## Quick Online Install & Auto-Update

### 1. One-Click Online Installer (Recommended)
Paste and run the following command in Windows PowerShell to automatically download, extract, create desktop shortcuts, and configure PATH:

```powershell
irm https://raw.githubusercontent.com/w1135766898/deepseek-harness-portable/main/install.ps1 | iex
```

- After installation, launch **DeepSeek Harness** directly from your Desktop, or type **`dsh`** in any terminal.

### 2. Fast In-Place Updates (No large re-downloads)
When a new release is published, update seamlessly in seconds while preserving all workspace data and settings:
- **Option A**: Double-click **`update.cmd`** in the application directory.
- **Option B**: Run the update command in any terminal:
  ```powershell
  dsh update
  ```

---

## Manual Portable Usage Options

If you download the standalone release zip (`DeepSeek-Harness-*-win32-x64.zip`), three launch options are available after extraction:

1. **Option 1: Double-click `start-web.cmd` (Recommended ⭐⭐⭐⭐⭐, 100% immune to SAC)**
   - Starts the Web engine via the official, Microsoft-trusted Node.js runtime and opens `http://127.0.0.1:3080` in your default browser.
   - Completely avoids Windows 11 Smart App Control (SAC) and SmartScreen blocks while maintaining identical features, presets, tools, and plugin capabilities.
2. **Option 2: Double-click `DeepSeek Harness.exe` (Native Standalone Desktop Window)**
   - Starts the standalone desktop window and system tray.
   - **If blocked by Windows 11 Smart App Control (SAC)**: Run **`一键解除拦截(自签名信任).bat`** inside the folder (or run as Administrator) to automatically generate and trust a local Code Signing certificate on your machine, enabling direct launch.
3. **Option 3: Double-click `start-desktop.cmd` (Official Electron Standalone Window)**
   - Loads the native application window using the official signed Electron binary.

Set `DEEPSEEK_API_KEY` in the launch environment or enter it in the Web UI settings. The desktop distribution disables telemetry for the local desktop channel.


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

