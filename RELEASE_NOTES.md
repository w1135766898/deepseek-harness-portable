# DeepSeek Harness for Win v1.2.0

[中文](RELEASE_NOTES.zh.md)

Windows x64 portable release · 2026-08-16

This is the v1.2.0 release of this Windows distribution, delivering native WSL Linux Bash support for the Minimal Agent Preset to achieve complete alignment with the official DeepSeek RL training environment, alongside integrated environment diagnostics and error recovery guidance.

## New Features

- **Minimal Agent Preset on Windows via WSL Linux Bash**: Full alignment with the official DeepSeek RL training distribution (Linux, Bash, stty, PS1, and marker protocol), executing seamlessly on Windows via `wsl.exe`.
- **Win32 ProcessInspector Stub & Full Access Isolation**: Injected a dedicated Win32 process inspector stub to prevent `signalForeground` session tear-downs, and isolated the `danger-full-access` sandbox policy within the minimal preset to bypass restricted-token barriers on Hyper-V and user directories.
- **Desktop WSL Environment Diagnostic & Guide**: Direct visibility into the host WSL readiness status from the desktop menu, with a one-click dialog to copy the `wsl --install` command.
- **Runtime Launch Error Translation**: Intercepts terminal launch errors and presents structured bilingual troubleshooting suggestions with recommendations for standard mode (PowerShell).

## Improvements

- **Hardened WSL Availability Probing**: Strips UTF-16 Byte Order Marks (BOM) and verifies non-empty distribution lists to prevent false positives when WSL is enabled without distributions.
- **On-Demand Menu Freshness**: Re-probes WSL status on menu interaction in milliseconds, updating without requiring an application restart after WSL installation.

## Components

- Distribution: 1.2.0
- Desktop shell: 0.1.0-shell.2
- Kernel: 0.1.0-rc.5 (@deepseek-ai/dsh-web-app)
- Tag: v1.2.0

## Checksums and security

- The final portable ZIP and Setup installer SHA-256 values are recorded in SHA256SUMS.txt and attached to the GitHub Release.
- Verify SHA256SUMS.txt before launching downloaded files.
- The executable is unsigned; Windows SmartScreen or Smart App Control may warn or block it.
- Conversations, credentials, settings, attachments, and desktop preferences stay outside the release directory during updates.
