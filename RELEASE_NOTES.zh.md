# DeepSeek Harness for Win v1.0.7

[English](RELEASE_NOTES.md)

Windows x64 便携版 · 2026-08-15

社区维护的分发版，不是 Microsoft 官方签名版本。

## 主要更新

- 在 JavaScript 运行时、CLI 与 PowerShell 更新脚本中统一实现了 SemVer 2.0 解析器与优先级比较器。
- 新增基于 taskkill 并带 PID 复用安全校验的 Windows 完整进程树终止能力。
- 实现配置存储的原子写入、自动备份、损坏回退与模式版本升级机制。
- 桌面端更新日志摘要新增分节徽标计数展示。

## 优化提升

- 更新器重构为事务化流程：更新前自动备份、布局校验、更新后回环健康探针与失败自动回滚。
- 独立 `update.ps1` 脚本全面模块化复用 `updater.psm1` 核心逻辑。
- 新增覆盖校验和、镜像回退、路径防逃逸、进程树、回滚事务与版本比较的 6 组 Pester 自动化测试套件。

## 修复

- 保证旧会话数据向 `.dsh/sessions` 迁移的幂等性，增加 `.migrated` 标记与生命周期排序保护。
- 修复便携运行时元数据过期隐患，增加发布打包前的源码哈希一致性严格校验门禁。

## 组件版本

- 分发：1.0.7
- 桌面外壳：0.1.0-shell.2
- 内核：0.1.0-rc.5（@deepseek-ai/dsh-web-app）
- 标签：v1.0.7

## 校验和与安全

- 便携 ZIP SHA-256：`49482891EB11355B3045FB1D487182651F8CD77540C23013E1AEC649CCAE1E4A`
- 安装程序 SHA-256：`0E1ABBDC4A37D2448FBF6CC496230B61180025CDFEA9E222D4055FF96BFEA8C0`
- 运行前请核对 SHA256SUMS.txt。
- 可执行文件未签名，Windows SmartScreen 可能提示风险。
- 更新时，会话、凭据、设置和附件保存在发布目录之外。
