# DeepSeek Harness for Win v1.0.5

[中文](RELEASE_NOTES.zh.md)

Windows x64 portable release · 2026-08-15

Community distribution, not an official Microsoft-signed build.

## Features

- Portable updates download and verify inside the desktop app with visible progress before restart confirmation.
- A verified update package can remain ready while the user continues working until restart is confirmed.

## Improvements

- Update metadata follows HTTP redirects and races GitHub with several mirror sources.
- The updater receives the prepared local package instead of downloading the same release twice.
- Standalone updates use shorter timeouts, multiple mirror fallbacks, and explicit target versions.

## Fixes

- Stable releases no longer compare below prerelease tags such as rc versions.
- API fallback no longer repeats the full checksum lookup for every mirror response.

## Components

- Distribution: 1.0.5
- Desktop shell: 0.1.0-shell.2
- Kernel: 0.1.0-rc.5 (@deepseek-ai/dsh-web-app)
- Tag: v1.0.5

## Checksums and security

- Portable ZIP SHA-256: `4104F67DC3D58F18611D99B54325F9DE37EA24BF84FF0CDC5812C955B88D4C5A`
- Setup SHA-256: `2F0C3305B55E7023533A3F3AB36A0A15BF485F948AE557DEFFDF74648BFA03CC`
- Verify SHA256SUMS.txt before launching.
- The executable is unsigned; Windows SmartScreen may warn.
- Conversations, credentials, settings, and attachments stay outside the release directory during updates.
