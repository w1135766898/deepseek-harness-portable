# DeepSeek Harness for Win v1.0.4

[English](RELEASE_NOTES.md)

Windows x64 便携版 · 2026-08-15

社区维护的分发版，不是 Microsoft 官方签名版本。

## 主要更新

- 桌面操作菜单支持方向键、Enter、Escape、Alt 和 F10 键盘导航。
- “复制排障信息”会将运行时、工作区和最近启动信息复制到剪贴板。
- “清理本地缓存与存储”经确认后清理界面缓存和本地存储，并重启应用。

## 优化提升

- 桌面排障操作完成后，在应用内显示轻量反馈提示。
- 清理流程保留登录 cookies，同时清除应用缓存和 IndexedDB 数据。

## 修复

- 菜单关闭或执行操作后会重置焦点，避免残留旧的焦点状态。

## 组件版本

- 分发：1.0.4
- 桌面外壳：0.1.0-shell.2
- 内核：0.1.0-rc.5（@deepseek-ai/dsh-web-app）
- 标签：v1.0.4

## 校验和与安全

- 便携 ZIP SHA-256：22DC9AE99C18BF0DEBDFDEB560F00F3C99BC723F93D7EA7216C494BD2755A565
- 安装程序 SHA-256：E226AC007DB80D6738E0FDAF451F11A7B702A8E6B2837E1CED8FDB7362516155
- 运行前请核对 SHA256SUMS.txt。
- 可执行文件未签名，Windows SmartScreen 可能提示风险。
- 更新时，会话、凭据、设置和附件保存在发布目录之外。
