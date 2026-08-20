# DeepSeek Harness Desktop v1.4.0

[中文](RELEASE_NOTES.zh.md)

Windows x64, macOS Apple Silicon, and Linux x64 desktop release · 2026-08-20

v1.4.0 upgrades the kernel to 0.1.0-rc.8, reworks the Learning interaction and teaching-state flow, and moves `view_image` onto the kernel's native attachment and model services. The Windows x64 artifacts are also rebuilt and verified under the new distribution identity.

## Learning Mode

- **Unified Learning UI**: teaching visuals and optional understanding checks now share design tokens, card styling, and focus behavior. Figures use one Tab stop with arrow-key navigation, screen-reader announcements, and structured text alternatives.
- **More natural teaching flow**: ordinary answers remain the default. Non-blocking visuals appear only when they materially help, and understanding checks are reserved for moments that change the next teaching move instead of creating repeated Reveal/Continue steps.
- **Session-scoped learning routes**: complex goals can keep a tentative route of up to six steps, advanced only by evidence the learner provides. State survives refresh, resume, and message compaction while remaining isolated after reset or session forks.
- **Reliable visual state**: session updates no longer rewind sequences, collapse revealed recall cards, or resample curves. A composition without the Learning Client now reports the visual as unavailable and falls back to a complete prose explanation.

## Vision and Kernel

- **Kernel upgrade to rc.8**: the pinned DeepSeek Harness kernel moves from 0.1.0-rc.7 to 0.1.0-rc.8, and the desktop baseline is rebuilt as v1.4.0.
- **`view_image` on the native model path**: images are committed through the attachment service and sent to a configured image-capable model over the kernel LLM channel, reusing existing provider credentials, retries, and usage metering instead of maintaining a separate endpoint or API key.
- **Capability-based model selection**: when no model is pinned, the bridge selects the first catalog route that declares image input; unavailable or explicitly text-only pinned models return actionable configuration guidance.

## Release & Update Reliability

- **Synchronized release identity**: the bundled release manifest, updater checks, installer filenames, desktop documentation, and release-notes metadata all target v1.4.0.
- **Verified artifact refresh**: the Windows ZIP and Setup installer are rebuilt from the current source, re-tested with native addon smoke checks, and accompanied by fresh SHA-256 values.
- **Existing desktop capabilities retained**: the transparent plugin marketplace, native image attachments, no-console launcher, and overwrite-install recovery remain available.

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
