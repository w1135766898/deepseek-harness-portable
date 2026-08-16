# DeepSeek Harness for Win v1.2.4

[English](RELEASE_NOTES.md)

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
- 内核：0.1.0-rc.5（@deepseek-ai/dsh-web-app）
- 标签：v1.2.4

## 校验和与安全

- 最终便携 ZIP 和 Setup 安装包的 SHA-256 值会记录在 SHA256SUMS.txt，并作为 GitHub Release 附件发布。
- 运行下载文件前请先核对 SHA256SUMS.txt。
- 可执行文件未签名，Windows SmartScreen 或 Smart App Control 可能发出警告或阻止运行。
- 更新期间，会话、凭据、设置、附件和桌面偏好均保存在发行目录之外。
