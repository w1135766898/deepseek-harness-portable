# DeepSeek Harness for Win — 桌面外壳

[English](README.md)

这个 workspace 包构建 DeepSeek Harness for Win v1.0.1 的原生 Electron 桌面外壳。它会在回环地址启动现有 Web runtime，将页面嵌入 BrowserWindow，并保留托盘图标提供桌面操作。

## 运行能力

- 在 127.0.0.1 启动打包的 dsh Web runtime。
- 将工作区选择保存在 Electron 用户数据中。
- 用户数据默认保存在官方 DSH_HOME 根目录，即 %USERPROFILE%\.dsh。
- 托盘和应用菜单提供工作区、浏览器模式、更新、更新日志和关于入口。
- 从 GitHub 或配置的镜像获取发布说明，并支持缓存和本地清单离线降级。
- 在主窗口内显示更新 Banner，点击后在当前窗口滑出更新日志抽屉；不再创建独立通知窗口或二级更新窗口。
- Windows 11 下使用 Mica/标题栏覆盖与系统主题同步，并记忆窗口位置、尺寸和最大化状态。

## 构建与测试

使用 Node.js ^22.19.0 或 >=24，以及 pnpm。

    pnpm install
    pnpm run build
    pnpm run desktop:test
    pnpm run desktop:dev
    pnpm run desktop:package:win

原生构建会下载 Electron，目标平台为 Windows x64。打包输出是便携目录：

    dist-desktop/electron/DeepSeek Harness-win32-x64/
    └─ runtime/DeepSeek Harness.exe

## 发布身份

- 发布：DeepSeek Harness for Win v1.0.1
- 分发：1.0.1
- 外壳：0.1.0-shell.2
- 内核：读取打包后的 @deepseek-ai/dsh-web-app manifest

release-manifest.json 会写入 runtime 同级目录，记录分发版本、桌面外壳版本、内核版本、内核 Git 提交和本地发布说明。

## 用户数据与安全

外壳将 Web 服务绑定到回环地址，并设置 DSH_TELEMETRY_DISABLED=1。工作区设置和桌面端发布说明状态保存在 Electron 用户数据中，不会写入打包应用目录。

请在 Web UI 设置中配置 DeepSeek API key，或在启动可执行文件的环境中提供。当前可执行文件没有可信商业 CA 签名，首次运行时 Windows SmartScreen 可能发出警告。

## 卸载

Setup 卸载器和便携版卸载脚本默认保留会话、凭据、设置、附件和桌面偏好；只有明确确认后才会删除数据。
