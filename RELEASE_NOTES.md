# DeepSeek Harness for Win v1.0.0

Windows x64 portable release · 2026-08-14 / Windows x64 便携版 · 2026-08-14

Community distribution, not an official Microsoft-signed build. / 社区维护的分发版，不是 Microsoft 官方签名版本。

## Features / 主要更新

- In-app release notes, history, and component versions. / 应用内查看更新日志、历史版本和组件版本。
- See the release summary before updating and a What's New card after restart. / 更新前查看发布摘要，更新后首次启动显示 What's New。
- GitHub, mirror, cache, and bundled fallback for release notes. / 发布说明支持 GitHub、镜像、缓存和本地清单降级。

## Bug Fixes / 修复

- Updates preserve existing workspace settings. / 更新不会覆盖已有工作区设置。
- External release links are validated and opened in the system browser. / 外部发布链接会先校验，再使用系统浏览器打开。

## Components / 组件版本

- Distribution / 分发：`1.0.0`
- Desktop shell / 桌面外壳：`0.1.0-shell.1`
- Kernel / 内核：`0.1.0-rc.5` (`@deepseek-ai/dsh-web-app`)
- Tag / 标签：`v1.0.0`

## Checksums & Security / 校验和与安全

- Portable ZIP SHA-256 / 便携 ZIP：`7272DBB3F40C7E6603A1A3BF29ECA6B4C3B2D878BFEE1E410E1471E959B4A0F8`
- Setup SHA-256 / 安装程序：`3399BD8F0A538A0A56C6DA7A2105BBFF4717BE05D8E14433A2B8571D37A7B4C6`
- Verify `SHA256SUMS.txt` before launching. / 运行前请核对 `SHA256SUMS.txt`。
- The executable is unsigned; Windows SmartScreen may warn. / 可执行文件未签名，Windows SmartScreen 可能提示风险。
- Conversations, credentials, settings, and attachments stay outside the release directory during updates. / 更新时，会话、凭据、设置和附件保存在发布目录之外。
