# DeepSeek Harness for Win v1.3.3

Windows x64 便携版 · 2026-08-19

这是本 Windows 分发版的 v1.3.3 维护/测试版本，重新发布最新 rc.7 桌面基线，并同步更新发布身份、更新器元数据、安装器文件名和校验值。

## 发布与更新可靠性

- **分发版本刷新**：将最新 rc.7 桌面基线重新整理为 1.3.3，并生成新的 Windows x64 便携 ZIP 与 Setup 安装包。
- **发布身份同步**：内置发布清单、更新器校验、安装器文件名、桌面文档和更新日志元数据统一指向 v1.3.3。
- **已验证产物刷新**：Windows ZIP 与 Setup 安装包从当前源码重新构建，完成原生插件 smoke 检查，并生成新的 SHA-256 校验值。
- **保留既有功能基线**：继续保留 v1.3.2 的 Learning 图示与原生选择、透明插件市场、原生图片附件、无控制台启动器和覆盖安装恢复能力。

## 组件版本

- 分发：1.3.3
- 桌面外壳：0.1.0-shell.2
- 运行时内核：0.1.0-rc.7

---

## English Release Notes

Windows x64 portable release · 2026-08-19

This is the v1.3.3 Windows maintenance/test build. It republishes the latest rc.7 desktop baseline and synchronizes release identity, updater metadata, installer filenames, and checksums.

### Release & Update Reliability

- **Versioned desktop refresh**: the latest rc.7 desktop baseline is repackaged as distribution v1.3.3 with a new Windows x64 portable ZIP and Setup installer.
- **Synchronized release identity**: the bundled release manifest, updater checks, installer filenames, desktop documentation, and release-notes metadata all target v1.3.3.
- **Verified artifact refresh**: the Windows ZIP and Setup installer are rebuilt from the current source, re-tested with native addon smoke checks, and accompanied by fresh SHA-256 values.
- **Feature baseline retained**: the build keeps the v1.3.2 Learning visuals and native choices, transparent plugin marketplace, native image attachments, no-console launcher, and overwrite-install recovery improvements.

### Component Versions

- Distribution: 1.3.3
- Desktop Shell: 0.1.0-shell.2
- Runtime Kernel: 0.1.0-rc.7

---

## 校验和与安全 / Checksums and security

最终便携 ZIP 和 Setup 安装包的 SHA-256 值会记录在 SHA256SUMS.txt，并作为 GitHub Release 附件发布。

The final portable ZIP and Setup installer SHA-256 values are recorded in SHA256SUMS.txt and attached to the GitHub Release.

```
1A95C50015B7121A92F8F1E8713456AE8B3AC20BEB3B54BD17BCFD26CF8476BF *DeepSeek-Harness-1.3.3-win32-x64.zip
38F3B938754474FAB614A767F5C66510ABB59407CBEA20F4D8894F32058D1050 *DeepSeek-Harness-Setup-1.3.3-win32-x64.exe
```
