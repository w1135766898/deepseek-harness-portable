# DeepSeek Harness Desktop

[English](README.md) · [发布说明](RELEASE_NOTES.zh.md) · [Issues](https://github.com/wsnxxxs/deepseek-harness-portable/issues)

[![Release](https://img.shields.io/github/v/release/wsnxxxs/deepseek-harness-portable)](https://github.com/wsnxxxs/deepseek-harness-portable/releases/latest)
[![Platform](https://img.shields.io/badge/platform-Windows%20x64%20%7C%20macOS%20arm64%20%7C%20Linux%20x64-blue)](https://github.com/wsnxxxs/deepseek-harness-portable/releases)
[![License](https://img.shields.io/github/license/wsnxxxs/deepseek-harness-portable)](LICENSE)

DeepSeek Harness Desktop 是 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的社区 Windows x64、macOS Apple Silicon 与 Linux x64 分发版，由 Electron 桌面外壳和平台原生 runtime 组成，不是 Microsoft 官方签名、Apple 公证或 Linux 发行版签名版本。

## 目录

- [为什么选择 DeepSeek Harness Desktop？](#为什么选择-deepseek-harness-desktop)
- [平台支持](#平台支持)
- [快速开始](#快速开始)
- [功能特性](#功能特性)
- [最新发布](#最新发布)
- [安装](#安装)
- [便携目录结构](#便携目录结构)
- [用户数据与API密钥](#用户数据与api密钥)
- [启动与更新](#启动与更新)
- [常见问题](#常见问题)
- [项目文档](#项目文档)
- [构建与发布](#构建与发布)
- [安全与限制](#安全与限制)
- [许可证](#许可证)

## 为什么选择 DeepSeek Harness Desktop？

上游 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 主要面向 POSIX Shell 与容器环境。本分发版增加原生 Electron 外壳、平台运行时适配、可验证的发布打包和便携更新链路；对上游的适配集中在受审查补丁和 Cordis 扩展点中，避免散落修改。

应用自带 Electron/Node.js runtime，用户数据保存在应用目录之外，并提供工作区选择、更新诊断、插件市场、视觉工具和交互式学习预设等桌面集成功能。

## 平台支持

| 平台 | 安装包 | 极简模式 Shell | 更新方式 | 重要要求 |
| --- | --- | --- | --- | --- |
| Windows x64 | Setup 或便携 ZIP | 通过 WSL 使用 Bash | 应用内校验下载、重启和回滚 | 默认 WSL 发行版可用且包含 Bash |
| macOS Apple Silicon | DMG | 通过 POSIX PTY 使用原生 `/bin/bash` | 打开发布页，手动替换 | 当前 DMG 未签名且未公证 |
| Linux x64 | AppImage 或 deb | 通过 POSIX PTY 使用原生 `/bin/bash` | 打开发布页，手动替换 | 沙箱模式需要可用的 bwrap/Landlock 后端 |

安装包已包含应用 runtime，普通用户无需安装 Node.js 或 pnpm。开发构建要求见[构建与发布](#构建与发布)。

## 快速开始

1. 从[最新发布](https://github.com/wsnxxxs/deepseek-harness-portable/releases/latest)下载 Windows Setup/ZIP、macOS 的 `DeepSeek-Harness-<version>-darwin-arm64.dmg`，或 Linux 的 `DeepSeek-Harness-<version>-linux-x64.AppImage`。
2. Windows 运行安装程序；Linux/macOS 下载并检查 Release 中的 `install.sh` 后运行 `sh install.sh`，也可继续手动安装 AppImage/deb 或 DMG。
3. 启动 **DeepSeek Harness**，在 Web UI 的“设置”中配置 DeepSeek API key（或在启动进程的环境中提供）。

首次启动前，请核对与安装包一同发布的校验值。需要使用极简模式的 Windows 用户还应确认 `wsl -- bash -lc true` 能正常执行。

## 功能特性

- 内置原生 Electron 桌面外壳与 DeepSeek Harness Web runtime，在回环地址启动。
- 支持工作区选择、浏览器模式、托盘/应用菜单、更新历史、关于信息和诊断导出。
- Windows 支持应用内检查更新、下载进度、SHA-256 校验、重启确认和回滚；Linux/macOS 提供发布页手动下载流程。
- 原生侧边栏 Logo 集成桌面菜单、系统主题同步、Windows 11 Mica/标题栏样式、macOS 原生菜单、分阶段启动过渡，以及适配多显示器的窗口状态记忆。
- 极简模式在 Windows 使用 WSL Bash，在 Linux/macOS 使用原生 `/bin/bash` POSIX PTY；Linux 沙箱模式遵循上游 bwrap/Landlock 失败关闭策略。
- 预装可移除的插件市场，支持 GitHub 分页搜索、一键安装、插件更新管理和 Agent 市场工具。

## 最新发布

| 项目 | 版本 |
| --- | --- |
| 发布 | DeepSeek Harness Desktop **v1.3.2**（[下载](https://github.com/wsnxxxs/deepseek-harness-portable/releases/tag/v1.3.2)) |
| 分发版本 | 1.3.2 |
| 桌面外壳 | 0.1.0-shell.2 |
| 内核 | 0.1.0-rc.7 |

请阅读[中文发布说明](RELEASE_NOTES.zh.md)，或在桌面端托盘菜单中打开“更新日志”。

## 安装

1. **Windows Setup 安装包：** 从 Releases 下载 `DeepSeek-Harness-Setup-<version>-win32-x64.exe` 并运行。
2. **Windows 在线安装：** 运行仓库中的 `install.ps1`。脚本只接受带可信 SHA-256 摘要的 release ZIP。参数：`-InstallDir <路径>`（默认 `%LOCALAPPDATA%\Programs\DeepSeek Harness`）、`-NoDesktopShortcut`、`-Force`。
3. **Windows 便携 ZIP：** 下载 `DeepSeek-Harness-<version>-win32-x64.zip`，先核对 `SHA256SUMS.txt`，再解压完整目录，不要重命名 `runtime`。
4. **Linux/macOS 校验安装：** 从同一个 Release 下载 `install.sh` 与 `SHA256SUMS-install.txt`，校验并检查脚本后运行 `sh install.sh`。脚本只选择已支持的原生目标，并在安装前使用 `SHA256SUMS-<target>.txt` 校验 AppImage/DMG。Linux 默认安装到 `~/.local/opt/deepseek-harness`，同时创建 `~/.local/bin/deepseek-harness` 和桌面入口；macOS 默认安装到 `~/Applications`。可使用 `--version <版本>`、`--install-dir <路径>` 或 `--help`。
5. **macOS Apple Silicon（手动）：** 下载 `DeepSeek-Harness-<version>-darwin-arm64.dmg`，核对 `SHA256SUMS-darwin-arm64.txt`，打开后将应用拖入“应用程序”。当前 DMG 未签名且未公证；安装脚本不会绕过 Gatekeeper。
6. **Linux x64 AppImage（手动）：** 下载 `DeepSeek-Harness-<version>-linux-x64.AppImage`，核对校验值，运行 `chmod +x DeepSeek-Harness-<version>-linux-x64.AppImage` 后启动。
7. **Linux x64 deb（手动）：** 下载 `DeepSeek-Harness-<version>-linux-x64.deb`，运行 `sudo apt install ./DeepSeek-Harness-<version>-linux-x64.deb` 安装。
8. **卸载：** 使用平台常规的应用移除流程。Windows 便携包包含卸载脚本；除非明确删除，否则会保留用户数据。

> **注意：** `setup-shortcuts.ps1`（安装程序以及便携包中的 `创建桌面快捷方式.bat` 会调用它）会创建指向无控制台 GUI 启动器的桌面快捷方式，并把便携目录加入**用户 PATH**；卸载程序会一并移除这两项。

安装器和更新器会校验 ZIP 摘要、发布清单、应用清单以及必要的原生模块，不会创建证书，也不会修改 Windows 信任存储。

## 便携目录结构

    DeepSeek Harness-win32-x64/
    ├─ dsh.cmd                     命令行入口：网页模式、`dsh update`、`dsh desktop`、`dsh trust`
    ├─ pnpm.cmd                    插件管理使用的内置包管理器入口
    ├─ start-web.cmd               使用内置 Electron/Node runtime 的浏览器模式入口
    ├─ DeepSeek Harness Launcher.exe  无控制台桌面启动与更新恢复入口
    ├─ start-desktop.cmd           控制台诊断与恢复后备入口
    ├─ update.ps1                  便携版更新器
    ├─ setup-shortcuts.ps1         快捷方式和 PATH 设置
    ├─ release-manifest.json       分发/外壳/内核版本清单
    ├─ 启动桌面版.bat               桌面启动（双击友好）
    ├─ 启动桌面窗口.bat             桌面窗口启动（同上）
    ├─ 启动网页版.bat               网页启动，缺 Node.js 时回退桌面端
    ├─ 在线更新.bat                 更新启动
    ├─ 创建桌面快捷方式.bat         快捷方式/PATH 设置启动
    ├─ 一键解除拦截(自签名信任).bat  签名说明；刻意不创建证书
    ├─ 使用说明.txt                 中文快速指南
    ├─ 使用说明.en.txt              英文快速指南
    └─ runtime/                    Electron 可执行文件和应用依赖

不要删除或重命名 Windows 的 `runtime` 目录。macOS 使用正常的 `.app` Bundle 结构。

Linux AppImage 和 deb 包内含原生 Electron runtime 与桌面入口。未压缩的 Linux 构建目录还会在 `runtime/` 旁提供 `start-desktop.sh`、`start-web.sh`、`dsh.sh` 和 `portable-pnpm.sh`。

## 用户数据与API密钥

- 会话、凭据、设置、附件和桌面偏好保存在**应用目录之外**：Windows 为 `%USERPROFILE%\.dsh`，Linux/macOS 为 `$HOME/.dsh`（可通过 `DSH_HOME` 环境变量覆盖）。更新后数据保留，除非明确删除否则不会移除。
- 在 Web UI **设置**中配置 DeepSeek API key，或在启动进程的环境中提供。
- 桌面外壳将 Web 服务绑定到回环地址，并设置 `DSH_TELEMETRY_DISABLED=1`。

## 启动与更新

- Windows 快捷方式与便携版用户使用 `DeepSeek Harness Launcher.exe`，在保留更新恢复能力的同时不打开命令行窗口；`start-desktop.cmd` 保留为控制台诊断后备入口。Linux 使用 AppImage/deb 的桌面入口或未压缩目录中的 `start-desktop.sh`；macOS 从“应用程序”启动应用。
- Windows 使用 `start-web.cmd`（或 `启动网页版.bat`），Linux 使用 `start-web.sh`，通过内置 Electron/Node runtime 启动网页版，无需安装系统 Node.js。
- Windows 的 `dsh.cmd` 提供同样的网页版入口、内置插件管理 CLI，并支持分发版子命令：`dsh update`、`dsh desktop`、`dsh trust`。
- 桌面托盘菜单提供“检查更新”“更新日志”和“关于”。
- 检测到 Windows 新版本时，桌面外壳会在应用内显示下载与校验进度，完成后再询问是否重启。Linux/macOS 使用同一个菜单打开发布页，由用户手动下载最新 AppImage/deb 或 DMG；应用不会自行替换安装目录。
- 更新通知以标题栏下方的轻量横幅显示，可按版本选择“不再提示”；“更新日志”和“关于”在卡片式更新中心内打开。具体行为详见[发布说明](RELEASE_NOTES.zh.md)。

## 常见问题

**为什么 Windows 提示可执行文件未签名？**
当前桌面可执行文件没有可信商业 CA 签名，SmartScreen 可能显示警告。请先核对发布的 SHA-256 值（见[安全与限制](#安全与限制)），然后选择**更多信息 → 仍要运行**。本项目刻意不创建自签名证书，也不修改信任存储。

**Smart App Control 是什么？能运行吗？**
Smart App Control 可能直接阻止未签名的应用。如果设备已启用该功能，可能需要为应用将其关闭，或使用经企业批准、CA 签名的构建。参考 Microsoft 的 [Smart App Control 概述](https://learn.microsoft.com/en-us/windows/apps/develop/smart-app-control/overview)。

**需要安装 Node.js 吗？**
不需要。桌面模式、浏览器/网页模式、DSH 插件 CLI 和 pnpm 均使用 Electron 内置的 Node.js runtime。

**我的数据存在哪里？**
在 `%USERPROFILE%\.dsh`（或 `$DSH_HOME`），位于应用目录之外。见[用户数据与API密钥](#用户数据与api密钥)。

**更新检查失败了怎么办？**
更新中心会显示错误状态和重试入口，不会阻塞主界面。Windows 也可以直接运行便携版更新器：`dsh update`、`在线更新.bat` 或 `update.ps1`；Linux/macOS 请打开发布页手动下载最新平台产物。

**macOS 极简模式需要 WSL 或 Docker 吗？**
不需要。Apple Silicon macOS 上，极简模式通过原生 POSIX PTY 和 `/bin/bash` 运行，并使用 macOS runtime 的原生进程与沙箱支持。

**Linux 极简模式需要 WSL 或 Docker 吗？**
不需要。Linux 直接使用原生 POSIX PTY 和 `/bin/bash`；沙箱模式优先使用上游 `bwrap`，回退到 Landlock 时若无法实际执行约束会失败关闭，不会静默降级为无沙箱运行。

**为什么极简模式中的长命令会超时？**
极简模式会原样执行模型给出的 Shell 命令。对 vendor 工作区使用递归 `grep` 还会扫描嵌套依赖目录，确实可能超过工具超时；建议改用会遵守忽略规则的 `rg`，或显式排除 `node_modules`。Windows 超时时，桌面桥接只会强制终止该终端对应的 `wsl.exe` 进程树；Linux/macOS 终止原生 POSIX PTY。

## 项目文档

| 文档 | 适用读者 | 内容 |
| --- | --- | --- |
| [桌面外壳说明](apps/desktop/README.zh.md) | 桌面端贡献者 | Electron 行为、原生产物目录、测试和发布身份 |
| [运行时架构与发布门禁](docs/runtime-architecture.md) | Runtime 与发布维护者 | 能力探测、模式契约、Manifest、CI 和签名门禁 |
| [交互式学习包](apps/interactive-learning/README.zh.md) | 功能贡献者 | 协议边界、开发流程、启用方式和兼容性 |
| [发布说明](RELEASE_NOTES.zh.md) | 用户与维护者 | 用户可见变更和升级信息 |

## 构建与发布

*面向维护者和贡献者。*

环境要求：Node.js ^22.19.0 或 >=24、pnpm。Windows 发布构建运行于 Windows x64；macOS 发布构建运行于 Apple Silicon macOS，并使用系统自带的 `hdiutil`、`sips` 和 `iconutil`；Linux 发布构建运行于原生 Linux x64，需要 `musl-gcc`、`bwrap`/Landlock 测试环境和 `dpkg-deb`。AppImage/deb 由 `electron-builder` 负责打包。

仓库通过固定 Git submodule `vendor/deepseek-harness` 内置匹配版本的 DeepSeek Harness 源码 workspace。它提供桌面外壳所需的 `@deepseek-ai/*` 包，并在本地构建嵌入式 Web runtime；发布流程不再需要把已有便携 ZIP 作为构建输入。

首次 clone 后只需初始化一次：

    pnpm run desktop:bootstrap

之后必须在目标原生主机上打包。打包流程会执行真实能力探测、写入实测模式目录和文件清单、对含 manifest 的最终应用字节再次冒烟、生成平台容器，最后写出不可变的已验证 bundle：

    pnpm install
    pnpm run desktop:package:win

Windows 已验证 bundle 位于 `dist-desktop/verified/win32-x64/`。发布是独立的只复制操作，必须显式传入该目录：

    pnpm run desktop:release:win -- --input dist-desktop/verified/win32-x64

构建 macOS Apple Silicon DMG：

    pnpm run desktop:package:mac
    pnpm run desktop:release:mac -- --input dist-desktop/verified/darwin-arm64

构建 Linux x64 AppImage 和 deb（必须在原生 Linux x64 主机执行）：

    pnpm run desktop:package:linux
    pnpm run desktop:release:linux -- --input dist-desktop/verified/linux-x64

产物位于 `dist-desktop/electron/linux-artifacts/`，未压缩 runtime 位于
`dist-desktop/electron/DeepSeek Harness-linux-x64/`。官方上游 Landlock launcher
会使用 `musl-gcc` 本地编译并暂存进 Linux runtime；launcher 缺失或 Landlock
内核不可用时，运行时仍保持失败关闭。

打包流程会为源码 workspace 生成指纹，并在输入未变化时复用已成功的编译、运行时部署、补丁和 Electron 产物层。排查干净构建时，可向 package 命令传入 `--no-cache`；需要有意打包现有编译产物时，仍可使用 `--skip-build`。release 命令不接受构建参数、不运行测试、不打补丁、不签名、也不重建压缩包；它只会重新校验 `artifact-verification.json` 指定的精确字节并复制它们。

桌面包保留三层独立版本：

- `distributionVersion`：公开 release 标签，以及对应平台的 ZIP、Setup、AppImage/deb 或 DMG 产物版本。
- 桌面外壳版本：Electron 外壳包版本。
- 内核版本：打包进来的 `@deepseek-ai/dsh-web-app` 版本。

原生 package CI matrix 是平台支持的唯一权威：Linux 使用原生 Linux x64，Windows 使用带可用 WSL distribution 和 Inno Setup 的原生 x64 runner，macOS 使用原生 Apple Silicon runner。交叉构建或未在本机实测的产物不能获得 verification record；release workflow 只消费这些记录，不重新构建。

当前本地包均标记为 `non-official-unsigned`。正式发布会失败关闭，直至附加目标特定证据：Windows Authenticode、macOS 签名与公证、Linux 外部包签名。`--allow-non-official` 仅是维护者发布 prerelease 的显式开关，不会改变产物分类。详见[运行时架构与发布门禁](docs/runtime-architecture.md)。准备新版本时，请同步更新 `RELEASE_NOTES.md`、`RELEASE_NOTES.zh.md` 和 `apps/desktop/src/release-notes.json`。

`dist-desktop/` 是可重建的临时构建目录，发布后可以删除。下一次构建所需的源码保存在 `vendor/deepseek-harness` 中；不要用 `node_modules/` 或便携 ZIP 替代源码提交到仓库。

## 安全与限制

- 运行下载文件前请先核对发布的 SHA-256 值。
- 当前本地 Windows、Linux、macOS 包均明确属于非正式未签名产物；正式发布通道在缺少 TargetSpec 的签名/公证证据时会拒绝发布。
- 本地 Web 服务默认只绑定回环地址。
- 不要把 API key 放入仓库或发布目录。
- 市场条目是从 GitHub 发现的第三方代码。安装前请审查插件仓库和权限；安装过程可能运行包构建脚本，插件会获得其 Cordis 组合所声明的能力。
- 如果组织要求可信可执行文件，请使用受认可的 CA、Microsoft Artifact Signing 或企业代码签名策略。

参考 [Smart App Control](https://learn.microsoft.com/en-us/windows/apps/develop/smart-app-control/overview) 和 [SmartScreen reputation guidance](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/smartscreen-reputation).

## 许可证

DeepSeek Harness 使用 [MIT](LICENSE) 许可证，第三方声明见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。上游源码：[deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness)。
