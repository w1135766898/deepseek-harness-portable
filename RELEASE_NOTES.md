# DeepSeek Harness for Win v1.2.5

[中文](RELEASE_NOTES.zh.md)

Windows x64 portable release · 2026-08-16

This is the v1.2.5 release of this Windows distribution, fixing an updater detection issue where releases without explicit asset names caused false "up to date" status reports, and automatically deriving standard portable asset filenames across valid SemVer releases.

## Bug Fixes & Improvements

- **Updater Detection & Asset Fallback**: Fixed an issue where new releases fetched via raw release notes or history without an explicit `assetName` field caused the update dialog to falsely report "You are running the latest version", and automatically derives standard package names (`DeepSeek-Harness-${version}-win32-x64.zip`) for valid SemVer releases.

## Components

- Distribution: 1.2.5
- Desktop shell: 0.1.0-shell.2
- Kernel: 0.1.0-rc.5 (@deepseek-ai/dsh-web-app)
- Tag: v1.2.5

## Checksums and security

- The final portable ZIP and Setup installer SHA-256 values are recorded in SHA256SUMS.txt and attached to the GitHub Release.
- Verify SHA256SUMS.txt before launching downloaded files.
- The executable is unsigned; Windows SmartScreen or Smart App Control may warn or block it.
- Conversations, credentials, settings, attachments, and desktop preferences stay outside the release directory during updates.
