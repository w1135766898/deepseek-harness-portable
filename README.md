# DeepSeek Harness portable Windows distributions

English | [中文](README.zh.md)

This directory documents the personal Windows distribution channel for DeepSeek Harness. The native desktop shell is an unpacked Electron directory; the single-file Web executable starts the local Web server and opens it in the default browser. Neither artifact is an official signed release.

## Download

Download the complete `DeepSeek Harness-win32-x64` directory for the native desktop shell, or download `dsh-desktop-web-<version>-win-x64.exe` for the single-file browser launcher. Keep every file in the native directory together.

## Why this project

This is a distribution layer for DeepSeek Harness itself, not a replacement chat client. The Web UI and plugin runtime remain the Harness product, including its profiles, sessions, skills, tools, workspace flow, and composable plugin graph; this repository adds a Windows delivery path around that runtime.

The comparison below uses adjacent public projects as reference points rather than treating different product categories as direct substitutes. Repositories change over time; the notes describe their public README and release model checked on 2026-08-14.

| Project | Primary focus | What this project adds for a Windows user |
| --- | --- | --- |
| [Eddie0521/turn-deepseek-into-desktop](https://github.com/Eddie0521/turn-deepseek-into-desktop) | Minimal native macOS wrapper with one-command install, menu-bar residency, loopback binding, and telemetry disabled. | The same wrapper direction is carried to Windows x64, with both an unpacked Electron shell and a single-file browser launcher; the portable artifacts do not require Xcode or an installer. |
| [doxdk/deepseek-desktop](https://github.com/doxdk/deepseek-desktop) | Electron desktop access to the DeepSeek chat site, with localStorage/cookies and an installer-oriented flow. | Packages the DeepSeek Harness agent runtime rather than only a chat page, while keeping profiles, plugins, sessions, tools, and workspace behavior; the single-file build can run without installation. |
| [DeepFundAI/ai-browser](https://github.com/DeepFundAI/ai-browser) | A broader Electron/Next.js AI browser with multimodal automation, scheduling, social integrations, file management, and multiple providers. | Keeps the scope focused on DeepSeek Harness fidelity and offers a smaller, easier-to-copy Windows distribution instead of requiring an application build environment. |
| [RealZST/HarnessKit](https://github.com/RealZST/HarnessKit) | A cross-agent management center for skills, MCP servers, plugins, hooks, configs, and rules. | Optimizes for running one complete Harness runtime faithfully, with a native window/tray mode and a browser mode that share the same packaged backend. |

### Main advantages

- **Upstream fidelity:** the desktop layer wraps the real DeepSeek Harness composition instead of reimplementing a parallel chat or agent client.
- **Two Windows modes:** use the native Electron window with tray controls, or a single `.exe` that starts the loopback Web UI and opens the default browser.
- **Actual portability:** the browser launcher has no installer requirement and keeps its `.dsh` home beside the executable by default; `DSH_HOME` can relocate it explicitly.
- **Local-first operation:** the server binds to `127.0.0.1` by default, desktop-channel telemetry is disabled, and API keys are entered at runtime rather than embedded in the artifact.
- **Practical Windows packaging:** the build includes the application icon, packaged runtime dependencies, shipped presets, and the supporting notices needed to move the distribution as a folder or a single file.

This narrower focus is intentional: HarnessKit and AI Browser cover broader multi-agent or automation management, while this project aims to make the DeepSeek Harness experience itself easy to carry and launch on Windows.

## Use the native desktop shell

Run `DeepSeek Harness.exe`. The shell starts the local runtime, displays the Web UI in its own window, keeps a tray entry, remembers the selected workspace, and uses the DeepSeek icon. Closing the window hides it; use the tray menu to quit or restart.

## Use the single-file launcher

Run the `.exe` to start the local Web server and open the default browser. Pass `--no-open` when another launcher should open the UI. The server binds to `127.0.0.1`; the selected port is reported by the executable.

Set `DEEPSEEK_API_KEY` in the launch environment or enter it in the Web UI settings. Both distributions disable telemetry for the local desktop channel.

## Data and portability

The native shell stores preferences and runtime data under Electron's per-user data directory. The single-file launcher uses `DSH_HOME` when provided and otherwise keeps its portable `.dsh` home beside the executable. Copy the native directory or the single-file executable together with its `.dsh` directory when moving a portable setup.

Delete the relevant user-data directory to reset a local setup. Do not put API keys in a repository or share them with the executable.

## Rebuild

From a Windows x64 checkout with Node.js `^22.19.0 || >=24` and pnpm:

```powershell
pnpm install
pnpm run build
pnpm run desktop:package:win
pnpm exec tsx scripts/build-desktop-web-exe.ts
```

The native output is written to `dist-desktop/electron/`; the single-file output is written to `dist-exe/`. The build downloads Electron and the SEA Node base on first use.

## Security and release status

The local Web server is loopback-only by default. The executables are not code-signed, do not include an installer or auto-update channel, and may trigger a Windows SmartScreen warning on first launch.

Some antivirus products (observed with Huorong/火绒) silently quarantine unsigned pkg/Electron executables on first write or download. Verify the SHA-256 checksum published with each release; if your antivirus flags the file, restore it from quarantine or add an exclusion for the directory, then re-check the checksum before running.

DeepSeek Harness is licensed under [MIT](LICENSE). Third-party notices are in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
