/** Host middleware for routing image turns through the selected vision model. */

import {
  contentHasImage,
  createUserMessage,
  type GenerateOptions,
  type LlmModelInfo,
  type LlmResolvedModelInfo,
  type Message,
  type StreamChunk,
} from '@deepseek-ai/dsh-llm'
import {
  formatVisualEvidenceForModel,
  parseVisualEvidence,
} from './hybrid-evidence.ts'
import {
  modelSupportsImages,
  selectVisionRoute,
  type TextRoute,
  type VisionRoute,
  type VisionRouteConfig,
} from './model-selection.ts'
import type { VisionConfig, StructuredVisualEvidence } from './types.ts'
import { VISUAL_EVIDENCE_INSTRUCTION } from './hybrid-routing.ts'

/** The small portion of LlmRuntime used by the installer. */
export interface HybridHostRuntime {
  listProviders(): readonly { id: string }[]
  listModels(provider: string): Promise<readonly LlmModelInfo[]>
  stream(options: GenerateOptions): AsyncIterable<StreamChunk>
  resolveModelInfo(provider: string, model: string, signal?: AbortSignal): Promise<LlmResolvedModelInfo>
}

/** Cordis context shape kept structural so the app need not depend on dsh-agent. */
export interface HybridHostContext {
  on(event: string, listener: (...args: any[]) => unknown): () => void
}

/** A resolved config getter can read the live settings source on every turn. */
export type HybridConfigGetter = () => VisionConfig | VisionRouteConfig | Promise<VisionConfig | VisionRouteConfig>

/** Optional seams for hosts that already cache a catalog or own the analyzer call. */
export interface HybridHostOptions {
  catalog?: () => readonly LlmModelInfo[] | Promise<readonly LlmModelInfo[]>
  analyze?: (input: {
    route: VisionRoute
    messages: readonly Message[]
    signal: AbortSignal
  }) => Promise<unknown>
}

/** Returned handles are used by api-proxy admission and plugin disposal. */
export interface HybridHostInstallation {
  /** Remove both waterfall listeners. */
  dispose(): void
  /** Resolver to use only at image admission boundaries in api-proxy. */
  resolveModelInfo(
    provider: string,
    model: string,
    signal?: AbortSignal,
  ): Promise<LlmResolvedModelInfo>
  /** The route captured after the model-selection assembly waterfall. */
  currentRoute(agent: object): TextRoute | undefined
}

interface AssembleContextLike {
  agent?: object
}

interface PromptAssemblyLike {
  variables: Record<string, string | undefined>
}

interface PreStepAgentLike {
  options?: { provider?: string; model?: string }
  session: {
    append(
      type: 'user/message',
      message: Message,
      options: {
        surfaceOp: 'append' | { op: 'replace'; start: number; end: number }
        sourceEventSeqs?: number[]
      },
    ): { seq: number }
  }
}

interface PreStepPayloadLike {
  agent: PreStepAgentLike
  messages: Message[]
  signal: AbortSignal
}

interface PreStepDecisionLike {
  kind: 'reject' | 'enter'
  messages?: Message[]
  [key: string]: unknown
}

function routeConfig(config: VisionConfig | VisionRouteConfig): VisionRouteConfig {
  return {
    enabled: config.enabled === true,
    model: config.model ?? '',
  }
}

async function catalogOf(
  runtime: HybridHostRuntime,
  options: HybridHostOptions,
): Promise<readonly LlmModelInfo[]> {
  if (options.catalog !== undefined) return await options.catalog()
  const providers = runtime.listProviders()
  const models = await Promise.all(providers.map(async (provider) => {
    try {
      return await runtime.listModels(provider.id)
    } catch {
      return []
    }
  }))
  return models.flat()
}

function routeFromAssembly(assembly: PromptAssemblyLike): TextRoute | undefined {
  const provider = assembly.variables.provider
  const model = assembly.variables.model
  return provider === undefined || model === undefined || provider === '' || model === ''
    ? undefined
    : { provider, model }
}

function routeFromAgent(agent: PreStepAgentLike): TextRoute | undefined {
  const provider = agent.options?.provider
  const model = agent.options?.model
  return provider === undefined || model === undefined || provider === '' || model === ''
    ? undefined
    : { provider, model }
}

function evidenceMessage(
  evidence: StructuredVisualEvidence,
  original: Message,
): Message {
  // Keep ordinary text from a mixed text+image user message visible after its
  // image-bearing event is replaced on the model surface.
  const text = original.content
    .filter(block => block.type === 'text')
    .map(block => block.text)
    .join('\n')
  const evidenceText = formatVisualEvidenceForModel(evidence)
  return createUserMessage({
    content: [{ type: 'text', text: text === '' ? evidenceText : `${text}\n\n${evidenceText}` }],
    source: { kind: 'plugin', plugin: 'vision-bridge' },
  })
}

function continueFromEvidenceMessage(): Message {
  return createUserMessage({
    content: [{
      type: 'text',
      text: 'Answer the user\'s request using the structured visual evidence already added above.',
    }],
    source: { kind: 'plugin', plugin: 'vision-bridge' },
  })
}

async function analyzeWithRuntime(
  runtime: HybridHostRuntime,
  route: VisionRoute,
  messages: readonly Message[],
  signal: AbortSignal,
): Promise<unknown> {
  const instruction = createUserMessage({
    content: [{ type: 'text', text: VISUAL_EVIDENCE_INSTRUCTION }],
    source: { kind: 'plugin', plugin: 'vision-bridge' },
  })
  let text = ''
  for await (const chunk of runtime.stream({
    provider: route.provider,
    model: route.model,
    messages: [instruction, ...messages],
    temperature: 0,
    signal,
  })) {
    if (chunk.type === 'text-delta') text += chunk.text
    if (chunk.type === 'block-end' && chunk.block.type === 'text' && text === '') text = chunk.block.text
    if (chunk.type === 'finish' && (chunk.reason.kind === 'error' || chunk.reason.kind === 'aborted')) {
      throw new Error(chunk.reason.failure.message)
    }
  }
  return text
}

/**
 * Install the only durable bridge point available before agent-loop request
 * construction. The returned resolver is deliberately separate from the
 * runtime's resolver: native capability checks in this middleware always use
 * the unmodified catalog, while api-proxy may use the returned resolver solely
 * to admit a text-only model when a fallback route is configured.
 *
 * Typical Host wiring:
 *
 * ```ts
 * const hybrid = installHybridVisionRouting(ctx, getVisionConfig, ctx.llm)
 * // api-proxy's image admission calls hybrid.resolveModelInfo(...)
 * // dispose hybrid when the plugin context is torn down
 * ```
 */
export function installHybridVisionRouting(
  ctx: HybridHostContext,
  getConfig: HybridConfigGetter,
  runtime: HybridHostRuntime,
  options: HybridHostOptions = {},
): HybridHostInstallation {
  const assembledRoutes = new WeakMap<object, TextRoute>()
  const originalResolveModelInfo = runtime.resolveModelInfo.bind(runtime)

  const resolveModelInfo = async (
    provider: string,
    model: string,
    signal?: AbortSignal,
  ): Promise<LlmResolvedModelInfo> => {
    const resolved = await originalResolveModelInfo(provider, model, signal)
    // Unknown capability is already admitted by api-proxy. Only explicit
    // text-only metadata needs the bridge capability for the current request.
    if (resolved.inputModalities === undefined || resolved.inputModalities.includes('image')) return resolved
    const config = routeConfig(await getConfig())
    const catalog = await catalogOf(runtime, options)
    const vision = selectVisionRoute(config, catalog)
    if (!vision.ok) return resolved
    return { ...resolved, inputModalities: ['text', 'image'] }
  }

  const assemblyDispose = ctx.on(
    'system-prompt/assemble',
    async (assemblyValue: unknown, contextValue: unknown, next: () => Promise<unknown>) => {
      const assembled = await next() as PromptAssemblyLike
      const context = contextValue as AssembleContextLike | undefined
      const agent = context?.agent
      const route = routeFromAssembly(assembled)
      if (agent !== undefined && route !== undefined) assembledRoutes.set(agent, route)
      return assembled
    },
  )

  const preStepDispose = ctx.on(
    'agent/pre-step',
    async (payloadValue: unknown, next: () => Promise<unknown>) => {
      const payload = payloadValue as PreStepPayloadLike
      const decision = await next() as PreStepDecisionLike
      if (decision.kind !== 'enter' || decision.messages === undefined || decision.messages.length === 0) return decision

      const current = assembledRoutes.get(payload.agent) ?? routeFromAgent(payload.agent)
      if (current === undefined) return decision
      const turnMessages = decision.messages
      if (!turnMessages.some(message => contentHasImage(message.content))) return decision

      const catalog = await catalogOf(runtime, options)
      if (modelSupportsImages(current, catalog)) return decision
      const vision = selectVisionRoute(routeConfig(await getConfig()), catalog)
      if (!vision.ok) {
        // Admission can race with provider/settings changes. Never return the
        // original image here: the selected text-only model must not receive
        // an image that the bridge failed to analyze.
        throw new Error(vision.message)
      }

      const rawEvidence = options.analyze === undefined
        ? await analyzeWithRuntime(runtime, vision.route, turnMessages, payload.signal)
        : await options.analyze({ route: vision.route, messages: turnMessages, signal: payload.signal })
      const evidence = parseVisualEvidence(rawEvidence)
      const remaining: Message[] = []
      let replacedImageMessage = false
      for (const message of turnMessages) {
        if (!contentHasImage(message.content)) {
          remaining.push(message)
          continue
        }
        replacedImageMessage = true
        const originalEvent = payload.agent.session.append('user/message', message, { surfaceOp: 'append' })
        payload.agent.session.append(
          'user/message',
          evidenceMessage(evidence, message),
          {
            surfaceOp: { op: 'replace', start: originalEvent.seq, end: originalEvent.seq },
            sourceEventSeqs: [originalEvent.seq],
          },
        )
      }
      // The agent loop treats an empty pre-step decision as a completed turn.
      // Keep the original image as the append-origin transcript event, keep
      // its evidence replacement model-only, and return one small context
      // message so the original text model actually performs this step.
      return {
        ...decision,
        messages: replacedImageMessage
          ? [...remaining, continueFromEvidenceMessage()]
          : remaining,
      }
    },
  )

  return {
    dispose: () => {
      assemblyDispose()
      preStepDispose()
    },
    resolveModelInfo,
    currentRoute: agent => assembledRoutes.get(agent),
  }
}
