/**
 * Host-side Cordis plugin entrypoint for @dsh-portable/vision-bridge.
 *
 * The plugin contributes one thing: an explicit `view_image` tool that analyzes
 * an image file on disk. Everything underneath it — provider credentials, model
 * capability, durable image storage, retry and metering — belongs to the kernel
 * services this plugin injects, so there is no parallel endpoint or secret to
 * configure here.
 * @module @dsh-portable/vision-bridge
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { installSettingsSection, settingsNamespace } from '@deepseek-ai/dsh-settings'
import type { ViewImageResult, VisionConfig } from './types.ts'
import { executeViewImage, renderViewImageContent, type VisionRuntime } from './view-image.ts'

export * from './types.ts'
export * from './model-selection.ts'

export const name = 'vision-bridge'
export const inject = ['tools', 'systemPrompt', 'attachments', 'llm']

export type Config = VisionConfig

export const Config: z<VisionConfig> = z.object({
  enabled: z.boolean().default(true),
  model: z.string().default(''),
})

export const VISION_SETTINGS_NAMESPACE = settingsNamespace('vision')

/**
 * Register the vision bridge on a host context.
 * @param ctx - the injecting cordis context.
 * @param config - entry configuration merged under the stored settings.
 */
export function apply(ctx: Context, config: Config = {}): void {
  const resolved = Config(config) as Required<VisionConfig>

  // Stored user settings win, then the entry config, then the schema default.
  // The api-proxy already publishes every registered namespace to web clients
  // and accepts writes for any of them, so registration is the whole wiring.
  let currentConfig = (): Required<VisionConfig> => resolved
  installSettingsSection<Required<VisionConfig>>(
    ctx,
    VISION_SETTINGS_NAMESPACE,
    Config as unknown as z<Required<VisionConfig>>,
    resolved,
    {
      setSource: thunk => {
        currentConfig = thunk
      },
      onChange: () => {},
    },
  )

  // Services are read per call rather than captured: a provider reconfigured
  // mid-session must be visible to the next invocation.
  const runtime: VisionRuntime = {
    get attachments() {
      return ctx.attachments
    },
    get llm() {
      return ctx.llm
    },
  }

  ctx.tools.register(
    defineTool({
      name: 'view_image',
      description:
        'Inspect and describe an image file using a configured image-capable model. Supports PNG, JPEG, WebP, and GIF images. '
        + 'Use this tool whenever you need to view screenshots, UI layouts, diagrams, charts, or images on disk.',
      parameters: {
        path: {
          type: 'string',
          required: true,
          description: 'Absolute path or workspace-relative path to the image file.',
        },
        prompt: {
          type: 'string',
          description: 'Specific question or instruction for the vision model (e.g. "Extract the error code from this dialog").',
        },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            text: { type: 'string', required: true },
            provider: { type: 'string', required: true },
            model: { type: 'string', required: true },
            path: { type: 'string', required: true },
            bytes: { type: 'number' },
            width: { type: 'number' },
            height: { type: 'number' },
            reason: { type: 'string' },
            isError: { type: 'boolean' },
          },
        },
        render: (_args, value) => renderViewImageContent(value as ViewImageResult),
        // Persist the result identity a replayed generic tool card needs. The
        // model-facing text remains the fallback when this plugin is later
        // disabled and no presenter is available.
        presentationMeta: (_args, value) => {
          const result = value as ViewImageResult
          return {
            path: result.path,
            provider: result.provider,
            model: result.model,
            bytes: result.bytes,
            isError: result.isError === true,
          }
        },
      },
      timeoutMs: 60_000,
      isConcurrencySafe: () => true,
      async execute(args, exec) {
        return executeViewImage(args, exec, currentConfig, runtime)
      },
      presentCall(args) {
        return {
          card: 'generic',
          title: `Inspect image ${args.path}`,
          kind: 'read',
          locations: [{ path: args.path }],
        }
      },
      presentResult(_args, result) {
        const meta = result.meta
        const path = typeof meta === 'object' && meta !== null && 'path' in meta && typeof meta.path === 'string'
          ? meta.path
          : undefined
        const leaf = path?.replaceAll('\\', '/').split('/').at(-1)
        return {
          card: 'generic',
          title: result.isError
            ? `Image inspection failed${leaf === undefined ? '' : ` · ${leaf}`}`
            : `Image analyzed${leaf === undefined ? '' : ` · ${leaf}`}`,
        }
      },
    }),
  )

  ctx.systemPrompt.section({
    name: 'tool:view_image',
    order: 150,
    text: 'Use view_image for image files on disk that need visual analysis. Images pasted into the conversation '
      + 'already ride the native attachment path and the selected image-capable model, and need no tool call.',
  })
}
