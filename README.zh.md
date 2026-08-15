# DeepSeek Harness for Win

[English](README.md)

DeepSeek Harness for Win 是 DeepSeek Harness 的社区 Windows x64 分发版，由 Electron 桌面外壳和便携式 runtime 运行目录组成，不是 Microsoft 官方签名版本。

## 最新发布

- 发布：DeepSeek Harness for Win v1.1.2
- 标签：v1.1.2
- 下载：[GitHub Release](https://github.com/wsnxxxs/deepseek-harness-portable/releases/tag/v1.1.2)
- 分发版本：1.1.2
- 桌面外壳：0.1.0-shell.2
- 内核：0.1.0-rc.5

请阅读[中文发布说明](RELEASE_NOTES.zh.md)，或在桌面端托盘菜单中打开“更新日志”。

## 安装

1. **Setup 安装包：** 从 Releases 下载 DeepSeek-Harness-Setup-<version>-win32-x64.exe。
2. **在线安装：** 运行仓库中的 install.ps1。脚本只接受带可信 SHA-256 摘要的 release ZIP。
3. **便携 ZIP：** 下载 DeepSeek-Harness-<version>-win32-x64.zip，先核对 SHA256SUMS.txt，再解压完整目录，不要重命名 runtime。
4. **卸载：** 运行 uninstall.cmd 或 uninstall.ps1。除非明确确认删除，否则会保留用户数据。

安装器和更新器会校验 ZIP 摘要、发布清单、应用清单以及必要的原生模块，不会创建证书，也不会修改 Windows 信任存储。

## 便携目录结构

    DeepSeek Harness-win32-x64/
    ├─ dsh.cmd                    命令行入口
    ├─ start-web.cmd              浏览器模式入口
    ├─ start-desktop.cmd         桌面模式入口
    ├─ update.ps1                便携版更新器
    ├─ setup-shortcuts.ps1       快捷方式和 PATH 设置
    ├─ release-manifest.json     分发/外壳/内核版本清单
    └─ runtime/                  Electron 可执行文件和应用依赖

不要删除或重命名 runtime 目录。

## 启动与更新

- start-desktop.cmd 启动内置 Electron 桌面端。
- start-web.cmd 使用 PATH 中的 Node.js 启动网页版。
- dsh.cmd 提供同样的网页版入口，并支持 dsh update。
- 桌面托盘菜单提供“检查更新”“更新日志”和“关于”。
- 检测到新版本时，桌面外壳会在应用内显示下载与校验进度，完成后再询问是否重启。
- 更新通知改为标题栏下方居中的轻量横幅，7 秒或关闭后向上滑出并销毁；可按版本选择“不再提示”。
- 网页原生侧边栏 Logo 染为品牌蓝；侧边栏展开时左键打开桌面菜单，收起时左键仍展开侧边栏、右键打开菜单。
- “更新日志”和“关于”会在当前窗口内打开居中卡片式更新中心，版本时间线在卡片内部局部滚动。
- Windows 外壳支持 Mica/标题栏覆盖、分阶段启动过渡、系统主题同步，以及适配多显示器的窗口状态记忆。

更新器会再次校验已准备好的便携 ZIP、发布清单和原生依赖，并在确认重启后以一次整体替换的方式更新 runtime。

## 构建与发布

环境要求：Windows x64、Node.js ^22.19.0 或 >=24、pnpm。

仓库通过固定 Git submodule `vendor/deepseek-harness` 内置匹配版本的 DeepSeek Harness 源码 workspace。它提供桌面外壳所需的 `@deepseek-ai/*` 包，并在本地构建嵌入式 Web runtime；发布流程不再需要把已有便携 ZIP 作为构建输入。

首次 clone 后只需初始化一次：

    pnpm run desktop:bootstrap

之后使用常规构建与发布命令：

    pnpm install
    pnpm run build
    pnpm run desktop:test
    pnpm run desktop:release:win

桌面包保留三层独立版本：

- distributionVersion：公开 Windows release 标签、ZIP 和 Setup 版本。
- desktop shell version：Electron 外壳包版本。
- kernel version：打包进来的 @deepseek-ai/dsh-web-app 内核版本。

发布命令会先构建上游 Web runtime，再构建桌面外壳，生成 release-manifest.json，并最后写入 SHA256SUMS.txt。准备新版本时，请同步更新 RELEASE_NOTES.md、RELEASE_NOTES.zh.md 和 apps/desktop/src/release-notes.json。

便携包会同时包含中文说明 使用说明.txt 和英文说明 使用说明.en.txt，需要时可按语言打开对应文件。

`dist-desktop/` 是可重建的临时构建目录，发布后可以删除。下一次构建所需的源码保存在 `vendor/deepseek-harness` 中；不要用 `node_modules/` 或便携 ZIP 替代源码提交到仓库。

## 安全与限制

当前桌面可执行文件没有可信商业 CA 签名，Windows SmartScreen 或 Smart App Control 可能发出警告或阻止运行。本项目不会自动创建自签名证书，也不会把证书导入信任存储。

- 运行下载文件前请先核对发布的 SHA-256 值。
- 本地 Web 服务默认只绑定回环地址。
- 不要把 API key 放入仓库或发布目录。
- 如果组织要求可信可执行文件，请使用受认可的 CA、Microsoft Artifact Signing 或企业代码签名策略。

参考 [Smart App Control](https://learn.microsoft.com/en-us/windows/apps/develop/smart-app-control/overview) 和 [SmartScreen reputation guidance](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/smartscreen-reputation)。

## 许可证

DeepSeek Harness 使用 [MIT](LICENSE) 许可证，第三方声明见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
