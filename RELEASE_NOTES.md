# DeepSeek Harness for Win v1.1.2

[中文](RELEASE_NOTES.zh.md)

Windows x64 portable release · 2026-08-15

This is the v1.1.2 maintenance release of this Windows distribution, fixing the release log so it follows the interface language: bundled bilingual release notes now take priority over the English GitHub release text.

## Bug Fixes

- **Fixed the update log ignoring the app language**: release notes now prefer the bundled bilingual content, so a Chinese interface shows Chinese release notes instead of the English text pulled from the GitHub release page.

## Improvements

- **Bundled bilingual release history**: all published versions (v1.1.1, v1.1.0, v1.0.0) now ship with Chinese and English release notes, so the full timeline stays localized even when offline or behind a restricted network.

## Components

- Distribution: 1.1.2
- Desktop shell: 0.1.0-shell.2
- Kernel: 0.1.0-rc.5 (@deepseek-ai/dsh-web-app)
- Tag: v1.1.2

## Checksums and security

- The final portable ZIP and Setup installer SHA-256 values are recorded in SHA256SUMS.txt and attached to the GitHub Release.
- Verify SHA256SUMS.txt before launching downloaded files.
- The executable is unsigned; Windows SmartScreen or Smart App Control may warn or block it.
- Conversations, credentials, settings, attachments, and desktop preferences stay outside the release directory during updates.
