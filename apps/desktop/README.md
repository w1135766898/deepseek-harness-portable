# dsh-desktop-web-pkg

English | [中文](README.zh.md)

This private workspace package builds the native Electron desktop shell for the DeepSeek Harness Web surface.

## Native desktop shell

Run pnpm run desktop:package:win from the repository root to build dist-desktop/electron/DeepSeek Harness-win32-x64/DeepSeek Harness.exe. The output directory is portable: copy or zip the complete directory and run the executable on Windows x64 without installing Node.js.

The Electron shell starts the existing dsh web runtime on loopback, embeds the returned URL in a BrowserWindow, keeps a tray icon, remembers the selected workspace, and uses apps/desktop/assets/deepseek.ico for the window, tray, and Windows executable icon.

## Runtime behavior

The distribution binds the Web server to 127.0.0.1 and sets DSH_TELEMETRY_DISABLED=1. The Electron shell stores its workspace preference and runtime home below Electron's per-user data directory, hides the window when it is closed, and stops the child runtime when the application quits.

Set the DeepSeek API key in the Web UI settings or in the environment used to launch the executable. Workspace selection and other application data are user data, not files inside the read-only packaged application directory.

## Development

Use Node.js ^22.19.0 || >=24 and pnpm. From the repository root, run pnpm install, pnpm run desktop:test, pnpm run desktop:dev, or pnpm run desktop:package:win. The native build downloads Electron during dependency installation and targets Windows x64.

## Limitations

The native output is an unpacked portable directory, not an installer. It is not code-signed and has no auto-update channel, so Windows SmartScreen may warn when the executable is first run. The checked-in icon is derived from the existing Web favicon; release signing and installer branding remain separate work.
