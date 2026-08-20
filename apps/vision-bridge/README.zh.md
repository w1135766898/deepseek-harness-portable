# Vision Bridge

[English](README.md)

`@dsh-portable/vision-bridge` 为 DeepSeek Harness 提供显式的 `view_image` 工具，用于分析工作区中的 PNG、JPEG、WebP 和 GIF 图片。它复用内核的附件存储、模型目录和 LLM 调用链路，不维护第二套服务商端点或 API 密钥。

## 使用方式

1. 在“设置 → 模型”中配置至少一个支持图片输入的模型及其服务商凭据。
2. 在“设置 → 插件 → Vision Bridge”中启用功能。模型留空时自动选择模型目录中第一个明确声明支持图片输入的模型；也可填写模型 ID 固定路由。
3. Agent 需要检查本地截图、图表或界面时，会调用 `view_image`。`path` 可以是绝对路径，也可以是相对当前会话工作区的路径；`prompt` 可指定要提取或分析的内容。

对话中直接粘贴的图片已使用原生附件链路，不需要再调用 `view_image`。

## 路由与失败行为

- 固定模型在目录中不存在时返回 `VISION_MODEL_UNAVAILABLE`。
- 固定模型明确声明不接受图片时返回 `VISION_MODEL_NOT_IMAGE_CAPABLE`。
- 没有固定模型且目录中没有声明图片能力的模型时，不会猜测或回退到文本模型。
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
