# DeepSeek Harness Desktop

[中文](README.zh.md) · [Release Notes](RELEASE_NOTES.md) · [Issues](https://github.com/wsnxxxs/deepseek-harness-portable/issues)

[![Release](https://img.shields.io/github/v/release/wsnxxxs/deepseek-harness-portable)](https://github.com/wsnxxxs/deepseek-harness-portable/releases/latest)
[![Platform](https://img.shields.io/badge/platform-Windows%20x64%20%7C%20macOS%20arm64-blue)](https://github.com/wsnxxxs/deepseek-harness-portable/releases)
[![License](https://img.shields.io/github/license/wsnxxxs/deepseek-harness-portable)](LICENSE)

DeepSeek Harness Desktop is a community Windows x64 and macOS Apple Silicon distribution of [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness). It combines the Electron desktop shell with a platform-native runtime. It is not an officially Microsoft-signed or Apple-notarized build.

## Table of contents

- [Why DeepSeek Harness Desktop?](#why-deepseek-harness-desktop)
- [Quick start](#quick-start)
- [Features](#features)
- [Latest release](#latest-release)
- [Install](#install)
- [Portable layout](#portable-layout)
- [User data and API key](#user-data-and-api-key)
- [Launch and update](#launch-and-update)
- [FAQ](#faq)
- [Build and release](#build-and-release)
- [Security and limitations](#security-and-limitations)
- [License](#license)

## Why DeepSeek Harness Desktop?

Upstream [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) is engineered primarily for POSIX shells and containerized environments. **DeepSeek Harness Desktop** keeps the upstream runtime intact while providing platform-native desktop packaging:

1. **Platform-native Minimal shell & consistent "We need / Let's" behavior**:
   - **The RL Distribution Challenge**: DeepSeek's official models (DeepSeek-R1, DeepSeek-V3 Agent loops) were trained with Reinforcement Learning (RL) inside standard Linux Bash environments. The models learned structured planning behaviors and distinct step-by-step reasoning habits (the classic *"We need to...", "Let's check...", "Let's run..."* Chain-of-Thought).
   - **Windows PowerShell Friction**: On Windows, PowerShell syntax quirks, path backslashes (`\`), parameter formatting, and shell alias behaviors alter the token distribution, frequently triggering command hallucinations, syntax errors, or broken reasoning chains.
   - **Windows**: The Minimal Preset runs in genuine Linux Bash through WSL, with the Windows process bridge and sandbox adapter.
   - **macOS**: The Minimal Preset runs directly through the native POSIX PTY and `/bin/bash`; it does not use WSL or a container compatibility layer.
2. **Zero-Configuration Portable Desktop Environment**:
   - Bundles standalone Node.js and Electron desktop shell—no manual Node/pnpm installation or build toolchains required.
   - User data is isolated outside the app under `%USERPROFILE%\.dsh` on Windows or `$HOME/.dsh` on macOS (`$DSH_HOME` overrides either path).
   - Uses Windows 11 Mica styling where available and native macOS window/menu behavior on Apple Silicon.
3. **Multimodal Vision Bridge (`@dsh-portable/vision-bridge`)**:
   - Equips text-only models with multimodal visual inspection capabilities by connecting to external OpenAI-compatible endpoints with high cost-performance vision models (Gemini 3.7 Flash, Mimo V2.5, etc.).
   - Global `view_image` tool registered directly into the official `Settings → Plugins` slot with live provider presets, connection validation, and write-only API key security protection.
4. **Preinstalled Plugin Marketplace (`dsh-plugin-marketplace`)**:
   - Adds searchable **Plugin Marketplace** and **Installed** tabs under `Settings → Plugins`, backed by the live GitHub `dsh-plugin` topic.
   - Ships with agent tools for searching, installing, inspecting, and updating plugins. It is preinstalled once per Web profile and remains removed or disabled when the user chooses so.
5. **Safe platform-aware updates**:
   - Windows keeps background staging, SHA-256 verification, atomic restart, and transactional rollback.
   - macOS first-release updates open the GitHub release page so users can manually download and replace the DMG; the app does not self-replace its application bundle.
6. **Zero-Modification Architecture**:
   - Cleanly wired through Cordis microkernel plugin slots and profile overlays without modifying upstream `vendor/deepseek-harness` code.

## Quick start

1. Download the Windows Setup/ZIP or `DeepSeek-Harness-<version>-darwin-arm64.dmg` for an Apple Silicon Mac from the [latest release](https://github.com/wsnxxxs/deepseek-harness-portable/releases/latest).
2. On Windows, run the installer. On macOS, open the DMG and drag **DeepSeek Harness** to **Applications**; because the first release is unsigned, use **Open** from the context menu on first launch.
3. Launch **DeepSeek Harness** and open **Settings** in the Web UI to add your DeepSeek API key (or provide it in the environment before launching).

## Features

- Bundled native Electron desktop shell with the built-in DeepSeek Harness Web runtime, served on the loopback address.
- Workspace selection, browser mode, tray/app menu, update history, About, and diagnostics export.
- Windows in-app update checks with download progress, SHA-256 verification, restart confirmation, and rollback; macOS release-page download flow.
- Native sidebar logo and system theme sync, Windows 11 Mica/title-bar styling, native macOS menus, a staged startup splash, and persisted multi-monitor-safe window bounds.
- Minimal mode uses WSL Bash on Windows and the native `/bin/bash` POSIX PTY on macOS.
- Preinstalled, removable plugin marketplace with paginated GitHub search, one-click installation, update management, and agent-facing market tools.

## Latest release

| Item | Version |
| --- | --- |
| Release | DeepSeek Harness Desktop **v1.2.7** ([download](https://github.com/wsnxxxs/deepseek-harness-portable/releases/tag/v1.2.7)) |
| Distribution | 1.2.7 |
| Desktop shell | 0.1.0-shell.2 |
| Kernel | 0.1.0-rc.5 |

Read the [English release notes](RELEASE_NOTES.md) or open **Release Notes** from the desktop tray menu.

## Install

1. **Windows Setup installer:** download `DeepSeek-Harness-Setup-<version>-win32-x64.exe` from Releases and run it.
2. **Windows online installer:** run `install.ps1` from this repository. It only accepts a release ZIP with a trusted SHA-256 digest. Options: `-InstallDir <path>` (default `%LOCALAPPDATA%\Programs\DeepSeek Harness`), `-NoDesktopShortcut`, `-Force`.
3. **Windows portable ZIP:** download `DeepSeek-Harness-<version>-win32-x64.zip`, verify `SHA256SUMS.txt`, then extract the complete directory without renaming `runtime`.
4. **macOS Apple Silicon:** download `DeepSeek-Harness-<version>-darwin-arm64.dmg`, verify `SHA256SUMS-darwin-arm64.txt`, open it, and drag the app to **Applications**. The DMG is currently unsigned and not notarized.
5. **Uninstall:** use the platform's normal app removal flow. Windows uninstall scripts are included; user data is kept unless explicitly removed.

> **Note:** `setup-shortcuts.ps1` (called by the installer and by `创建桌面快捷方式.bat` in the portable package) creates a desktop shortcut and adds the portable directory to your **user PATH**. The uninstaller removes both.

The installer and updater verify the ZIP digest, release manifest, application manifest, and required native modules. They do not create certificates or modify Windows trust stores.

## Windows portable layout

    DeepSeek Harness-win32-x64/
    ├─ dsh.cmd                      CLI entry: web mode, `dsh update`, `dsh desktop`, `dsh trust`
    ├─ pnpm.cmd                     Embedded package-manager entry used by plugin management
    ├─ start-web.cmd                Browser mode entry using the embedded Electron/Node runtime
    ├─ start-desktop.cmd            Desktop mode entry
    ├─ update.ps1                   Portable updater
    ├─ setup-shortcuts.ps1          Shortcut and user PATH setup
    ├─ release-manifest.json        Distribution/shell/kernel version manifest
    ├─ 启动桌面版.bat                Desktop launcher (double-click friendly)
    ├─ 启动桌面窗口.bat              Desktop window launcher (same as above)
    ├─ 启动网页版.bat                Web launcher with desktop fallback
    ├─ 在线更新.bat                  Update launcher
    ├─ 创建桌面快捷方式.bat          Shortcut/PATH setup launcher
    ├─ 一键解除拦截(自签名信任).bat  Signing info; intentionally creates no certificates
    ├─ 使用说明.txt                  Chinese quick guide
    ├─ 使用说明.en.txt               English quick guide
    └─ runtime/                     Electron executable and application dependencies

Do not delete or rename the Windows `runtime` directory. macOS uses the normal `.app` bundle layout instead.

## User data and API key

- Sessions, credentials, settings, attachments, and desktop preferences live **outside the application directory**, under `%USERPROFILE%\.dsh` on Windows or `$HOME/.dsh` on macOS (override with the `DSH_HOME` environment variable). They survive updates and are kept on uninstall unless you explicitly remove them.
- Configure your DeepSeek API key in the Web UI **Settings**, or provide it in the environment of the launching process.
- The desktop shell binds the Web service to the loopback address and sets `DSH_TELEMETRY_DISABLED=1`.

## Launch and update

- Windows `start-desktop.cmd` (or `启动桌面版.bat`) launches the bundled Electron desktop shell. macOS launches the app from **Applications**.
- Windows `start-web.cmd` (or `启动网页版.bat`) starts the Web surface through the embedded Electron/Node runtime; no system Node.js installation is required.
- Windows `dsh.cmd` provides the same web entry plus the embedded plugin-management CLI and distribution subcommands: `dsh update`, `dsh desktop`, `dsh trust`.
- The desktop tray menu provides **Check for Updates**, **Release Notes**, and **About**.
- When a new Windows release is found, the desktop shell downloads and verifies it in-app with progress, then asks before restarting. Update, rollback, and startup recovery share a per-installation mutex. On macOS, the same menu opens the release page for manual DMG download.
- Update notices appear as a transient banner below the title bar and can be suppressed per version; Release Notes and About open in a card-style Update Hub. See the [release notes](RELEASE_NOTES.md) for the details of these behaviors.

## FAQ

**Why does Windows say the executable is unsigned?**
The desktop executable is currently not signed by a trusted commercial CA, so SmartScreen may warn about it. Verify the published SHA-256 values (see [Security and limitations](#security-and-limitations)), then choose **More info → Run anyway**. This project deliberately does not create self-signed certificates or modify trust stores.

**What is Smart App Control, and can this run at all?**
Smart App Control may block unsigned apps outright. If it is enabled on your device, you may need to turn it off for this app, or use an enterprise-approved, CA-signed build. See Microsoft's [Smart App Control overview](https://learn.microsoft.com/en-us/windows/apps/develop/smart-app-control/overview).

**Do I need Node.js installed?**
No. Desktop mode, browser/Web mode, the DSH plugin CLI, and pnpm all use the Node.js runtime embedded in Electron.

**Where is my data stored?**
Under `%USERPROFILE%\.dsh` (or `$DSH_HOME`), outside the application directory. See [User data and API key](#user-data-and-api-key).

**An update check failed — what now?**
The Update Hub shows an error state with a retry action instead of blocking the main window. On Windows you can also run the portable updater directly: `dsh update`, `在线更新.bat`, or `update.ps1`. On macOS, open the release page and download the latest DMG manually.

**Does macOS Minimal mode require WSL or Docker?**
No. On Apple Silicon, Minimal mode uses the native POSIX PTY and `/bin/bash`, with the macOS runtime's native process and sandbox support.

**Why did a long command time out in Minimal mode?**
Minimal mode runs the requested shell command unchanged. Recursive `grep` over the vendored workspace also traverses nested dependency trees and can legitimately exceed the tool timeout; prefer `rg` (which respects ignore files) or exclude `node_modules`. On Windows, the desktop bridge force-stops only that terminal's `wsl.exe` process tree and waits for PTY disposal.

## Build and release

*For maintainers and contributors.*

Requirements: Node.js ^22.19.0 or >=24 and pnpm. Windows release builds run on Windows x64; the first macOS release build runs on Apple Silicon macOS and uses the system `hdiutil`, `sips`, and `iconutil` tools.

This repository includes the matching DeepSeek Harness source workspace as a pinned Git submodule at `vendor/deepseek-harness`. It supplies the `@deepseek-ai/*` packages and builds the embedded Web runtime locally; the release process does not need an existing portable ZIP as its build input.

On a fresh clone, initialize the source workspace once:

    pnpm run desktop:bootstrap

After that, the normal build and release commands are:

    pnpm install
    pnpm run desktop:test
    pnpm run desktop:package:win
    pnpm run desktop:release:win

For macOS Apple Silicon DMG builds, use:

    pnpm run desktop:package:mac
    pnpm run desktop:release:mac

Packaging fingerprints the source workspace and reuses successful build, deployed-runtime, and Electron layers when their inputs have not changed. Use `pnpm run desktop:release:win -- --no-cache` when diagnosing a clean release build, or pass `--no-cache` to the underlying package script; `--skip-build` remains available when intentionally packaging existing compiled output.

The desktop package keeps three version identities:

- `distributionVersion`: the public release tag plus the platform-specific ZIP, Setup, or DMG artifact.
- desktop shell version: the Electron shell package version.
- kernel version: the packaged `@deepseek-ai/dsh-web-app` version.

The release commands build or safely reuse the upstream Web runtime and desktop shell, always run the release tests, and write platform-specific checksums last. The macOS lane emits an unsigned, non-notarized Apple Silicon DMG. When preparing a release, update `RELEASE_NOTES.md`, `RELEASE_NOTES.zh.md`, and `apps/desktop/src/release-notes.json` together.

`dist-desktop/` is a generated build directory and may be deleted after a release. The source needed for the next build remains in `vendor/deepseek-harness`; do not commit `node_modules/` or a portable ZIP as a substitute for the source workspace.

## Security and limitations

- Verify the published SHA-256 values before running downloaded files.
- The macOS DMG is currently unsigned and not notarized; use the Finder context-menu **Open** action on first launch if Gatekeeper asks for confirmation.
- The local web server binds to loopback by default.
- Do not put API keys in the repository or release directory.
- Marketplace entries are third-party code discovered from GitHub. Review a plugin's repository and permissions before installing it; installation can run package build scripts and grants the plugin the capabilities of its Cordis composition.
- If trusted executables are required, use an approved CA, Microsoft Artifact Signing, or an enterprise signing policy.

See Microsoft's [Smart App Control overview](https://learn.microsoft.com/en-us/windows/apps/develop/smart-app-control/overview) and [SmartScreen reputation guidance](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/smartscreen-reputation).

## License

DeepSeek Harness is licensed under [MIT](LICENSE). Third-party notices are in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). Upstream source: [deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness).
