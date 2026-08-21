# DeepSeek Harness Desktop v1.4.2

Windows x64 桌面版 · 2026-08-21

v1.4.2 在 0.1.1-rc.1 桌面基线上完成 Learning 图示可读性重构：状态可测、焦点上下文可追踪，Windows x64 产物也按新的分发身份重新构建和校验。

## Learning 模式

- **统一学习界面**：教学图示与可选的理解检查共用设计令牌、卡片样式和焦点规范；图形支持单一 Tab 停靠点、方向键浏览、屏幕阅读器读数和结构化文字替代。
- **更自然的教学流程**：普通回答仍是默认路径；只有确实有助于理解时才插入非阻塞图示，理解检查也只在会改变下一步教学策略时出现，不再形成重复的 Reveal/Continue 流程。
- **会话内学习路线**：复杂目标可以维护最多六步的暂定路线，仅依据学习者实际给出的证据推进；状态可随刷新、恢复和消息压缩延续，并在 reset 或会话分叉后保持隔离。
- **可靠的图示状态**：修复会话更新导致步骤图回到第一帧、回忆卡重新折叠或曲线重复采样的问题；无 Learning Client 时明确返回不可用，并自动改用完整文字说明。
- **可测的图示状态**：八种状态使用明确的强度数据，`context` 为 0.62、`inactive` 为 0.55，只有 `disabled` 有意降到 0.38，并通过 `--lx-vs-alpha` 只施加一次。
- **可读的节点连线布局**：CJK 感知的测量与换行、真实分组层带、边标签底片、响应式列布局、0.82 fit-to-width 下限和窄屏滚动共同保持密集图示可读。
- **统一的 renderer 契约**：八类 renderer 共用 shell、控件、序列轨、选择槽、空状态、图例及无障碍分支，并由 63 项 visual-legibility 检查覆盖。

## 视觉能力与内核

- **更新上游内核**：固定的 DeepSeek Harness 内核已更新到 0.1.1-rc.1，官方模型目录新增明确支持图片输入的 `deepseek-v4-flash-vision-exp`。
- **`view_image` 改走原生模型通道**：图片经附件服务提交，并通过内核 LLM 通道调用已配置的图像模型，沿用现有的服务商凭据、重试策略与用量计量，不再维护独立端点或 API 密钥。
- **原生优先的混合行为**：原生支持图片的对话模型直接接收图片块；纯文本模型使用 Vision Bridge 后备路径，后续纯文字轮次继续使用当前文字模型。
- **按能力选择模型**：未固定模型时自动选择模型目录中声明支持图片输入的路由；同名模型可用 `provider/model` 固定，模型不可用或明确不支持图片时返回可操作提示。

## 发布与更新可靠性

- **发布身份同步**：内置发布清单、更新器校验、安装器文件名、桌面文档和更新日志元数据统一指向 v1.4.2。
- **已验证产物刷新**：Windows ZIP 与 Setup 安装包从当前源码重新构建，完成原生插件 smoke 检查，并生成新的 SHA-256 校验值。
- **既有桌面能力保持不变**：透明插件市场、原生图片附件、无控制台启动器和覆盖安装恢复能力继续保留。

## 组件版本

- 分发：1.4.2
- 桌面外壳：0.1.0-shell.2
- 运行时内核：0.1.1-rc.1

---

## English Release Notes

Windows x64 desktop release · 2026-08-20

v1.4.2 carries the Learning visual-legibility refactor on the 0.1.1-rc.1 desktop baseline. It makes visual state measurable, keeps focus context readable, and rebuilds the Windows x64 artifacts under the new distribution identity.

### Learning Mode

- **Unified Learning UI**: teaching visuals and optional understanding checks now share design tokens, card styling, and focus behavior. Figures use one Tab stop with arrow-key navigation, screen-reader announcements, and structured text alternatives.
- **More natural teaching flow**: ordinary answers remain the default. Non-blocking visuals appear only when they materially help, and understanding checks are reserved for moments that change the next teaching move instead of creating repeated Reveal/Continue steps.
- **Session-scoped learning routes**: complex goals can keep a tentative route of up to six steps, advanced only by evidence the learner provides. State survives refresh, resume, and message compaction while remaining isolated after reset or session forks.
- **Reliable visual state**: session updates no longer rewind sequences, collapse revealed recall cards, or resample curves. A composition without the Learning Client now reports the visual as unavailable and falls back to a complete prose explanation.
- **Measurable visual states**: eight states use explicit strength data; `context` is 0.62, `inactive` is 0.55, and `disabled` is the only intentionally subdued state at 0.38, applied once through `--lx-vs-alpha`.
- **Readable node-link layout**: CJK-aware measurement and wrapping, real group bands, backed edge labels, responsive columns, a 0.82 fit-to-width floor, and scroll fallback keep dense diagrams legible.
- **Shared renderer contract**: all eight renderers use shared shell, controls, sequence rail, selection slot, empty state, legends, and accessibility branches, backed by 63 visual-legibility checks.

### Vision and Kernel

- **Upstream kernel updated**: the pinned DeepSeek Harness kernel is now 0.1.1-rc.1, and its official catalog publishes `deepseek-v4-flash-vision-exp` as image-capable.
- **`view_image` on the native model path**: images are committed through the attachment service and sent to a configured image-capable model over the kernel LLM channel, reusing existing provider credentials, retries, and usage metering instead of maintaining a separate endpoint or API key.
- **Native-first hybrid behavior**: image-capable conversation models receive native image blocks directly; text-only models use the Vision Bridge fallback, while later text-only turns stay on the selected text model.
- **Capability-based model selection**: when no model is pinned, the bridge selects the first catalog route that declares image input; `provider/model` pins disambiguate duplicate IDs, and invalid or explicitly text-only pins return actionable guidance.

### Release & Update Reliability

- **Synchronized release identity**: the bundled release manifest, updater checks, installer filenames, desktop documentation, and release-notes metadata all target v1.4.2.
- **Verified artifact refresh**: the Windows ZIP and Setup installer are rebuilt from the current source, re-tested with native addon smoke checks, and accompanied by fresh SHA-256 values.
- **Existing desktop capabilities retained**: the transparent plugin marketplace, native image attachments, no-console launcher, and overwrite-install recovery remain available.

### Component Versions

- Distribution: 1.4.2
- Desktop Shell: 0.1.0-shell.2
- Runtime Kernel: 0.1.1-rc.1

---

## 校验和与安全 / Checksums and security

最终便携 ZIP 和 Setup 安装包的 SHA-256 值记录在 `SHA256SUMS.txt`，并作为 GitHub Release 附件发布。

The final portable ZIP and Setup installer SHA-256 values are recorded in `SHA256SUMS.txt` and attached to the GitHub Release.

```text
6F97D651958BC8F07D9C85851FEE5BFFBA34092BDD94DFD7A1862DCD554947F5 *DeepSeek-Harness-1.4.2-win32-x64.zip
981A02633B9E2D6F1FDC6A098E7FD93D7542329DD310D6B813733D5DDB30CA7F *DeepSeek-Harness-Setup-1.4.2-win32-x64.exe
```
