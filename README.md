# DeepSeek Harness for Win

[中文](README.zh.md) · [Release Notes](RELEASE_NOTES.md) · [Issues](https://github.com/wsnxxxs/deepseek-harness-portable/issues)

[![Release](https://img.shields.io/github/v/release/wsnxxxs/deepseek-harness-portable)](https://github.com/wsnxxxs/deepseek-harness-portable/releases/latest)
[![Platform](https://img.shields.io/badge/platform-Windows%20x64-blue)](https://github.com/wsnxxxs/deepseek-harness-portable/releases)
[![License](https://img.shields.io/github/license/wsnxxxs/deepseek-harness-portable)](LICENSE)

DeepSeek Harness for Win is a community Windows x64 distribution of [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness). It combines the Electron desktop shell with a portable runtime directory. It is not an official Microsoft-signed build.

## Table of contents

- [Why DeepSeek Harness for Win?](#why-deepseek-harness-for-win)
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

## Why DeepSeek Harness for Win?

Upstream [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) is engineered primarily for Linux CLI and containerized environments. Running it on Windows natively often leads to platform frictions, terminal incompatibilities, and tool-call failures. **DeepSeek Harness for Win** is built specifically for Windows to deliver an out-of-the-box native desktop experience while preserving 100% upstream architectural integrity:

1. **Native WSL Linux Bash & Flawless "We need / Let's" CoT Reproduction**:
   - **The RL Distribution Challenge**: DeepSeek's official models (DeepSeek-R1, DeepSeek-V3 Agent loops) were trained with Reinforcement Learning (RL) inside standard Linux Bash environments. The models learned structured planning behaviors and distinct step-by-step reasoning habits (the classic *"We need to...", "Let's check...", "Let's run..."* Chain-of-Thought).
   - **Windows PowerShell Friction**: On Windows, PowerShell syntax quirks, path backslashes (`\`), parameter formatting, and shell alias behaviors alter the token distribution, frequently triggering command hallucinations, syntax errors, or broken reasoning chains.
   - **Our Solution**: Through our deep WSL bridge, isolated `danger-full-access` sandbox policy, and Win32 ProcessInspector stub, this distribution executes the official Minimal Preset in genuine Linux Bash on Windows. This perfectly preserves the RL prompt token distribution and reproduces the model's native "We need / Let's" Chain-of-Thought (CoT) reasoning flow without execution friction.
2. **Zero-Configuration Portable Desktop Environment**:
   - Bundles standalone Node.js and Electron desktop shell—no manual Node/pnpm installation or build toolchains required.
   - User data is completely isolated in `%USERPROFILE%\.dsh` (`$DSH_HOME`), making the entire directory portable and USB-drive friendly.
   - Designed with Windows 11 Mica material, custom title bar, sidebar logo desktop menu integration, system theme sync, and smooth startup splash.
3. **Multimodal Vision Bridge (`@dsh-portable/vision-bridge`)**:
   - Equips text-only models with multimodal visual inspection capabilities by connecting to external OpenAI-compatible endpoints with high cost-performance vision models (Gemini 3.7 Flash, Mimo V2.5, etc.).
   - Global `view_image` tool registered directly into the official `Settings → Plugins` slot with live provider presets, connection validation, and write-only API key security protection.
4. **Seamless In-App Atomic Updates**:
   - Background staging download, SHA-256 integrity verification, and pre-extraction while the application remains fully usable.
   - Near-instantaneous (1–2s) atomic swap on restart with full transactional rollback safety.
5. **Zero-Modification Architecture**:
   - Cleanly wired through Cordis microkernel plugin slots and profile overlays without modifying upstream `vendor/deepseek-harness` code.

## Quick start

1. Download `DeepSeek-Harness-Setup-<version>-win32-x64.exe` from the [latest release](https://github.com/wsnxxxs/deepseek-harness-portable/releases/latest) (or use the portable ZIP — see [Install](#install)).
2. Run the installer. If SmartScreen warns about the unsigned executable, choose **More info → Run anyway** (see [FAQ](#faq)).
3. Launch **DeepSeek Harness** from the desktop shortcut or the tray.
4. Open **Settings** in the Web UI and add your DeepSeek API key (or provide it in the environment before launching).

## Features

- Bundled native Electron desktop shell with the built-in DeepSeek Harness Web runtime, served on the loopback address.
- Workspace selection, browser mode, tray/app menu, update history, About, and diagnostics export.
- In-app update checks with download progress, SHA-256 verification, restart confirmation, and rollback.
- Native sidebar logo with an integrated desktop menu, Windows 11 Mica/title-bar styling, system theme sync, a staged startup splash, and persisted multi-monitor-safe window bounds.

## Latest release

| Item | Version |
| --- | --- |
| Release | DeepSeek Harness for Win **v1.2.3** ([download](https://github.com/wsnxxxs/deepseek-harness-portable/releases/tag/v1.2.3)) |
| Distribution | 1.2.3 |
| Desktop shell | 0.1.0-shell.2 |
| Kernel | 0.1.0-rc.5 |

Read the [English release notes](RELEASE_NOTES.md) or open **Release Notes** from the desktop tray menu.

## Install

1. **Setup installer:** download `DeepSeek-Harness-Setup-<version>-win32-x64.exe` from Releases and run it.
2. **Online installer:** run `install.ps1` from this repository. It only accepts a release ZIP with a trusted SHA-256 digest. Options: `-InstallDir <path>` (default `%LOCALAPPDATA%\DeepSeek-Harness`), `-NoDesktopShortcut`, `-Force`.
3. **Portable ZIP:** download `DeepSeek-Harness-<version>-win32-x64.zip`, verify `SHA256SUMS.txt`, then extract the complete directory without renaming `runtime`.
4. **Uninstall:** run `uninstall.cmd` or `uninstall.ps1`. User data is kept unless you explicitly confirm removal.

> **Note:** `setup-shortcuts.ps1` (called by the installer and by `创建桌面快捷方式.bat` in the portable package) creates a desktop shortcut and adds the portable directory to your **user PATH**. The uninstaller removes both.

The installer and updater verify the ZIP digest, release manifest, application manifest, and required native modules. They do not create certificates or modify Windows trust stores.

## Portable layout

    DeepSeek Harness-win32-x64/
    ├─ dsh.cmd                      CLI entry: web mode, `dsh update`, `dsh desktop`, `dsh trust`
    ├─ start-web.cmd                Browser mode entry (Node.js from PATH; falls back to desktop)
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

Do not delete or rename the `runtime` directory.

## User data and API key

- Sessions, credentials, settings, attachments, and desktop preferences live **outside the application directory**, under `%USERPROFILE%\.dsh` (override with the `DSH_HOME` environment variable). They survive updates and are kept on uninstall unless you explicitly confirm removal.
- Configure your DeepSeek API key in the Web UI **Settings**, or provide it in the environment of the launching process.
- The desktop shell binds the Web service to the loopback address and sets `DSH_TELEMETRY_DISABLED=1`.

## Launch and update

- `start-desktop.cmd` (or `启动桌面版.bat`) launches the bundled Electron desktop shell.
- `start-web.cmd` (or `启动网页版.bat`) starts the Web surface through Node.js from PATH; if Node.js is missing it falls back to the desktop shell.
- `dsh.cmd` provides the same web entry plus subcommands: `dsh update`, `dsh desktop`, `dsh trust`.
- The desktop tray menu provides **Check for Updates**, **Release Notes**, and **About**.
- When a new release is found, the desktop shell downloads and verifies it in-app with progress, then asks before restarting. The updater re-verifies the prepared portable ZIP, release manifest, and native dependencies, and replaces `runtime` as one operation after restart confirmation.
- Update notices appear as a transient banner below the title bar and can be suppressed per version; Release Notes and About open in a card-style Update Hub. See the [release notes](RELEASE_NOTES.md) for the details of these behaviors.

## FAQ

**Why does Windows say the executable is unsigned?**
The desktop executable is currently not signed by a trusted commercial CA, so SmartScreen may warn about it. Verify the published SHA-256 values (see [Security and limitations](#security-and-limitations)), then choose **More info → Run anyway**. This project deliberately does not create self-signed certificates or modify trust stores.

**What is Smart App Control, and can this run at all?**
Smart App Control may block unsigned apps outright. If it is enabled on your device, you may need to turn it off for this app, or use an enterprise-approved, CA-signed build. See Microsoft's [Smart App Control overview](https://learn.microsoft.com/en-us/windows/apps/develop/smart-app-control/overview).

**Do I need Node.js installed?**
No — the portable `runtime` bundles its own Node.js for the desktop shell. Only browser/Web mode (`start-web.cmd`, `启动网页版.bat`) uses a Node.js from PATH, and it falls back to the desktop shell when Node.js is missing.

**Where is my data stored?**
Under `%USERPROFILE%\.dsh` (or `$DSH_HOME`), outside the application directory. See [User data and API key](#user-data-and-api-key).

**An update check failed — what now?**
The Update Hub shows an error state with a retry action instead of blocking the main window. You can also run the portable updater directly: `dsh update`, `在线更新.bat`, or `update.ps1`.

## Build and release

*For maintainers and contributors.*

Requirements: Windows x64, Node.js ^22.19.0 or >=24, and pnpm.

This repository includes the matching DeepSeek Harness source workspace as a pinned Git submodule at `vendor/deepseek-harness`. It supplies the `@deepseek-ai/*` packages and builds the embedded Web runtime locally; the release process does not need an existing portable ZIP as its build input.

On a fresh clone, initialize the source workspace once:

    pnpm run desktop:bootstrap

After that, the normal build and release commands are:

    pnpm install
    pnpm run build
    pnpm run desktop:test
    pnpm run desktop:release:win

The desktop package keeps three version identities:

- `distributionVersion`: the public Windows release tag, ZIP, and Setup version.
- desktop shell version: the Electron shell package version.
- kernel version: the packaged `@deepseek-ai/dsh-web-app` version.

The release command builds the upstream Web runtime, builds the desktop shell, writes `release-manifest.json`, and writes `SHA256SUMS.txt` last. When preparing a release, update `RELEASE_NOTES.md`, `RELEASE_NOTES.zh.md`, and `apps/desktop/src/release-notes.json` together.

`dist-desktop/` is a generated build directory and may be deleted after a release. The source needed for the next build remains in `vendor/deepseek-harness`; do not commit `node_modules/` or a portable ZIP as a substitute for the source workspace.

## Security and limitations

- Verify the published SHA-256 values before running downloaded files.
- The local web server binds to loopback by default.
- Do not put API keys in the repository or release directory.
- If trusted executables are required, use an approved CA, Microsoft Artifact Signing, or an enterprise signing policy.

See Microsoft's [Smart App Control overview](https://learn.microsoft.com/en-us/windows/apps/develop/smart-app-control/overview) and [SmartScreen reputation guidance](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/smartscreen-reputation).

## License

DeepSeek Harness is licensed under [MIT](LICENSE). Third-party notices are in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). Upstream source: [deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness).
