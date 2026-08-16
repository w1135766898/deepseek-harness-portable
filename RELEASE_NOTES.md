# DeepSeek Harness for Win v1.2.6

[中文](RELEASE_NOTES.zh.md)

Windows x64 portable release · 2026-08-16

This is the v1.2.6 release of this Windows distribution, hardening the update and installation workflows on Windows, resolving runtime directory replacement edge-cases and PowerShell pipeline leaks, and enhancing process-tree lifecycle management.

## Bug Fixes & Hardening

- **Updater & Installer Hardening**: Re-engineered directory atomic replacement to prevent nested runtime paths when NTFS handles are pending release, eliminated PowerShell output pipeline leaks, and added transaction journal state validation.
- **Setup Installer Resilience**: Enhanced pre-extraction child process termination and directory cleanup in Inno Setup to eliminate archive extraction permission errors (`tar exit code 1`).
- **WSL Terminal Subprocess Cleanup**: Tightened terminal inspection and process tree lifecycle across Windows desktop sessions.

## Components

- Distribution: 1.2.6
- Desktop shell: 0.1.0-shell.2
- Kernel: 0.1.0-rc.5 (@deepseek-ai/dsh-web-app)
- Tag: v1.2.6

## Checksums and security

- The final portable ZIP and Setup installer SHA-256 values are recorded in SHA256SUMS.txt and attached to the GitHub Release.
- Verify SHA256SUMS.txt before launching downloaded files.
- The executable is unsigned; Windows SmartScreen or Smart App Control may warn or block it.
- Conversations, credentials, settings, attachments, and desktop preferences stay outside the release directory during updates.
