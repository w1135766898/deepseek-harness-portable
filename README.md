# DeepSeek Harness portable Windows distributions

English | [中文](README.zh.md)

This directory documents the personal Windows distribution channel for DeepSeek Harness. The native desktop shell is an unpacked Electron directory; the single-file Web executable starts the local Web server and opens it in the default browser. Neither artifact is an official signed release.

## Download

Download the complete `DeepSeek Harness-win32-x64` directory for the native desktop shell, or download `dsh-desktop-web-<version>-win-x64.exe` for the single-file browser launcher. Keep every file in the native directory together.

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
