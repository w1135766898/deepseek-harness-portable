# DeepSeek Harness for Win v1.3.2

Windows x64 便携版 · 2026-08-18

这是本 Windows 分发版的 v1.3.2 测试版本，继续使用 rc.7 runtime，并修复桌面端“关于”和“更新记录”入口未可靠打开原生窗口的问题。

## 新功能与体验优化

- **Windows 无控制台启动**：桌面与开始菜单快捷方式改用 GUI 引导程序，在保留更新中断恢复能力的同时不再闪现命令行窗口；现有快捷方式会自动迁移，并可随版本回滚安全恢复。
- **可靠的关于与更新记录入口**：桌面菜单操作直接打开原生模态窗口，不再绕行 Web runtime 菜单桥接。
- **Learning 原生交互**：方向、深度和节奏使用客户端原生选择；教学图示直接出现在助手消息中，并支持持久回放与文字等价说明。
- **覆盖安装首次启动修复**：profile 依赖保持优先，Setup Finish 启动遇到 junction 替换窗口时回退到已安装 runtime。
- **历史兼容修复**：兼容旧版 `portable-runtime/mode-resolution` 事件，并将新写入事件标记为可忽略。
- **插件透明度**：安装确认前展示来源、运行环境、网络/图像外发、激活、降级与验证信息；未知插件明确标记为未验证。
- **rc.7 原生图片链路**：支持图像的模型使用持久化附件；纯文本模型保留显式、可见外发的 `view_image` 路径。
- **内置插件市场**：每个 Web profile 首次使用时预装固定版本的 `dsh-plugin-marketplace`。用户可以关闭或卸载它，选择会在重启和升级后保持。
- **市场工具自包含**：便携版通过 Electron 内置 Node.js 运行时提供 DSH 插件 CLI 和 pnpm，市场操作无需系统 Node.js 环境。
- **已验证更新恢复**：启动器和更新器可从已验证的暂存目录修复发行版自有文件，同时保留事务与回滚安全性。
- **跨盘符 Setup 安装**：安装器将 staging 保持在用户选择的应用目录下，即使安装到 D: 或 E:，runtime 激活也始终使用同卷重命名。
- **运行时占用恢复**：覆盖安装会可靠结束桌面进程树，并重试释放 Electron/Node 文件句柄，避免运行中的旧版本阻断 runtime 切换。
- **启动脚本兼容性**：统一 Windows CMD 脚本的 CRLF 行尾并避免非 ASCII 控制台命令，修复 Finish 后启动时出现 `errorlevel` 或乱码命令错误。
- **启动器事务检测**：启动脚本兼容 PowerShell 5.1 JSON 的空格格式，正确识别 committed/rolled-back 状态，避免每次启动不必要的恢复延迟。
- **内容寻址打包缓存**：对构建、暂存和 Electron 产物层生成指纹并安全复用，支持显式 `--no-cache`，并校验发布归档布局。

## 组件版本

- 分发：1.3.2
- 桌面外壳：0.1.0-shell.2
- 运行时内核：0.1.0-rc.7

---

## English Release Notes

Windows x64 portable release · 2026-08-18

This is the v1.3.2 Windows test build. It keeps the rc.7 runtime and fixes unreliable desktop About and release-notes entry points.

### New Features & Improvements

- **No-console Windows startup**: desktop and Start menu shortcuts use a GUI bootstrap that preserves interrupted-update recovery without flashing a command window; existing shortcuts migrate automatically and roll back safely.
- **Reliable About and release notes**: desktop menu actions open the native modal directly instead of routing through the Web runtime menu bridge.
- **Native Learning interaction**: direction, depth, and pace use the client choice control; teaching graphics render inside assistant messages with durable replay and text equivalents.
- **Overwrite-install first-launch fix**: profile dependencies retain priority, with an installed-runtime fallback during the Setup Finish junction replacement window.
- **Session compatibility fix**: legacy `portable-runtime/mode-resolution` events load, and new events are explicitly marked ignorable.
- **Plugin transparency**: confirmation shows source, runtime, network/image egress, activation, degradation, and verification details; unknown plugins are marked unverified.
- **Native rc.7 image path**: image-capable models use persisted attachments, while text-only models retain the explicit, disclosed external `view_image` path.
- **Bundled plugin marketplace**: each Web profile receives the pinned `dsh-plugin-marketplace` package once. Users can disable or remove it, and that choice persists across restarts and upgrades.
- **Self-contained marketplace tooling**: the portable release includes the DSH plugin CLI and pnpm behind the embedded Electron Node.js runtime, so marketplace operations do not require a system Node.js installation.
- **Verified update recovery**: startup and updater flows can repair release-owned payload files from verified staging while preserving transaction and rollback safety.
- **Cross-volume Setup installs**: installer staging now stays under the selected application directory, so runtime activation remains a same-volume rename even when installing to D: or E:.
- **Runtime lock recovery**: in-place Setup upgrades reliably terminate the desktop process tree and retry Electron/Node handle release, so a running old version no longer blocks the runtime switch.
- **Startup script compatibility**: Windows CMD scripts now use CRLF line endings and ASCII control messages, preventing `errorlevel` or garbled-command failures when Setup launches the app from Finish.
- **Launcher transaction detection**: startup wrappers tolerate PowerShell 5.1 JSON whitespace when checking committed or rolled-back transactions, avoiding unnecessary recovery delays.
- **Content-addressed packaging cache**: successful build, staging, and Electron layers are fingerprinted and safely reused, with explicit `--no-cache` support and release archive layout checks.

### Component Versions

- Distribution: 1.3.2
- Desktop Shell: 0.1.0-shell.2
- Runtime Kernel: 0.1.0-rc.7

---

## 校验和与安全 / Checksums and security

最终便携 ZIP 和 Setup 安装包的 SHA-256 值会记录在 SHA256SUMS.txt，并作为 GitHub Release 附件发布。

The final portable ZIP and Setup installer SHA-256 values are recorded in SHA256SUMS.txt and attached to the GitHub Release.

```
4A2A4E05F50102FB285E6C7B152F7BEDD6D86EC5FAF978C9C41500AA20AB2AC2 *DeepSeek-Harness-1.3.2-win32-x64.zip
4985F3BF95AA2E58DE90AAC241F4E7DB1256AB0FE5D7F7EBF2CF520DC93A116F *DeepSeek-Harness-Setup-1.3.2-win32-x64.exe
```
