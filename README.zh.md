# DeepSeek Harness for Win

中文 / English

DeepSeek Harness for Win 是 DeepSeek Harness 的社区 Windows x64 分发版，由 Electron 桌面外壳和便携式 runtime 运行目录组成，不是 Microsoft 官方签名版本。

DeepSeek Harness for Win is a community Windows x64 distribution of DeepSeek Harness. It combines the Electron desktop shell with a portable runtime directory and is not an official Microsoft-signed build.

## 最新发布 / Latest release

- 发布 / Release：DeepSeek Harness for Win v1.0.1
- 标签 / Tag：v1.0.1
- 下载 / Download：[GitHub Release](https://github.com/wsnxxxs/deepseek-harness-portable/releases/tag/v1.0.1)
- 分发版本 / Distribution：1.0.1
- 桌面外壳 / Desktop shell：0.1.0-shell.2
- 内核 / Kernel：0.1.0-rc.5

完整发布说明见 [RELEASE_NOTES.md](RELEASE_NOTES.md)，也可以在桌面端托盘菜单中打开“Release Notes / 更新日志”。

See [RELEASE_NOTES.md](RELEASE_NOTES.md) or open “Release Notes / 更新日志” from the desktop tray menu.

## 安装 / Install

1. **Setup 安装包 / Setup installer**：从 Releases 下载 DeepSeek-Harness-Setup-<version>-win32-x64.exe。
2. **在线安装 / Online installer**：运行仓库中的 install.ps1。脚本只接受带可信 SHA-256 摘要的 release ZIP。
3. **便携 ZIP / Portable ZIP**：下载 DeepSeek-Harness-<version>-win32-x64.zip，先核对 SHA256SUMS.txt，再解压完整目录，不要重命名 runtime。
4. **卸载 / Uninstall**：运行 uninstall.cmd 或 uninstall.ps1。除非明确确认删除，否则会保留用户数据。

安装器和更新器会校验 ZIP 摘要、发布清单、应用清单以及必要的原生模块，不会创建证书，也不会修改 Windows 信任存储。

The installer and updater verify the ZIP digest, release manifest, application manifest, and native modules. They do not create certificates or modify Windows trust stores.

## 便携目录 / Portable layout

    DeepSeek Harness-win32-x64/
    ├─ dsh.cmd
    ├─ start-web.cmd
    ├─ start-desktop.cmd
    ├─ update.ps1
    ├─ setup-shortcuts.ps1
    ├─ release-manifest.json
    └─ runtime/                 Electron 可执行文件和应用依赖

不要删除或重命名 runtime 目录。

Do not delete or rename the runtime directory.

## 启动与更新 / Launch and update

- start-desktop.cmd：启动内置 Electron 桌面端。
- start-web.cmd：使用 PATH 中的 Node.js 启动网页版。
- dsh.cmd：提供网页版入口，并支持 dsh update。
- 桌面托盘菜单提供“检查更新”“更新日志”和“关于”。
- 检测到新版本时，会先展示双语发布摘要，再启动 update.ps1。
- 升级后首次启动会显示 What's New 欢迎卡片；会话、凭据、设置和附件保存在发布目录之外。

- start-desktop.cmd launches the bundled Electron desktop shell.
- start-web.cmd starts the web surface through Node.js from PATH.
- dsh.cmd provides the web entry and supports dsh update.
- The desktop tray menu provides Check for Updates, Release Notes, and About.
- A bilingual release summary is shown before update.ps1 starts.
- The first startup after an upgrade shows a What's New card; user data stays outside the release directory.

更新器会下载完整便携 ZIP，校验 SHA-256、发布清单和原生依赖，最后整体替换 runtime。

The updater downloads a complete portable ZIP, verifies SHA-256 and native dependencies, and replaces runtime as one operation.

## 构建与发布 / Build and release

环境要求 / Requirements：Windows x64、Node.js ^22.19.0 或 >=24、pnpm。

    pnpm install
    pnpm run build
    pnpm run desktop:test
    pnpm run desktop:release:win

桌面包保留三层独立版本：

- distributionVersion：公开 Windows release 标签、ZIP 和 Setup 版本。
- desktop shell version：Electron 外壳包版本。
- kernel version：@deepseek-ai/dsh-web-app 内核版本。

The desktop package keeps three version identities:

- distributionVersion: public Windows release tag, ZIP, and Setup version.
- desktop shell version: Electron shell package version.
- kernel version: packaged @deepseek-ai/dsh-web-app version.

发布命令会生成 release-manifest.json，并最后写入 SHA256SUMS.txt。准备新版本时，请同步更新 RELEASE_NOTES.md 和 apps/desktop/src/release-notes.json。

The release command writes release-manifest.json and SHA256SUMS.txt last. Update RELEASE_NOTES.md and apps/desktop/src/release-notes.json together for a new release.

## 安全与限制 / Security and limitations

当前桌面可执行文件没有可信商业 CA 签名，Windows SmartScreen 或 Smart App Control 可能发出警告或阻止运行。本项目不会自动创建自签名证书，也不会把证书导入信任存储。

The desktop executable is not signed by a trusted commercial CA. SmartScreen or Smart App Control may warn or block it; this project does not create or import certificates automatically.

- 运行下载文件前请先核对发布的 SHA-256 值。
- 本地 Web 服务默认只绑定回环地址。
- 不要把 API key 放入仓库或发布目录。
- 如需可信可执行文件，请使用受认可的 CA、Microsoft Artifact Signing 或企业代码签名策略。

- Verify published SHA-256 values before running downloads.
- The local Web server binds to loopback by default.
- Do not put API keys in the repository or release directory.
- Use an approved CA, Microsoft Artifact Signing, or enterprise signing policy when trusted executables are required.

参考 / References：[Smart App Control](https://learn.microsoft.com/en-us/windows/apps/develop/smart-app-control/overview)、[SmartScreen reputation guidance](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/smartscreen-reputation)。

## 许可证 / License

DeepSeek Harness 使用 [MIT](LICENSE) 许可证，第三方声明见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。

DeepSeek Harness is licensed under [MIT](LICENSE). Third-party notices are in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
