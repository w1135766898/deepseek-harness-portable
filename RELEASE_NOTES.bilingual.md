# DeepSeek Harness for Win v1.2.6

Windows x64 便携版 · 2026-08-16

这是本 Windows 分发版的 v1.2.6 版本，全面加固了 Windows 平台上的更新替换与安装包稳健性，修复了更新过程中可能产生的目录嵌套与输出流泄露，并增强了进程树退出清理与事务状态机校验守护。

## 问题修复与安装更新加固

- **更新与安装事务加固**：重构目录原子替换逻辑，杜绝 Windows NTFS 句柄未释放时导致的 `runtime` 目录嵌套问题，清理 PowerShell 输出流泄露，并引入更新事务日志状态校验守护。
- **Setup 安装包稳健性优化**：增强解压前的残留子进程终止与旧目录清理机制，杜绝安装时出现 tar 解压权限冲突（`tar exit code 1`）问题。
- **WSL 终端子进程退出清理**：进一步强化终端检查与进程树生命周期联动，确保桌面会话退出时彻底清理资源。

## 组件版本

- 分发：1.2.6
- 桌面外壳：0.1.0-shell.2
- 运行时内核：0.1.0-rc.5

---

## English Release Notes

Windows x64 portable release · 2026-08-16

This is the v1.2.6 release of this Windows distribution, hardening the update and installation workflows on Windows, resolving runtime directory replacement edge-cases and PowerShell pipeline leaks, and enhancing process-tree lifecycle management.

### Bug Fixes & Hardening

- **Updater & Installer Hardening**: Re-engineered directory atomic replacement to prevent nested runtime paths when NTFS handles are pending release, eliminated PowerShell output pipeline leaks, and added transaction journal state validation.
- **Setup Installer Resilience**: Enhanced pre-extraction child process termination and directory cleanup in Inno Setup to eliminate archive extraction permission errors (`tar exit code 1`).
- **WSL Terminal Subprocess Cleanup**: Tightened terminal inspection and process tree lifecycle across Windows desktop sessions.

### Component Versions

- Distribution: 1.2.6
- Desktop Shell: 0.1.0-shell.2
- Runtime Kernel: 0.1.0-rc.5

---

## 校验和与安全 / Checksums and security

每个最终发布构件均经 SHA-256 校验和验证：

Every final release artifact is verified with a SHA-256 checksum:

```
8CD036754069C9451895B65F2F589D78EC2B593065A31B64CB30D238EFD5BE8A *DeepSeek-Harness-1.2.6-win32-x64.zip
075F5901ABDDE684FEC9C8488A40A51A571D38ACF7EFDE616F92E097F190EF21 *DeepSeek-Harness-Setup-1.2.6-win32-x64.exe
```
