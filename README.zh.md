# DeepSeek Harness Windows 便携版

[English](README.md) | 中文

本仓库生成 DeepSeek Harness 的社区 Windows x64 分发包。产物由 Electron 桌面外壳和 `runtime/` 运行目录组成，不是 Microsoft 官方签名版本。

## 安装

- **Setup 安装包：** 从 Releases 下载 `DeepSeek-Harness-Setup-<version>-win32-x64.exe`。
- **在线安装：** 运行仓库中的 `install.ps1`。脚本只接受带有可信 SHA-256 清单的发布 ZIP。
- **便携 ZIP：** 下载 `DeepSeek-Harness-<version>-win32-x64.zip`，先核对 `SHA256SUMS.txt`，再解压且不要改动 `runtime/` 目录名。

安装器和更新器会校验 ZIP 摘要、应用清单及原生模块；不会创建证书，也不会修改 Windows 信任存储。

## 目录和启动

```text
DeepSeek Harness-win32-x64/
├── dsh.cmd
├── start-web.cmd
├── start-desktop.cmd
├── update.ps1
├── setup-shortcuts.ps1
└── runtime/                 # Electron 可执行文件和应用依赖
```

- `start-desktop.cmd` 启动内置 Electron 桌面窗口。
- `start-web.cmd` 使用 `PATH` 中的 Node.js 启动网页版；`dsh.cmd` 提供相同入口并支持 `dsh update`。
- `setup-shortcuts.ps1` 创建桌面快捷方式并把便携根目录加入当前用户 `PATH`。

## 更新

运行 `dsh update` 或 `update.ps1`。更新器下载完整便携 ZIP，校验 SHA-256，检查应用清单和原生模块，然后整体替换 `runtime/`；用户数据保存在发布目录之外。

## 构建和发布

在 Windows x64、Node.js `^22.19.0 || >=24` 和 pnpm 环境中运行：

```powershell
pnpm install
pnpm run build
pnpm run desktop:release:win
```

发布命令读取 `apps/desktop/package.json` 的版本，构建便携目录，生成 ZIP；安装了 Inno Setup 时同时生成 Setup.exe，最后一步重算 `SHA256SUMS.txt`。

## 安全与发布状态

当前桌面可执行文件没有由受信任商业 CA 签发的代码签名，因此 SmartScreen 或 Smart App Control 可能发出警告或阻止运行。自签名证书或把证书导入当前用户存储不能满足 Smart App Control，本项目不会自动执行这种操作。

- 运行前请用发布的 SHA-256 值核对 ZIP 和 Setup.exe。
- 如果组织要求受信任的可执行文件，请使用获批准的 CA、Microsoft Artifact Signing 或企业代码签名策略重新签名。
- 本地 Web 服务默认只监听回环地址；不要把 API key 放进仓库或发布目录。

可参考 Microsoft 的 [Smart App Control 说明](https://learn.microsoft.com/en-us/windows/apps/develop/smart-app-control/overview) 和 [SmartScreen 声誉指南](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/smartscreen-reputation)。

DeepSeek Harness 使用 [MIT](LICENSE) 许可证，第三方声明见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
