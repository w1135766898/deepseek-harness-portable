# DeepSeek Harness for Win

[中文](README.zh.md)

DeepSeek Harness for Win is a community Windows x64 distribution of DeepSeek Harness. It combines the Electron desktop shell with a portable runtime directory. It is not an official Microsoft-signed build.

## Latest release

- Release: DeepSeek Harness for Win v1.1.3
- Tag: v1.1.3
- Download: [GitHub Release](https://github.com/wsnxxxs/deepseek-harness-portable/releases/tag/v1.1.3)
- Distribution version: 1.1.3
- Desktop shell: 0.1.0-shell.2
- Kernel: 0.1.0-rc.5

Read the [English release notes](RELEASE_NOTES.md) or open Release Notes from the desktop tray menu.

## Install

1. **Setup installer:** download DeepSeek-Harness-Setup-<version>-win32-x64.exe from Releases.
2. **Online installer:** run install.ps1 from this repository. It only accepts a release ZIP with a trusted SHA-256 digest.
3. **Portable ZIP:** download DeepSeek-Harness-<version>-win32-x64.zip, verify SHA256SUMS.txt, then extract the complete directory without renaming runtime.
4. **Uninstall:** run uninstall.cmd or uninstall.ps1. User data is kept unless you explicitly confirm removal.

The installer and updater verify the ZIP digest, release manifest, application manifest, and required native modules. They do not create certificates or modify Windows trust stores.

## Portable layout

    DeepSeek Harness-win32-x64/
    ├─ dsh.cmd
    ├─ start-web.cmd
    ├─ start-desktop.cmd
    ├─ update.ps1
    ├─ setup-shortcuts.ps1
    ├─ release-manifest.json
    └─ runtime/                 Electron executable and application dependencies

Do not delete or rename the runtime directory.

## Launch and update

- start-desktop.cmd launches the bundled Electron desktop shell.
- start-web.cmd starts the web surface through Node.js from PATH.
- dsh.cmd provides the same web entry and supports dsh update.
- The desktop tray menu provides Check for Updates, Release Notes, and About.
- When a new release is found, the desktop shell downloads and verifies it in-app with progress before asking to restart.
- Update notices use a centered, transient banner below the title bar; they slide away and are destroyed after seven seconds or dismissal, with an optional per-version "Do not remind me again" choice.
- The native sidebar logo is blue and opens the desktop menu when the sidebar is expanded; in the collapsed state, left click still expands the sidebar and right click opens the menu.
- Release Notes and About open in a centered card-style Update Hub with a locally scrolling history timeline.
- The Windows shell uses Mica/title-bar overlay styling, a staged startup splash, system theme synchronization, and persisted multi-monitor-safe window bounds.

The updater verifies the prepared portable ZIP again, validates the release manifest and native dependencies, then replaces runtime as one operation after restart confirmation.

## Build and release

Requirements: Windows x64, Node.js ^22.19.0 or >=24, and pnpm.

This repository includes the matching DeepSeek Harness source workspace as a pinned Git submodule at `vendor/deepseek-harness`. It supplies the `@deepseek-ai/*` packages and builds the embedded Web runtime locally; the release process does not need an existing portable ZIP as its build input.

On a fresh clone, initialize the source workspace once:

    pnpm run desktop:bootstrap

After that, the normal build and release commands are:

    pnpm install
    pnpm run build
    pnpm run desktop:test
    pnpm run desktop:release:win

The desktop package keeps three version identities:

- distributionVersion: the public Windows release tag, ZIP, and Setup version.
- desktop shell version: the Electron shell package version.
- kernel version: the packaged @deepseek-ai/dsh-web-app version.

The release command builds the upstream Web runtime, builds the desktop shell, writes release-manifest.json, and writes SHA256SUMS.txt last. When preparing a release, update RELEASE_NOTES.md, RELEASE_NOTES.zh.md, and apps/desktop/src/release-notes.json together.

`dist-desktop/` is a generated build directory and may be deleted after a release. The source needed for the next build remains in `vendor/deepseek-harness`; do not commit `node_modules/` or a portable ZIP as a substitute for the source workspace.

The portable package includes a Chinese quick guide at 使用说明.txt and an English quick guide at 使用说明.en.txt.

## Security and limitations

The desktop executable is currently not signed by a trusted commercial CA. Windows SmartScreen or Smart App Control may warn or block it. This project does not automatically create a self-signed certificate or import certificates into trust stores.

- Verify the published SHA-256 values before running downloaded files.
- The local web server binds to loopback by default.
- Do not put API keys in the repository or release directory.
- If trusted executables are required, use an approved CA, Microsoft Artifact Signing, or an enterprise signing policy.

See Microsoft's [Smart App Control overview](https://learn.microsoft.com/en-us/windows/apps/develop/smart-app-control/overview) and [SmartScreen reputation guidance](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/smartscreen-reputation).

## License

DeepSeek Harness is licensed under [MIT](LICENSE). Third-party notices are in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
