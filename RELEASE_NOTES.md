# DeepSeek Harness for Win v1.1.3

[中文](RELEASE_NOTES.zh.md)

Windows x64 portable release · 2026-08-15

Community distribution, not an official Microsoft-signed build.

## Fixes

- Restored the polished blue native whale menu trigger without overriding pointer behavior for unrelated controls or disabled buttons.
- Kept the native logo menu path connected to Release Notes, Check for Updates, and About after the visual branding override.
- Changed manual update-check failures to open the centered Update Hub with a clear error state and retry action instead of blocking the main window with a native dialog.

## Improvements

- The desktop shell, embedded Web runtime, and release package can now be rebuilt from the pinned `vendor/deepseek-harness` source workspace.
- Release packaging continues to validate the runtime source copy, release manifest, archive layout, and SHA-256 checksums before publishing.
- Generated build directories and TypeScript caches are excluded from the source tree; release binaries are published as GitHub Release assets.

## Components

- Distribution: 1.1.3
- Desktop shell: 0.1.0-shell.2
- Kernel: 0.1.0-rc.5 (@deepseek-ai/dsh-web-app)
- Tag: v1.1.3

## Checksums and security

- The final portable ZIP and Setup SHA-256 values are recorded in `SHA256SUMS.txt` and the GitHub Release assets.
- Verify `SHA256SUMS.txt` before launching downloaded files.
- The executable is unsigned; Windows SmartScreen may warn.
- Conversations, credentials, settings, and attachments stay outside the release directory during updates.
