# DeepSeek Harness Windows 便携式分发物

[English](README.md) | 中文

这个目录说明 DeepSeek Harness 的个人 Windows 分发渠道。原生桌面外壳是未封装的 Electron 目录；单文件 Web 可执行文件会启动本地 Web 服务并在默认浏览器中打开。两种分发物都不是官方签名版本。

## 下载

原生桌面外壳请下载完整的 `DeepSeek Harness-win32-x64` 目录；单文件浏览器启动器请下载 `dsh-desktop-web-<version>-win-x64.exe`。原生目录中的所有文件必须保持在一起。

## 为什么做这个项目

这里提供的是 DeepSeek Harness 本身的分发层，而不是另一个聊天客户端。Web 界面和插件运行时仍然是 Harness 产品本身，保留 profile、session、skill、tool、workspace 流程以及可组合的插件图；这个仓库为同一个运行时补充 Windows 分发方式。

下面的比较选取相邻的公开项目作为参照，并不把不同产品类别当成直接替代品。仓库会持续变化，以下内容根据 2026-08-14 查看的公开 README 和发布方式整理。

| 项目 | 主要方向 | 这个项目为 Windows 用户增加的内容 |
| --- | --- | --- |
| [Eddie0521/turn-deepseek-into-desktop](https://github.com/Eddie0521/turn-deepseek-into-desktop) | 面向 macOS 的轻量原生外壳，提供一键安装、菜单栏常驻、回环地址绑定和关闭 telemetry。 | 把同样的外壳思路带到 Windows x64，同时提供 Electron 原生外壳和单文件浏览器启动器；便携分发物不需要 Xcode 或安装程序。 |
| [doxdk/deepseek-desktop](https://github.com/doxdk/deepseek-desktop) | 通过 Electron 访问 DeepSeek 聊天网站，支持 localStorage/cookie，流程偏向安装程序。 | 打包的是 DeepSeek Harness agent 运行时，而不只是聊天页面，保留 profile、插件、session、tool 和 workspace 行为；单文件版本可以免安装运行。 |
| [DeepFundAI/ai-browser](https://github.com/DeepFundAI/ai-browser) | 基于 Electron/Next.js 的更宽泛 AI 浏览器，包含多模态自动化、计划任务、社交集成、文件管理和多模型支持。 | 把范围聚焦在 DeepSeek Harness 的完整运行一致性上，提供更容易复制的 Windows 分发物，不要求终端用户准备应用构建环境。 |
| [RealZST/HarnessKit](https://github.com/RealZST/HarnessKit) | 统一管理多个 agent 的 skill、MCP server、plugin、hook、配置和规则。 | 专注于忠实运行一套完整 Harness，原生窗口/托盘模式与浏览器模式共享同一个打包后的后端。 |

### 主要优势

- **保持上游一致：** 桌面层包装真实的 DeepSeek Harness composition，而不是另起一套聊天或 agent 客户端。
- **两种 Windows 模式：** 使用带托盘控制的 Electron 原生窗口，或运行单个 `.exe` 启动回环 Web UI 并打开默认浏览器。
- **真正便携：** 浏览器启动器不要求安装程序，默认把 `.dsh` home 放在可执行文件旁边，也可以通过 `DSH_HOME` 显式迁移。
- **本地优先：** 服务默认绑定 `127.0.0.1`，桌面渠道关闭 telemetry，API key 在运行时填写，不嵌入分发文件。
- **面向 Windows 的打包：** 分发物包含应用图标、打包后的运行时依赖、内置预设和第三方声明，可以整体复制目录或携带单文件。

这种更窄的定位是有意为之：HarnessKit 和 AI Browser 覆盖更广的多 agent 或自动化管理，而这个项目的目标是让 DeepSeek Harness 本身更容易在 Windows 上携带和启动。

## 使用原生桌面外壳

运行 `DeepSeek Harness.exe`。外壳会启动本地运行时，在自己的窗口中显示 Web 界面，保留托盘入口，记住所选 workspace，并使用 DeepSeek 图标。关闭窗口时会隐藏窗口；请使用托盘菜单退出或重启。

## 使用单文件启动器

运行 `.exe` 会启动本地 Web 服务并打开默认浏览器。其他启动器负责打开界面时传入 `--no-open`。服务只绑定到 `127.0.0.1`；实际分配的端口会由可执行文件报告。

可以在启动环境中设置 `DEEPSEEK_API_KEY`，也可以在 Web 界面设置中填写。两种分发物都会为本地桌面渠道关闭 telemetry。

## 数据与便携性

原生外壳把偏好和运行时数据保存在 Electron 的用户数据目录下。单文件启动器在提供 `DSH_HOME` 时使用该目录，否则把便携式 `.dsh` home 保存在可执行文件旁边。移动便携式环境时，请把原生目录整体复制，或把单文件可执行文件与对应的 `.dsh` 目录一起复制。

删除对应的用户数据目录可以重置本地环境。不要把 API key 放进仓库，也不要把它和可执行文件一起分享。

## 重新构建

在安装了 Node.js `^22.19.0 || >=24` 和 pnpm 的 Windows x64 checkout 中运行：

```powershell
pnpm install
pnpm run build
pnpm run desktop:package:win
pnpm exec tsx scripts/build-desktop-web-exe.ts
```

原生输出写入 `dist-desktop/electron/`；单文件输出写入 `dist-exe/`。构建会在打包前校验 Electron 运行时；如果安装时跳过了生命周期脚本，会在此处下载 Electron；SEA Node 基础运行时也会在首次使用时下载。

## 安全与发布状态

本地 Web 服务默认只监听回环地址。可执行文件当前没有代码签名、安装程序或自动更新通道，首次启动时可能触发 Windows SmartScreen 警告。

部分杀毒软件（实测火绒）会在首次写入或下载时静默隔离未签名的 pkg/Electron 可执行文件。请核对每个 Release 随附的 SHA-256 校验值；若被杀毒软件拦截，请从隔离区恢复或为该目录添加信任，恢复后再次核对校验值再运行。

DeepSeek Harness 使用 [MIT](LICENSE) 许可证。第三方声明位于 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
