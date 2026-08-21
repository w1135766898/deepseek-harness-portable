/** Model-route selection and transient message rewriting for hybrid vision. */

import {
  contentHasImage,
  OFFLOADED_IMAGE_TEXT,
  type ContentBlock,
  type GenerateOptions,
  type Message,
} from '@deepseek-ai/dsh-llm'
import type { LlmModelInfo } from '@deepseek-ai/dsh-llm'
import {
  imageInputCapability,
  modelSupportsImages,
  selectVisionRoute,
  type TextRoute,
  type VisionRoute,
  type VisionRouteConfig,
} from './model-selection.ts'
import {
  formatVisualEvidenceForModel,
  parseVisualEvidence,
} from './hybrid-evidence.ts'
import type { StructuredVisualEvidence } from './types.ts'

/** Stable route labels used by the host and tests. */
export type HybridRouteKind = 'text' | 'native-image' | 'vision-fallback'

/** A successful hybrid route selection. `route` is always the user's model. */
export type HybridRouteSelection =
  | { ok: true; kind: 'text'; route: TextRoute; hasImage: false }
  | { ok: true; kind: 'native-image'; route: TextRoute; hasImage: true }
  | { ok: true; kind: 'vision-fallback'; route: TextRoute; visionRoute: VisionRoute; hasImage: true }

/** Failure reasons returned before a provider call is attempted. */
export type HybridRouteFailureReason =
  | 'VISION_BRIDGE_DISABLED'
  | 'VISION_MODEL_UNAVAILABLE'
  | 'VISION_MODEL_NOT_IMAGE_CAPABLE'
  | 'VISION_ANALYZER_UNAVAILABLE'

/** A route failure retains the existing vision selection's stable reason. */
export type HybridRouteOutcome =
  | HybridRouteSelection
  | { ok: false; reason: HybridRouteFailureReason; message: string }

/** Inputs needed to choose one route for one request. */
export interface HybridRouteInput {
  /** The provider/model selected for ordinary conversation text. */
  current: TextRoute
  /** Current provider catalog, including modality declarations. */
  catalog: readonly LlmModelInfo[]
  /** Existing vision-bridge configuration. */
  vision: VisionRouteConfig
  /** Complete request history, used only when no current-turn slice is supplied. */
  messages?: readonly Message[]
  /** Messages belonging to this turn; preferred over scanning history. */
  currentTurnMessages?: readonly Message[]
  /** Explicit override for callers that already performed turn admission. */
  hasImage?: boolean
}

/** Return the history suffix after the latest assistant message. */
export function currentTurnMessages(messages: readonly Message[]): Message[] {
  let lastAssistant = -1
  for (const [index, message] of messages.entries()) {
    if (message.role === 'assistant') lastAssistant = index
  }
  return messages.slice(lastAssistant + 1)
}

/**
 * Detect images in the current turn only.
 *
 * Looking at the whole derived history would keep a text-only conversation on
 * the vision route forever after its first image. The loop builds requests
 * from the full history, so the latest assistant boundary is the useful
 * stateless approximation when a Host does not already have turn events.
 */
export function currentTurnHasImage(messages: readonly Message[]): boolean {
  return currentTurnMessages(messages).some(message => contentHasImage(message.content))
}

/** Alias for callers that phrase the question as a predicate. */
export const hasCurrentTurnImage = currentTurnHasImage

/** Pick native image input, fallback vision analysis, or ordinary text. */
export function selectHybridRoute(input: HybridRouteInput): HybridRouteOutcome {
  const turn = input.currentTurnMessages ?? (input.messages === undefined ? [] : currentTurnMessages(input.messages))
  const hasImage = input.hasImage ?? turn.some(message => contentHasImage(message.content))
  if (!hasImage) return { ok: true, kind: 'text', route: input.current, hasImage: false }
  if (modelSupportsImages(input.current, input.catalog)) {
    return { ok: true, kind: 'native-image', route: input.current, hasImage: true }
  }

  const vision = selectVisionRoute(input.vision, input.catalog)
  if (!vision.ok) return vision
  return {
    ok: true,
    kind: 'vision-fallback',
    route: input.current,
    visionRoute: vision.route,
    hasImage: true,
  }
}

/** Alias used by Host code that calls the operation a model-route selection. */
export const selectHybridModelRoute = selectHybridRoute

/** True when the active model is known to accept image input. */
export function currentRouteAcceptsImages(
  current: TextRoute,
  catalog: readonly LlmModelInfo[],
): boolean {
  return imageInputCapability(current, catalog) === 'supported'
}

/** Input handed to the Host's configured vision-model call. */
export interface HybridVisionAnalysisInput {
  messages: readonly Message[]
  signal?: AbortSignal
}

/** Host-provided callback; the bridge owns route choice, Host owns dispatch. */
export type HybridVisionAnalyzer = (input: HybridVisionAnalysisInput) => Promise<unknown>

/** Inputs for converting a selected fallback route into a text-model request. */
export interface HybridRequestOptions extends HybridRouteInput {
  /** Required only for an image round on a text-only current route. */
  analyze?: HybridVisionAnalyzer
}

export type HybridRequestOutcome =
  | { ok: true; route: HybridRouteSelection; request: GenerateOptions; evidence?: StructuredVisualEvidence }
  | { ok: false; reason: HybridRouteFailureReason; message: string }

/** Replace image blocks without mutating the immutable session messages. */
function replaceBlocks(
  blocks: readonly ContentBlock[],
  replacement: (block: Extract<ContentBlock, { type: 'image' }>) => ContentBlock,
): ContentBlock[] {
  let changed = false
  const next: ContentBlock[] = []
  for (const block of blocks) {
    if (block.type === 'image') {
      next.push(replacement(block))
      changed = true
    } else if (block.type === 'tool-result') {
      const content = replaceBlocks(block.content, replacement)
      next.push(content === block.content ? block : { ...block, content })
      changed ||= content !== block.content
    } else {
      next.push(block)
    }
  }
  return changed ? next : blocks as ContentBlock[]
}

/**
 * Replace images with one aggregate evidence block for the current turn and a
 * text-only omission marker for older history. The returned messages are
 * transient and can safely be passed to a text adapter without changing the
 * durable image-bearing user message.
 */
export function replaceImagesWithEvidence(
  messages: readonly Message[],
  evidence: StructuredVisualEvidence,
  turnMessages: readonly Message[] = currentTurnMessages(messages),
): Message[] {
  const turnIds = new Set(turnMessages.map(message => String(message.id)))
  const evidenceText = formatVisualEvidenceForModel(evidence)
  let emittedEvidence = false
  return messages.map((message) => {
    const isCurrentTurn = turnIds.has(String(message.id))
    const content = replaceBlocks(message.content, () => {
      if (isCurrentTurn && !emittedEvidence) {
        emittedEvidence = true
        return { type: 'text', text: evidenceText }
      }
      return {
        type: 'text',
        text: isCurrentTurn
          ? '[additional image represented by the visual evidence above]'
          : OFFLOADED_IMAGE_TEXT,
      }
    })
    return content === message.content ? message : { ...message, content }
  })
}

/** Alias for the common "rewrite image content" phrasing. */
export const rewriteImagesAsEvidence = replaceImagesWithEvidence

/** Build a text block suitable for appending as a model-facing evidence message. */
export function visualEvidenceText(evidence: StructuredVisualEvidence): string {
  return formatVisualEvidenceForModel(evidence)
}

/**
 * Select a route and, for a text-only image round, ask the Host callback for
 * visual evidence and return a transient text-only request. The callback is
 * deliberately injected so this helper can run from either `agent/pre-step`
 * or a Host-owned dispatch seam without recursively entering `llm/stream`.
 */
export async function prepareHybridRequest(
  request: GenerateOptions,
  options: HybridRequestOptions,
): Promise<HybridRequestOutcome> {
  const selection = selectHybridRoute({ ...options, messages: options.messages ?? request.messages })
  if (!selection.ok) return selection
  if (selection.kind !== 'vision-fallback') return { ok: true, route: selection, request }
  if (options.analyze === undefined) {
    return {
      ok: false,
      reason: 'VISION_ANALYZER_UNAVAILABLE',
      message: 'A text-only model received an image, but no visual evidence analyzer is installed.',
    }
  }

  const turn = options.currentTurnMessages ?? currentTurnMessages(request.messages)
  const result = await options.analyze({ messages: turn, signal: request.signal })
  const evidence = parseVisualEvidence(result)
  return {
    ok: true,
    route: selection,
    request: { ...request, messages: replaceImagesWithEvidence(request.messages, evidence, turn) },
    evidence,
  }
}

/** Prompt text for a Host callback that wants provider JSON rather than prose. */
export const VISUAL_EVIDENCE_INSTRUCTION = [
  'Inspect the supplied image(s) and return JSON only.',
  'Use exactly these top-level keys: summary, ocr, layout, objects, coordinates, semantics.',
  'Include readable OCR text, layout regions, detected objects or UI targets, coordinates or bounding boxes, and semantic relations when present.',
  'Use numeric x, y, width, height values for boxes and numeric x, y values for points; omit unknown values rather than guessing.',
].join(' ')
