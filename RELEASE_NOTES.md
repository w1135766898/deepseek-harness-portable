# DeepSeek Harness for Win v1.0.0

[中文](RELEASE_NOTES.zh.md)

Windows x64 portable release · 2026-08-14

Community distribution, not an official Microsoft-signed build.

## Features

- Raycast- and Linear-style timeline for release history.
- A compact HUD toast after a successful upgrade.
- DeepSeek whale branding with adaptive light and dark glass styling.
- Persistent updater progress and terminal status in the user data directory.

## Improvements

- Atomic rows make features, improvements, and fixes easier to scan.
- Smaller update window and non-intrusive post-update notification.
- Graceful handoff waits for the desktop shell before replacing the portable runtime.
- Failed or interrupted updates remain visible and can be retried.

## Components

- Distribution: 1.0.0
- Desktop shell: 0.1.0-shell.2
- Kernel: 0.1.0-rc.5 (@deepseek-ai/dsh-web-app)
- Tag: v1.0.0

## Checksums and security

- Portable ZIP SHA-256: generated during the release build; see SHA256SUMS.txt.
- Setup SHA-256: generated during the release build; see SHA256SUMS.txt.
- Verify SHA256SUMS.txt before launching.
- The executable is unsigned; Windows SmartScreen may warn.
- Conversations, credentials, settings, and attachments stay outside the release directory during updates.
