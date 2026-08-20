/**
 * The visual state model shared by every visual@4 renderer.
 *
 * The previous model had exactly two states — `focus` and `dim` — and expressed
 * `dim` as low opacity on the whole element. On a node_link diagram that
 * multiplied with the edge's own low alpha, so an unfocused edge was drawn at
 * roughly 10% alpha and an unfocused node label at 20% of an
 * already tertiary grey. The first frame of a decision tree therefore erased
 * the very branches the learner needed in order to read the highlighted one.
 *
 * Emphasis here is a ranked set of roles instead. Context keeps enough strength
 * to stay legible (>= 55% of full), the current element is raised by ring,
 * weight and size rather than by removing everything else, and each renderer
 * maps the same roles onto its own marks.
 */

export type VisualState =
  /** No sequence focus is active: the whole structure reads at full strength. */
  | 'overview'
  /** The element this frame is about. */
  | 'current'
  /** On the path to, or directly incident with, the current element. */
  | 'related'
  /** The surrounding structure. Quieter, never unreadable. */
  | 'context'
  /** Far from the current element in a large figure. */
  | 'inactive'
  /** Chosen by the learner. */
  | 'selected'
  /** Was current in an earlier frame of the sequence. */
  | 'visited'
  /** Genuinely not operable. Never used merely for de-emphasis. */
  | 'disabled'

/**
 * Relative visual strength per state, in the 0–1 range the stylesheets read as
 * `--lx-vs-alpha`. These are the numbers the legibility tests assert against,
 * so the floor for any state that still carries meaning lives here rather than
 * being spread across eight stylesheets.
 */
export const VISUAL_STATE_STRENGTH: Readonly<Record<VisualState, number>> = {
  overview: 1,
  current: 1,
  selected: 1,
  related: 0.92,
  visited: 0.78,
  context: 0.62,
  inactive: 0.55,
  disabled: 0.38,
}

/** The weakest strength any state carrying real content may be drawn at. */
export const MINIMUM_LEGIBLE_STRENGTH = 0.55

/** States that de-emphasise rather than disable. */
export const CONTEXT_STATES: readonly VisualState[] = ['related', 'visited', 'context', 'inactive']

export interface VisualFocus {
  /** Ids the active sequence frame focuses. */
  currentIds: ReadonlySet<string>
  /** Ids focused by any earlier frame of the sequence. */
  visitedIds: ReadonlySet<string>
  /** Whether a sequence is driving the figure at all. */
  active: boolean
}

export const IDLE_FOCUS: VisualFocus = {
  currentIds: new Set<string>(),
  visitedIds: new Set<string>(),
  active: false,
}

export function visualFocus(
  currentIds: Iterable<string>,
  visitedIds: Iterable<string> = [],
): VisualFocus {
  const current = new Set(currentIds)
  const visited = new Set([...visitedIds].filter(id => !current.has(id)))
  return { currentIds: current, visitedIds: visited, active: current.size > 0 }
}

/**
 * Resolve one element's state.
 *
 * `relatedIds` are the ids that make this element part of the current story
 * without being its subject: the group a node belongs to, the endpoints of a
 * focused edge, the section a concept sits in.
 */
export function elementState(
  id: string,
  focus: VisualFocus,
  relatedIds: readonly (string | undefined)[] = [],
): VisualState {
  if (!focus.active) return 'overview'
  if (focus.currentIds.has(id)) return 'current'
  if (relatedIds.some(related => related !== undefined && focus.currentIds.has(related))) return 'related'
  if (focus.visitedIds.has(id)) return 'visited'
  return 'context'
}

/** The strength a state is drawn at, for tests and for inline style fallbacks. */
export function stateStrength(state: VisualState): number {
  return VISUAL_STATE_STRENGTH[state]
}
