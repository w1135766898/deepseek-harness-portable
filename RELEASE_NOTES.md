# DeepSeek Harness for Win v1.0.2

[中文](RELEASE_NOTES.zh.md)

Windows x64 portable release · 2026-08-15

Community distribution, not an official Microsoft-signed build.

## Features

- Raycast- and Linear-style timeline for release history.
- A lightweight in-app update banner that collapses to an update bell after a successful upgrade.
- DeepSeek whale branding with adaptive light and dark glass styling.
- Persistent updater progress and terminal status in the user data directory.

## Improvements

- Atomic rows make features, improvements, and fixes easier to scan.
- Same-window release history drawer with no separate update window or floating HUD.
- Graceful handoff waits for the desktop shell before replacing the portable runtime.
- Failed or interrupted updates remain visible and can be retried.

## Fixes

- Windows PowerShell 5.1 now reads UTF-8 release manifests correctly.

## Components

- Distribution: 1.0.2
- Desktop shell: 0.1.0-shell.2
- Kernel: 0.1.0-rc.5 (@deepseek-ai/dsh-web-app)
- Tag: v1.0.2

## Checksums and security

- Portable ZIP SHA-256: 4477F87A45885758089E45C5D3BCD35694845AA27478800384ABFCA0909D9CE7
- Setup SHA-256: 9FFC70C43A37DE2CBF630D4617D85E0F7825531A87D356056EFB2B9BE96ECCD3
- Verify SHA256SUMS.txt before launching.
- The executable is unsigned; Windows SmartScreen may warn.
- Conversations, credentials, settings, and attachments stay outside the release directory during updates.
