# DeepSeek Harness for Win v1.0.1

Windows x64 portable release · 2026-08-14 / Windows x64 便携版 · 2026-08-14

Community distribution, not an official Microsoft-signed build. / 社区维护的分发版，不是 Microsoft 官方签名版本。

## Features / 主要更新

- Raycast- and Linear-style timeline for release history. / 采用 Raycast 与 Linear 风格的时间轴展示发布记录。
- A compact HUD toast after a successful upgrade. / 升级完成后显示轻量灵动的 HUD 通知气泡。
- DeepSeek whale branding with adaptive light and dark glass styling. / 使用 DeepSeek 小蓝鲸标识，并适配浅色与深色毛玻璃主题。

## Improvements / 优化提升

- Atomic rows make features, improvements, and fixes easier to scan. / 采用原子行布局，更清晰地区分新功能、优化和修复。
- Smaller update window and non-intrusive post-update notification. / 缩小更新窗口，升级后通知不抢占用户焦点。

## Components / 组件版本

- Distribution / 分发：`1.0.1`
- Desktop shell / 桌面外壳：`0.1.0-shell.2`
- Kernel / 内核：`0.1.0-rc.5` (`@deepseek-ai/dsh-web-app`)
- Tag / 标签：`v1.0.1`

## Checksums & Security / 校验和与安全

- Portable ZIP SHA-256 / 便携 ZIP：将在打包后写入 `SHA256SUMS.txt`。
- Setup SHA-256 / 安装程序：将在打包后写入 `SHA256SUMS.txt`。
- Verify `SHA256SUMS.txt` before launching. / 运行前请核对 `SHA256SUMS.txt`。
- The executable is unsigned; Windows SmartScreen may warn. / 可执行文件未签名，Windows SmartScreen 可能提示风险。
- Conversations, credentials, settings, and attachments stay outside the release directory during updates. / 更新时，会话、凭据、设置和附件保存在发布目录之外。
