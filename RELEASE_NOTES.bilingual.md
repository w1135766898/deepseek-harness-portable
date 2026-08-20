# DeepSeek Harness Desktop v1.4.0

Windows x64 桌面版 · 2026-08-20

v1.4.0 升级到 0.1.0-rc.8 内核，重做 Learning 模式的交互与教学状态链路，并让 `view_image` 统一使用内核原生的附件和模型服务。Windows x64 发布产物也已按新的分发身份重新构建和校验。

## Learning 模式

- **统一学习界面**：教学图示与可选的理解检查共用设计令牌、卡片样式和焦点规范；图形支持单一 Tab 停靠点、方向键浏览、屏幕阅读器读数和结构化文字替代。
- **更自然的教学流程**：普通回答仍是默认路径；只有确实有助于理解时才插入非阻塞图示，理解检查也只在会改变下一步教学策略时出现，不再形成重复的 Reveal/Continue 流程。
- **会话内学习路线**：复杂目标可以维护最多六步的暂定路线，仅依据学习者实际给出的证据推进；状态可随刷新、恢复和消息压缩延续，并在 reset 或会话分叉后保持隔离。
- **可靠的图示状态**：修复会话更新导致步骤图回到第一帧、回忆卡重新折叠或曲线重复采样的问题；无 Learning Client 时明确返回不可用，并自动改用完整文字说明。

## 视觉能力与内核

- **内核升级到 rc.8**：固定的 DeepSeek Harness 内核从 0.1.0-rc.7 升级到 0.1.0-rc.8，桌面基线随之重建为 v1.4.0。
- **`view_image` 改走原生模型通道**：图片经附件服务提交，并通过内核 LLM 通道调用已配置的图像模型，沿用现有的服务商凭据、重试策略与用量计量，不再维护独立端点或 API 密钥。
- **按能力选择模型**：未固定模型时自动选择模型目录中声明支持图片输入的路由；固定模型不可用或明确不支持图片时，返回可操作的配置提示。

## 发布与更新可靠性

- **发布身份同步**：内置发布清单、更新器校验、安装器文件名、桌面文档和更新日志元数据统一指向 v1.4.0。
- **已验证产物刷新**：Windows ZIP 与 Setup 安装包从当前源码重新构建，完成原生插件 smoke 检查，并生成新的 SHA-256 校验值。
- **既有桌面能力保持不变**：透明插件市场、原生图片附件、无控制台启动器和覆盖安装恢复能力继续保留。

## 组件版本

- 分发：1.4.0
- 桌面外壳：0.1.0-shell.2
- 运行时内核：0.1.0-rc.8

---

## English Release Notes

Windows x64 desktop release · 2026-08-20

v1.4.0 upgrades the kernel to 0.1.0-rc.8, reworks the Learning interaction and teaching-state flow, and moves `view_image` onto the kernel's native attachment and model services. The Windows x64 artifacts are also rebuilt and verified under the new distribution identity.

### Learning Mode

- **Unified Learning UI**: teaching visuals and optional understanding checks now share design tokens, card styling, and focus behavior. Figures use one Tab stop with arrow-key navigation, screen-reader announcements, and structured text alternatives.
- **More natural teaching flow**: ordinary answers remain the default. Non-blocking visuals appear only when they materially help, and understanding checks are reserved for moments that change the next teaching move instead of creating repeated Reveal/Continue steps.
- **Session-scoped learning routes**: complex goals can keep a tentative route of up to six steps, advanced only by evidence the learner provides. State survives refresh, resume, and message compaction while remaining isolated after reset or session forks.
- **Reliable visual state**: session updates no longer rewind sequences, collapse revealed recall cards, or resample curves. A composition without the Learning Client now reports the visual as unavailable and falls back to a complete prose explanation.

### Vision and Kernel

- **Kernel upgrade to rc.8**: the pinned DeepSeek Harness kernel moves from 0.1.0-rc.7 to 0.1.0-rc.8, and the desktop baseline is rebuilt as v1.4.0.
- **`view_image` on the native model path**: images are committed through the attachment service and sent to a configured image-capable model over the kernel LLM channel, reusing existing provider credentials, retries, and usage metering instead of maintaining a separate endpoint or API key.
- **Capability-based model selection**: when no model is pinned, the bridge selects the first catalog route that declares image input; unavailable or explicitly text-only pinned models return actionable configuration guidance.

### Release & Update Reliability

- **Synchronized release identity**: the bundled release manifest, updater checks, installer filenames, desktop documentation, and release-notes metadata all target v1.4.0.
- **Verified artifact refresh**: the Windows ZIP and Setup installer are rebuilt from the current source, re-tested with native addon smoke checks, and accompanied by fresh SHA-256 values.
- **Existing desktop capabilities retained**: the transparent plugin marketplace, native image attachments, no-console launcher, and overwrite-install recovery remain available.

### Component Versions

- Distribution: 1.4.0
- Desktop Shell: 0.1.0-shell.2
- Runtime Kernel: 0.1.0-rc.8

---

## 校验和与安全 / Checksums and security

最终便携 ZIP 和 Setup 安装包的 SHA-256 值记录在 `SHA256SUMS.txt`，并作为 GitHub Release 附件发布。

The final portable ZIP and Setup installer SHA-256 values are recorded in `SHA256SUMS.txt` and attached to the GitHub Release.

```text
8E96746D9A6562742DFB301868126616025CC9C502DF5B82808B786E3E0ED101 *DeepSeek-Harness-1.4.0-win32-x64.zip
002420606552C017D10D32B4B7660AF6C43B859A70216263E1F050DAD37C83CE *DeepSeek-Harness-Setup-1.4.0-win32-x64.exe
```
