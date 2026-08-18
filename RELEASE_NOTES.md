# DeepSeek Harness Desktop v1.3.2

[中文](RELEASE_NOTES.zh.md)

Windows x64, macOS Apple Silicon, and Linux x64 desktop release · 2026-08-18

This is the v1.3.2 test build. It keeps the DeepSeek Harness rc.7 runtime and makes the desktop About and release-notes entry points open their native modal reliably.

## New Features & Improvements

- **No-console Windows startup**: desktop and Start menu shortcuts use a GUI bootstrap that preserves interrupted-update recovery without flashing a command window; existing shortcuts migrate automatically and roll back safely.
- **Reliable About and release notes**: desktop menu actions now open the native modal directly instead of routing through the Web runtime menu bridge.
- **Native Learning choices**: learning direction, depth, and pace now use the rc.7 client choice control instead of a custom activity form.
- **Inline teaching graphics**: parameter explorers, process steppers, and structure comparisons render inside the assistant message, persist in session replay, and include text equivalents and non-color-only labels.
- **Forward-compatible session history**: the portable runtime accepts the exact legacy `portable-runtime/mode-resolution` event and marks new occurrences ignorable; unrelated unknown non-ignorable events remain rejected.
- **Reliable overwrite-install first launch**: profile dependencies stay authoritative, with an installed-runtime fallback during the brief junction replacement window used by Setup Finish startup.
- **Transparent plugin installation**: Marketplace now shows source, runtime, network/image-egress, activation, degradation, known-issue, and verification details before confirmation; unknown plugins are marked unverified.
- **Native rc.7 image attachments**: supported models use the persisted client attachment path, while the explicit external `view_image` route remains available for text-only models with clear egress disclosure.
- **macOS Apple Silicon desktop distribution**: the Electron shell now packages a native `darwin-arm64` app and DMG with target-specific `node-pty`, `sharp`, and `koffi` addons.
- **Native macOS Minimal mode**: the official preset runs through the POSIX PTY and `/bin/bash` without WSL or a container compatibility layer.
- **Platform-aware release flow**: Windows keeps in-app portable updates, while macOS opens the release page for manual DMG downloads.
- **Bundled plugin marketplace**: each Web profile receives the pinned `dsh-plugin-marketplace` package once. Users can disable or remove it, and that choice persists across restarts and upgrades.
- **Self-contained marketplace tooling**: the portable release includes the DSH plugin CLI and pnpm behind the embedded Electron Node.js runtime, so marketplace operations do not require a system Node.js installation.
- **Verified update recovery**: startup and updater flows can repair release-owned payload files from verified staging while preserving transaction and rollback safety.
- **Cross-volume Setup installs**: installer staging now stays under the selected application directory, so runtime activation remains a same-volume rename even when installing to D: or E:.
- **Launcher transaction detection**: startup wrappers tolerate PowerShell 5.1 JSON whitespace when checking committed or rolled-back transactions, avoiding unnecessary recovery delays.
- **Content-addressed packaging cache**: successful build, staging, and Electron layers are fingerprinted and safely reused, with explicit `--no-cache` support and release archive layout checks.

## Components

- Distribution: 1.3.2
- Desktop shell: 0.1.0-shell.2
- Kernel: 0.1.0-rc.7 (@deepseek-ai/dsh-web-app)
- Tag: v1.3.2

## Checksums and security

- The final Windows portable ZIP and Setup installer SHA-256 values are recorded in `SHA256SUMS.txt`; the macOS DMG is recorded in `SHA256SUMS-darwin-arm64.txt`.
- Verify the matching checksum file before launching downloaded files.
- Marketplace packages are third-party code; review their source and permissions before enabling additional plugins.
- The Windows executable and macOS DMG are unsigned; Windows SmartScreen/Smart App Control and macOS Gatekeeper may warn or block them.
- Conversations, credentials, settings, attachments, and desktop preferences stay outside the release directory during updates.
