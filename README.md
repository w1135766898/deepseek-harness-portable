# DeepSeek Harness portable Windows distributions

English | [中文](README.zh.md)

This directory documents the personal Windows distribution channel for DeepSeek Harness. The release is an unpacked Electron desktop shell that starts the local Web runtime in its own window. It is not an official signed release.

## Download

Download the complete `DeepSeek Harness-win32-x64` directory. Keep every file in the native directory together.

## Why this project

This is a distribution layer for DeepSeek Harness itself, not a replacement chat client. The Web UI and plugin runtime remain the Harness product, including its profiles, sessions, skills, tools, workspace flow, and composable plugin graph; this repository adds a Windows delivery path around that runtime.

The comparison below uses adjacent public projects as reference points rather than treating different product categories as direct substitutes. Repositories change over time; the notes describe their public README and release model checked on 2026-08-14.

| Project | Primary focus | What this project adds for a Windows user |
| --- | --- | --- |
| [Eddie0521/turn-deepseek-into-desktop](https://github.com/Eddie0521/turn-deepseek-into-desktop) | Minimal native macOS wrapper with one-command install, menu-bar residency, loopback binding, and telemetry disabled. | The same wrapper direction is carried to Windows x64 as an unpacked Electron shell with a tray, workspace memory, and a portable directory; it does not require Xcode or an installer. |
| [doxdk/deepseek-desktop](https://github.com/doxdk/deepseek-desktop) | Electron desktop access to the DeepSeek chat site, with localStorage/cookies and an installer-oriented flow. | Packages the DeepSeek Harness agent runtime rather than only a chat page, while keeping profiles, plugins, sessions, tools, and workspace behavior in a native Windows shell. |
| [DeepFundAI/ai-browser](https://github.com/DeepFundAI/ai-browser) | A broader Electron/Next.js AI browser with multimodal automation, scheduling, social integrations, file management, and multiple providers. | Keeps the scope focused on DeepSeek Harness fidelity and offers a smaller, easier-to-copy Windows distribution instead of requiring an application build environment. |
| [RealZST/HarnessKit](https://github.com/RealZST/HarnessKit) | A cross-agent management center for skills, MCP servers, plugins, hooks, configs, and rules. | Optimizes for running one complete Harness runtime faithfully in a native window/tray shell with the same packaged backend. |

### Main advantages

- **Upstream fidelity:** the desktop layer wraps the real DeepSeek Harness composition instead of reimplementing a parallel chat or agent client.
- **Actual portability:** copy the complete Electron directory to another Windows x64 machine; it includes its runtime and does not require Node.js or an installer.
- **Local-first operation:** the server binds to `127.0.0.1` by default, desktop-channel telemetry is disabled, and API keys are entered at runtime rather than embedded in the artifact.
- **Practical Windows packaging:** the build includes the application icon, packaged runtime dependencies, shipped presets, and the supporting notices needed to move the distribution as a folder.

This narrower focus is intentional: HarnessKit and AI Browser cover broader multi-agent or automation management, while this project aims to make the DeepSeek Harness experience itself easy to carry and launch on Windows.

## Launch and Usage Options

After extracting the complete `DeepSeek Harness-win32-x64` directory, three launch options are available:

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

