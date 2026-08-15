# DeepSeek Harness for Win v1.1.2

[中文](RELEASE_NOTES.zh.md)

Windows x64 portable release · 2026-08-15

Community distribution, not an official Microsoft-signed build.

## Fixes

- Unified the Update Hub modal to a stable 620 × 660 px base size across Release Notes and About. About content is now centered inside the shared container instead of shrinking the modal to 440 × 340 px.
- Removed modal width/height transitions and keyword-size interpolation, preventing the close button, footer actions, and visual focus from jumping during tab changes.
- Kept narrow windows responsive through shared modal width/height variables, while preventing header titles and tabs from wrapping unexpectedly.

## Improvements

- Synchronized the desktop shell locale with the Harness setting so shell menus, release notes, and About use the selected language consistently.
- Hardened the updater launcher and post-update loopback health probe, including safer process handling and reliable exit-status reporting.
- Preserved strict portable-runtime source consistency checks, release manifests, archive layout validation, and generated SHA-256 checksums before publishing.

## Components

- Distribution: 1.1.2
- Desktop shell: 0.1.0-shell.2
- Kernel: 0.1.0-rc.5 (@deepseek-ai/dsh-web-app)
- Tag: v1.1.2

## Checksums and security

- The final portable ZIP and Setup SHA-256 values are recorded in `SHA256SUMS.txt` and the GitHub Release assets.
- Verify SHA256SUMS.txt before launching downloaded files.
- The executable is unsigned; Windows SmartScreen may warn.
- Conversations, credentials, settings, and attachments stay outside the release directory during updates.
