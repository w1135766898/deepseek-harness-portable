# DeepSeek Harness for Win v1.2.7

[English](RELEASE_NOTES.md)

Windows x64 便携版 · 2026-08-17

这是本 Windows 分发版的 v1.2.7 版本，新增内置插件市场流程，修复基于已验证暂存内容的更新启动边界问题，并让 Windows 打包更快、更可复现。

## 新功能与体验优化

- **内置插件市场**：每个 Web profile 首次使用时预装固定版本的 `dsh-plugin-marketplace`。用户可以关闭或卸载它，选择会在重启和升级后保持。
- **市场工具自包含**：便携版通过 Electron 内置 Node.js 运行时提供 DSH 插件 CLI 和 pnpm，市场操作无需系统 Node.js 环境。
- **已验证更新恢复**：启动器和更新器可从已验证的暂存目录修复发行版自有文件，同时保留事务与回滚安全性。
- **跨盘符 Setup 安装**：安装器将 staging 保持在用户选择的应用目录下，即使安装到 D: 或 E:，runtime 激活也始终使用同卷重命名。
- **启动器事务检测**：启动脚本兼容 PowerShell 5.1 JSON 的空格格式，正确识别 committed/rolled-back 状态，避免每次启动不必要的恢复延迟。
- **内容寻址打包缓存**：对构建、暂存和 Electron 产物层生成指纹并安全复用，支持显式 `--no-cache`，并校验发布归档布局。

## 组件版本

- 分发：1.2.7
- 桌面外壳：0.1.0-shell.2
- 内核：0.1.0-rc.5（@deepseek-ai/dsh-web-app）
- 标签：v1.2.7

## 校验和与安全

- 最终便携 ZIP 和 Setup 安装包的 SHA-256 值会记录在 SHA256SUMS.txt，并作为 GitHub Release 附件发布。
- 运行下载文件前请先核对 SHA256SUMS.txt。
- 市场中的插件属于第三方代码，启用额外插件前请审查其来源和权限。
- 可执行文件未签名，Windows SmartScreen 或 Smart App Control 可能发出警告或阻止运行。
- 更新期间，会话、凭据、设置、附件和桌面偏好均保存在发行目录之外。
