/**
 * Host-side Cordis plugin entrypoint for @dsh-portable/vision-bridge.
 * @module @dsh-portable/vision-bridge
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { installSettingsSection, settingsNamespace } from '@deepseek-ai/dsh-settings'
import type { SettingsDescriptor, SettingsPathOp } from '@deepseek-ai/dsh-settings'
import type { RpcResponse, SettingsNamespaceView } from '@deepseek-ai/dsh-host-apiproxy'
import type { ViewImageResult, VisionConfig } from './types.ts'
import { createPromptImageTextHandler } from './prompt-image.ts'
import { executeViewImage, renderViewImageContent } from './view-image.ts'

export * from './types.ts'

export const name = 'vision-bridge'
export const inject = ['tools', 'systemPrompt']

export type Config = VisionConfig

export const Config: z<VisionConfig> = z.object({
  enabled: z.boolean().default(true),
  provider: z.string().default('compatible'),
  model: z.string().default('gpt-4o-mini'),
  baseURL: z.string().default('https://api.openai.com/v1'),
  apiKey: z.string().role('secret').default(''),
  maxImageBytes: z.number().default(20 * 1024 * 1024),
  timeoutMs: z.number().default(60_000),
  prompt: z.string().default(''),
})

export const VISION_SETTINGS_NAMESPACE = settingsNamespace('vision')

const HOOKED = Symbol('vision-bridge-settings-hook')

type SettingsApi = Context['apiProxy']['settings']

interface SettingsApiPatch {
  owners: Map<symbol, Context>
  rawDescribe: SettingsApi['describe']
  rawMutate: SettingsApi['mutate']
  describe: SettingsApi['describe']
  mutate: SettingsApi['mutate']
}

type HookedSettingsApi = SettingsApi & { [HOOKED]?: SettingsApiPatch }

function activeSettingsContext(patch: SettingsApiPatch): Context {
  const contexts = [...patch.owners.values()]
  const active = contexts.at(-1)
  if (active === undefined) throw new Error('vision settings API hook has no active owner')
  return active
}

function releaseSettingsApiPatch(api: HookedSettingsApi, patch: SettingsApiPatch, owner: symbol): void {
  patch.owners.delete(owner)
  if (patch.owners.size > 0 || api[HOOKED] !== patch) return
  if (api.describe === patch.describe) api.describe = patch.rawDescribe
  if (api.mutate === patch.mutate) api.mutate = patch.rawMutate
  delete api[HOOKED]
}

/** Map one redacted settings descriptor to its wire view (matching api-proxy.ts:1929). */
function toView(descriptor: SettingsDescriptor): SettingsNamespaceView {
  return {
    ns: String(descriptor.ns),
    schema: descriptor.schema,
    value: descriptor.value,
    ...descriptor.base === undefined ? {} : { base: descriptor.base },
    ...descriptor.user === undefined ? {} : { user: descriptor.user },
    applies: descriptor.applies,
    secrets: (descriptor.secrets ?? []).map(secret => ({ path: [...secret.path], set: secret.set })),
    revision: descriptor.revision,
  }
}

export function apply(ctx: Context, config: Config = {}): void {
  const resolved = Config(config) as Required<VisionConfig>

  // 1) Bind settings namespace (reads user settings.yaml -> fallback to entry config -> schema default)
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

  // Text-only conversation models receive a durable, model-visible analysis
  // in place of raw pixels. Image-capable models never dispatch this event.
  ctx.on('api-proxy/image-to-text', createPromptImageTextHandler(() => currentConfig()))

  // 2) Hook apiProxy.settings to expose 'vision' to web clients and handle its mutations
  ctx.inject(['apiProxy', 'settings'], (scopeCtx) => {
    const settingsApi = scopeCtx.apiProxy.settings as HookedSettingsApi
    const owner = Symbol('vision-bridge-settings-owner')
    const existing = settingsApi[HOOKED]
    if (existing !== undefined) {
      existing.owners.set(owner, scopeCtx)
      scopeCtx.effect(
        () => () => { releaseSettingsApiPatch(settingsApi, existing, owner) },
        'vision-bridge: shared settings API hook owner',
      )
      return
    }

    const rawDescribe = settingsApi.describe
    const rawMutate = settingsApi.mutate
    const patch = {
      owners: new Map([[owner, scopeCtx]]),
      rawDescribe,
      rawMutate,
    } as SettingsApiPatch

    patch.describe = async (request) => {
      const response = await rawDescribe.call(settingsApi, request)
      if (!response.result.ok) return response
      const namespaces = response.result.value.namespaces
      if (namespaces.some(entry => entry.ns === 'vision')) return response
      const descriptor = activeSettingsContext(patch).settings
        .describe({ redactSecrets: true })
        .find(entry => String(entry.ns) === 'vision')
      if (descriptor !== undefined) namespaces.push(toView(descriptor))
      return response
    }

    patch.mutate = async (request) => {
      const { ns, ops, expectedRevision } = request.payload
      if (ns !== 'vision') return rawMutate.call(settingsApi, request)
      try {
        const settings = activeSettingsContext(patch).settings
        await settings.mutate(VISION_SETTINGS_NAMESPACE, ops as SettingsPathOp[], expectedRevision)
        const updated = settings
          .describe({ redactSecrets: true })
          .find(entry => String(entry.ns) === 'vision')
        if (updated === undefined) throw new Error('vision namespace vanished after write')
        return {
          rpcId: request.rpcId,
          result: { ok: true, value: toView(updated) },
        } as RpcResponse<SettingsNamespaceView>
      } catch (error) {
        return {
          rpcId: request.rpcId,
          result: {
            ok: false,
            error: {
              code: 'settings-rejected',
              message: error instanceof Error ? error.message : String(error),
              details: {},
            },
          },
        } as RpcResponse<SettingsNamespaceView>
      }
    }

    settingsApi[HOOKED] = patch
    settingsApi.describe = patch.describe
    settingsApi.mutate = patch.mutate
    scopeCtx.effect(
      () => () => { releaseSettingsApiPatch(settingsApi, patch, owner) },
      'vision-bridge: settings API hook',
    )
  })

  // 3) Register global view_image tool on Host level (visible to all agents without modifying presets)
  ctx.tools.register(
    defineTool({
      name: 'view_image',
      description:
        'Inspect and describe an image file using an external vision model. Supports PNG, JPEG, WebP, and GIF images. ' +
        'Use this tool whenever you need to view screenshots, UI layouts, diagrams, charts, or images on disk.',
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
            model: { type: 'string', required: true },
            path: { type: 'string', required: true },
            bytes: { type: 'number' },
            isError: { type: 'boolean' },
          },
        },
        render: (_args, value) => renderViewImageContent(value as ViewImageResult),
      },
      timeoutMs: resolved.timeoutMs,
      isConcurrencySafe: () => true,
      async execute(args, exec) {
        return executeViewImage(args, exec, currentConfig)
      },
      presentCall(args) {
        return {
          card: 'generic',
          title: `Inspect image ${args.path}`,
          kind: 'read',
          locations: [{ path: args.path }],
        }
      },
    }),
  )

  // 4) System prompt guidance section
  ctx.systemPrompt.section({
    name: 'tool:view_image',
    order: 150,
    text: 'Use the view_image tool when the user provides or asks about an image file: it inspects and describes the image with an external vision model.',
  })
}
