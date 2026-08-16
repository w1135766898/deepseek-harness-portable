# DeepSeek Harness for Win v1.2.6

[English](RELEASE_NOTES.md)

Windows x64 便携版 · 2026-08-16

这是本 Windows 分发版的 v1.2.6 版本，全面加固了 Windows 平台上的更新替换与安装包稳健性，修复了更新过程中可能产生的目录嵌套与输出流泄露，并增强了进程树退出清理与事务状态机校验守护。

## 问题修复与安装更新加固

- **更新与安装事务加固**：重构目录原子替换逻辑，杜绝 Windows NTFS 句柄未释放时导致的 `runtime` 目录嵌套问题，清理 PowerShell 输出流泄露，并引入更新事务日志状态校验守护。
- **Setup 安装包稳健性优化**：增强解压前的残留子进程终止与旧目录清理机制，杜绝安装时出现 tar 解压权限冲突（`tar exit code 1`）问题。
- **WSL 终端子进程退出清理**：进一步强化终端检查与进程树生命周期联动，确保桌面会话退出时彻底清理资源。

## 组件版本

- 分发：1.2.6
- 桌面外壳：0.1.0-shell.2
- 内核：0.1.0-rc.5（@deepseek-ai/dsh-web-app）
- 标签：v1.2.6

## 校验和与安全

- 最终便携 ZIP 和 Setup 安装包的 SHA-256 值会记录在 SHA256SUMS.txt，并作为 GitHub Release 附件发布。
- 运行下载文件前请先核对 SHA256SUMS.txt。
- 可执行文件未签名，Windows SmartScreen 或 Smart App Control 可能发出警告或阻止运行。
- 更新期间，会话、凭据、设置、附件和桌面偏好均保存在发行目录之外。
