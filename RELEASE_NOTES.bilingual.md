# DeepSeek Harness for Win v1.2.4

Windows x64 便携版 · 2026-08-16

这是本 Windows 分发版的 v1.2.4 版本，通过 WSLENV 机制共享终端环境变量彻底解决分页器阻塞，为 WSL 终端引入 Ctrl+C 字节级精确中断响应，联动 PTY 生命周期确保退出时销毁后台进程，并全面对齐视觉外挂 Design Tokens 设计规范。

## 新功能与体验优化

- **通过 WSLENV 共享 WSL 终端环境变量**：将 Windows 宿主环境中的终端与运行时变量（`PAGER`、`GIT_PAGER`、`TERM`、`DSH_*` 等）自动注入 Linux 会话，彻底消除 `git`/`man` 等命令因交互分页器（`less`）阻塞的问题，确保就绪探测畅通无阻。
- **WSL 终端精确 SIGINT 中断响应**：封装底层终端句柄，将前端发起的 `SIGINT` 信号转化为标准 `Ctrl+C` 字节流直接写入 PTY，使得前台正在执行的任务能够即时响应中断与停止，无需等待 300s 超时强制重置。
- **完善 WSL 终端进程生命周期与退出联动**：修复进程树根节点逻辑，在宿主应用退出时联动调用 PTY `SIGKILL` 彻底销毁 `wsl.exe` 与后台终端资源，杜绝孤儿进程残留。
- **WSL 状态智能探测与跨编码自适应解码**：自动识别并兼容 UTF-16LE / UTF-8 编码混杂的 `wsl -l -q` 输出，杜绝误判；针对未安装 Linux 发行版等异常场景提供中英文双语友好排错指引与一键修复建议。
- **视觉外挂（Vision Bridge）UI 规范与官方 Design Tokens 对齐**：深度优化 `@dsh-portable/vision-bridge` 前端配置组件在浅色与深色主题下的视觉变量与卡片间距，界面表现更精致协调。

## 组件版本

- 分发：1.2.4
- 桌面外壳：0.1.0-shell.2
- 运行时内核：0.1.0-rc.5

---

## English Release Notes

Windows x64 portable release · 2026-08-16

This is the v1.2.4 release of this Windows distribution, sharing terminal environment variables with WSL sessions via WSLENV to eliminate pager hangs, delivering Ctrl+C signals for interactive WSL task interruptions, binding host shutdown directly to PTY lifecycle cleanup, and aligning Vision Bridge styles with official design tokens.

### New Features & Improvements

- **WSL Terminal Environment Sharing via WSLENV**: Windows host terminal and runtime environment variables (`PAGER`, `GIT_PAGER`, `TERM`, `DSH_*`, etc.) are now seamlessly shared into WSL Linux sessions. This completely eliminates interactive pager hangs (such as `less` in `git` or `man`) and ensures readiness probe workflows run smoothly.
- **Interactive SIGINT Delivery for WSL Terminals**: Intercepts terminal interrupt requests and delivers the standard Ctrl+C byte directly into the PTY stream. Foreground tasks now respond and cancel immediately without waiting for 300s command timeout resets.
- **Deterministic WSL Process Cleanup on Exit**: Binds host shutdown directly to PTY `SIGKILL` signals, ensuring background `wsl.exe` instances and terminal subprocesses are cleanly destroyed on application exit with zero orphan processes.
- **Robust WSL Diagnostic & Cross-Encoding Detection**: Automatically handles and decodes mixed UTF-16LE and UTF-8 `wsl -l -q` command output across different Windows locales. Provides actionable bilingual troubleshooting guidance and one-click commands when distributions are missing.
- **Vision Bridge Design Token Alignment**: Harmonized CSS variables and card styles in `@dsh-portable/vision-bridge` with official microkernel design tokens across dark and light themes.

### Component Versions

- Distribution: 1.2.4
- Desktop Shell: 0.1.0-shell.2
- Runtime Kernel: 0.1.0-rc.5

---

## 校验和与安全 / Checksums and security

每个最终发布构件均经 SHA-256 校验和验证：

Every final release artifact is verified with a SHA-256 checksum:

```
36027F8B2C747CA0F58C749C1291B63CB7D0992B57DF2EDBDC47B9972430F030 *DeepSeek-Harness-1.2.4-win32-x64.zip
BF3DC481FDEBEB4B220B36E0B8F200288CAC9F92B604025FCBE31F32309BCD4A *DeepSeek-Harness-Setup-1.2.4-win32-x64.exe
```
