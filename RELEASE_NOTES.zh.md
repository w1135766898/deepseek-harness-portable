# DeepSeek Harness for Win v1.0.0

[English](RELEASE_NOTES.md)

Windows x64 便携版 · 2026-08-15

这是本 Windows 分发版的第一个正式版本。项目为社区维护构建，并非 Microsoft 官方签名版本。

## 主要功能

- 提供组合原生 Electron 桌面外壳与内置 DeepSeek Harness Web runtime 的 Windows x64 便携包。
- 支持工作区选择、浏览器模式、托盘/应用菜单、更新历史、关于信息和诊断导出。
- 支持应用内检查更新、下载进度、SHA-256 校验、重启确认和回滚。
- 提供蓝色原生鲸鱼 Logo 菜单、Windows 11 Mica/标题栏样式、系统主题同步、启动过渡页，以及适配多显示器的窗口状态记忆。

## 构建与稳定性

- 桌面外壳、内置 Web runtime 和发行包均基于仓库内固定的 vendor/deepseek-harness 源码 workspace 重新构建。
- 发布前会校验 runtime 源码一致性、发布清单、便携包目录布局、必要的原生模块和 SHA-256 校验和。
- 安装包包含中英文快速指南、便携启动/更新脚本，以及默认保留用户数据、仅在明确确认后删除数据的卸载流程。

## 组件版本

- 分发：1.0.0
- 桌面外壳：0.1.0-shell.2
- 内核：0.1.0-rc.5（@deepseek-ai/dsh-web-app）
- 标签：v1.0.0

## 校验和与安全

- 最终便携 ZIP 和 Setup 安装包的 SHA-256 值会记录在 SHA256SUMS.txt，并作为 GitHub Release 附件发布。
- 运行下载文件前请先核对 SHA256SUMS.txt。
- 可执行文件未签名，Windows SmartScreen 或 Smart App Control 可能发出警告或阻止运行。
- 更新期间，会话、凭据、设置、附件和桌面偏好均保存在发行目录之外。
