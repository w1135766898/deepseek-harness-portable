# DeepSeek Harness for Win v1.4.0

Windows x64 便携版 · 2026-08-20

这是本 Windows 分发版的 v1.4.0 版本：将固定的运行时内核从 0.1.0-rc.7 升级到 0.1.0-rc.8，在其之上重建桌面基线，并以新的分发身份与校验值刷新发布产物。

## 发布与更新可靠性

- **内核升级到 rc.8**：固定的 DeepSeek Harness 内核从 0.1.0-rc.7 升级到 0.1.0-rc.8，并在其之上将桌面基线重建为 1.4.0，生成新的 Windows x64 便携 ZIP 与 Setup 安装包。
- **视觉辅助改走原生模型通道**：`view_image` 现在通过附件服务提交图片，并经内核 LLM 通道调用已配置的图像模型，沿用你现有的服务商凭据、重试策略与用量计量，不再单独维护端点与 API 密钥。
- **发布身份同步**：内置发布清单、更新器校验、安装器文件名、桌面文档和更新日志元数据统一指向 v1.4.0。
- **已验证产物刷新**：Windows ZIP 与 Setup 安装包从当前源码重新构建，完成原生插件 smoke 检查，并生成新的 SHA-256 校验值。
- **保留既有功能基线**：继续保留 v1.3.3 的 Learning 图示与原生选择、透明插件市场、原生图片附件、无控制台启动器和覆盖安装恢复能力。

## 组件版本

- 分发：1.4.0
- 桌面外壳：0.1.0-shell.2
- 运行时内核：0.1.0-rc.8

---

## English Release Notes

Windows x64 portable release · 2026-08-19

This is the v1.4.0 Windows build. It moves the pinned runtime kernel from 0.1.0-rc.7 to 0.1.0-rc.8, rebuilds the desktop baseline on top of it, and refreshes the release artifacts with a new distribution identity and checksums.

### Release & Update Reliability

- **Kernel upgrade to rc.8**: the pinned DeepSeek Harness kernel moves from 0.1.0-rc.7 to 0.1.0-rc.8, and the desktop baseline is rebuilt on it as distribution v1.4.0 with a new Windows x64 portable ZIP and Setup installer.
- **Vision Bridge on the native model path**: `view_image` now commits images through the attachment service and calls a configured image-capable model over the kernel LLM channel, reusing your existing provider credentials, retry policy, and usage metering instead of its own endpoint and API key.
- **Synchronized release identity**: the bundled release manifest, updater checks, installer filenames, desktop documentation, and release-notes metadata all target v1.4.0.
- **Verified artifact refresh**: the Windows ZIP and Setup installer are rebuilt from the current source, re-tested with native addon smoke checks, and accompanied by fresh SHA-256 values.
- **Feature baseline retained**: the build keeps the v1.3.3 Learning visuals and native choices, transparent plugin marketplace, native image attachments, no-console launcher, and overwrite-install recovery improvements.

### Component Versions

- Distribution: 1.4.0
- Desktop Shell: 0.1.0-shell.2
- Runtime Kernel: 0.1.0-rc.8

---

## 校验和与安全 / Checksums and security

最终便携 ZIP 和 Setup 安装包的 SHA-256 值会记录在 SHA256SUMS.txt，并作为 GitHub Release 附件发布。

The final portable ZIP and Setup installer SHA-256 values are recorded in SHA256SUMS.txt and attached to the GitHub Release.

```
EB342BBFD772D658233CA05CBCA61E6A6946F0842A504B3F020F90B17A133377 *DeepSeek-Harness-1.4.0-win32-x64.zip
63EB85CAD8423E74F441D3B389666ABD2837110AAEB2D565E4D3E53672477B1B *DeepSeek-Harness-Setup-1.4.0-win32-x64.exe
```
