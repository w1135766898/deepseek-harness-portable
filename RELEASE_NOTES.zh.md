# DeepSeek Harness for Win v1.1.3

[English](RELEASE_NOTES.md)

Windows x64 便携版 · 2026-08-15

社区维护的分发版，不是 Microsoft 官方签名版本。

## 修复

- 恢复精致的蓝色原生鲸鱼菜单触发器，同时不再覆盖其他控件和禁用按钮的 pointer 行为。
- 保持原生 Logo 菜单到“更新日志”“检查更新”和“关于”的完整调用链。
- 手动检查更新失败时，改为打开居中更新中心并显示错误状态和重试入口，不再用原生对话框阻塞主窗口。

## 优化提升

- 桌面外壳、内置 Web runtime 和发行包现在可以基于固定的 `vendor/deepseek-harness` 源码 workspace 重新构建。
- 发布前继续校验 runtime 源码一致性、发布清单、压缩包布局和 SHA-256 校验和。
- 生成的构建目录和 TypeScript 缓存不再进入源码树；发行二进制文件作为 GitHub Release 附件发布。

## 组件版本

- 分发：1.1.3
- 桌面外壳：0.1.0-shell.2
- 内核：0.1.0-rc.5（@deepseek-ai/dsh-web-app）
- 标签：v1.1.3

## 校验和与安全

- 最终便携 ZIP 和 Setup 安装包的 SHA-256 会写入 `SHA256SUMS.txt`，并作为 GitHub Release 资产发布。
- 运行下载文件前请先核对 `SHA256SUMS.txt`。
- 可执行文件未签名，Windows SmartScreen 可能提示风险。
- 更新时，会话、凭据、设置和附件保存在发布目录之外。
