# DeepSeek Harness for Win v1.1.0

[中文](RELEASE_NOTES.zh.md)

Windows x64 portable release · 2026-08-15

This is the v1.1.0 release of this Windows distribution, bringing PowerShell agent support, immersive titlebar enhancements, update & rollback reliability improvements, and UI refinements.

## Features

- **Windows Minimal Agent Preset**: Added PowerShell (`pwsh`) shell support and cmdline execution on Windows.
- **Immersive Titlebar Layout**: Adopted immersive titlebar with safe top content offset and window drag regions, preventing overlap with native window controls.
- **Update & Rollback UX**: Added transaction state visibility (`starting`, `rolled-back`), automatic application relaunch after rollback, and localized status cards.
- **Cross-Restart Ready Resume**: Downloaded updates are remembered and verified across app restarts with automatic stale package cleanup.

## Bug Fixes

- Disabled background jobs (`run_in_background`) in Minimal preset on Windows to prevent orphaned processes.
- Fixed update ready notice suppression caused by previous dismissal records.
- Fixed error classification during download failures and added automatic downgrade to retry on corrupted packages.
- Fixed sidebar whale logo click dispatch and anchor synchronization.

## Components

- Distribution: 1.1.0
- Desktop shell: 0.1.0-shell.2
- Kernel: 0.1.0-rc.5 (@deepseek-ai/dsh-web-app)
- Tag: v1.1.0

## Checksums and security

- The final portable ZIP and Setup installer SHA-256 values are recorded in SHA256SUMS.txt and attached to the GitHub Release.
- Verify SHA256SUMS.txt before launching downloaded files.
- The executable is unsigned; Windows SmartScreen or Smart App Control may warn or block it.
- Conversations, credentials, settings, attachments, and desktop preferences stay outside the release directory during updates.
