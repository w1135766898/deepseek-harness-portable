# DeepSeek Harness for Win v1.0.0

[中文](RELEASE_NOTES.zh.md)

Windows x64 portable release · 2026-08-15

This is the first formal release of this Windows distribution. It is a community-maintained build and is not signed by Microsoft.

## Features

- Portable Windows x64 package combining the native Electron desktop shell with an embedded DeepSeek Harness Web runtime.
- Workspace selection, browser mode, tray/application menus, release history, About, and diagnostics export.
- In-app update checking, download progress, SHA-256 verification, restart confirmation, and rollback support.
- Native blue whale logo menu, Windows 11 Mica/title-bar styling, system theme synchronization, startup splash, and multi-monitor-safe window state.

## Build and reliability

- The desktop shell, embedded Web runtime, and release package are rebuilt from the pinned vendor/deepseek-harness source workspace included in this repository.
- Release packaging validates the runtime source copy, release manifest, portable archive layout, required native modules, and SHA-256 checksums before publication.
- The package includes Chinese and English quick guides, portable start/update scripts, and an uninstall flow that keeps user data unless deletion is explicitly confirmed.

## Components

- Distribution: 1.0.0
- Desktop shell: 0.1.0-shell.2
- Kernel: 0.1.0-rc.5 (@deepseek-ai/dsh-web-app)
- Tag: v1.0.0

## Checksums and security

- The final portable ZIP and Setup installer SHA-256 values are recorded in SHA256SUMS.txt and attached to the GitHub Release.
- Verify SHA256SUMS.txt before launching downloaded files.
- The executable is unsigned; Windows SmartScreen or Smart App Control may warn or block it.
- Conversations, credentials, settings, attachments, and desktop preferences stay outside the release directory during updates.
