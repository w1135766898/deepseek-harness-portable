# DeepSeek Harness for Win v1.2.7

Windows x64 便携版 · 2026-08-17

这是本 Windows 分发版的 v1.2.7 版本，新增内置插件市场流程，修复基于已验证暂存内容的更新启动边界问题，并让 Windows 打包更快、更可复现。

## 新功能与体验优化

- **内置插件市场**：每个 Web profile 首次使用时预装固定版本的 `dsh-plugin-marketplace`。用户可以关闭或卸载它，选择会在重启和升级后保持。
- **市场工具自包含**：便携版通过 Electron 内置 Node.js 运行时提供 DSH 插件 CLI 和 pnpm，市场操作无需系统 Node.js 环境。
- **已验证更新恢复**：启动器和更新器可从已验证的暂存目录修复发行版自有文件，同时保留事务与回滚安全性。
- **跨盘符 Setup 安装**：安装器将 staging 保持在用户选择的应用目录下，即使安装到 D: 或 E:，runtime 激活也始终使用同卷重命名。
- **运行时占用恢复**：覆盖安装会可靠结束桌面进程树，并重试释放 Electron/Node 文件句柄，避免运行中的旧版本阻断 runtime 切换。
- **启动脚本兼容性**：统一 Windows CMD 脚本的 CRLF 行尾并避免非 ASCII 控制台命令，修复 Finish 后启动时出现 `errorlevel` 或乱码命令错误。
- **启动器事务检测**：启动脚本兼容 PowerShell 5.1 JSON 的空格格式，正确识别 committed/rolled-back 状态，避免每次启动不必要的恢复延迟。
- **内容寻址打包缓存**：对构建、暂存和 Electron 产物层生成指纹并安全复用，支持显式 `--no-cache`，并校验发布归档布局。

## 组件版本

- 分发：1.2.7
- 桌面外壳：0.1.0-shell.2
- 运行时内核：0.1.0-rc.5

---

## English Release Notes

Windows x64 portable release · 2026-08-17

This is the v1.2.7 release of this Windows distribution. It adds a bundled plugin marketplace workflow, repairs update bootstrap edge-cases from verified staging, and makes Windows packaging faster and more reproducible.

### New Features & Improvements

- **Bundled plugin marketplace**: each Web profile receives the pinned `dsh-plugin-marketplace` package once. Users can disable or remove it, and that choice persists across restarts and upgrades.
- **Self-contained marketplace tooling**: the portable release includes the DSH plugin CLI and pnpm behind the embedded Electron Node.js runtime, so marketplace operations do not require a system Node.js installation.
- **Verified update recovery**: startup and updater flows can repair release-owned payload files from verified staging while preserving transaction and rollback safety.
- **Cross-volume Setup installs**: installer staging now stays under the selected application directory, so runtime activation remains a same-volume rename even when installing to D: or E:.
- **Runtime lock recovery**: in-place Setup upgrades reliably terminate the desktop process tree and retry Electron/Node handle release, so a running old version no longer blocks the runtime switch.
- **Startup script compatibility**: Windows CMD scripts now use CRLF line endings and ASCII control messages, preventing `errorlevel` or garbled-command failures when Setup launches the app from Finish.
- **Launcher transaction detection**: startup wrappers tolerate PowerShell 5.1 JSON whitespace when checking committed or rolled-back transactions, avoiding unnecessary recovery delays.
- **Content-addressed packaging cache**: successful build, staging, and Electron layers are fingerprinted and safely reused, with explicit `--no-cache` support and release archive layout checks.

### Component Versions

- Distribution: 1.2.7
- Desktop Shell: 0.1.0-shell.2
- Runtime Kernel: 0.1.0-rc.5

---

## 校验和与安全 / Checksums and security

最终便携 ZIP 和 Setup 安装包的 SHA-256 值会记录在 SHA256SUMS.txt，并作为 GitHub Release 附件发布。

The final portable ZIP and Setup installer SHA-256 values are recorded in SHA256SUMS.txt and attached to the GitHub Release.

```
469F24F9BFBCF010780E2B7E58435DA3596DCCD18832E7104E2256DFA9191EE6 *DeepSeek-Harness-1.2.7-win32-x64.zip
0A5C42D172E5D4D0D9D48B9F633EB1A75EBEFFF6670228889B85D86C2ECA02A0 *DeepSeek-Harness-Setup-1.2.7-win32-x64.exe
```
