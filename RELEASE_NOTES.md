# DeepSeek Harness for Win v1.2.1

[中文](RELEASE_NOTES.zh.md)

Windows x64 portable release · 2026-08-16

This is the v1.2.1 release of this Windows distribution, fundamentally redesigning the in-app update lifecycle with transparent pre-extraction staging, 1–2 second instant atomic restarts, and startup script mutex protection.

## New Features & Improvements

- **In-App Pre-Extraction Staging**: Update downloads, SHA-256 verification, and ZIP decompression now run transparently in the background while the application stays fully usable with zero interruption.
- **1–2 Second Instant Atomic Swap**: Replaced the previous 30+ second silent extraction waiting period with a near-instant directory swap on restart, eliminating anxiety over whether the application crashed or hung.
- **Transparent User Control**: The update interface clearly displays update status and gives users full control with explicit "Restart and Update Now" and "Later" options.
- **Launcher Mutex Protection**: `启动桌面版.bat`, `start-desktop.cmd`, and `启动桌面窗口.bat` now detect active update transactions and wait safely, preventing Windows file-lock collisions.

## Components

- Distribution: 1.2.1
- Desktop shell: 0.1.0-shell.2
- Kernel: 0.1.0-rc.5 (@deepseek-ai/dsh-web-app)
- Tag: v1.2.1

## Checksums and security

- The final portable ZIP and Setup installer SHA-256 values are recorded in SHA256SUMS.txt and attached to the GitHub Release.
- Verify SHA256SUMS.txt before launching downloaded files.
- The executable is unsigned; Windows SmartScreen or Smart App Control may warn or block it.
- Conversations, credentials, settings, attachments, and desktop preferences stay outside the release directory during updates.
