# DeepSeek Harness for Win v1.1.1

[中文](RELEASE_NOTES.zh.md)

Windows x64 portable release · 2026-08-15

This is the v1.1.1 maintenance release of this Windows distribution, fixing the in-app update restart flow and hardening the transactional updater.

## Bug Fixes

- **Fixed in-app updates never starting after restart confirmation**: the updater is now launched in a way that Windows PowerShell 5.1 actually executes (the previous detached launch exited silently without running, leaving the update stuck at `starting` and reporting "last update incomplete" on the next launch).
- **Fixed updater self-termination risk**: the old desktop shell is now terminated without recursively killing its process tree, so the running updater can no longer be killed by its own cleanup.
- **Fixed unexplained incomplete-update states**: early updater failures (for example a missing updater module) now record a concrete failed status with the real error message.

## Improvements

- **Console updates reuse downloaded packages**: `在线更新.bat` / `update.cmd` now reuse the ZIP the desktop shell already downloaded (SHA-256 verified against the published digest), so updating after a failed in-app restart does not re-download.
- **Normal post-update launch**: the new version's splash and main window appear normally instead of starting hidden.

## Components

- Distribution: 1.1.1
- Desktop shell: 0.1.0-shell.2
- Kernel: 0.1.0-rc.5 (@deepseek-ai/dsh-web-app)
- Tag: v1.1.1

## Checksums and security

- The final portable ZIP and Setup installer SHA-256 values are recorded in SHA256SUMS.txt and attached to the GitHub Release.
- Verify SHA256SUMS.txt before launching downloaded files.
- The executable is unsigned; Windows SmartScreen or Smart App Control may warn or block it.
- Conversations, credentials, settings, attachments, and desktop preferences stay outside the release directory during updates.
