# DeepSeek Harness for Win v1.0.4

[中文](RELEASE_NOTES.zh.md)

Windows x64 portable release · 2026-08-15

Community distribution, not an official Microsoft-signed build.

## Features

- Keyboard navigation for the desktop action menu with Arrow keys, Enter, Escape, Alt, and F10.
- Copy Diagnostics exports runtime, workspace, and recent startup information to the clipboard.
- Clear Web Storage removes local UI caches and storage after confirmation, then restarts the app.

## Improvements

- Action feedback appears in a lightweight in-app toast after desktop diagnostics actions.
- The storage cleanup flow keeps login cookies while clearing application caches and IndexedDB data.

## Fixes

- Desktop menu focus is reset when the menu closes or dispatches an action, preventing stale focus state.

## Components

- Distribution: 1.0.4
- Desktop shell: 0.1.0-shell.2
- Kernel: 0.1.0-rc.5 (@deepseek-ai/dsh-web-app)
- Tag: v1.0.4

## Checksums and security

- Portable ZIP SHA-256: 22DC9AE99C18BF0DEBDFDEB560F00F3C99BC723F93D7EA7216C494BD2755A565
- Setup SHA-256: E226AC007DB80D6738E0FDAF451F11A7B702A8E6B2837E1CED8FDB7362516155
- Verify SHA256SUMS.txt before launching.
- The executable is unsigned; Windows SmartScreen may warn.
- Conversations, credentials, settings, and attachments stay outside the release directory during updates.
