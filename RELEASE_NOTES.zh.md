# DeepSeek Harness Desktop v1.3.1

[English](RELEASE_NOTES.md)

Windows x64、macOS Apple Silicon 与 Linux x64 桌面版 · 2026-08-18

这是 v1.3.1 桌面版发布：运行时升级至 DeepSeek Harness rc.7，修复覆盖安装首次启动与新版事件导致的历史会话兼容问题，并把 Learning 预设真正融入桌面客户端对话体验。

## 新功能与体验优化

- **原生 Learning 选择**：学习方向、深度和节奏改用 rc.7 客户端原生选择控件，不再展示自定义活动表单。
- **对话内教学图示**：参数探索、过程分步和结构比较直接渲染在助手消息中，可随会话持久回放，并提供文字等价说明和非单纯依赖颜色的标注。
- **历史会话向前兼容**：精确兼容旧版 `portable-runtime/mode-resolution` 事件，新写入事件标记为可忽略；其他未知且不可忽略事件仍会拒绝加载。
- **覆盖安装首次启动可靠性**：始终优先使用 profile 依赖，并在 Setup Finish 启动恰逢 junction 替换窗口时回退到已安装 runtime。
- **透明插件安装**：Marketplace 在确认前展示来源、运行环境、网络/图像外发、激活、降级、已知问题和验证信息；未知插件明确标记为未验证。
- **rc.7 原生图片附件**：支持图片的模型使用客户端持久化附件链路；纯文本模型仍可显式调用外部 `view_image`，并清楚提示数据外发。
- **macOS Apple Silicon 桌面分发**：Electron 外壳现在可以打包原生 `darwin-arm64` 应用和 DMG，并按目标平台暂存 `node-pty`、`sharp` 与 `koffi` 原生模块。
- **macOS 原生极简模式**：官方预设通过 POSIX PTY 和 `/bin/bash` 运行，不使用 WSL 或容器兼容层。
- **平台感知发布流程**：Windows 保留应用内便携更新，macOS 则打开发布页手动下载 DMG。
- **内置插件市场**：每个 Web profile 首次使用时预装固定版本的 `dsh-plugin-marketplace`。用户可以关闭或卸载它，选择会在重启和升级后保持。
- **市场工具自包含**：便携版通过 Electron 内置 Node.js 运行时提供 DSH 插件 CLI 和 pnpm，市场操作无需系统 Node.js 环境。
- **已验证更新恢复**：启动器和更新器可从已验证的暂存目录修复发行版自有文件，同时保留事务与回滚安全性。
- **跨盘符 Setup 安装**：安装器将 staging 保持在用户选择的应用目录下，即使安装到 D: 或 E:，runtime 激活也始终使用同卷重命名。
- **启动器事务检测**：启动脚本兼容 PowerShell 5.1 JSON 的空格格式，正确识别 committed/rolled-back 状态，避免每次启动不必要的恢复延迟。
- **内容寻址打包缓存**：对构建、暂存和 Electron 产物层生成指纹并安全复用，支持显式 `--no-cache`，并校验发布归档布局。

## 组件版本

- 分发：1.3.1
- 桌面外壳：0.1.0-shell.2
- 内核：0.1.0-rc.7（@deepseek-ai/dsh-web-app）
- 标签：v1.3.1

## 校验和与安全

- Windows 便携 ZIP 和 Setup 安装包的 SHA-256 值记录在 `SHA256SUMS.txt`；macOS DMG 的校验值记录在 `SHA256SUMS-darwin-arm64.txt`。
- 运行下载文件前请先核对对应的校验文件。
- 市场中的插件属于第三方代码，启用额外插件前请审查其来源和权限。
- Windows 可执行文件和 macOS DMG 均未签名，Windows SmartScreen/Smart App Control 及 macOS Gatekeeper 可能发出警告或阻止运行。
- 更新期间，会话、凭据、设置、附件和桌面偏好均保存在发行目录之外。
