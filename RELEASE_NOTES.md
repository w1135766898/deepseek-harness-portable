# DeepSeek Harness for Win v1.0.1

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

## Components

- Distribution: 1.0.1
- Desktop shell: 0.1.0-shell.2
- Kernel: 0.1.0-rc.5 (@deepseek-ai/dsh-web-app)
- Tag: v1.0.1

## Checksums and security

- Portable ZIP SHA-256: C8A19489F6B70964995FB7F9333026ECFAF0A9AED55FE2A6E77A5788E619EA80
- Setup SHA-256: 2DE8379E7220A01F9446B6102381C556234B0DBE59882D1C5FC8CFA77E154145
- Verify SHA256SUMS.txt before launching.
- The executable is unsigned; Windows SmartScreen may warn.
- Conversations, credentials, settings, and attachments stay outside the release directory during updates.
