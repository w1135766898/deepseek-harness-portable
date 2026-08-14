# DeepSeek Harness Windows 便携式分发物

[English](README.md) | 中文

这个目录说明 DeepSeek Harness 的个人 Windows 分发渠道。发布物是未封装的 Electron 原生桌面外壳，会在自己的窗口中启动本地 Web 运行时。它不是官方签名版本。

## 快速安装方式（三选一）

### 方式一：标准 Windows 单文件安装包 (Setup.exe，新手首选)
从 Release 页面直接下载 **`DeepSeek-Harness-Setup-0.1.0-rc.5-win32-x64.exe`**：
- **双击即装**：无需任何解压工具，双击安装包即可一步到位。
- **规范安装路径**：自动安装至 `%LOCALAPPDATA%\Programs\DeepSeek Harness`（无需管理员 UAC 权限）。
- **全自动系统集成**：自动创建桌面图标、开始菜单入口，并注册到 Windows 控制面板“已安装的应用/添加或删除程序”（可随时一键彻底干净卸载）。
- **内置安全证书**：安装过程中自动配置本机代码签名信任，彻底免疫 Windows 11 智能应用控制 (SAC) 拦截。

---

### 方式二：终端一键极速在线安装 (PowerShell)
在 Windows PowerShell 终端中粘贴并运行以下命令，全自动完成下载、安装、桌面快捷方式创建与环境变量配置：

- **🇨🇳 中国大陆用户推荐（内置国内高速镜像通道）**：
  ```powershell
  irm https://ghfast.top/https://raw.githubusercontent.com/w1135766898/deepseek-harness-portable/main/install.ps1 | iex
  ```
- **🌍 海外/直连用户**：
  ```powershell
  irm https://raw.githubusercontent.com/w1135766898/deepseek-harness-portable/main/install.ps1 | iex
  ```

---

### 方式三：免安装绿色便携版 (ZIP)
下载 **`DeepSeek-Harness-0.1.0-rc.5-win32-x64.zip`**，解压到任意文件夹后直接双击 **`启动网页版.bat`** 即可即开即用，随身携带，不污染系统。

---

## 快速热更新（免重新下载大包）
当后续发布新版本时，自动通过多节点加速通道增量升级，保留所有用户数据与配置：
- **方式 A**：双击软件根目录下的 **`在线更新.bat`**。
- **方式 B**：在任何终端中直接执行命令：
  ```powershell
  dsh update
  ```

---

## 绿色便携版目录结构与使用说明

若您选择直接下载 Release 压缩包（`DeepSeek-Harness-*-win32-x64.zip`），解压后根目录结构清晰极简，底层 29,000+ 个运行库文件已全部收纳至 `runtime/` 目录中：

```text
📦 DeepSeek Harness-win32-x64/
 ├── 启动网页版.bat                             <-- 主启动入口 (100% 免疫拦截，双击即可)
 ├── 启动桌面窗口.bat                           <-- 备用原生桌面窗口
 ├── 在线更新.bat                               <-- 一键在线增量热升级
 ├── 创建桌面快捷方式.bat                       <-- 桌面快捷方式与本机证书信任
 ├── 使用说明.txt                               <-- 新手快速上手指南
 ├── dsh.cmd                                   <-- CLI 命令行入口
 └── 📂 runtime/                               <-- 底层运行库与依赖核心 (请勿删除)
```

### 启动方式选择：
1. **主推荐：双击 `启动网页版.bat`**
   - 自动调用官方签名的 Node.js 运行时启动 Web 引擎，并在默认浏览器中打开 `http://127.0.0.1:3080`。
   - **彻底免疫 Windows 11 智能应用控制 (SAC) 与 SmartScreen 拦截**。
2. **备用窗口：双击 `启动桌面窗口.bat`**
   - 启动独立桌面应用窗口与右下角系统托盘。
   - 若遇到 Windows 11 智能应用控制 (SAC) 拦截，只需运行一次 **`创建桌面快捷方式.bat`** 即可永久解除拦截。



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

