# dsh-desktop-web-pkg

English | [中文](README.zh.md)

This private workspace package builds the native Electron desktop shell for the DeepSeek Harness Web surface.

## Native desktop shell

Run pnpm run desktop:package:win from the repository root to build dist-desktop/electron/DeepSeek Harness-win32-x64/DeepSeek Harness.exe. The output directory is portable: copy or zip the complete directory and run the executable on Windows x64 without installing Node.js.

The Electron shell starts the existing dsh web runtime on loopback, embeds the returned URL in a BrowserWindow, keeps a tray icon, remembers the selected workspace, and uses apps/desktop/assets/deepseek.ico for the window, tray, and Windows executable icon.

## Runtime behavior

The distribution binds the Web server to 127.0.0.1 and sets DSH_TELEMETRY_DISABLED=1. The Electron shell stores only its desktop-specific workspace preference below Electron's per-user data directory; the Harness runtime uses the official `DSH_HOME` root (`%USERPROFILE%\.dsh` by default). It hides the window when it is closed and stops the child runtime when the application quits.

Set the DeepSeek API key in the Web UI settings or in the environment used to launch the executable. Workspace selection and other application data are user data, not files inside the read-only packaged application directory.

## Uninstall and user data

The Setup uninstaller removes the application files and asks whether to delete local user data. Choosing **No** keeps conversations, credentials, settings, attachments, and desktop preferences for a future reinstall.

For a portable install, run `uninstall.cmd` or `uninstall.ps1` from the portable root. The same keep-data default applies; explicitly confirm the data-removal prompt to remove the official `DSH_HOME` root and Electron desktop data.

## Development

Use Node.js ^22.19.0 || >=24 and pnpm. From the repository root, run pnpm install, pnpm run desktop:test, pnpm run desktop:dev, or pnpm run desktop:package:win. The native build downloads Electron during dependency installation and targets Windows x64.

## Limitations

The native output is an unpacked portable directory, not an installer. It is not code-signed, so Windows SmartScreen may warn when the executable is first run. Release builds carry an independent desktop-shell version and distribution version in addition to the packaged kernel version. The checked-in icon is derived from the existing Web favicon; release signing and installer branding remain separate work.
