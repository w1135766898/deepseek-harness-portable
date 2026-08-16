# DeepSeek Harness for Win v1.2.3

[中文](RELEASE_NOTES.zh.md)

Windows x64 portable release · 2026-08-16

This is the v1.2.3 release of this Windows distribution, reinforcing native WSL Linux Bash integration to flawlessly reproduce DeepSeek's native "We need / Let's" RL Chain-of-Thought (CoT) reasoning flow, integrating Vision Bridge settings into the Web UI API proxy, and polishing desktop UI interactions.

## New Features & Improvements

- **Native WSL Environment Bridge & "We need / Let's" CoT Reproduction**: DeepSeek's official Reinforcement Learning (RL) training runs in Linux Bash environments. On Windows, executing the official Minimal Preset inside genuine WSL Linux Bash avoids PowerShell token/syntax divergence and perfectly reproduces the model's native step-by-step reasoning (*"We need to...", "Let's check...", "Let's run..."*).
- **Vision Bridge API Proxy Integration**: Dynamically injects the `@dsh-portable/vision-bridge` settings schema into the Web UI `apiProxy`, enabling live multi-provider configuration validation and management directly in official Settings.
- **Desktop UI Interaction Optimization**: Refined menu accordion expansion animations, streamlined text phrasing, modernized SVG icons, and verified monolingual in-app release notes viewer.
- **Documentation & "Why Us" Value Proposition**: Added in-depth comparison documentation detailing the advantages of this Windows portable distribution over upstream Linux-centric builds.

## Components

- Distribution: 1.2.3
- Desktop shell: 0.1.0-shell.2
- Kernel: 0.1.0-rc.5 (@deepseek-ai/dsh-web-app)
- Tag: v1.2.3

## Checksums and security

- The final portable ZIP and Setup installer SHA-256 values are recorded in SHA256SUMS.txt and attached to the GitHub Release.
- Verify SHA256SUMS.txt before launching downloaded files.
- The executable is unsigned; Windows SmartScreen or Smart App Control may warn or block it.
- Conversations, credentials, settings, attachments, and desktop preferences stay outside the release directory during updates.
