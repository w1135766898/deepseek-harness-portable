# DeepSeek Harness Windows 便携式分发物

[English](README.md) | 中文

这个目录说明 DeepSeek Harness 的个人 Windows 分发渠道。发布物是未封装的 Electron 原生桌面外壳，会在自己的窗口中启动本地 Web 运行时。它不是官方签名版本。

## 快速安装与自动更新

### 1. 一键在线安装（推荐）
在 Windows PowerShell 中粘贴并运行以下命令，即可全自动完成最新版本的下载、解压、桌面快捷方式创建与环境变量配置：

```powershell
irm https://raw.githubusercontent.com/w1135766898/deepseek-harness-portable/main/install.ps1 | iex
```

- 安装完成后，可直接在桌面打开 **DeepSeek Harness**，或在任何终端输入 **`dsh`** 启动。

### 2. 快速热更新（免重新下载大包）
当后续发布新版本时，无需手动重新下载完整压缩包，使用以下任一方式即可在 3 秒内完成增量升级并保留所有数据：
- **方式 A**：双击软件根目录下的 **`update.cmd`**。
- **方式 B**：在任何终端中直接执行命令：
  ```powershell
  dsh update
  ```

---

## 手动便携式运行方式

若您选择直接下载 Release 压缩包（`DeepSeek-Harness-*-win32-x64.zip`），解压后提供以下三种启动方式：

1. **方式一：双击 `start-web.cmd`（推荐 ⭐⭐⭐⭐⭐，100% 免疫拦截）**
   - 通过系统已安装的官方签名 Node.js 运行时启动 Web 引擎，自动在默认浏览器中打开 `http://127.0.0.1:3080`。
   - 完全绕过 Windows 11 智能应用控制（SAC）与 SmartScreen 拦截，所有功能、预设与插件完全一致。
2. **方式二：双击 `DeepSeek Harness.exe`（原生独立桌面窗口）**
   - 启动独立桌面应用窗口与右下角系统托盘。
   - **若遇到 Windows 11 智能应用控制（SAC）强制拦截**：直接双击运行目录内的 **`一键解除拦截(自签名信任).bat`**（或以管理员身份运行），即可自动在当前电脑生成并信任专属安全签名，之后便可直接双击 exe 启动。
3. **方式三：双击 `start-desktop.cmd`（官方 Electron 独立窗口）**
   - 通过官方签名版 Electron 加载应用窗口，兼顾独立窗口体验与防拦截。

可以在启动环境中设置 `DEEPSEEK_API_KEY`，也可以在 Web 界面设置中填写。桌面分发物会为本地渠道关闭 telemetry。


## 数据与便携性

原生外壳把偏好和运行时数据保存在 Electron 的用户数据目录下。移动便携式环境时，请把原生目录整体复制。

删除对应的用户数据目录可以重置本地环境。不要把 API key 放进仓库，也不要把它和可执行文件一起分享。

## 重新构建

在安装了 Node.js `^22.19.0 || >=24` 和 pnpm 的 Windows x64 checkout 中运行：

```powershell
pnpm install
pnpm run build
pnpm run desktop:package:win
```

原生输出写入 `dist-desktop/electron/`。构建会在打包前校验 Electron 运行时；如果安装时跳过了生命周期脚本，会在此处下载 Electron。

## 安全与发布状态

本地 Web 服务默认只监听回环地址。桌面可执行文件当前没有商业 CA 代码签名，首次启动时可能触发 Windows SmartScreen 警告或 Windows 11 智能应用控制（SAC）提示。

- **普通 SmartScreen 警告**：点击“更多信息” -> “仍要运行”即可。
- **智能应用控制（SAC）拦截**：直接使用 `start-web.cmd`，或运行 `一键解除拦截(自签名信任).bat` 添加本机信任。
- 部分杀毒软件（实测火绒）会在首次写入或下载时静默隔离未签名的可执行文件。请核对随附的 SHA-256 校验值；若被杀毒软件拦截，请从隔离区恢复或为该目录添加信任。当前 Release 的校验值记录在 [SHA256SUMS.txt](SHA256SUMS.txt) 中。

DeepSeek Harness 使用 [MIT](LICENSE) 许可证。第三方声明位于 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。

