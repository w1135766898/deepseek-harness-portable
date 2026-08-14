# DeepSeek Harness portable Windows distribution

English | [中文](README.zh.md)

This repository produces a community Windows x64 distribution of DeepSeek Harness. The package is an Electron desktop shell plus a portable `runtime/` directory. It is not an official Microsoft-signed build.

## Install

- **Setup installer:** download `DeepSeek-Harness-Setup-<version>-win32-x64.exe` from Releases.
- **Online installer:** run `install.ps1` from this repository. It accepts only a release ZIP whose SHA-256 digest is published with the release.
- **Portable ZIP:** download `DeepSeek-Harness-<version>-win32-x64.zip`, verify `SHA256SUMS.txt`, and extract it without renaming the `runtime/` directory.

The installer and updater verify the ZIP digest and required native modules before installing. They do not create certificates or modify Windows trust stores.

## Portable layout and launchers

```text
DeepSeek Harness-win32-x64/
├── dsh.cmd
├── start-web.cmd
├── start-desktop.cmd
├── update.ps1
├── setup-shortcuts.ps1
└── runtime/                 # Electron executable and application dependencies
```

- `start-desktop.cmd` launches the bundled Electron shell.
- `start-web.cmd` runs the web entry through a Node.js installation in `PATH`; `dsh.cmd` provides the same web entry and supports `dsh update`.
- `setup-shortcuts.ps1` creates a shortcut and adds the portable root to the user `PATH`.

## Updates

Run `dsh update` or `update.ps1`. The updater downloads the complete portable ZIP, verifies its SHA-256 digest, validates the application manifest and native modules, and swaps the `runtime/` directory as one operation. User data is kept outside the release tree.

## Build and release

On Windows x64 with Node.js `^22.19.0 || >=24` and pnpm:

```powershell
pnpm install
pnpm run build
pnpm run desktop:release:win
```

The release command takes the version from `apps/desktop/package.json`, builds the portable tree, emits the ZIP and (when Inno Setup is installed) Setup.exe, then writes `SHA256SUMS.txt` last.

## Security and release status

The desktop executable is currently unsigned by a certificate issued through a trusted commercial CA. SmartScreen or Smart App Control may therefore warn or block it. A self-signed certificate or importing one into the current user's stores does not satisfy Smart App Control and is intentionally not performed by this project.

- Verify the downloaded ZIP and Setup.exe against the published SHA-256 values before running them.
- If your organization requires trusted executables, use a build signed through an approved CA, Microsoft Artifact Signing, or an enterprise code-signing policy.
- The local web server is loopback-only by default. Do not place API keys in the repository or release directory.

See Microsoft's [Smart App Control overview](https://learn.microsoft.com/en-us/windows/apps/develop/smart-app-control/overview) and [SmartScreen reputation guidance](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/smartscreen-reputation) for the platform's signing requirements.

DeepSeek Harness is licensed under [MIT](LICENSE). Third-party notices are in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
