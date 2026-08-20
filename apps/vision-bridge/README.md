# Vision Bridge

[中文](README.zh.md)

`@dsh-portable/vision-bridge` provides an explicit `view_image` tool for analyzing PNG, JPEG, WebP, and GIF files in a workspace. It reuses the kernel attachment store, model catalog, and LLM path instead of maintaining a second provider endpoint or API key.

## Usage

1. Configure at least one image-capable model and its provider credentials under **Settings → Models**.
2. Enable the feature under **Settings → Plugins → Vision Bridge**. Leave the model empty to select the first catalog entry that explicitly declares image input, or enter a model ID to pin the route.
3. When an agent needs to inspect a local screenshot, chart, or UI, it calls `view_image`. `path` may be absolute or relative to the current session workspace; `prompt` can specify what to extract or analyze.

Images pasted directly into a conversation already use the native attachment path and do not need a `view_image` call.

## Routing and failure behavior

- A pinned model missing from the catalog returns `VISION_MODEL_UNAVAILABLE`.
- A pinned model that explicitly rejects image input returns `VISION_MODEL_NOT_IMAGE_CAPABLE`.
- With no pinned model and no catalog entry declaring image input, the bridge does not guess or fall back to a text-only model.
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
