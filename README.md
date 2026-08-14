# DeepSeek Harness for Win

English / 中文

DeepSeek Harness for Win is a community Windows x64 distribution of DeepSeek Harness. It combines the Electron desktop shell with a portable runtime directory. It is not an official Microsoft-signed build.

DeepSeek Harness for Win 是 DeepSeek Harness 的社区 Windows x64 分发版，由 Electron 桌面外壳和便携式 runtime 运行目录组成，不是 Microsoft 官方签名版本。

## Latest release / 最新发布

- Release / 发布：DeepSeek Harness for Win v1.0.1
- Tag / 标签：v1.0.1
- Download / 下载：[GitHub Release](https://github.com/wsnxxxs/deepseek-harness-portable/releases/tag/v1.0.1)
- Distribution version / 分发版本：1.0.1
- Desktop shell / 桌面外壳：0.1.0-shell.2
- Kernel / 内核：0.1.0-rc.5

The complete release notes are available in [RELEASE_NOTES.md](RELEASE_NOTES.md) and inside the desktop app from the tray menu.

完整发布说明见 [RELEASE_NOTES.md](RELEASE_NOTES.md)，也可以在桌面端托盘菜单中打开“Release Notes / 更新日志”。

## Install / 安装

1. **Setup installer / Setup 安装包**：download DeepSeek-Harness-Setup-<version>-win32-x64.exe from Releases.
2. **Online installer / 在线安装**：run install.ps1 from this repository. It only accepts a release ZIP with a trusted SHA-256 digest.
3. **Portable ZIP / 便携 ZIP**：download DeepSeek-Harness-<version>-win32-x64.zip, verify SHA256SUMS.txt, then extract the complete directory without renaming runtime.
4. **Uninstall / 卸载**：run uninstall.cmd or uninstall.ps1. User data is kept unless you explicitly confirm removal.

The installer and updater verify the ZIP digest, release manifest, application manifest, and required native modules. They do not create certificates or modify Windows trust stores.

安装器和更新器会校验 ZIP 摘要、发布清单、应用清单以及必要的原生模块，不会创建证书，也不会修改 Windows 信任存储。

## Portable layout / 便携目录结构

    DeepSeek Harness-win32-x64/
    ├─ dsh.cmd
    ├─ start-web.cmd
    ├─ start-desktop.cmd
    ├─ update.ps1
    ├─ setup-shortcuts.ps1
    ├─ release-manifest.json
    └─ runtime/                 Electron executable and application dependencies

    DeepSeek Harness-win32-x64/
    ├─ dsh.cmd                    命令行入口
    ├─ start-web.cmd              浏览器模式入口
    ├─ start-desktop.cmd          桌面模式入口
    ├─ update.ps1                 便携版更新器
    ├─ setup-shortcuts.ps1        快捷方式和 PATH 设置
    ├─ release-manifest.json      分发/外壳/内核版本清单
    └─ runtime/                   Electron 可执行文件和应用依赖

Do not delete or rename the runtime directory.

不要删除或重命名 runtime 目录。

## Launch and update / 启动与更新

- start-desktop.cmd launches the bundled Electron desktop shell.
- start-web.cmd starts the web surface through Node.js from PATH.
- dsh.cmd provides the same web entry and supports dsh update.
- The desktop tray menu provides Check for Updates, Release Notes, and About.
- When a new release is found, the desktop shell shows the bilingual release summary before starting update.ps1.
- After an upgrade, the first startup shows a What's New card. Sessions, credentials, settings, and attachments remain in user data outside the release directory.

- start-desktop.cmd 启动内置 Electron 桌面端。
- start-web.cmd 使用 PATH 中的 Node.js 启动网页版。
- dsh.cmd 提供同样的网页版入口，并支持 dsh update。
- 桌面托盘菜单提供“检查更新”“更新日志”和“关于”。
- 检测到新版本时，桌面外壳会先展示双语发布摘要，再启动 update.ps1。
- 升级后首次启动会显示 What's New 欢迎卡片。会话、凭据、设置和附件保存在发布目录之外的用户数据中。

The updater downloads a complete portable ZIP, verifies SHA-256, validates the release manifest and native dependencies, then replaces runtime as one operation.

更新器会下载完整便携 ZIP，校验 SHA-256、发布清单和原生依赖，最后以一次整体替换的方式更新 runtime。

## Build and release / 构建与发布

Requirements / 环境要求：Windows x64, Node.js ^22.19.0 or >=24, and pnpm.

    pnpm install
    pnpm run build
    pnpm run desktop:test
    pnpm run desktop:release:win

The desktop package keeps three version identities:

- distributionVersion: the public Windows release tag, ZIP, and Setup version.
- desktop shell version: the Electron shell package version.
- kernel version: the packaged @deepseek-ai/dsh-web-app version.

桌面包保留三层独立版本：

- distributionVersion：公开 Windows release 标签、ZIP 和 Setup 版本。
- desktop shell version：Electron 外壳包版本。
- kernel version：打包进来的 @deepseek-ai/dsh-web-app 内核版本。

The release command writes release-manifest.json and writes SHA256SUMS.txt last. Update RELEASE_NOTES.md and apps/desktop/src/release-notes.json together when preparing a new release.

发布命令会生成 release-manifest.json，并最后写入 SHA256SUMS.txt。准备新版本时，请同步更新 RELEASE_NOTES.md 和 apps/desktop/src/release-notes.json。

## Security and limitations / 安全与限制

The desktop executable is currently not signed by a trusted commercial CA. Windows SmartScreen or Smart App Control may warn or block it. This project does not automatically create a self-signed certificate or import certificates into trust stores.

当前桌面可执行文件没有可信商业 CA 签名，Windows SmartScreen 或 Smart App Control 可能发出警告或阻止运行。本项目不会自动创建自签名证书，也不会把证书导入信任存储。

- Verify the published SHA-256 values before running downloaded files.
- The local web server binds to loopback by default.
- Do not put API keys in the repository or release directory.
- If trusted executables are required, use an approved CA, Microsoft Artifact Signing, or an enterprise signing policy.

- 运行下载文件前请先核对发布的 SHA-256 值。
- 本地 Web 服务默认只绑定回环地址。
- 不要把 API key 放入仓库或发布目录。
- 如果组织要求可信可执行文件，请使用受认可的 CA、Microsoft Artifact Signing 或企业代码签名策略。

See Microsoft's [Smart App Control overview](https://learn.microsoft.com/en-us/windows/apps/develop/smart-app-control/overview) and [SmartScreen reputation guidance](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/smartscreen-reputation).

## License / 许可证

DeepSeek Harness is licensed under [MIT](LICENSE). Third-party notices are in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

DeepSeek Harness 使用 [MIT](LICENSE) 许可证，第三方声明见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
