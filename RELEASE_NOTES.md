# DeepSeek Harness for Win v1.0.0

English / 中文

## Release identity / 发布信息

- Release / 发布：DeepSeek Harness for Win v1.0.0
- Tag / 标签：v1.0.0
- Distribution version / 分发版本：1.0.0
- Desktop shell version / 桌面外壳版本：0.1.0-shell.1
- Kernel version / 内核版本：0.1.0-rc.5 (@deepseek-ai/dsh-web-app)
- Download / 下载：[GitHub Release](https://github.com/wsnxxxs/deepseek-harness-portable/releases/tag/v1.0.0)

This is a community Windows x64 distribution. It is not an official Microsoft-signed build.

这是社区维护的 Windows x64 分发版，不是 Microsoft 官方签名版本。

## Features / 新功能

- In-app release notes and release history from the tray and application menus.
- 应用内更新日志和历史发布记录，可从托盘及应用菜单打开。
- A component view for distribution, desktop shell, kernel, and kernel Git commit.
- “关于”页面展示分发版本、桌面外壳、内核和内核 Git 提交。
- A What's New card after the first startup on a new version.
- 新版本首次启动显示 What's New 更新欢迎卡片。

## Improvements / 优化提升

- Update checks show the release summary before starting the portable updater.
- 检查更新时会先展示发布摘要，再启动便携版更新器。
- Release notes use GitHub plus the configured mirror, with cached and bundled offline fallback.
- 发布说明支持 GitHub、配置的镜像、缓存和本地清单离线降级。
- The release manifest records the independent distribution, desktop shell, kernel, kernel commit, and bundled notes.
- 发布清单记录独立的分发版本、桌面外壳、内核、内核提交和本地发布说明。
- README and release documentation now use bilingual English and Chinese sections.
- README 和发布文档统一提供 English / 中文双语内容。

## Bug fixes / 问题修复

- Desktop release-note state is stored without overwriting the existing workspace preference.
- 桌面端发布说明状态会保存在用户配置中，不会覆盖已有工作区设置。
- Remote release links are validated and opened through the system browser.
- 远程发布链接会先校验，再交由系统默认浏览器打开。

## Integrity / 完整性校验

- Portable ZIP SHA-256 / 便携 ZIP SHA-256：
  7272DBB3F40C7E6603A1A3BF29ECA6B4C3B2D878BFEE1E410E1471E959B4A0F8
- Setup SHA-256 / Setup SHA-256：
  3399BD8F0A538A0A56C6DA7A2105BBFF4717BE05D8E14433A2B8571D37A7B4C6

Verify SHA256SUMS.txt before launching downloaded files.

运行下载文件前，请先核对 SHA256SUMS.txt。

## Security notice / 安全提示

The desktop executable is not signed by a trusted commercial CA. Windows SmartScreen or Smart App Control may warn or block it. This project does not automatically create certificates or modify trust stores.

当前桌面可执行文件没有可信商业 CA 签名，Windows SmartScreen 或 Smart App Control 可能发出警告或阻止运行。本项目不会自动创建证书或修改信任存储。

User conversations, credentials, settings, and attachments remain outside the release directory during updates.

更新过程中，用户会话、凭据、设置和附件都会保存在发布目录之外。
