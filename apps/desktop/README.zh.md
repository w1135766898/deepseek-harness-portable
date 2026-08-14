# DeepSeek Harness for Win — 桌面外壳

中文 / English

这个 workspace 包构建 DeepSeek Harness for Win v1.0.0 的原生 Electron 桌面外壳。它会在回环地址启动现有 Web runtime，将页面嵌入 BrowserWindow，并保留托盘图标提供桌面操作。

This workspace package builds the native Electron desktop shell for DeepSeek Harness for Win v1.0.0. It starts the existing Web runtime on loopback, embeds it in a BrowserWindow, and keeps a tray icon.

## 运行能力 / Runtime features

- 在 127.0.0.1 启动打包的 dsh Web runtime。
- 将工作区选择保存在 Electron 用户数据中。
- 用户数据默认保存在官方 DSH_HOME 根目录，即 %USERPROFILE%\.dsh。
- 托盘和应用菜单提供工作区、浏览器模式、更新、更新日志和关于入口。
- 从 GitHub 或配置的镜像获取双语发布说明，并支持缓存和本地清单离线降级。
- 在 update.ps1 执行前显示应用内更新摘要，版本变化后首次启动显示 What's New 卡片。

- Starts the packaged dsh Web runtime on 127.0.0.1.
- Remembers the workspace in Electron user data.
- Keeps runtime data under DSH_HOME, %USERPROFILE%\.dsh by default.
- Provides tray and application menu actions for updates, release notes, and About.
- Uses GitHub or the configured mirror with cached and bundled offline fallback.

## 构建与测试 / Build and test

使用 Node.js ^22.19.0 或 >=24，以及 pnpm：

Use Node.js ^22.19.0 or >=24 and pnpm:

    pnpm install
    pnpm run build
    pnpm run desktop:test
    pnpm run desktop:dev
    pnpm run desktop:package:win

输出是 Windows x64 便携目录：

The output is a portable Windows x64 directory:

    dist-desktop/electron/DeepSeek Harness-win32-x64/
    └─ runtime/DeepSeek Harness.exe

## 发布身份 / Release identity

- 发布 / Release：DeepSeek Harness for Win v1.0.0
- 分发 / Distribution：1.0.0
- 外壳 / Desktop shell：0.1.0-shell.1
- 内核 / Kernel：读取打包后的 @deepseek-ai/dsh-web-app manifest

release-manifest.json 会写入 runtime 同级目录，记录分发版本、桌面外壳版本、内核版本、内核 Git 提交和本地发布说明。

The release manifest records the distribution, desktop shell, kernel, kernel Git commit, and bundled release notes.

## 用户数据与安全 / User data and security

外壳将 Web 服务绑定到回环地址，并设置 DSH_TELEMETRY_DISABLED=1。工作区设置和桌面端发布说明状态保存在 Electron 用户数据中，不会写入打包应用目录。

The shell binds the Web server to loopback and sets DSH_TELEMETRY_DISABLED=1. Workspace settings and release-note state are stored in Electron user data.

请在 Web UI 设置中配置 DeepSeek API key，或在启动环境中提供。当前可执行文件没有可信商业 CA 签名，首次运行时 Windows SmartScreen 可能发出警告。

Set the DeepSeek API key in Web UI settings or the launch environment. The executable is not signed by a trusted commercial CA, so SmartScreen may warn on first run.

## 卸载 / Uninstall

Setup 卸载器和便携版卸载脚本默认保留会话、凭据、设置、附件和桌面偏好；只有明确确认后才会删除数据。

The Setup uninstaller and portable scripts keep conversations, credentials, settings, attachments, and desktop preferences unless removal is explicitly confirmed.
