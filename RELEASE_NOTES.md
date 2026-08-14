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

- Portable ZIP SHA-256: 5DD00E4DD87A1159F8561F0923B4AD0073390F02CDB62640E9A48A3FDE735627
- Setup SHA-256: D1273478017F2EDBDC27ABC1F1796AE80E488CC1FC54946DD04A0A3478AEAB36
- Verify SHA256SUMS.txt before launching.
- The executable is unsigned; Windows SmartScreen may warn.
- Conversations, credentials, settings, and attachments stay outside the release directory during updates.
