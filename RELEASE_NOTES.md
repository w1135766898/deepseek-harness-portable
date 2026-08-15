# DeepSeek Harness for Win v1.1.3

[中文](RELEASE_NOTES.zh.md)

Windows x64 portable release · 2026-08-16

This is the v1.1.3 maintenance release of this Windows distribution, delivering security hardening for uninstallation, zip-slip and PATH injection fixes for installation, and reliability improvements for background updates and health checks.

## Bug Fixes

- **Refused to remove user data through a junction or symlink**: uninstallation strictly refuses to follow junctions or symlinks when removing user data to prevent accidental deletion of target directories.
- **Full engine termination before removal**: uninstaller terminates the complete backend process tree before removing files and fixes percent sign escaping in delayed cleanup scripts.
- **Case-insensitive PATH comparison**: installer checks existing PATH entries case-insensitively before appending, preventing duplicate entries.
- **Zip-slip validation**: hardened installer and updater against zip-slip path traversal violations during extraction.

## Improvements

- **Throttled automatic update checks**: background update checking is throttled to once per day to eliminate unnecessary startup requests.
- **Exponential backoff for health probes**: backend health probing backs off exponentially when consecutive failures accumulate.
- **State cache separation**: moved the release history cache out of config.json for cleaner state management.
- **External URL validation**: window open handler enforces strict HTTP and HTTPS protocol checks.

## Components

- Distribution: 1.1.3
- Desktop shell: 0.1.0-shell.2
- Kernel: 0.1.0-rc.5 (@deepseek-ai/dsh-web-app)
- Tag: v1.1.3

## Checksums and security

- The final portable ZIP and Setup installer SHA-256 values are recorded in SHA256SUMS.txt and attached to the GitHub Release.
- Verify SHA256SUMS.txt before launching downloaded files.
- The executable is unsigned; Windows SmartScreen or Smart App Control may warn or block it.
- Conversations, credentials, settings, attachments, and desktop preferences stay outside the release directory during updates.
