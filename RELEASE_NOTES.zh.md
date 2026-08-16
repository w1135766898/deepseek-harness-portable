# DeepSeek Harness for Win v1.2.5

[English](RELEASE_NOTES.md)

Windows x64 便携版 · 2026-08-16

这是本 Windows 分发版的 v1.2.5 版本，修复了更新日志与更新检测模块在未显式提供资产文件名时的误报问题，并在所有合法的 SemVer 版本下自动推导标准便携分发包文件名，确保应用内更新与提示保持准确同步。

## 问题修复与体验优化

- **修复更新检测误报与资产包回退推导**：修复当通过 Mirror/Raw 渠道拉取更新日志或历史记录中未显式指定 `assetName` 时导致模态框误判为“当前已是最新版本”的问题，并为所有合法 SemVer 版本自动推导标准便携分发包文件名（`DeepSeek-Harness-${version}-win32-x64.zip`）。

## 组件版本

- 分发：1.2.5
- 桌面外壳：0.1.0-shell.2
- 内核：0.1.0-rc.5（@deepseek-ai/dsh-web-app）
- 标签：v1.2.5

## 校验和与安全

- 最终便携 ZIP 和 Setup 安装包的 SHA-256 值会记录在 SHA256SUMS.txt，并作为 GitHub Release 附件发布。
- 运行下载文件前请先核对 SHA256SUMS.txt。
- 可执行文件未签名，Windows SmartScreen 或 Smart App Control 可能发出警告或阻止运行。
- 更新期间，会话、凭据、设置、附件和桌面偏好均保存在发行目录之外。
