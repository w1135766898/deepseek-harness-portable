# DeepSeek Harness for Win

[English](README.md)

DeepSeek Harness for Win 是 DeepSeek Harness 的社区 Windows x64 分发版，由 Electron 桌面外壳和便携式 runtime 运行目录组成，不是 Microsoft 官方签名版本。

## 最新发布

- 发布：DeepSeek Harness for Win v1.0.1
- 标签：v1.0.1
- 下载：[GitHub Release](https://github.com/wsnxxxs/deepseek-harness-portable/releases/tag/v1.0.1)
- 分发版本：1.0.1
- 桌面外壳：0.1.0-shell.2
- 内核：0.1.0-rc.5

请阅读[中文发布说明](RELEASE_NOTES.zh.md)，或在桌面端托盘菜单中打开“更新日志”。

## 安装

1. **Setup 安装包：** 从 Releases 下载 DeepSeek-Harness-Setup-<version>-win32-x64.exe。
2. **在线安装：** 运行仓库中的 install.ps1。脚本只接受带可信 SHA-256 摘要的 release ZIP。
3. **便携 ZIP：** 下载 DeepSeek-Harness-<version>-win32-x64.zip，先核对 SHA256SUMS.txt，再解压完整目录，不要重命名 runtime。
4. **卸载：** 运行 uninstall.cmd 或 uninstall.ps1。除非明确确认删除，否则会保留用户数据。

安装器和更新器会校验 ZIP 摘要、发布清单、应用清单以及必要的原生模块，不会创建证书，也不会修改 Windows 信任存储。

## 便携目录结构

    DeepSeek Harness-win32-x64/
    ├─ dsh.cmd                    命令行入口
    ├─ start-web.cmd              浏览器模式入口
    ├─ start-desktop.cmd         桌面模式入口
    ├─ update.ps1                便携版更新器
    ├─ setup-shortcuts.ps1       快捷方式和 PATH 设置
    ├─ release-manifest.json     分发/外壳/内核版本清单
    └─ runtime/                  Electron 可执行文件和应用依赖

不要删除或重命名 runtime 目录。

## 启动与更新

- start-desktop.cmd 启动内置 Electron 桌面端。
- start-web.cmd 使用 PATH 中的 Node.js 启动网页版。
- dsh.cmd 提供同样的网页版入口，并支持 dsh update。
- 桌面托盘菜单提供“检查更新”“更新日志”和“关于”。
- 检测到新版本时，桌面外壳会先展示发布摘要，再启动便携版更新器。
- 升级后首次启动会显示 What's New 欢迎卡片。会话、凭据、设置和附件保存在发布目录之外的用户数据中。

更新器会下载完整便携 ZIP，校验 SHA-256、发布清单和原生依赖，最后以一次整体替换的方式更新 runtime。

## 构建与发布

环境要求：Windows x64、Node.js ^22.19.0 或 >=24、pnpm。

    pnpm install
    pnpm run build
    pnpm run desktop:test
    pnpm run desktop:release:win

桌面包保留三层独立版本：

- distributionVersion：公开 Windows release 标签、ZIP 和 Setup 版本。
- desktop shell version：Electron 外壳包版本。
- kernel version：打包进来的 @deepseek-ai/dsh-web-app 内核版本。

发布命令会生成 release-manifest.json，并最后写入 SHA256SUMS.txt。准备新版本时，请同步更新 RELEASE_NOTES.md、RELEASE_NOTES.zh.md 和 apps/desktop/src/release-notes.json。

便携包会同时包含中文说明 使用说明.txt 和英文说明 使用说明.en.txt，需要时可按语言打开对应文件。

## 安全与限制

当前桌面可执行文件没有可信商业 CA 签名，Windows SmartScreen 或 Smart App Control 可能发出警告或阻止运行。本项目不会自动创建自签名证书，也不会把证书导入信任存储。

- 运行下载文件前请先核对发布的 SHA-256 值。
- 本地 Web 服务默认只绑定回环地址。
- 不要把 API key 放入仓库或发布目录。
- 如果组织要求可信可执行文件，请使用受认可的 CA、Microsoft Artifact Signing 或企业代码签名策略。

参考 [Smart App Control](https://learn.microsoft.com/en-us/windows/apps/develop/smart-app-control/overview) 和 [SmartScreen reputation guidance](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/smartscreen-reputation)。

## 许可证

DeepSeek Harness 使用 [MIT](LICENSE) 许可证，第三方声明见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
