# DeepSeek Harness Desktop

[中文](README.zh.md) · [Release Notes](RELEASE_NOTES.md) · [Issues](https://github.com/wsnxxxs/deepseek-harness-portable/issues)

[![Release](https://img.shields.io/github/v/release/wsnxxxs/deepseek-harness-portable)](https://github.com/wsnxxxs/deepseek-harness-portable/releases/latest)
[![Platform](https://img.shields.io/badge/platform-Windows%20x64%20%7C%20macOS%20arm64%20%7C%20Linux%20x64-blue)](https://github.com/wsnxxxs/deepseek-harness-portable/releases)
[![License](https://img.shields.io/github/license/wsnxxxs/deepseek-harness-portable)](LICENSE)

DeepSeek Harness Desktop is a community Windows x64, macOS Apple Silicon, and Linux x64 distribution of [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness). It combines the Electron desktop shell with a platform-native runtime. It is not an officially Microsoft-signed, Apple-notarized, or Linux-distribution-signed build.

## Table of contents

- [Why DeepSeek Harness Desktop?](#why-deepseek-harness-desktop)
- [Platform support](#platform-support)
- [Quick start](#quick-start)
- [Features](#features)
- [Latest release](#latest-release)
- [Install](#install)
- [Portable layout](#portable-layout)
- [User data and API key](#user-data-and-api-key)
- [Launch and update](#launch-and-update)
- [FAQ](#faq)
- [Documentation](#documentation)
- [Build and release](#build-and-release)
- [Security and limitations](#security-and-limitations)
- [License](#license)

## Why DeepSeek Harness Desktop?

Upstream [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) is primarily designed for POSIX shells and containerized environments. This distribution adds a native Electron shell, platform-specific runtime adapters, verified release packaging, and a portable update path. Upstream adaptations remain isolated behind reviewed patches and Cordis extension points.

The packaged application includes its own Electron/Node.js runtime, stores user data outside the application directory, and provides desktop integrations such as workspace selection, update diagnostics, the plugin marketplace, vision tools, and the Interactive Learning preset.

## Platform support

| Platform | Package | Minimal shell | Update behavior | Important requirement |
| --- | --- | --- | --- | --- |
| Windows x64 | Setup or portable ZIP | Bash through WSL | In-app verified download, restart, and rollback | A working default WSL distribution with Bash |
| macOS Apple Silicon | DMG | Native `/bin/bash` through a POSIX PTY | Opens the release page for manual replacement | Current DMG is unsigned and not notarized |
| Linux x64 | AppImage or deb | Native `/bin/bash` through a POSIX PTY | Opens the release page for manual replacement | Sandboxed modes require a usable bwrap/Landlock backend |

Packages include the application runtime; users do not need to install Node.js or pnpm. Build prerequisites are listed separately under [Build and release](#build-and-release).

## Quick start

1. Download the Windows Setup/ZIP, `DeepSeek-Harness-<version>-darwin-arm64.dmg`, or `DeepSeek-Harness-<version>-linux-x64.AppImage` from the [latest release](https://github.com/wsnxxxs/deepseek-harness-portable/releases/latest).
2. On Windows, run the installer. On Linux/macOS, download and inspect the release's `install.sh`, then run `sh install.sh`; manual AppImage/deb and DMG installation remains available.
3. Launch **DeepSeek Harness** and open **Settings** in the Web UI to add your DeepSeek API key (or provide it in the environment before launching).

Before first launch, verify the checksum published alongside the artifact. Windows users who need Minimal mode should also verify that `wsl -- bash -lc true` succeeds.

## Features

- Bundled native Electron desktop shell with the built-in DeepSeek Harness Web runtime, served on the loopback address.
- Workspace selection, browser mode, tray/app menu, update history, About, and diagnostics export.
- Windows in-app update checks with download progress, SHA-256 verification, restart confirmation, and rollback; Linux/macOS release-page download flow.
- Native sidebar logo and system theme sync, Windows 11 Mica/title-bar styling, native macOS menus, a staged startup splash, and persisted multi-monitor-safe window bounds.
- Minimal mode uses WSL Bash on Windows and the native `/bin/bash` POSIX PTY on Linux/macOS. Linux sandbox-capable modes use bwrap or fail-closed Landlock according to the upstream policy.
- Preinstalled, removable plugin marketplace with paginated GitHub search, one-click installation, update management, and agent-facing market tools.

## Latest release

| Item | Version |
| --- | --- |
| Release | DeepSeek Harness Desktop **v1.3.2** ([download](https://github.com/wsnxxxs/deepseek-harness-portable/releases/tag/v1.3.2)) |
| Distribution | 1.3.2 |
| Desktop shell | 0.1.0-shell.2 |
| Kernel | 0.1.0-rc.7 |

Read the [English release notes](RELEASE_NOTES.md) or open **Release Notes** from the desktop tray menu.

## Install

1. **Windows Setup installer:** download `DeepSeek-Harness-Setup-<version>-win32-x64.exe` from Releases and run it.
2. **Windows online installer:** run `install.ps1` from this repository. It only accepts a release ZIP with a trusted SHA-256 digest. Options: `-InstallDir <path>` (default `%LOCALAPPDATA%\Programs\DeepSeek Harness`), `-NoDesktopShortcut`, `-Force`.
3. **Windows portable ZIP:** download `DeepSeek-Harness-<version>-win32-x64.zip`, verify `SHA256SUMS.txt`, then extract the complete directory without renaming `runtime`.
4. **Verified Linux/macOS install:** download `install.sh` and `SHA256SUMS-install.txt` from the same release, verify the script, inspect it, then run `sh install.sh`. It selects only the supported native target and verifies the AppImage/DMG against `SHA256SUMS-<target>.txt` before installation. Linux defaults to `~/.local/opt/deepseek-harness` plus `~/.local/bin/deepseek-harness` and a desktop entry; macOS defaults to `~/Applications`. Use `--version <version>`, `--install-dir <path>`, or `--help` as needed.
5. **macOS Apple Silicon (manual):** download `DeepSeek-Harness-<version>-darwin-arm64.dmg`, verify `SHA256SUMS-darwin-arm64.txt`, open it, and drag the app to **Applications**. The DMG is currently unsigned and not notarized; the installer does not bypass Gatekeeper.
6. **Linux x64 AppImage (manual):** download `DeepSeek-Harness-<version>-linux-x64.AppImage`, verify its checksum, run `chmod +x DeepSeek-Harness-<version>-linux-x64.AppImage`, and launch it.
7. **Linux x64 deb (manual):** download `DeepSeek-Harness-<version>-linux-x64.deb` and install it with `sudo apt install ./DeepSeek-Harness-<version>-linux-x64.deb`.
8. **Uninstall:** use the platform's normal app removal flow. Windows uninstall scripts are included; user data is kept unless explicitly removed.

> **Note:** `setup-shortcuts.ps1` (called by the installer and by `创建桌面快捷方式.bat` in the portable package) creates a desktop shortcut that targets the no-console GUI launcher and adds the portable directory to your **user PATH**. The uninstaller removes both.

The installer and updater verify the ZIP digest, release manifest, application manifest, and required native modules. They do not create certificates or modify Windows trust stores.

## Portable layout

    DeepSeek Harness-win32-x64/
    ├─ dsh.cmd                      CLI entry: web mode, `dsh update`, `dsh desktop`, `dsh trust`
    ├─ pnpm.cmd                     Embedded package-manager entry used by plugin management
    ├─ start-web.cmd                Browser mode entry using the embedded Electron/Node runtime
    ├─ DeepSeek Harness Launcher.exe  No-console desktop launcher and update-recovery bootstrap
    ├─ start-desktop.cmd            Console diagnostics and recovery fallback
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

Linux AppImage and deb packages contain the native Electron runtime and desktop entry. The unpacked Linux build also includes `start-desktop.sh`, `start-web.sh`, `dsh.sh`, and `portable-pnpm.sh` beside `runtime/` for terminal-driven use.

## User data and API key

- Sessions, credentials, settings, attachments, and desktop preferences live **outside the application directory**, under `%USERPROFILE%\.dsh` on Windows or `$HOME/.dsh` on Linux/macOS (override with the `DSH_HOME` environment variable). They survive updates and are kept on uninstall unless you explicitly remove them.
- Configure your DeepSeek API key in the Web UI **Settings**, or provide it in the environment of the launching process.
- The desktop shell binds the Web service to the loopback address and sets `DSH_TELEMETRY_DISABLED=1`.

## Launch and update

- Windows shortcuts and portable users launch `DeepSeek Harness Launcher.exe`, which keeps update recovery available without opening a command window. `start-desktop.cmd` remains the console diagnostics fallback. Linux uses the AppImage/deb desktop entry or the unpacked `start-desktop.sh`; macOS launches the app from **Applications**.
- Windows `start-web.cmd` (or `启动网页版.bat`) and Linux `start-web.sh` start the Web surface through the embedded Electron/Node runtime; no system Node.js installation is required.
- Windows `dsh.cmd` provides the same web entry plus the embedded plugin-management CLI and distribution subcommands: `dsh update`, `dsh desktop`, `dsh trust`.
- The desktop tray menu provides **Check for Updates**, **Release Notes**, and **About**.
- When a new Windows release is found, the desktop shell downloads and verifies it in-app with progress, then asks before restarting. Linux and macOS open the release page and require a manual AppImage/deb or DMG download; they do not self-replace the running installation.
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
The Update Hub shows an error state with a retry action instead of blocking the main window. On Windows you can also run the portable updater directly: `dsh update`, `在线更新.bat`, or `update.ps1`. On Linux/macOS, open the release page and download the latest platform artifact manually.

**Does macOS Minimal mode require WSL or Docker?**
No. On Apple Silicon, Minimal mode uses the native POSIX PTY and `/bin/bash`, with the macOS runtime's native process and sandbox support.

**Does Linux Minimal mode require WSL or Docker?**
No. Linux uses its native POSIX PTY and `/bin/bash`. Sandboxed modes use the upstream `bwrap` runner when available and fail closed to Landlock when the fallback is selected; an unavailable enforcement backend is not silently downgraded to an unsandboxed run.

**Why did a long command time out in Minimal mode?**
Minimal mode runs the requested shell command unchanged. Recursive `grep` over the vendored workspace also traverses nested dependency trees and can legitimately exceed the tool timeout; prefer `rg` (which respects ignore files) or exclude `node_modules`. On Windows, the desktop bridge force-stops only that terminal's `wsl.exe` process tree; Linux/macOS terminate the native POSIX PTY.

## Documentation

| Document | Audience | Contents |
| --- | --- | --- |
| [Desktop shell guide](apps/desktop/README.md) | Desktop contributors | Electron behavior, native output layout, tests, and release identity |
| [Runtime architecture and release gates](docs/runtime-architecture.md) | Runtime and release maintainers | Capability probes, mode contracts, manifests, CI, and signing gates |
| [Interactive Learning pack](apps/interactive-learning/README.md) | Feature contributors | Protocol boundaries, development workflow, activation, and compatibility |
| [Release notes](RELEASE_NOTES.md) | Users and maintainers | User-visible changes and upgrade information |

## Build and release

*For maintainers and contributors.*

Requirements: Node.js ^22.19.0 or >=24 and pnpm. Windows release builds run on Windows x64; macOS release builds run on Apple Silicon macOS and use `hdiutil`, `sips`, and `iconutil`; Linux release builds run on native Linux x64 with `musl-gcc`, `bwrap`/Landlock test support, and `dpkg-deb` for the deb lane. `electron-builder` supplies the AppImage/deb packaging layer.

This repository includes the matching DeepSeek Harness source workspace as a pinned Git submodule at `vendor/deepseek-harness`. It supplies the `@deepseek-ai/*` packages and builds the embedded Web runtime locally; the release process does not need an existing portable ZIP as its build input.

On a fresh clone, initialize the source workspace once:

    pnpm run desktop:bootstrap

After that, package on the matching native host. Packaging runs the real capability probes, writes the measured mode catalog and file inventory, retests the manifest-bearing application bytes, creates the platform containers, and finally writes an immutable verified bundle:

    pnpm install
    pnpm run desktop:package:win

The verified Windows bundle is written to `dist-desktop/verified/win32-x64/`. Publishing is a separate copy-only operation and requires that directory explicitly:

    pnpm run desktop:release:win -- --input dist-desktop/verified/win32-x64

For macOS Apple Silicon DMG builds, use:

    pnpm run desktop:package:mac
    pnpm run desktop:release:mac -- --input dist-desktop/verified/darwin-arm64

For Linux x64 AppImage and deb builds, run on a native Linux x64 host:

    pnpm run desktop:package:linux
    pnpm run desktop:release:linux -- --input dist-desktop/verified/linux-x64

The Linux command writes the unpacked runtime to
`dist-desktop/electron/DeepSeek Harness-linux-x64/` and the release artifacts to
`dist-desktop/electron/linux-artifacts/`. The official upstream Landlock launcher
is compiled locally with `musl-gcc` and staged into the Linux runtime; a missing
launcher or unusable Landlock kernel remains fail-closed at runtime.

Packaging fingerprints the source workspace and reuses successful compile, deployed-runtime, patch, and Electron layers when their inputs have not changed. Pass `--no-cache` to a package command when diagnosing a clean build; `--skip-build` remains available when intentionally packaging existing compiled output. Release commands do not accept build flags, run tests, patch files, sign files, or recreate archives: they re-hash and copy only the exact files named by `artifact-verification.json`.

The desktop package keeps three version identities:

- `distributionVersion`: the public release tag plus the platform-specific ZIP, Setup, AppImage/deb, or DMG artifact.
- desktop shell version: the Electron shell package version.
- kernel version: the packaged `@deepseek-ai/dsh-web-app` version.

The native package CI matrix is the authority for platform support: Linux runs on native Linux x64, Windows uses a native x64 runner with a working WSL distribution and Inno Setup, and macOS uses a native Apple Silicon runner. A cross-built or locally unmeasured artifact cannot receive a verification record. The release workflow consumes those records without rebuilding.

Current local packages are classified `non-official-unsigned`. Official publishing fails closed until target-specific evidence is attached: Authenticode for Windows, signing plus notarization for macOS, and external package signing for Linux. `--allow-non-official` is an explicit maintainer override for a prerelease; it never changes the classification. See [Runtime architecture and release gates](docs/runtime-architecture.md). When preparing a release, update `RELEASE_NOTES.md`, `RELEASE_NOTES.zh.md`, and `apps/desktop/src/release-notes.json` together.

`dist-desktop/` is a generated build directory and may be deleted after a release. The source needed for the next build remains in `vendor/deepseek-harness`; do not commit `node_modules/` or a portable ZIP as a substitute for the source workspace.

## Security and limitations

- Verify the published SHA-256 values before running downloaded files.
- Current local Windows, Linux, and macOS packages are explicitly non-official and unsigned; the official release lane refuses them without the TargetSpec signing/notarization evidence.
- The local web server binds to loopback by default.
- Do not put API keys in the repository or release directory.
- Marketplace entries are third-party code discovered from GitHub. Review a plugin's repository and permissions before installing it; installation can run package build scripts and grants the plugin the capabilities of its Cordis composition.
- If trusted executables are required, use an approved CA, Microsoft Artifact Signing, or an enterprise signing policy.

See Microsoft's [Smart App Control overview](https://learn.microsoft.com/en-us/windows/apps/develop/smart-app-control/overview) and [SmartScreen reputation guidance](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/smartscreen-reputation).

## License

DeepSeek Harness is licensed under [MIT](LICENSE). Third-party notices are in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). Upstream source: [deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness).
