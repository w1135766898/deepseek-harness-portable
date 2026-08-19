# DeepSeek Harness Desktop v1.3.3

[English](RELEASE_NOTES.md)

Windows x64、macOS Apple Silicon 与 Linux x64 桌面版 · 2026-08-19

这是 v1.3.3 维护/测试版：将最新 rc.7 桌面基线重新打包，并同步发布身份、更新器元数据、安装器文件名和 Windows x64 分发产物。

## 发布与更新可靠性

- **分发版本刷新**：将最新 rc.7 桌面基线重新整理为 1.3.3，并生成新的 Windows x64 便携 ZIP 与 Setup 安装包。
- **发布身份同步**：内置发布清单、更新器校验、安装器文件名、桌面文档和更新日志元数据统一指向 v1.3.3。
- **已验证产物刷新**：Windows ZIP 与 Setup 安装包从当前源码重新构建，完成原生插件 smoke 检查，并生成新的 SHA-256 校验值。
- **保留既有功能基线**：继续保留 v1.3.2 的 Learning 图示与原生选择、透明插件市场、原生图片附件、无控制台启动器和覆盖安装恢复能力。

## 组件版本

- 分发：1.3.3
- 桌面外壳：0.1.0-shell.2
- 内核：0.1.0-rc.7（@deepseek-ai/dsh-web-app）
- 标签：v1.3.3

## 校验和与安全

- Windows 便携 ZIP 和 Setup 安装包的 SHA-256 值记录在 `SHA256SUMS.txt`；macOS DMG 的校验值记录在 `SHA256SUMS-darwin-arm64.txt`。
- 运行下载文件前请先核对对应的校验文件。
- 市场中的插件属于第三方代码，启用额外插件前请审查其来源和权限。
- Windows 可执行文件和 macOS DMG 均未签名，Windows SmartScreen/Smart App Control 及 macOS Gatekeeper 可能发出警告或阻止运行。
- 更新期间，会话、凭据、设置、附件和桌面偏好均保存在发行目录之外。
