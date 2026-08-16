# DeepSeek Harness for Win — Desktop shell

[中文](README.zh.md)

This workspace package builds the native Electron desktop shell for DeepSeek Harness for Win v1.0.0. It starts the existing Web runtime on loopback, embeds it in a BrowserWindow, and keeps a tray icon for desktop actions.

## Runtime features

- Starts the packaged dsh Web runtime on 127.0.0.1.
- Remembers the selected workspace in Electron user data.
- Keeps user data under the official DSH_HOME root, %USERPROFILE%\.dsh by default.
- Provides tray and application menu actions for workspace, browser mode, updates, release notes, and About.
- Fetches release notes from GitHub or the configured mirror, with cached and bundled offline fallback.
- Downloads and verifies portable updates in-app with progress before asking the user to restart.
- Shows update availability in a compact, centered banner below the title bar; it auto-destroys after seven seconds or dismissal, supports per-version suppression, and keeps the full release history in a centered card-style Update Hub.
- Fuses the native sidebar logo with the desktop menu: expanded left click opens the menu, while collapsed left click expands the sidebar and right click opens the menu.
- Uses a Windows 11 Mica title-bar overlay, system theme synchronization, startup splash, and persisted multi-monitor-safe window bounds.

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

The native build downloads Electron and targets Windows x64. The packaged output is a portable directory:

    dist-desktop/electron/DeepSeek Harness-win32-x64/
    └─ runtime/DeepSeek Harness.exe

## Release identity

- Release: DeepSeek Harness for Win v1.2.5
- Distribution: 1.2.5
- Desktop shell: 0.1.0-shell.2
- Kernel: read from the packaged @deepseek-ai/dsh-web-app manifest

The release manifest is written beside runtime and records the distribution, desktop shell, kernel, kernel Git commit, and bundled release notes.

## User data and security

The shell binds the Web server to loopback and sets DSH_TELEMETRY_DISABLED=1. Workspace settings and desktop release-note state are stored in Electron user data, not inside the packaged application directory.

Set the DeepSeek API key in the Web UI settings or in the environment used to launch the executable. The executable is not signed by a trusted commercial CA, so Windows SmartScreen may warn on first run.

## Uninstall

The Setup uninstaller and portable uninstall scripts keep conversations, credentials, settings, attachments, and desktop preferences by default. Data is removed only after explicit confirmation.
