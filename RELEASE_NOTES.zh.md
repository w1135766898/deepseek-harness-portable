# DeepSeek Harness for Win v1.2.0

[English](RELEASE_NOTES.md)

Windows x64 便携版 · 2026-08-16

这是本 Windows 分发版的 v1.2.0 版本，正式在 Windows 平台通过 WSL 原生 Linux Bash 支持与 DeepSeek 官方 RL 训练环境完全对齐的“极简模式”，并带来了一站式的环境自检与排错引导体验。

## 新功能

- **极简模式正式支持 Windows（WSL Linux Bash）**：完整对齐 DeepSeek 官方 RL 训练环境方言（Linux、Bash、stty、PS1 及 marker 协议），通过 `wsl.exe` 在 Windows 平台上流畅运行极简模式。
- **Win32 进程检查器桩与 Full Access 沙箱隔离**：注入专用的 Win32 终端进程检查器桩（避免 `signalForeground` 抛错破坏会话），并在极简预设中隔离启用 `danger-full-access` 沙箱策略，彻底解除 Windows ACL 受限令牌对 Hyper-V / 用户目录写入的阻断。
- **桌面菜单 WSL 运行环境状态自检**：在深海鲸鱼桌面菜单中直观展示当前系统 WSL Linux 环境的就绪状态，点击即可弹出原生配置指引并一键复制 `wsl --install` 安装命令。
- **运行时启动失败友好转译**：在执行层拦截 WSL 启动失败，并输出结构化中英文排错指引，清晰提示标准模式（PowerShell）与极简模式的切换建议。

## 体验优化

- **WSL 探测逻辑加固**：剥离 UTF-16 字节序标识符（BOM）并校验有效发行版列表，杜绝“已启用 WSL 但无发行版”时的误判。
- **菜单动态保鲜机制**：展开菜单时自动触发毫秒级重探测，用户安装配置完 WSL 后无需重启应用即可即时更新状态。

## 组件版本

- 分发：1.2.0
- 桌面外壳：0.1.0-shell.2
- 内核：0.1.0-rc.5（@deepseek-ai/dsh-web-app）
- 标签：v1.2.0

## 校验和与安全

- 最终便携 ZIP 和 Setup 安装包的 SHA-256 值会记录在 SHA256SUMS.txt，并作为 GitHub Release 附件发布。
- 运行下载文件前请先核对 SHA256SUMS.txt。
- 可执行文件未签名，Windows SmartScreen 或 Smart App Control 可能发出警告或阻止运行。
- 更新期间，会话、凭据、设置、附件和桌面偏好均保存在发行目录之外。
