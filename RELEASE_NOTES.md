# DeepSeek Harness for Win v1.2.4

[中文](RELEASE_NOTES.zh.md)

Windows x64 portable release · 2026-08-16

This is the v1.2.4 release of this Windows distribution, sharing terminal environment variables with WSL sessions via WSLENV to eliminate pager hangs, delivering Ctrl+C signals for interactive WSL task interruptions, binding host shutdown directly to PTY lifecycle cleanup, and aligning Vision Bridge styles with official design tokens.

## New Features & Improvements

- **WSL Terminal Environment Sharing via WSLENV**: Windows host terminal and runtime environment variables (`PAGER`, `GIT_PAGER`, `TERM`, `DSH_*`, etc.) are now seamlessly shared into WSL Linux sessions. This completely eliminates interactive pager hangs (such as `less` in `git` or `man`) and ensures readiness probe workflows run smoothly.
- **Interactive SIGINT Delivery for WSL Terminals**: Intercepts terminal interrupt requests and delivers the standard Ctrl+C byte directly into the PTY stream. Foreground tasks now respond and cancel immediately without waiting for 300s command timeout resets.
- **Deterministic WSL Process Cleanup on Exit**: Binds host shutdown directly to PTY `SIGKILL` signals, ensuring background `wsl.exe` instances and terminal subprocesses are cleanly destroyed on application exit with zero orphan processes.
- **Robust WSL Diagnostic & Cross-Encoding Detection**: Automatically handles and decodes mixed UTF-16LE and UTF-8 `wsl -l -q` command output across different Windows locales. Provides actionable bilingual troubleshooting guidance and one-click commands when distributions are missing.
- **Vision Bridge Design Token Alignment**: Harmonized CSS variables and card styles in `@dsh-portable/vision-bridge` with official microkernel design tokens across dark and light themes.

## Components

- Distribution: 1.2.4
- Desktop shell: 0.1.0-shell.2
- Kernel: 0.1.0-rc.5 (@deepseek-ai/dsh-web-app)
- Tag: v1.2.4

## Checksums and security

- The final portable ZIP and Setup installer SHA-256 values are recorded in SHA256SUMS.txt and attached to the GitHub Release.
- Verify SHA256SUMS.txt before launching downloaded files.
- The executable is unsigned; Windows SmartScreen or Smart App Control may warn or block it.
- Conversations, credentials, settings, attachments, and desktop preferences stay outside the release directory during updates.
