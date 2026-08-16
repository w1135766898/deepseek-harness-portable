# DeepSeek Harness for Win v1.2.3

Windows x64 便携版 · 2026-08-16

这是本 Windows 分发版的 v1.2.3 版本，强化了 WSL 原生 Linux Bash 环境桥接以完美复现 DeepSeek 官方强化学习（RL）标志性的“We need / Let's”思维链推理模式，将视觉外挂配置无缝接入 Web UI 代理，并全面优化桌面端交互体验。

## 新功能与体验优化

- **强化 WSL 原生环境桥接与“We need / Let's”思维链复现**：DeepSeek 官方强化学习训练基于 Linux Bash 环境。在 Windows 平台通过 WSL 原生 Linux Bash 完整承载官方极简模式（Minimal Preset），杜绝 PowerShell 语法与 Token 漂移，完美复现模型经典的“We need to... / Let's check...”分步规划与链式推理（CoT）。
- **视觉辅助外挂 API 代理层融合**：动态将 `@dsh-portable/vision-bridge` 配置模式注入 Host Web UI `apiProxy`，支持在【设置 → 插件】中即时管理视觉服务商、测试连接并安全持久化。
- **桌面端交互细节与动效优化**：深度优化菜单手风琴折叠展开动画、精简文案表述、升级矢量图标，并严格确保应用内更新日志单语言纯净渲染。
- **完善项目文档与 Why Us 核心差异说明**：全面补充 Windows 便携版本相较于官方版本在 Token 分布对齐、环境免配置与多模态扩展等方面的独特价值与核心优势。

## 组件版本

- 分发：1.2.3
- 桌面外壳：0.1.0-shell.2
- 运行时内核：0.1.0-rc.5

---

## English Release Notes

Windows x64 portable release · 2026-08-16

This is the v1.2.3 release of this Windows distribution, reinforcing native WSL Linux Bash integration to flawlessly reproduce DeepSeek's native "We need / Let's" RL Chain-of-Thought (CoT) reasoning flow, integrating Vision Bridge settings into the Web UI API proxy, and polishing desktop UI interactions.

### New Features & Improvements

- **Native WSL Environment Bridge & "We need / Let's" CoT Reproduction**: DeepSeek's official Reinforcement Learning (RL) training runs in Linux Bash environments. On Windows, executing the official Minimal Preset inside genuine WSL Linux Bash avoids PowerShell token/syntax divergence and perfectly reproduces the model's native step-by-step reasoning (*"We need to...", "Let's check...", "Let's run..."*).
- **Vision Bridge API Proxy Integration**: Dynamically injects the `@dsh-portable/vision-bridge` settings schema into the Web UI `apiProxy`, enabling live multi-provider configuration validation and management directly in official Settings.
- **Desktop UI Interaction Optimization**: Refined menu accordion expansion animations, streamlined text phrasing, modernized SVG icons, and verified monolingual in-app release notes viewer.
- **Documentation & "Why Us" Value Proposition**: Added in-depth comparison documentation detailing the advantages of this Windows portable distribution over upstream Linux-centric builds.

### Component Versions

- Distribution: 1.2.3
- Desktop Shell: 0.1.0-shell.2
- Runtime Kernel: 0.1.0-rc.5

---

## 校验和与安全 / Checksums and security

每个最终发布构件均经 SHA-256 校验和验证：

Every final release artifact is verified with a SHA-256 checksum:

```
3D059B43341635147B804A771D66353206FA9A8442F86FAA7057372A321380DA *DeepSeek-Harness-1.2.3-win32-x64.zip
6C8D26C3DC8E6148DDF09F23CFC2C25CE4BE1770E1C28AF24C99669CA3433B2B *DeepSeek-Harness-Setup-1.2.3-win32-x64.exe
```
