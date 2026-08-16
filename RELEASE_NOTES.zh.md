# DeepSeek Harness for Win v1.2.3

[English](RELEASE_NOTES.md)

Windows x64 便携版 · 2026-08-16

这是本 Windows 分发版的 v1.2.3 版本，强化了 WSL 原生 Linux Bash 环境桥接以完美复现 DeepSeek 官方强化学习（RL）标志性的“We need / Let's”思维链推理模式，将视觉外挂配置无缝接入 Web UI 代理，并全面优化桌面端交互体验。

## 新功能与体验优化

- **强化 WSL 原生环境桥接与“We need / Let's”思维链复现**：DeepSeek 官方强化学习训练基于 Linux Bash 环境。在 Windows 平台通过 WSL 原生 Linux Bash 完整承载官方极简模式（Minimal Preset），杜绝 PowerShell 语法与 Token 漂移，完美复现模型经典的“We need to... / Let's check...”分步规划与链式推理（CoT）。
- **视觉辅助外挂 API 代理层融合**：动态将 `@dsh-portable/vision-bridge` 配置模式注入 Host Web UI `apiProxy`，支持在【设置 → 插件】中即时管理视觉服务商、测试连接并安全持久化。
- **桌面端交互细节与动效优化**：深度优化菜单手风琴折叠展开动画、精简文案表述、升级矢量图标，并严格确保应用内更新日志单语言纯净渲染。
- **完善项目文档与 Why Us 核心差异说明**：全面补充 Windows 便携版本相较于官方版本在 Token 分布对齐、环境免配置与多模态扩展等方面的独特价值与核心优势。

## 组件版本

- 分发：1.2.3
- 桌面外壳：0.1.0-shell.2
- 内核：0.1.0-rc.5（@deepseek-ai/dsh-web-app）
- 标签：v1.2.3

## 校验和与安全

- 最终便携 ZIP 和 Setup 安装包的 SHA-256 值会记录在 SHA256SUMS.txt，并作为 GitHub Release 附件发布。
- 运行下载文件前请先核对 SHA256SUMS.txt。
- 可执行文件未签名，Windows SmartScreen 或 Smart App Control 可能发出警告或阻止运行。
- 更新期间，会话、凭据、设置、附件和桌面偏好均保存在发行目录之外。
