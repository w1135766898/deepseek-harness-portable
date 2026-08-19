# DeepSeek Harness Desktop v1.3.3

[中文](RELEASE_NOTES.zh.md)

Windows x64, macOS Apple Silicon, and Linux x64 desktop release · 2026-08-19

This is the v1.3.3 maintenance/test build. It republishes the latest rc.7 desktop baseline with synchronized release identity, updater metadata, installer naming, and Windows x64 artifacts.

## Release & Update Reliability

- **Versioned desktop refresh**: the latest rc.7 desktop baseline is repackaged as distribution v1.3.3 with a new Windows x64 portable ZIP and Setup installer.
- **Synchronized release identity**: the bundled release manifest, updater checks, installer filenames, desktop documentation, and release-notes metadata all target v1.3.3.
- **Verified artifact refresh**: the Windows ZIP and Setup installer are rebuilt from the current source, re-tested with native addon smoke checks, and accompanied by fresh SHA-256 values.
- **Feature baseline retained**: the build keeps the v1.3.2 Learning visuals and native choices, transparent plugin marketplace, native image attachments, no-console launcher, and overwrite-install recovery improvements.

## Components

- Distribution: 1.3.3
- Desktop shell: 0.1.0-shell.2
- Kernel: 0.1.0-rc.7 (@deepseek-ai/dsh-web-app)
- Tag: v1.3.3

## Checksums and security

- The final Windows portable ZIP and Setup installer SHA-256 values are recorded in `SHA256SUMS.txt`; the macOS DMG is recorded in `SHA256SUMS-darwin-arm64.txt`.
- Verify the matching checksum file before launching downloaded files.
- Marketplace packages are third-party code; review their source and permissions before enabling additional plugins.
- The Windows executable and macOS DMG are unsigned; Windows SmartScreen/Smart App Control and macOS Gatekeeper may warn or block them.
- Conversations, credentials, settings, attachments, and desktop preferences stay outside the release directory during updates.
