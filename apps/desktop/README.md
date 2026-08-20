# DeepSeek Harness Desktop — Desktop shell

[中文](README.zh.md)

This workspace package builds the native Electron desktop shell for DeepSeek Harness Desktop. It starts the existing Web runtime on loopback, embeds it in a BrowserWindow, and keeps tray/app-menu actions for desktop workflows on Windows, macOS, and Linux.

## Runtime features

- Starts the packaged dsh Web runtime on 127.0.0.1.
- Remembers the selected workspace in Electron user data.
- Keeps user data under the official DSH_HOME root, %USERPROFILE%\.dsh by default.
- Provides tray and application menu actions for workspace, browser mode, updates, release notes, and About.
- Fetches release notes from GitHub or the configured mirror, with cached and bundled offline fallback.
- Downloads and verifies Windows portable updates in-app with progress before asking the user to restart; Linux/macOS open the release page for manual AppImage/deb or DMG download.
- Shows update availability in a compact, centered banner below the title bar; it auto-destroys after seven seconds or dismissal, supports per-version suppression, and keeps the full release history in a centered card-style Update Hub.
- Fuses the native sidebar logo with the desktop menu: expanded left click opens the menu, while collapsed left click expands the sidebar and right click opens the menu.
- Uses a Windows 11 Mica title-bar overlay where supported, native macOS title/menu behavior, system theme synchronization, startup splash, and persisted multi-monitor-safe window bounds.
- Runs Minimal mode through WSL Bash on Windows and native `/bin/bash` through a POSIX PTY on Linux/macOS; Linux sandbox-capable modes retain the upstream bwrap/Landlock fail-closed chain.
- Preinstalls the pinned `dsh-plugin-marketplace` once per Web profile; users can disable or remove it without the distribution restoring it on restart.
- Bundles the DSH plugin CLI and pnpm behind Electron's Node mode, so marketplace operations do not require a system Node.js toolchain.

## Build and test

Use Node.js ^22.19.0 or >=24 and pnpm.

On a fresh clone, run `pnpm run desktop:bootstrap` once to initialize the pinned
`vendor/deepseek-harness` source workspace that provides the `@deepseek-ai/*`
packages. The build and packaging commands then compile the Web runtime locally;
they do not depend on an existing portable ZIP.

    pnpm install
    pnpm run build
    pnpm run desktop:test
    pnpm run desktop:dev
    pnpm run desktop:package:win
    pnpm run desktop:package:mac
    pnpm run desktop:package:linux

Run each packaging command on its matching native host: Windows x64 with a working WSL distribution, Apple Silicon macOS, or Linux x64. The commands download Electron, run capability probes and packaged smoke tests, and write immutable verified bundles under `dist-desktop/verified/<target>/`.

The unpacked Windows application is written to:

    dist-desktop/electron/DeepSeek Harness-win32-x64/
    └─ runtime/DeepSeek Harness.exe

The macOS Apple Silicon build targets `darwin-arm64` and produces:

    dist-desktop/electron/DeepSeek Harness-darwin-arm64/DeepSeek Harness.app
    dist-desktop/electron/DeepSeek-Harness-<distributionVersion>-darwin-arm64.dmg

DMG creation and the build-time `.icns` conversion require macOS system tools (`hdiutil`, `sips`, and `iconutil`). The first release lane is intentionally unsigned and not notarized.

The Linux x64 build targets `linux-x64` and produces an unpacked Electron
runtime plus `DeepSeek-Harness-<distributionVersion>-linux-x64.AppImage` and
`.deb` artifacts. It must run on native Linux x64: the official upstream
Landlock launcher is compiled with `musl-gcc`, then staged into the deploy
closure. `electron-builder` creates the AppImage and deb from the unpacked
runtime. Linux and macOS update checks open the release page for manual
replacement instead of self-updating the installed application.

Publishing is a separate copy-only step. It re-hashes the exact files named by `artifact-verification.json`; it does not build, test, patch, sign, or recreate an archive:

    pnpm run desktop:release:win -- --input dist-desktop/verified/win32-x64
    pnpm run desktop:release:mac -- --input dist-desktop/verified/darwin-arm64
    pnpm run desktop:release:linux -- --input dist-desktop/verified/linux-x64

## Release identity

- Release: DeepSeek Harness Desktop v1.4.0
- Distribution: 1.4.0
- Desktop shell: 0.1.0-shell.2
- Kernel: read from the packaged @deepseek-ai/dsh-web-app manifest

The release manifest is written beside runtime and records the distribution, desktop shell, kernel, kernel Git commit, and bundled release notes.

## User data and security

The shell binds the Web server to loopback and sets DSH_TELEMETRY_DISABLED=1. Workspace settings and desktop release-note state are stored in Electron user data, not inside the packaged application directory. Windows uses `%USERPROFILE%\.dsh`; Linux/macOS use `$HOME/.dsh` unless `DSH_HOME` is set. Marketplace plugins are third-party code and should be reviewed before installation.

Set the DeepSeek API key in the Web UI settings or in the environment used to launch the application. The Windows executable is not signed by a trusted commercial CA, and the macOS DMG is not signed or notarized, so the operating system may require an explicit first-launch confirmation.

## Uninstall

The Setup uninstaller and portable uninstall scripts keep conversations, credentials, settings, attachments, and desktop preferences by default. Data is removed only after explicit confirmation.
