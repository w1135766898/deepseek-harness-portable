# DeepSeek Harness for Win v1.2.2

[English](RELEASE_NOTES.md)

Windows x64 便携版 · 2026-08-16

这是本 Windows 分发版的 v1.2.2 版本，引入了视觉辅助外挂插件（@dsh-portable/vision-bridge），通过外部 OpenAI 兼容的视觉多模态大模型赋予文本模型看图识图能力。

## 新功能与体验优化

- **视觉辅助外挂插件（`@dsh-portable/vision-bridge`）**：为纯文本大模型接入外部 OpenAI 兼容视觉模型（如 GPT-4o、Qwen-VL、GLM-4V、本地 Ollama 等），支持看图、UI分析与图表识别。
- **全局 `view_image` 工具**：支持 PNG、JPEG、WebP 与 GIF 图片文件，根据当前会话 cwd 智能解析相对路径，自动校验大小与 Base64 编码，并严格遵循防凭证重定向外泄规范。
- **官方设置槽位无缝融入**：在【设置 → 插件】页面官方槽位注册专属配置卡片，支持服务商预设一键切换、即时配置验证与持久化保存，API Key 采用纯写模式与 Secret 级别安全脱敏保护。
- **零侵入架构设计**：全部通过 Cordis 微内核插件机制与运行时 Overlay 动态装配，保持 upstream `vendor/deepseek-harness` 100% 原生纯净。

## 组件版本

- 分发：1.2.2
- 桌面外壳：0.1.0-shell.2
- 内核：0.1.0-rc.5（@deepseek-ai/dsh-web-app）
- 标签：v1.2.2

## 校验和与安全

- 最终便携 ZIP 和 Setup 安装包的 SHA-256 值会记录在 SHA256SUMS.txt，并作为 GitHub Release 附件发布。
- 运行下载文件前请先核对 SHA256SUMS.txt。
- 可执行文件未签名，Windows SmartScreen 或 Smart App Control 可能发出警告或阻止运行。
- 更新期间，会话、凭据、设置、附件和桌面偏好均保存在发行目录之外。
