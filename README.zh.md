# DeepSeek Harness Windows 便携式分发物

[English](README.md) | 中文

这个目录说明 DeepSeek Harness 的个人 Windows 分发渠道。原生桌面外壳是未封装的 Electron 目录；单文件 Web 可执行文件会启动本地 Web 服务并在默认浏览器中打开。两种分发物都不是官方签名版本。

## 下载

原生桌面外壳请下载完整的 `DeepSeek Harness-win32-x64` 目录；单文件浏览器启动器请下载 `dsh-desktop-web-<version>-win-x64.exe`。原生目录中的所有文件必须保持在一起。

## 使用原生桌面外壳

运行 `DeepSeek Harness.exe`。外壳会启动本地运行时，在自己的窗口中显示 Web 界面，保留托盘入口，记住所选 workspace，并使用 DeepSeek 图标。关闭窗口时会隐藏窗口；请使用托盘菜单退出或重启。

## 使用单文件启动器

运行 `.exe` 会启动本地 Web 服务并打开默认浏览器。其他启动器负责打开界面时传入 `--no-open`。服务只绑定到 `127.0.0.1`；实际分配的端口会由可执行文件报告。

可以在启动环境中设置 `DEEPSEEK_API_KEY`，也可以在 Web 界面设置中填写。两种分发物都会为本地桌面渠道关闭 telemetry。

## 数据与便携性

原生外壳把偏好和运行时数据保存在 Electron 的用户数据目录下。单文件启动器在提供 `DSH_HOME` 时使用该目录，否则把便携式 `.dsh` home 保存在可执行文件旁边。移动便携式环境时，请把原生目录整体复制，或把单文件可执行文件与对应的 `.dsh` 目录一起复制。

删除对应的用户数据目录可以重置本地环境。不要把 API key 放进仓库，也不要把它和可执行文件一起分享。

## 重新构建

在安装了 Node.js `^22.19.0 || >=24` 和 pnpm 的 Windows x64 checkout 中运行：

```powershell
pnpm install
pnpm run build
pnpm run desktop:package:win
pnpm exec tsx scripts/build-desktop-web-exe.ts
```

原生输出写入 `dist-desktop/electron/`；单文件输出写入 `dist-exe/`。首次构建时会下载 Electron 和 SEA Node 基础运行时。

## 安全与发布状态

本地 Web 服务默认只监听回环地址。可执行文件当前没有代码签名、安装程序或自动更新通道，首次启动时可能触发 Windows SmartScreen 警告。

部分杀毒软件（实测火绒）会在首次写入或下载时静默隔离未签名的 pkg/Electron 可执行文件。请核对每个 Release 随附的 SHA-256 校验值；若被杀毒软件拦截，请从隔离区恢复或为该目录添加信任，恢复后再次核对校验值再运行。

DeepSeek Harness 使用 [MIT](LICENSE) 许可证。第三方声明位于 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
