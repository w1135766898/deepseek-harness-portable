# DeepSeek Harness for Win v1.1.0

[English](RELEASE_NOTES.md)

Windows x64 便携版 · 2026-08-15

这是本 Windows 分发版的 v1.1.0 版本，带来 PowerShell 智能体预设支持、沉浸式标题栏优化、更新与回滚体验重构以及多项交互修复。

## 主要功能

- **Windows 极简智能体预设**：支持 PowerShell (`pwsh`) 执行器与 cmdline 命令行交互。
- **沉浸式标题栏布局**：采用沉浸式标题栏设计，配置顶部安全边距与窗口拖拽区域，消除与原生控制按钮的重叠。
- **更新与回滚体验重构**：新增事务状态感知（`starting`、`rolled-back`）、回滚后自动重启恢复，以及多语言状态提示卡片。
- **更新包就绪状态跨进程恢复**：已下载更新包持久化记忆并在启动时完整性校验，支持过期临时文件自动清理。

## 问题修复

- 在 Windows 极简预设中禁用后台任务（`run_in_background`），避免产生无法停止的孤儿进程。
- 修复跨进程恢复的更新就绪通知被先前关闭记录误静默的问题。
- 修复下载阶段报错分类，增加损坏安装包自动降级重试。
- 修复侧边栏深海鲸鱼 Logo 的点击事件分发与锚点同步。

## 组件版本

- 分发：1.1.0
- 桌面外壳：0.1.0-shell.2
- 内核：0.1.0-rc.5（@deepseek-ai/dsh-web-app）
- 标签：v1.1.0

## 校验和与安全

- 最终便携 ZIP 和 Setup 安装包的 SHA-256 值会记录在 SHA256SUMS.txt，并作为 GitHub Release 附件发布。
- 运行下载文件前请先核对 SHA256SUMS.txt。
- 可执行文件未签名，Windows SmartScreen 或 Smart App Control 可能发出警告或阻止运行。
- 更新期间，会话、凭据、设置、附件和桌面偏好均保存在发行目录之外。
