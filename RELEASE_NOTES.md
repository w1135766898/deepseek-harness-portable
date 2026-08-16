# DeepSeek Harness for Win v1.2.7

[中文](RELEASE_NOTES.zh.md)

Windows x64 portable release · 2026-08-17

This is the v1.2.7 release of this Windows distribution. It adds a bundled plugin marketplace workflow, repairs update bootstrap edge-cases from verified staging, and makes Windows packaging faster and more reproducible.

## New Features & Improvements

- **Bundled plugin marketplace**: each Web profile receives the pinned `dsh-plugin-marketplace` package once. Users can disable or remove it, and that choice persists across restarts and upgrades.
- **Self-contained marketplace tooling**: the portable release includes the DSH plugin CLI and pnpm behind the embedded Electron Node.js runtime, so marketplace operations do not require a system Node.js installation.
- **Verified update recovery**: startup and updater flows can repair release-owned payload files from verified staging while preserving transaction and rollback safety.
- **Cross-volume Setup installs**: installer staging now stays under the selected application directory, so runtime activation remains a same-volume rename even when installing to D: or E:.
- **Launcher transaction detection**: startup wrappers tolerate PowerShell 5.1 JSON whitespace when checking committed or rolled-back transactions, avoiding unnecessary recovery delays.
- **Content-addressed packaging cache**: successful build, staging, and Electron layers are fingerprinted and safely reused, with explicit `--no-cache` support and release archive layout checks.

## Components

- Distribution: 1.2.7
- Desktop shell: 0.1.0-shell.2
- Kernel: 0.1.0-rc.5 (@deepseek-ai/dsh-web-app)
- Tag: v1.2.7

## Checksums and security

- The final portable ZIP and Setup installer SHA-256 values are recorded in SHA256SUMS.txt and attached to the GitHub Release.
- Verify SHA256SUMS.txt before launching downloaded files.
- Marketplace packages are third-party code; review their source and permissions before enabling additional plugins.
- The executable is unsigned; Windows SmartScreen or Smart App Control may warn or block it.
- Conversations, credentials, settings, attachments, and desktop preferences stay outside the release directory during updates.
