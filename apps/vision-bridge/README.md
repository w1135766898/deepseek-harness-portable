# Hybrid Vision Bridge

[中文](README.zh.md)

`@dsh-portable/vision-bridge` adds hybrid image routing to conversations and provides an explicit `view_image` tool for analyzing PNG, JPEG, WebP, and GIF files. It reuses the kernel attachment store, model catalog, and LLM path instead of maintaining a second provider endpoint or API key.

## Usage

1. Configure at least one image-capable model and its provider credentials under **Settings → Models**.
2. Enable the feature under **Settings → Plugins → Vision Bridge**. Leave the model empty to select the first catalog entry that explicitly declares image input. With the current official kernel, this includes `deepseek-v4-flash-vision-exp` when the DeepSeek provider is configured. Enter a model ID to pin the route; use `provider/model` when two providers expose the same ID.
3. Paste or upload images in the normal conversation composer. The existing attachment UI keeps thumbnails in the draft and the submitted images in session history.
4. When an agent needs to inspect a local screenshot, chart, or UI, it calls `view_image`. Use `path` (absolute or relative to the current session workspace) for a local file, or `attachmentId` for an image already referenced by the current session history; these inputs are mutually exclusive. `prompt` can specify what to extract or analyze.

On image turns, the bridge inspects the selected conversation model's declared capabilities. Image-capable models receive the native image blocks unchanged. For text-only models, the configured vision route extracts structured OCR, layout, object, coordinate, and semantic evidence, then supplies that evidence to the original text model. Later text-only turns automatically stay on the original text model. A historical `attachmentId` reuses its durable reference and does not write another attachment object.

## Routing and failure behavior

- A pinned model missing from the catalog returns `VISION_MODEL_UNAVAILABLE`.
- A pinned model that explicitly rejects image input returns `VISION_MODEL_NOT_IMAGE_CAPABLE`.
- With no pinned model and no catalog entry declaring image input, the bridge does not guess or fall back to a text-only model.
- Native image-capable conversation models do not invoke the fallback vision route. The current official DeepSeek catalog publishes `deepseek-v4-flash-vision-exp` as image-capable, so it can be used without a second endpoint or key.
- Disabling the plugin leaves native model capabilities intact, but disables text-model fallback routing and `view_image`.
- A provider that cannot list its models is skipped without hiding other configured providers.
- The tool follows the attachment service's image-size policy and checks type, existence, and size before reading a file.

Recoverable errors are returned as structured tool results with a stable `reason`, normalized path, and any selected provider/model identity. The call timeout is 60 seconds.

## Development and verification

After changing source, run:

```sh
pnpm --filter @dsh-portable/vision-bridge run build
pnpm --filter @dsh-portable/vision-bridge test
```

The Host entry is exported from the package root, while the Web settings card is exported from `@dsh-portable/vision-bridge/client`. The root plugin requires Cordis `tools`, `systemPrompt`, `attachments`, and `llm` services. Its configuration contains only `enabled` and an optional `model`; it accepts no credentials or custom endpoint.
