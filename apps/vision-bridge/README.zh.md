# Hybrid Vision Bridge

[English](README.md)

`@dsh-portable/vision-bridge` 为对话提供 Hybrid 图片路由，并提供显式的 `view_image` 工具来分析 PNG、JPEG、WebP 和 GIF 图片。它复用内核的附件存储、模型目录和 LLM 调用链路，不维护第二套服务商端点或 API 密钥。

## 使用方式

1. 在“设置 → 模型”中配置至少一个支持图片输入的模型及其服务商凭据。
2. 在“设置 → 插件 → Vision Bridge”中启用功能。模型留空时自动选择模型目录中第一个明确声明支持图片输入的模型；当前官方内核在配置 DeepSeek 服务商时会提供 `deepseek-v4-flash-vision-exp`。也可填写模型 ID 固定路由；如果多个服务商有同名模型，可填写 `provider/model` 指定服务商。
3. 在普通对话输入框中直接粘贴或上传图片；现有附件界面会在草稿中显示缩略图，并在发送后把图片保留在会话历史中。
4. Agent 需要检查本地截图、图表或界面时，会调用 `view_image`。本地文件使用 `path`（绝对路径或相对当前会话工作区的路径）；重新分析当前会话历史中已有的图片则使用 `attachmentId`，两者不能同时提供；`prompt` 可指定要提取或分析的内容。

图片轮次会先检查当前对话模型声明的能力：支持图片的模型继续原样接收原生图片块；纯文本模型则由已配置的视觉模型提取 OCR、布局、目标、坐标和语义等结构化证据，再交给原文本模型继续推理。之后的纯文字轮次自动继续使用原文本模型。历史 `attachmentId` 会复用持久引用，不会再次写入附件对象。

## 路由与失败行为

- 固定模型在目录中不存在时返回 `VISION_MODEL_UNAVAILABLE`。
- 固定模型明确声明不接受图片时返回 `VISION_MODEL_NOT_IMAGE_CAPABLE`。
- 没有固定模型且目录中没有声明图片能力的模型时，不会猜测或回退到文本模型。
- 当前对话模型原生支持图片时，不会调用后备视觉路由。当前官方 DeepSeek 目录已将 `deepseek-v4-flash-vision-exp` 声明为支持图片输入，不需要第二套端点或密钥即可使用。
- 停用插件不会改变模型自身的原生能力，但会停用文本模型的自动视觉桥接和 `view_image`。
- 单个服务商无法列出模型时会跳过该服务商，不影响其他已配置服务商。
- 工具遵循附件服务的图片大小限制，并在读取前检查文件类型、存在性和大小。

可恢复错误会作为结构化工具结果返回，包含稳定的 `reason`、规范化路径以及已选择的服务商/模型信息；调用超时为 60 秒。

## 开发与验证

源码修改后运行：

```sh
pnpm --filter @dsh-portable/vision-bridge run build
pnpm --filter @dsh-portable/vision-bridge test
```

Host 入口由包根导出，Web 设置卡由 `@dsh-portable/vision-bridge/client` 导出。包根需要 Cordis 的 `tools`、`systemPrompt`、`attachments` 和 `llm` 服务；配置只有 `enabled` 与可选的 `model`，不接受凭据或自定义端点。
