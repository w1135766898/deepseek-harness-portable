# DeepSeek Harness for Win v1.2.2

[中文](RELEASE_NOTES.zh.md)

Windows x64 portable release · 2026-08-16

This is the v1.2.2 release of this Windows distribution, introducing the Vision Bridge plugin (@dsh-portable/vision-bridge) to equip text-only models with multimodal visual inspection capabilities through external OpenAI-compatible vision models.

## New Features & Improvements

- **Vision Bridge Plugin (`@dsh-portable/vision-bridge`)**: Equips text-only models with vision capabilities by delegating image analysis to OpenAI-compatible vision models (GPT-4o, Qwen-VL, GLM-4V, local Ollama, etc.).
- **Global `view_image` Tool**: Automatically inspects PNG, JPEG, WebP, and GIF images, intelligently resolves relative file paths against current session cwd, checks file bounds, and securely encodes base64 Data URLs.
- **Official Settings UI Slot Integration**: Mounts a dedicated configuration card inside the official `Settings → Plugins` tab, featuring live provider presets, configuration validation, and write-only API key security protection.
- **Zero-Modification Architecture**: Implemented cleanly through Cordis microkernel plugin slots and profile overlays, keeping upstream `vendor/deepseek-harness` 100% untouched.

## Components

- Distribution: 1.2.2
- Desktop shell: 0.1.0-shell.2
- Kernel: 0.1.0-rc.5 (@deepseek-ai/dsh-web-app)
- Tag: v1.2.2

## Checksums and security

- The final portable ZIP and Setup installer SHA-256 values are recorded in SHA256SUMS.txt and attached to the GitHub Release.
- Verify SHA256SUMS.txt before launching downloaded files.
- The executable is unsigned; Windows SmartScreen or Smart App Control may warn or block it.
- Conversations, credentials, settings, attachments, and desktop preferences stay outside the release directory during updates.
