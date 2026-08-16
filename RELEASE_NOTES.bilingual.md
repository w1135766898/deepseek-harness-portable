# DeepSeek Harness for Win v1.2.5

Windows x64 便携版 · 2026-08-16

这是本 Windows 分发版的 v1.2.5 版本，修复了更新日志与更新检测模块在未显式提供资产文件名时的误报问题，并在所有合法的 SemVer 版本下自动推导标准便携分发包文件名，确保应用内更新与提示保持准确同步。

## 问题修复与体验优化

- **修复更新检测误报与资产包回退推导**：修复当通过 Mirror/Raw 渠道拉取更新日志或历史记录中未显式指定 `assetName` 时导致模态框误判为“当前已是最新版本”的问题，并为所有合法 SemVer 版本自动推导标准便携分发包文件名（`DeepSeek-Harness-${version}-win32-x64.zip`）。

## 组件版本

- 分发：1.2.5
- 桌面外壳：0.1.0-shell.2
- 运行时内核：0.1.0-rc.5

---

## English Release Notes

Windows x64 portable release · 2026-08-16

This is the v1.2.5 release of this Windows distribution, fixing an updater detection issue where releases without explicit asset names caused false "up to date" status reports, and automatically deriving standard portable asset filenames across valid SemVer releases.

### Bug Fixes & Improvements

- **Updater Detection & Asset Fallback**: Fixed an issue where new releases fetched via raw release notes or history without an explicit `assetName` field caused the update dialog to falsely report "You are running the latest version", and automatically derives standard package names (`DeepSeek-Harness-${version}-win32-x64.zip`) for valid SemVer releases.

### Component Versions

- Distribution: 1.2.5
- Desktop Shell: 0.1.0-shell.2
- Runtime Kernel: 0.1.0-rc.5

---

## 校验和与安全 / Checksums and security

每个最终发布构件均经 SHA-256 校验和验证：

Every final release artifact is verified with a SHA-256 checksum:

```
EFC849607DE021C9F5F147C367C1A59F6D87BD3482A278B06CC151B6F3E26292 *DeepSeek-Harness-1.2.5-win32-x64.zip
9494D7F7F0733118D28910EFEBCAAAC709B236225369A7A6975939C6B9B95445 *DeepSeek-Harness-Setup-1.2.5-win32-x64.exe
```
