# DeepSeek Harness for Win v1.0.3

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

- Distribution: 1.0.3
- Desktop shell: 0.1.0-shell.2
- Kernel: 0.1.0-rc.5 (@deepseek-ai/dsh-web-app)
- Tag: v1.0.3

## Checksums and security

- Portable ZIP SHA-256: 6AF094A456D28C7B90BEA03A4AA9537A7A36031A71BBC407FFC5569AF400B876
- Setup SHA-256: 5ABC75778558F5D0A83C357388919710D396187123037A9545543C0B7CEA9202
- Verify SHA256SUMS.txt before launching.
- The executable is unsigned; Windows SmartScreen may warn.
- Conversations, credentials, settings, and attachments stay outside the release directory during updates.
