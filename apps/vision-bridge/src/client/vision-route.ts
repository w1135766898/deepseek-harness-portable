/**
 * Client-only description of which model Vision Bridge will use.
 *
 * Image bytes now travel the same providers the deployment already uses for
 * conversations, so the interesting question is no longer "where does this
 * endpoint point" but "which configured model answers, and did the operator
 * choose it or is it discovered". Capability resolution is the host's job; this
 * summary only reports the selection as configured.
 * @module @dsh-portable/vision-bridge/client/vision-route
 */

/** How the vision model is selected. */
export type VisionRouteKind = 'disabled' | 'auto' | 'pinned'

/** The configured selection, as the settings card presents it. */
export interface VisionRouteSummary {
  kind: VisionRouteKind
  /** Pinned model id, when the operator named one. */
  model?: string
}

/**
 * The composer-side route intent for one draft.
 *
 * The conversation host already owns image admission, serialization, and
 * durable history.  The client only needs to identify whether the current
 * draft is an image turn so the host can prepare its visual route.  Keeping
 * this as a tiny pure projection means the ordinary text path remains exactly
 * the same (an empty image list is `text`).
 */
export type VisionTurnKind = 'text' | 'vision'

export interface VisionTurnPlan {
  /** Route selected for the pending composer submission. */
  kind: VisionTurnKind
  /** Number of browser-owned images waiting to cross the Host boundary. */
  imageCount: number
  /** Whether a visual override should be released after this turn settles. */
  restoreTextRoute: boolean
}

/**
 * Project input attachment ids into a route preparation plan.
 *
 * `readonly unknown[]` is intentional: this helper is also useful to host
 * adapters and tests without importing the browser-only attachment brand.
 * Empty/absent input follows the normal text route and never asks the host to
 * switch models.
 */
export function planVisionTurn(imageIds: readonly unknown[] | undefined): VisionTurnPlan {
  const imageCount = imageIds?.length ?? 0
  if (imageCount === 0) {
    return { kind: 'text', imageCount: 0, restoreTextRoute: false }
  }
  return { kind: 'vision', imageCount, restoreTextRoute: true }
}

/**
 * Summarize the configured vision selection.
 * @param enabled - whether the capability is offered at all.
 * @param model - configured model id or provider/model; empty means discover an image-capable one.
 */
export function describeVisionRoute(enabled: boolean, model: string): VisionRouteSummary {
  if (!enabled) return { kind: 'disabled' }
  const pinnedModel = model.trim()
  if (pinnedModel === '') return { kind: 'auto' }
  return {
    kind: 'pinned',
    model: pinnedModel,
  }
}
