# DeepSeek Harness Desktop — 桌面外壳

[English](README.md)

这个 workspace 包构建 DeepSeek Harness Desktop 的原生 Electron 桌面外壳，支持 Windows、macOS 和 Linux。它会在回环地址启动现有 Web runtime，将页面嵌入 BrowserWindow，并保留托盘/应用菜单提供桌面操作。

## 运行能力

- 在 127.0.0.1 启动打包的 dsh Web runtime。
- 将工作区选择保存在 Electron 用户数据中。
- 用户数据默认保存在官方 DSH_HOME 根目录：Windows 为 `%USERPROFILE%\.dsh`，Linux/macOS 为 `$HOME/.dsh`。
- 托盘和应用菜单提供工作区、浏览器模式、更新、更新日志和关于入口。
- 从 GitHub 或配置的镜像获取发布说明，并支持缓存和本地清单离线降级。
- Windows 在应用内显示便携版更新的下载与校验进度，完成后再询问是否重启；Linux/macOS 打开发布页手动下载对应产物。
- 在标题栏下方居中显示紧凑更新横幅，7 秒或关闭后销毁，支持按版本忽略，并在当前窗口打开居中卡片式更新中心。
- 原生侧边栏 Logo 融合桌面菜单：展开态左键打开菜单，收起态左键展开侧边栏、右键打开菜单。
- Windows 11 下使用 Mica/标题栏覆盖与系统主题同步，并记忆窗口位置、尺寸和最大化状态。
- Windows 极简模式通过 WSL Bash 运行；Linux/macOS 极简模式通过 POSIX PTY 使用原生 `/bin/bash`。Linux 沙箱模式保留上游 bwrap/Landlock 失败关闭链路。
- 每个 Web profile 首次使用时预装固定版本的 `dsh-plugin-marketplace`；用户关闭或卸载后，分发版不会在重启时恢复它。
- 通过 Electron 的 Node 模式内置 DSH 插件 CLI 与 pnpm，市场操作无需系统 Node.js 工具链。

## 构建与测试

使用 Node.js ^22.19.0 或 >=24，以及 pnpm。

首次 clone 后运行一次 `pnpm run desktop:bootstrap`，初始化固定版本的
`vendor/deepseek-harness` 源码 workspace；它提供构建所需的 `@deepseek-ai/*`
包。之后构建和打包会在本地编译 Web runtime，不依赖已有便携 ZIP。

    pnpm install
    pnpm run build
    pnpm run desktop:test
    pnpm run desktop:dev
    pnpm run desktop:package:win
    pnpm run desktop:package:mac
    pnpm run desktop:package:linux

每条打包命令都必须在对应的原生主机执行：带可用 WSL 发行版的 Windows x64、Apple Silicon macOS 或 Linux x64。命令会下载 Electron、执行能力探测与打包后冒烟测试，并把不可变的已验证 bundle 写入 `dist-desktop/verified/<target>/`。

Windows 未压缩应用位于：

    dist-desktop/electron/DeepSeek Harness-win32-x64/
    └─ runtime/DeepSeek Harness.exe

macOS Apple Silicon 构建目标为 `darwin-arm64`，输出：

    dist-desktop/electron/DeepSeek Harness-darwin-arm64/DeepSeek Harness.app
    dist-desktop/electron/DeepSeek-Harness-<distributionVersion>-darwin-arm64.dmg

DMG 创建和构建时 `.icns` 转换依赖 macOS 系统工具 `hdiutil`、`sips` 与 `iconutil`。当前发行通道未签名且未公证。

Linux x64 构建必须在原生 Linux x64 主机执行，输出 AppImage、deb 和未压缩
Electron runtime。构建期间会使用 `musl-gcc` 编译官方上游 Landlock launcher，
再由 `electron-builder` 生成 AppImage/deb；Linux 不使用应用内自替换更新，而是
通过发布页手动下载新版本。

发布是独立的只复制步骤。它会重新校验 `artifact-verification.json` 指定的精确文件，不会构建、测试、打补丁、签名或重建归档：

    pnpm run desktop:release:win -- --input dist-desktop/verified/win32-x64
    pnpm run desktop:release:mac -- --input dist-desktop/verified/darwin-arm64
    pnpm run desktop:release:linux -- --input dist-desktop/verified/linux-x64

## 发布身份

- 发布：DeepSeek Harness Desktop v1.5.0
- 分发：1.5.0
- 外壳：0.1.0-shell.2
- 内核：读取打包后的 @deepseek-ai/dsh-web-app manifest

release-manifest.json 会写入 runtime 同级目录，记录分发版本、桌面外壳版本、内核版本、内核 Git 提交和本地发布说明。

## 用户数据与安全

外壳将 Web 服务绑定到回环地址，并设置 DSH_TELEMETRY_DISABLED=1。工作区设置和桌面端发布说明状态保存在 Electron 用户数据中，不会写入打包应用目录。市场中的插件属于第三方代码，安装前应先审查其来源和权限。

请在 Web UI 设置中配置 DeepSeek API key，或在启动可执行文件的环境中提供。当前构建未进行 Linux 包签名、Windows 商业 CA 签名或 macOS 公证；首次运行时请先核对发布校验值。

## 卸载

Setup 卸载器和便携版卸载脚本默认保留会话、凭据、设置、附件和桌面偏好；只有明确确认后才会删除数据。
