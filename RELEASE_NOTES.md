# DeepSeek Harness for Win v1.0.6

[中文](RELEASE_NOTES.zh.md)

Windows x64 portable release · 2026-08-15

Community distribution, not an official Microsoft-signed build.

## Features

- Update notices now appear as a compact, centered banner below the title bar and slide upward before being destroyed after seven seconds or dismissal.
- A per-version "Do not remind me again" action persists the ignored version and clears the main-process notice cache.
- The native sidebar logo is branded blue and opens the desktop menu in the expanded state; the collapsed state keeps left-click sidebar expansion and adds right-click menu access.

## Improvements

- The desktop menu is positioned from the native logo and reflows within the viewport instead of reserving a separate floating trigger.
- The compact notice layout adapts to narrow windows and honors reduced-motion preferences.
- Release Notes and About remain in the same-window drawer while the update UI no longer leaves a persistent corner control.

## Fixes

- Duplicate logo overlap and the stale folded notification node are removed from the desktop shell.
- Dismissed notices no longer reappear for the same version after a refresh.

## Components

- Distribution: 1.0.6
- Desktop shell: 0.1.0-shell.2
- Kernel: 0.1.0-rc.5 (@deepseek-ai/dsh-web-app)
- Tag: v1.0.6

## Checksums and security

- Portable ZIP SHA-256: `B05743443CB0BB8CBB4CB8BC2BB114D92C5B15E98B190F8D02A6D86A6E960317`
- Setup SHA-256: `4DA26E0BCA75DC3BA10DC2634C30869EF870F98BF6F056E7485765FA273641E7`
- Verify SHA256SUMS.txt before launching.
- The executable is unsigned; Windows SmartScreen may warn.
- Conversations, credentials, settings, and attachments stay outside the release directory during updates.
