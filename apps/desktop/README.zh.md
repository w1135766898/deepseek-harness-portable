# dsh-desktop-web-pkg

[English](README.md) | 中文

这个私有 workspace 包为 DeepSeek Harness 的 Web 界面构建两种 Windows 分发物：原生 Electron 桌面外壳，以及在默认浏览器中打开同一个本地 Web 界面的单文件可执行文件。

## 原生桌面外壳

在仓库根目录运行 pnpm run desktop:package:win，会生成 dist-desktop/electron/DeepSeek Harness-win32-x64/DeepSeek Harness.exe。输出目录是便携式目录；将整个目录复制或压缩后，可在 Windows x64 上直接运行，不需要安装 Node.js。

Electron 外壳会在回环地址启动现有的 dsh web 运行时，把返回的地址嵌入 BrowserWindow，保留托盘图标，记住所选 workspace，并使用 apps/desktop/assets/deepseek.ico 作为窗口、托盘和 Windows 可执行文件图标。

## 单文件 Web 可执行文件

运行 pnpm exec tsx scripts/build-desktop-web-exe.ts，会生成 dist-exe/dsh-desktop-web-<version>-win-x64.exe。这个路径会启动本地 Web 服务并打开默认浏览器；传入 --no-open 可让它用于启动器或脚本而不自动打开浏览器。

单文件可执行文件会通过 Windows 资源编辑器写入同一个 deepseek.ico。Electron 分发物提供完整的桌面体验；单文件路径继续适合偏好浏览器启动方式的场景。

## 运行时行为

两种分发物都会把 Web 服务绑定到 127.0.0.1，并设置 DSH_TELEMETRY_DISABLED=1。Electron 外壳把 workspace 偏好和运行时 home 保存在 Electron 的用户数据目录下，关闭窗口时隐藏窗口，并在应用退出时停止子运行时。

可以在 Web 界面设置中配置 DeepSeek API key，也可以在启动可执行文件时提供环境变量。workspace 选择和其他应用数据属于用户数据，不会写入只读的打包应用目录。

## 开发

使用 Node.js ^22.19.0 || >=24 和 pnpm。在仓库根目录运行 pnpm install、pnpm run desktop:test、pnpm run desktop:dev 或 pnpm run desktop:package:win。原生构建会在安装依赖时下载 Electron，并以 Windows x64 为目标。

## 限制

原生输出是未封装的便携式目录，不是安装程序；当前没有代码签名和自动更新通道，因此首次运行时 Windows SmartScreen 可能会发出警告。仓库中的图标由现有 Web favicon 生成；发布签名和安装程序品牌化仍是独立工作。
