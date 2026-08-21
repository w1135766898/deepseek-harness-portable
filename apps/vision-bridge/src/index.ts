/**
 * Host-side Cordis plugin entrypoint for @dsh-portable/vision-bridge.
 *
 * The plugin contributes one explicit `view_image` tool that analyzes local
 * image files or re-analyzes durable images already referenced by the current
 * session. Everything underneath it — provider credentials, model capability,
 * durable image storage, retry and metering — belongs to the kernel services
 * this plugin injects, so there is no parallel endpoint or secret to configure.
 * @module @dsh-portable/vision-bridge
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { installSettingsSection, settingsNamespace } from '@deepseek-ai/dsh-settings'
import type { ViewImageArgs, ViewImageResult, VisionConfig } from './types.ts'
import { installHybridVisionRouting, type HybridHostContext } from './hybrid-host.ts'
import { executeViewImage, renderViewImageContent, type VisionRuntime } from './view-image.ts'

export * from './types.ts'
export * from './model-selection.ts'
export * from './hybrid-evidence.ts'
export * from './hybrid-routing.ts'
export * from './hybrid-host.ts'

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
  const llm = ctx.get('llm') ?? ctx.llm
  const runtime: VisionRuntime = {
    get attachments() {
      return ctx.attachments
    },
    get llm() {
      return llm
    },
  }

  // Image admission happens before an Agent can rewrite its model surface.
  // Advertise the configured fallback at that boundary, then let pre-step
  // preserve the original image event and replace only the model-facing copy
  // with structured visual evidence.
  const hybrid = installHybridVisionRouting(
    ctx as unknown as HybridHostContext,
    currentConfig,
    llm,
  )
  const originalResolveModelInfo = llm.resolveModelInfo
  ctx.effect(() => {
    llm.resolveModelInfo = hybrid.resolveModelInfo
    return () => {
      if (llm.resolveModelInfo === hybrid.resolveModelInfo) {
        llm.resolveModelInfo = originalResolveModelInfo
      }
      hybrid.dispose()
    }
  }, 'vision-bridge: hybrid routing')

  ctx.tools.register(
    defineTool({
      name: 'view_image',
      description:
        'Inspect and describe an image using a configured image-capable model. For a local PNG, JPEG, WebP, or GIF '
        + 'provide path; to re-analyze an image already present in this session history, provide attachmentId. '
        + 'Use this tool whenever you need to view screenshots, UI layouts, diagrams, charts, or images.',
      parameters: {
        path: {
          type: 'string',
          description: 'Absolute path or workspace-relative path to a local image file (mutually exclusive with attachmentId).',
        },
        attachmentId: {
          type: 'string',
          description: 'Opaque attachment id from this session history (mutually exclusive with path).',
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
            source: { type: 'string', enum: ['local', 'history'] },
            attachmentId: { type: 'string' },
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
          const result = value as ViewImageResult & { source?: 'local' | 'history'; attachmentId?: string }
          return {
            path: result.path,
            source: result.source ?? 'local',
            ...result.attachmentId === undefined ? {} : { attachmentId: result.attachmentId },
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
        return executeViewImage(args as ViewImageArgs, exec, currentConfig, runtime)
      },
      presentCall(args) {
        const attachmentId = typeof args.attachmentId === 'string' ? args.attachmentId : undefined
        const path = typeof args.path === 'string' ? args.path : undefined
        return {
          card: 'generic',
          title: attachmentId === undefined
            ? `Inspect image ${path ?? ''}`
            : `Inspect historical image ${attachmentId}`,
          kind: 'read',
          ...attachmentId === undefined && path !== undefined ? { locations: [{ path }] } : {},
        }
      },
      presentResult(_args, result) {
        const meta = result.meta
        const path = typeof meta === 'object' && meta !== null && 'path' in meta && typeof meta.path === 'string'
          ? meta.path
          : undefined
        const source = typeof meta === 'object' && meta !== null && 'source' in meta && meta.source === 'history'
          ? 'history'
          : 'local'
        const attachmentId = typeof meta === 'object' && meta !== null && 'attachmentId' in meta && typeof meta.attachmentId === 'string'
          ? meta.attachmentId
          : undefined
        const leaf = path?.replaceAll('\\', '/').split('/').at(-1)
        return {
          card: 'generic',
          title: source === 'history'
            ? result.isError
              ? `Historical image inspection failed${attachmentId === undefined ? '' : ` · ${attachmentId}`}`
              : `Historical image analyzed${attachmentId === undefined ? '' : ` · ${attachmentId}`}`
            : result.isError
              ? `Image inspection failed${leaf === undefined ? '' : ` · ${leaf}`}`
              : `Image analyzed${leaf === undefined ? '' : ` · ${leaf}`}`,
        }
      },
    }),
  )

  ctx.systemPrompt.section({
    name: 'tool:view_image',
    order: 150,
    text: () => currentConfig().enabled
      ? 'Pasted or uploaded images use Hybrid Vision Bridge automatically. If the current model accepts images, keep '
        + 'the native image input. Otherwise, the configured vision model produces structured OCR, layout, object, coordinate, '
        + 'and semantic evidence for the original text model. Use view_image for local image files that need visual analysis. '
        + 'To revisit an image already saved in this session, pass its opaque attachmentId from history; this reuses the '
        + 'durable reference and does not upload it again.'
      : 'Hybrid Vision Bridge and view_image are disabled. Native model image capabilities are unchanged.',
  })
}
