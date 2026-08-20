# DeepSeek Harness Desktop v1.4.0

[中文](RELEASE_NOTES.zh.md)

Windows x64, macOS Apple Silicon, and Linux x64 desktop release · 2026-08-20

This is the v1.4.0 build. It moves the pinned runtime kernel from 0.1.0-rc.7 to 0.1.0-rc.8, rebuilds the desktop baseline on top of it, and refreshes the Windows x64 release artifacts with a new distribution identity and checksums.

## Release & Update Reliability

- **Kernel upgrade to rc.8**: the pinned DeepSeek Harness kernel moves from 0.1.0-rc.7 to 0.1.0-rc.8, and the desktop baseline is rebuilt on it as distribution v1.4.0 with a new Windows x64 portable ZIP and Setup installer.
- **Vision Bridge on the native model path**: `view_image` now commits images through the attachment service and calls a configured image-capable model over the kernel LLM channel, reusing your existing provider credentials, retry policy, and usage metering instead of its own endpoint and API key.
- **Synchronized release identity**: the bundled release manifest, updater checks, installer filenames, desktop documentation, and release-notes metadata all target v1.4.0.
- **Verified artifact refresh**: the Windows ZIP and Setup installer are rebuilt from the current source, re-tested with native addon smoke checks, and accompanied by fresh SHA-256 values.
- **Feature baseline retained**: the build keeps the v1.3.3 Learning visuals and native choices, transparent plugin marketplace, native image attachments, no-console launcher, and overwrite-install recovery improvements.

## Components

- Distribution: 1.4.0
- Desktop shell: 0.1.0-shell.2
- Kernel: 0.1.0-rc.8 (@deepseek-ai/dsh-web-app)
- Tag: v1.4.0

## Checksums and security

- The final Windows portable ZIP and Setup installer SHA-256 values are recorded in `SHA256SUMS.txt`; the macOS DMG is recorded in `SHA256SUMS-darwin-arm64.txt`.
- Verify the matching checksum file before launching downloaded files.
- Marketplace packages are third-party code; review their source and permissions before enabling additional plugins.
- The Windows executable and macOS DMG are unsigned; Windows SmartScreen/Smart App Control and macOS Gatekeeper may warn or block them.
- Conversations, credentials, settings, attachments, and desktop preferences stay outside the release directory during updates.
