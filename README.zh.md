# DeepSeek Harness for Win

[English](README.md) · [发布说明](RELEASE_NOTES.zh.md) · [Issues](https://github.com/wsnxxxs/deepseek-harness-portable/issues)

[![Release](https://img.shields.io/github/v/release/wsnxxxs/deepseek-harness-portable)](https://github.com/wsnxxxs/deepseek-harness-portable/releases/latest)
[![Platform](https://img.shields.io/badge/platform-Windows%20x64-blue)](https://github.com/wsnxxxs/deepseek-harness-portable/releases)
[![License](https://img.shields.io/github/license/wsnxxxs/deepseek-harness-portable)](LICENSE)

DeepSeek Harness for Win 是 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的社区 Windows x64 分发版，由 Electron 桌面外壳和便携式 runtime 运行目录组成，不是 Microsoft 官方签名版本。

## 目录

- [为什么选择我们？（Why Us）](#为什么选择我们why-us)
- [快速开始](#快速开始)
- [功能特性](#功能特性)
- [最新发布](#最新发布)
- [安装](#安装)
- [便携目录结构](#便携目录结构)
- [用户数据与API密钥](#用户数据与api密钥)
- [启动与更新](#启动与更新)
- [常见问题](#常见问题)
- [构建与发布](#构建与发布)
- [安全与限制](#安全与限制)
- [许可证](#许可证)

## 为什么选择我们？（Why Us）

DeepSeek 官方 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 主要面向 Linux/macOS 命令行与容器环境。Windows 用户直接使用时常面临终端兼容性、工具调用分歧与繁琐的环境配置。**DeepSeek Harness for Win** 为 Windows 平台量身打造，在保持 100% 原生微内核纯净的同时提供开箱即用的卓越桌面与 Agent 体验：

1. **原生 WSL 深度融合与 "We need / Let's" 思维链复现**：
   - **强化学习环境对齐**：DeepSeek 官方模型（如 DeepSeek-R1、DeepSeek-V3 Agent 循环）的强化学习（RL）训练基于标准 Linux Bash 环境，模型形成了鲜明的链式规划与分步推理模式（标志性的 *"We need to...", "Let's check...", "Let's run..."* 思考链）。
   - **规避 Windows PowerShell 差异**：在 Windows 原生环境下，PowerShell 的语法规则、路径反斜杠（`\`）、参数格式及别名机制容易打破模型的 Token 概率分布，导致指令幻觉、语法报错或思维链中断。
   - **深度桥接方案**：本项目通过 WSL 原生 Linux Bash 桥接、Win32 终端检查器桩与 `danger-full-access` 隔离沙箱策略，在 Windows 上完整运行官方极简预设（Minimal Preset），完美复现 DeepSeek 原生 "We need / Let's" 链式推理（CoT）与工具执行流。
2. **开箱即用便携桌面版**：
   - 内置独立 Node.js 与 Electron 桌面外壳，免装 Node/pnpm 等开发环境，双击即开即用。
   - 用户数据严格隔离于 `%USERPROFILE%\.dsh`（`$DSH_HOME`），支持便携目录整体移动或放入 U 盘随身携带。
   - 深度适配 Windows 11 Mica 质感、原生标题栏、侧边栏 Logo 融合菜单、系统深浅色同步与分阶段启动过渡。
3. **视觉辅助多模态外挂（`@dsh-portable/vision-bridge`）**：
   - 为纯文本大模型（如 DeepSeek-V3 / R1）接入外部 OpenAI 兼容端点与高性价比多模态模型（如 Gemini 3.7 Flash、Mimo V2.5 等），赋予模型看图、UI分析与图表识别能力。
   - 全局 `view_image` 工具无缝集成至官方【设置 → 插件】槽位，支持服务商预设一键切换、即时测试与 API Key 纯写脱敏保护。
4. **预装插件市场（`dsh-plugin-marketplace`）**：
   - 在【设置 → 插件】中增加可搜索的“插件市场”和“已安装”页签，实时读取 GitHub `dsh-plugin` 话题。
   - 内置供 Agent 搜索、安装、检查和更新插件的工具。每个 Web profile 只预装一次，用户关闭或卸载后不会被自动恢复。
5. **无感极速原子化更新**：
   - 引入运行时后台预解压（Staging）机制，在软件运行期间透明完成下载、SHA-256 完整性校验与解压布局检查。
   - 重启替换耗时仅 1~2 秒，配备完善的事务备份与异常自动回滚保障。
6. **零侵入微内核架构**：
   - 所有 Windows 适配与功能插件均通过 Cordis 微内核插件机制与运行时 Overlay 动态挂载，保持 upstream `vendor/deepseek-harness` 100% 原生纯净，无缝跟随官方上游迭代。

## 快速开始

1. 从[最新发布](https://github.com/wsnxxxs/deepseek-harness-portable/releases/latest)下载 `DeepSeek-Harness-Setup-<version>-win32-x64.exe`（或使用便携 ZIP，见[安装](#安装)）。
2. 运行安装程序。如果 SmartScreen 对未签名的可执行文件发出警告，请选择**更多信息 → 仍要运行**（见[常见问题](#常见问题)）。
3. 从桌面快捷方式或托盘启动 **DeepSeek Harness**。
4. 在 Web UI 的**设置**中配置你的 DeepSeek API key（或在启动进程的环境中提供）。

## 功能特性

- 内置原生 Electron 桌面外壳与 DeepSeek Harness Web runtime，在回环地址启动。
- 支持工作区选择、浏览器模式、托盘/应用菜单、更新历史、关于信息和诊断导出。
- 支持应用内检查更新、下载进度、SHA-256 校验、重启确认和回滚。
- 原生侧边栏 Logo 集成桌面菜单（展开态左键打开、收起态右键打开），Windows 11 Mica/标题栏样式、系统主题同步、分阶段启动过渡，以及适配多显示器的窗口状态记忆。
- 预装可移除的插件市场，支持 GitHub 分页搜索、一键安装、插件更新管理和 Agent 市场工具。

## 最新发布

| 项目 | 版本 |
| --- | --- |
| 发布 | DeepSeek Harness for Win **v1.2.7**（[下载](https://github.com/wsnxxxs/deepseek-harness-portable/releases/tag/v1.2.7)) |
| 分发版本 | 1.2.7 |
| 桌面外壳 | 0.1.0-shell.2 |
| 内核 | 0.1.0-rc.5 |

请阅读[中文发布说明](RELEASE_NOTES.zh.md)，或在桌面端托盘菜单中打开“更新日志”。

## 安装

1. **Setup 安装包：** 从 Releases 下载 `DeepSeek-Harness-Setup-<version>-win32-x64.exe` 并运行。
2. **在线安装：** 运行仓库中的 `install.ps1`。脚本只接受带可信 SHA-256 摘要的 release ZIP。参数：`-InstallDir <路径>`（默认 `%LOCALAPPDATA%\Programs\DeepSeek Harness`）、`-NoDesktopShortcut`、`-Force`。若检测到 `%LOCALAPPDATA%\DeepSeek-Harness` 下的旧版安装，会原地升级。
3. **便携 ZIP：** 下载 `DeepSeek-Harness-<version>-win32-x64.zip`，先核对 `SHA256SUMS.txt`，再解压完整目录，不要重命名 `runtime`。
4. **卸载：** 运行 `uninstall.cmd` 或 `uninstall.ps1`。除非明确确认删除，否则会保留用户数据。

> **注意：** `setup-shortcuts.ps1`（安装程序以及便携包中的 `创建桌面快捷方式.bat` 会调用它）会创建桌面快捷方式，并把便携目录加入**用户 PATH**；卸载程序会一并移除这两项。

安装器和更新器会校验 ZIP 摘要、发布清单、应用清单以及必要的原生模块，不会创建证书，也不会修改 Windows 信任存储。

## 便携目录结构

    DeepSeek Harness-win32-x64/
    ├─ dsh.cmd                     命令行入口：网页模式、`dsh update`、`dsh desktop`、`dsh trust`
    ├─ pnpm.cmd                    插件管理使用的内置包管理器入口
    ├─ start-web.cmd               使用内置 Electron/Node runtime 的浏览器模式入口
    ├─ start-desktop.cmd           桌面模式入口
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

不要删除或重命名 `runtime` 目录。

## 用户数据与API密钥

- 会话、凭据、设置、附件和桌面偏好保存在**应用目录之外**的 `%USERPROFILE%\.dsh`（可通过 `DSH_HOME` 环境变量覆盖）。更新后数据保留，卸载时除非明确确认否则不会删除。
- 在 Web UI **设置**中配置 DeepSeek API key，或在启动进程的环境中提供。
- 桌面外壳将 Web 服务绑定到回环地址，并设置 `DSH_TELEMETRY_DISABLED=1`。

## 启动与更新

- `start-desktop.cmd`（或 `启动桌面版.bat`）启动内置 Electron 桌面端。
- `start-web.cmd`（或 `启动网页版.bat`）使用内置 Electron/Node runtime 启动网页版，无需安装系统 Node.js。
- `dsh.cmd` 提供同样的网页版入口、内置插件管理 CLI，并支持分发版子命令：`dsh update`、`dsh desktop`、`dsh trust`。
- 桌面托盘菜单提供“检查更新”“更新日志”和“关于”。
- 检测到新版本时，桌面外壳会在应用内显示下载与校验进度，完成后再询问是否重启。更新、回滚和启动恢复共用按安装目录隔离的互斥锁；新旧 `runtime` 通过同卷目录重命名切换。事务未完成时启动器会等待并恢复，直接启动 Electron 则会被门禁阻止。
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
更新中心会显示错误状态和重试入口，不会阻塞主界面。也可以直接运行便携版更新器：`dsh update`、`在线更新.bat` 或 `update.ps1`。

**为什么极简/WSL 模式中的长命令会超时？**
极简模式会原样执行模型给出的 Linux 命令。对 vendor 工作区使用递归 `grep` 还会扫描嵌套依赖目录，确实可能超过工具超时；建议改用会遵守忽略规则的 `rg`，或显式排除 `node_modules`。超时时桌面桥接现在会只强制终止该终端对应的 `wsl.exe` 进程树并等待 PTY 释放，不应再追加 `PTY cleanup failed`。

## 构建与发布

*面向维护者和贡献者。*

环境要求：Windows x64、Node.js ^22.19.0 或 >=24、pnpm。

仓库通过固定 Git submodule `vendor/deepseek-harness` 内置匹配版本的 DeepSeek Harness 源码 workspace。它提供桌面外壳所需的 `@deepseek-ai/*` 包，并在本地构建嵌入式 Web runtime；发布流程不再需要把已有便携 ZIP 作为构建输入。

首次 clone 后只需初始化一次：

    pnpm run desktop:bootstrap

之后使用常规构建与发布命令：

    pnpm install
    pnpm run desktop:test
    pnpm run desktop:package:win
    pnpm run desktop:release:win

打包流程会为源码 workspace 生成指纹，并在输入未变化时复用已成功的构建、运行时部署和 Electron 产物层。排查干净的发布构建时，可使用 `pnpm run desktop:release:win -- --no-cache`，也可向底层打包脚本传入 `--no-cache`；需要有意打包现有编译产物时，仍可使用 `--skip-build`。

桌面包保留三层独立版本：

- `distributionVersion`：公开 Windows release 标签、ZIP 和 Setup 版本。
- 桌面外壳版本：Electron 外壳包版本。
- 内核版本：打包进来的 `@deepseek-ai/dsh-web-app` 版本。

发布命令会构建或安全复用上游 Web runtime 和桌面外壳，始终执行发布测试，生成 `release-manifest.json`，并最后写入 `SHA256SUMS.txt`。准备新版本时，请同步更新 `RELEASE_NOTES.md`、`RELEASE_NOTES.zh.md` 和 `apps/desktop/src/release-notes.json`。

`dist-desktop/` 是可重建的临时构建目录，发布后可以删除。下一次构建所需的源码保存在 `vendor/deepseek-harness` 中；不要用 `node_modules/` 或便携 ZIP 替代源码提交到仓库。

## 安全与限制

- 运行下载文件前请先核对发布的 SHA-256 值。
- 本地 Web 服务默认只绑定回环地址。
- 不要把 API key 放入仓库或发布目录。
- 市场条目是从 GitHub 发现的第三方代码。安装前请审查插件仓库和权限；安装过程可能运行包构建脚本，插件会获得其 Cordis 组合所声明的能力。
- 如果组织要求可信可执行文件，请使用受认可的 CA、Microsoft Artifact Signing 或企业代码签名策略。

参考 [Smart App Control](https://learn.microsoft.com/en-us/windows/apps/develop/smart-app-control/overview) 和 [SmartScreen reputation guidance](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/smartscreen-reputation).

## 许可证

DeepSeek Harness 使用 [MIT](LICENSE) 许可证，第三方声明见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。上游源码：[deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness)。
