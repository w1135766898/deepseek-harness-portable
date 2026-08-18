/**
 * Session-local, tentative teaching state for the Learning preset.
 *
 * A caller owns the in-memory store and feeds it explicit observable events.
 * Strict identity-free snapshots may be written to the owning session log for
 * resume/fork replay, but are never a cross-session learner profile.
 */

import { createHash } from 'node:crypto'
import { KNOWN_SESSION_EVENT_TYPES, type SessionEvent } from '@deepseek-ai/dsh-session'

export const LEARNER_STATE_PROTOCOL = 'dsh-learning/learner-state@1' as const
export const LEARNER_STATE_EVENT_PROTOCOL = 'dsh-learning/state-event@1' as const
export const LEARNER_STATE_SESSION_EVENT_TYPE = 'learning/state' as const
export const MAX_LEARNER_EVIDENCE = 8
export const MAX_APPLIED_EVENT_IDS = 64
export const MAX_PRIOR_KNOWLEDGE = 8
export const MAX_MISCONCEPTIONS = 6
export const MAX_SOURCE_ANCHORS = 8
export const DEFAULT_TRANSCRIPT_TOKEN_BUDGET = 300

const MAX_STORED_TEXT = 240

export type LearnerRequestKind =
  | 'concept'
  | 'procedure'
  | 'topic'
  | 'source-study'
  | 'practice'
  | 'resource'
  | 'direct-task'
  | 'unknown'

export type LearnerLevel = 'novice' | 'intermediate' | 'advanced' | 'unknown'

export type LearnerGap =
  | 'concept'
  | 'procedure'
  | 'notation'
  | 'task-model'
  | 'prerequisite'
  | 'unknown'

export type LearnerReadiness = 'can-reason' | 'needs-foothold' | 'unknown'

export type LearnerProgressSignal =
  | 'progressing'
  | 'impatient'
  | 'stuck'
  | 'shutdown-risk'
  | 'unknown'

/** Captures both urgency and when the learner expressed it. */
export type LearnerUrgency =
  | 'none'
  | 'initial-blocker'
  | 'later-pressure'
  | 'unknown'

export type LearnerSupportLevel = 0 | 1 | 2 | 3 | 4 | 5
export type LearnerAssessmentContext = 'self-study' | 'graded' | 'unknown'
export type LearnerMastery = 'unseen' | 'emerging' | 'transfer'

export type LearnerTeachingMove =
  | 'none'
  | 'visual'
  | 'checkpoint'

export type LearnerEvidenceKind =
  | 'attempt'
  | 'prediction'
  | 'explanation'
  | 'contrast'
  | 'transfer'
  | 'error'

export type LearnerEvidenceConfidence = 'low' | 'medium' | 'high'
export type LearnerEvidenceCorrectness = 'correct' | 'incorrect' | 'unknown'
export type LearnerEvidenceIndependence = 'independent' | 'guided' | 'unknown'
export type LearnerTransferContext = 'same' | 'fresh' | 'unknown'
type NonTransferEvidenceKind = Exclude<LearnerEvidenceKind, 'transfer'>

export type ObservableEventSource =
  | 'learner-message'
  | 'learner-action'
  | 'assistant-output'
  | 'source-material'
  | 'user-correction'

export interface ObservableLearnerEvent {
  /** Stable within one session; a replay with the same id is ignored. */
  id: string
  source: ObservableEventSource
  /** The concrete utterance/action that justifies emitting this event. */
  summary: string
  turn?: number
}

interface LearnerEvidenceBase {
  summary: string
  confidence: LearnerEvidenceConfidence
  correctness: LearnerEvidenceCorrectness
  independence: LearnerEvidenceIndependence
  source: Extract<ObservableEventSource, 'learner-message' | 'learner-action' | 'user-correction'>
  turn?: number
}

export type LearnerEvidence =
  | (LearnerEvidenceBase & { kind: 'transfer'; transferContext: LearnerTransferContext })
  | (LearnerEvidenceBase & { kind: NonTransferEvidenceKind; transferContext?: never })

interface LearnerEvidenceInputBase {
  summary: string
  confidence?: LearnerEvidenceConfidence
  /** Unknown until feedback/evaluation has established correctness. */
  correctness?: LearnerEvidenceCorrectness
  /** Unknown for a bare checkpoint submission; guided work cannot prove mastery. */
  independence?: LearnerEvidenceIndependence
}

export type LearnerEvidenceInput =
  | (LearnerEvidenceInputBase & { kind: 'transfer'; transferContext: LearnerTransferContext })
  | (LearnerEvidenceInputBase & { kind: NonTransferEvidenceKind; transferContext?: never })

export interface LearnerState {
  protocol: typeof LEARNER_STATE_PROTOCOL
  /** Every pedagogical field below is a revisable hypothesis. */
  tentative: true
  sessionId: string
  revision: number
  goal: string | null
  requestKind: LearnerRequestKind
  level: LearnerLevel
  priorKnowledge: readonly string[]
  gap: LearnerGap
  misconceptions: readonly string[]
  readiness: LearnerReadiness
  progressSignal: LearnerProgressSignal
  urgency: LearnerUrgency
  supportLevel: LearnerSupportLevel
  assessmentContext: LearnerAssessmentContext
  mastery: LearnerMastery
  evidence: readonly LearnerEvidence[]
  lastMove: LearnerTeachingMove
  sourceAnchors: readonly string[]
  /** Bounded replay/conflict fence. Never included in the model transcript. */
  appliedEventIds: readonly AppliedLearnerStateEvent[]
}

export interface AppliedLearnerStateEvent {
  id: string
  /** SHA-256 of the canonical JSON event payload. */
  fingerprint: string
}

export type LearnerStateEvent =
  | {
      type: 'goal_observed'
      goal: string
      observation: ObservableLearnerEvent
    }
  | {
      type: 'request_kind_observed'
      requestKind: LearnerRequestKind
      observation: ObservableLearnerEvent
    }
  | {
      type: 'prior_knowledge_observed'
      level?: LearnerLevel
      items?: readonly string[]
      mode?: 'append' | 'replace'
      observation: ObservableLearnerEvent
    }
  | {
      type: 'gap_observed'
      gap: LearnerGap
      misconceptions?: readonly string[]
      misconceptionMode?: 'append' | 'replace'
      observation: ObservableLearnerEvent
    }
  | {
      type: 'readiness_observed'
      readiness: LearnerReadiness
      observation: ObservableLearnerEvent
    }
  | {
      type: 'progress_observed'
      progressSignal: LearnerProgressSignal
      observation: ObservableLearnerEvent
    }
  | {
      type: 'urgency_observed'
      urgency: LearnerUrgency
      observation: ObservableLearnerEvent
    }
  | {
      type: 'assessment_context_observed'
      assessmentContext: LearnerAssessmentContext
      observation: ObservableLearnerEvent
    }
  | {
      type: 'learner_evidence_observed'
      evidence: LearnerEvidenceInput
      observation: ObservableLearnerEvent
    }
  | {
      type: 'assistant_move_observed'
      move: LearnerTeachingMove
      observation: ObservableLearnerEvent
    }
  | {
      type: 'source_anchors_observed'
      anchors: readonly string[]
      mode?: 'append' | 'replace'
      observation: ObservableLearnerEvent
    }
  | {
      type: 'state_corrected'
      correction: LearnerStateCorrection
      observation: ObservableLearnerEvent & { source: 'user-correction' }
    }

/** Only pedagogical fields are correctable; lifecycle identity is not. */
export interface LearnerStateCorrection {
  goal?: string | null
  requestKind?: LearnerRequestKind
  level?: LearnerLevel
  priorKnowledge?: readonly string[]
  gap?: LearnerGap
  misconceptions?: readonly string[]
  readiness?: LearnerReadiness
  progressSignal?: LearnerProgressSignal
  urgency?: LearnerUrgency
  supportLevel?: LearnerSupportLevel
  assessmentContext?: LearnerAssessmentContext
  mastery?: LearnerMastery
  evidence?: readonly LearnerEvidenceInput[]
  lastMove?: LearnerTeachingMove
  sourceAnchors?: readonly string[]
}

export type LearnerStateSnapshotReason = 'update' | 'correction' | 'reset'

/** Persisted payload deliberately omits lifecycle identity. */
export type LearnerStateSnapshot = Omit<LearnerState, 'sessionId'>

/**
 * Log-only event payload. `snapshot` is complete so resume is a latest-valid-
 * snapshot fold rather than a replay of model inferences.
 */
export interface LearnerStateSnapshotEvent {
  protocol: typeof LEARNER_STATE_EVENT_PROTOCOL
  reason: LearnerStateSnapshotReason
  snapshot: LearnerStateSnapshot
}

declare module '@deepseek-ai/dsh-session/types' {
  interface SessionEventMap {
    /** Full, log-only learner-state snapshot; never projected into model history. */
    'learning/state': LearnerStateSnapshotEvent
  }
}

/**
 * Registers the required (non-ignorable) log event with persistence readers.
 * Startup owns calling this function; it is idempotent and does not append.
 */
export function registerLearningSessionEventType(): void {
  ;(KNOWN_SESSION_EVENT_TYPES as Set<string>).add(LEARNER_STATE_SESSION_EVENT_TYPE)
}

const REQUEST_KINDS: ReadonlySet<string> = new Set<LearnerRequestKind>([
  'concept', 'procedure', 'topic', 'source-study', 'practice', 'resource', 'direct-task', 'unknown',
])
const LEVELS: ReadonlySet<string> = new Set<LearnerLevel>([
  'novice', 'intermediate', 'advanced', 'unknown',
])
const GAPS: ReadonlySet<string> = new Set<LearnerGap>([
  'concept', 'procedure', 'notation', 'task-model', 'prerequisite', 'unknown',
])
const READINESS_VALUES: ReadonlySet<string> = new Set<LearnerReadiness>([
  'can-reason', 'needs-foothold', 'unknown',
])
const PROGRESS_SIGNALS: ReadonlySet<string> = new Set<LearnerProgressSignal>([
  'progressing', 'impatient', 'stuck', 'shutdown-risk', 'unknown',
])
const URGENCY_VALUES: ReadonlySet<string> = new Set<LearnerUrgency>([
  'none', 'initial-blocker', 'later-pressure', 'unknown',
])
const ASSESSMENT_CONTEXTS: ReadonlySet<string> = new Set<LearnerAssessmentContext>([
  'self-study', 'graded', 'unknown',
])
const MASTERY_VALUES: ReadonlySet<string> = new Set<LearnerMastery>([
  'unseen', 'emerging', 'transfer',
])
const TEACHING_MOVES: ReadonlySet<string> = new Set<LearnerTeachingMove>([
  'none', 'visual', 'checkpoint',
])
const EVIDENCE_KINDS: ReadonlySet<string> = new Set<LearnerEvidenceKind>([
  'attempt', 'prediction', 'explanation', 'contrast', 'transfer', 'error',
])
const EVIDENCE_CONFIDENCE: ReadonlySet<string> = new Set<LearnerEvidenceConfidence>([
  'low', 'medium', 'high',
])
const EVIDENCE_CORRECTNESS: ReadonlySet<string> = new Set<LearnerEvidenceCorrectness>([
  'correct', 'incorrect', 'unknown',
])
const EVIDENCE_INDEPENDENCE: ReadonlySet<string> = new Set<LearnerEvidenceIndependence>([
  'independent', 'guided', 'unknown',
])
const TRANSFER_CONTEXTS: ReadonlySet<string> = new Set<LearnerTransferContext>([
  'same', 'fresh', 'unknown',
])
const OBSERVABLE_SOURCES: ReadonlySet<string> = new Set<ObservableEventSource>([
  'learner-message', 'learner-action', 'assistant-output', 'source-material', 'user-correction',
])

function assertEnum<T extends string>(value: T, values: ReadonlySet<string>, label: string): T {
  if (!values.has(value)) throw new TypeError(`Invalid ${label}: ${String(value)}`)
  return value
}

function normalizeRequiredText(value: string, label: string): string {
  if (typeof value !== 'string') throw new TypeError(`${label} must be a string`)
  const normalized = value.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim()
  if (!normalized) throw new TypeError(`${label} must not be empty`)
  return [...normalized].slice(0, MAX_STORED_TEXT).join('')
}

function normalizeSessionId(sessionId: string): string {
  return normalizeRequiredText(sessionId, 'sessionId')
}

function normalizeStringList(values: readonly string[], limit: number, label: string): readonly string[] {
  if (!Array.isArray(values)) throw new TypeError(`${label} must be an array`)
  const normalized: string[] = []
  for (const value of values) {
    const item = normalizeRequiredText(value, `${label} item`)
    if (!normalized.includes(item)) normalized.push(item)
  }
  return Object.freeze(normalized.slice(-limit))
}

function appendBoundedUnique(
  current: readonly string[],
  additions: readonly string[],
  limit: number,
  label: string,
): readonly string[] {
  return normalizeStringList([...current, ...additions], limit, label)
}

function normalizeSupportLevel(value: number): LearnerSupportLevel {
  if (!Number.isInteger(value) || value < 0 || value > 5) {
    throw new TypeError('supportLevel must be an integer from 0 through 5')
  }
  return value as LearnerSupportLevel
}

function maxSupportLevel(
  current: LearnerSupportLevel,
  minimum: LearnerSupportLevel,
): LearnerSupportLevel {
  return Math.max(current, minimum) as LearnerSupportLevel
}

function lowerSupportLevel(current: LearnerSupportLevel): LearnerSupportLevel {
  return Math.max(0, current - 1) as LearnerSupportLevel
}

function trailingIncorrectEvidence(evidence: readonly LearnerEvidence[]): number {
  let count = 0
  for (let index = evidence.length - 1; index >= 0; index -= 1) {
    if (evidence[index]?.correctness !== 'incorrect') break
    count += 1
  }
  return count
}

function normalizeCount(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 0) throw new TypeError(`${label} must be a non-negative integer`)
  return value
}

function normalizeObservation(observation: ObservableLearnerEvent): ObservableLearnerEvent {
  if (!observation || typeof observation !== 'object') {
    throw new TypeError('An explicit observable event is required')
  }
  const turn = observation.turn
  if (turn !== undefined && (!Number.isSafeInteger(turn) || turn < 0)) {
    throw new TypeError('observation.turn must be a non-negative integer')
  }
  return Object.freeze({
    id: normalizeRequiredText(observation.id, 'observation.id'),
    source: assertEnum(observation.source, OBSERVABLE_SOURCES, 'observation.source'),
    summary: normalizeRequiredText(observation.summary, 'observation.summary'),
    ...(turn === undefined ? {} : { turn }),
  })
}

function normalizeEvidence(
  input: LearnerEvidenceInput,
  observation: ObservableLearnerEvent,
): LearnerEvidence {
  if (!['learner-message', 'learner-action', 'user-correction'].includes(observation.source)) {
    throw new TypeError('Learner evidence must come from a learner action, learner message, or user correction')
  }
  const kind = assertEnum(input.kind, EVIDENCE_KINDS, 'evidence.kind') as LearnerEvidenceKind
  const base = {
    summary: normalizeRequiredText(input.summary, 'evidence.summary'),
    confidence: assertEnum(input.confidence ?? 'medium', EVIDENCE_CONFIDENCE, 'evidence.confidence'),
    correctness: assertEnum(
      input.correctness ?? 'unknown',
      EVIDENCE_CORRECTNESS,
      'evidence.correctness',
    ),
    independence: assertEnum(
      input.independence ?? 'unknown',
      EVIDENCE_INDEPENDENCE,
      'evidence.independence',
    ),
    source: observation.source as LearnerEvidence['source'],
    ...(observation.turn === undefined ? {} : { turn: observation.turn }),
  }
  if (kind === 'transfer') {
    return Object.freeze({
      ...base,
      kind,
      transferContext: assertEnum(
        strictString(input.transferContext, 'evidence.transferContext'),
        TRANSFER_CONTEXTS,
        'evidence.transferContext',
      ) as LearnerTransferContext,
    })
  }
  if (Object.hasOwn(input, 'transferContext')) {
    throw new TypeError('evidence.transferContext is only allowed for transfer evidence')
  }
  return Object.freeze({ ...base, kind }) as LearnerEvidence
}

function freezeEvidence(evidence: readonly LearnerEvidence[]): readonly LearnerEvidence[] {
  return Object.freeze(evidence.map(item => Object.freeze({ ...item })))
}

function freezeState(state: LearnerState): LearnerState {
  return Object.freeze({
    ...state,
    priorKnowledge: Object.freeze([...state.priorKnowledge]),
    misconceptions: Object.freeze([...state.misconceptions]),
    evidence: freezeEvidence(state.evidence),
    sourceAnchors: Object.freeze([...state.sourceAnchors]),
    appliedEventIds: Object.freeze(state.appliedEventIds.map(item => Object.freeze({ ...item }))),
  })
}

function canonicalJson(value: unknown, ancestors = new Set<object>()): string {
  if (value === null) return 'null'
  if (typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value)
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('learner state events must contain finite JSON numbers')
    return JSON.stringify(value)
  }
  if (Array.isArray(value)) {
    if (ancestors.has(value)) throw new TypeError('learner state events must not contain cycles')
    ancestors.add(value)
    const encoded = `[${value.map(item => item === undefined ? 'null' : canonicalJson(item, ancestors)).join(',')}]`
    ancestors.delete(value)
    return encoded
  }
  if (typeof value === 'object') {
    if (ancestors.has(value)) throw new TypeError('learner state events must not contain cycles')
    ancestors.add(value)
    const record = value as Record<string, unknown>
    const encoded = `{${Object.keys(record)
      .filter(key => record[key] !== undefined)
      .sort()
      .map(key => `${JSON.stringify(key)}:${canonicalJson(record[key], ancestors)}`)
      .join(',')}}`
    ancestors.delete(value)
    return encoded
  }
  throw new TypeError('learner state events must be JSON-serializable')
}

function learnerStateEventFingerprint(event: LearnerStateEvent): string {
  return createHash('sha256').update(canonicalJson(event), 'utf8').digest('hex')
}

function assertEventSourceMatrix(
  event: LearnerStateEvent,
  observation: ObservableLearnerEvent,
): void {
  if (event.type === 'assistant_move_observed') {
    if (observation.source !== 'assistant-output') {
      throw new TypeError('assistant_move_observed requires source assistant-output')
    }
    return
  }
  if (event.type === 'source_anchors_observed') {
    if (observation.source !== 'source-material') {
      throw new TypeError('source_anchors_observed requires source source-material')
    }
    return
  }
  if (event.type === 'state_corrected') {
    if (observation.source !== 'user-correction') {
      throw new TypeError('state_corrected requires source user-correction')
    }
    return
  }
  if (observation.source !== 'learner-message' && observation.source !== 'learner-action') {
    throw new TypeError(`${event.type} requires source learner-message or learner-action`)
  }
}

function isIndependentlyCorrectEvidence(evidence: LearnerEvidence): boolean {
  return (evidence.source === 'learner-message' || evidence.source === 'learner-action')
    && evidence.correctness === 'correct'
    && evidence.independence === 'independent'
    && evidence.kind !== 'error'
}

function evidenceMastery(evidence: readonly LearnerEvidence[]): LearnerMastery {
  const independentlyCorrect = evidence.filter(isIndependentlyCorrectEvidence)
  if (independentlyCorrect.some(item =>
    item.kind === 'transfer' && item.transferContext === 'fresh')) return 'transfer'
  if (independentlyCorrect.length > 0) return 'emerging'
  return 'unseen'
}

function masteryFromEvidence(
  current: LearnerMastery,
  evidence: readonly LearnerEvidence[],
): LearnerMastery {
  const observed = evidenceMastery(evidence)
  if (observed === 'transfer') return 'transfer'
  if (observed === 'emerging' && current === 'unseen') return 'emerging'
  return current
}

function evidenceSupportsMastery(evidence: LearnerEvidence, mastery: LearnerMastery): boolean {
  if (!isIndependentlyCorrectEvidence(evidence)) return false
  return mastery === 'transfer'
    ? evidence.kind === 'transfer' && evidence.transferContext === 'fresh'
    : mastery === 'emerging'
}

function boundEvidence(
  evidence: readonly LearnerEvidence[],
  mastery: LearnerMastery,
): readonly LearnerEvidence[] {
  const recent = evidence.slice(-MAX_LEARNER_EVIDENCE)
  if (mastery === 'unseen' || recent.some(item => evidenceSupportsMastery(item, mastery))) {
    return freezeEvidence(recent)
  }
  const support = [...evidence].reverse().find(item => evidenceSupportsMastery(item, mastery))
  if (!support) return freezeEvidence(recent)
  return freezeEvidence([support, ...recent.slice(-(MAX_LEARNER_EVIDENCE - 1))])
}

function assertMasteryEvidenceConsistency(state: Pick<LearnerState, 'mastery' | 'evidence'>): void {
  const supported = evidenceMastery(state.evidence)
  if (state.mastery === 'transfer' && supported !== 'transfer') {
    throw new TypeError('transfer mastery requires correct, independent learner transfer evidence')
  }
  if (state.mastery === 'emerging' && supported === 'unseen') {
    throw new TypeError('emerging mastery requires correct, independent learner evidence')
  }
}

export function createInitialLearnerState(sessionId: string): LearnerState {
  return freezeState({
    protocol: LEARNER_STATE_PROTOCOL,
    tentative: true,
    sessionId: normalizeSessionId(sessionId),
    revision: 0,
    goal: null,
    requestKind: 'unknown',
    level: 'unknown',
    priorKnowledge: [],
    gap: 'unknown',
    misconceptions: [],
    readiness: 'unknown',
    progressSignal: 'unknown',
    urgency: 'unknown',
    supportLevel: 0,
    assessmentContext: 'unknown',
    mastery: 'unseen',
    evidence: [],
    lastMove: 'none',
    sourceAnchors: [],
    appliedEventIds: [],
  })
}

function applyCorrection(
  state: LearnerState,
  correction: LearnerStateCorrection,
  observation: ObservableLearnerEvent,
): LearnerState {
  if (observation.source !== 'user-correction') {
    throw new TypeError('State corrections must come from an explicit user correction')
  }

  const next: LearnerState = { ...state }
  if (Object.hasOwn(correction, 'goal')) {
    next.goal = correction.goal === null ? null : normalizeRequiredText(correction.goal as string, 'goal')
  }
  if (correction.requestKind !== undefined) {
    next.requestKind = assertEnum(correction.requestKind, REQUEST_KINDS, 'requestKind')
  }
  if (correction.level !== undefined) next.level = assertEnum(correction.level, LEVELS, 'level')
  if (correction.priorKnowledge !== undefined) {
    next.priorKnowledge = normalizeStringList(correction.priorKnowledge, MAX_PRIOR_KNOWLEDGE, 'priorKnowledge')
  }
  if (correction.gap !== undefined) next.gap = assertEnum(correction.gap, GAPS, 'gap')
  if (correction.misconceptions !== undefined) {
    next.misconceptions = normalizeStringList(correction.misconceptions, MAX_MISCONCEPTIONS, 'misconceptions')
  }
  if (correction.readiness !== undefined) {
    next.readiness = assertEnum(correction.readiness, READINESS_VALUES, 'readiness')
  }
  if (correction.progressSignal !== undefined) {
    next.progressSignal = assertEnum(correction.progressSignal, PROGRESS_SIGNALS, 'progressSignal')
  }
  if (correction.urgency !== undefined) {
    next.urgency = assertEnum(correction.urgency, URGENCY_VALUES, 'urgency')
  }
  if (correction.supportLevel !== undefined) {
    next.supportLevel = normalizeSupportLevel(correction.supportLevel)
  }
  if (correction.assessmentContext !== undefined) {
    next.assessmentContext = assertEnum(
      correction.assessmentContext,
      ASSESSMENT_CONTEXTS,
      'assessmentContext',
    )
  }
  if (correction.mastery !== undefined) {
    const requested = assertEnum(correction.mastery, MASTERY_VALUES, 'mastery')
    const ranks: Record<LearnerMastery, number> = { unseen: 0, emerging: 1, transfer: 2 }
    if (ranks[requested] > ranks[state.mastery]) {
      throw new TypeError('A user correction cannot upgrade mastery without evaluated independent evidence')
    }
    next.mastery = requested
  }
  if (correction.evidence !== undefined) {
    const normalized = correction.evidence.map(item => normalizeEvidence(item, observation))
    if (correction.mastery === undefined) {
      next.mastery = evidenceMastery(normalized)
    }
    next.evidence = boundEvidence(normalized, next.mastery)
  }
  if (correction.lastMove !== undefined) {
    next.lastMove = assertEnum(correction.lastMove, TEACHING_MOVES, 'lastMove')
  }
  if (correction.sourceAnchors !== undefined) {
    next.sourceAnchors = normalizeStringList(correction.sourceAnchors, MAX_SOURCE_ANCHORS, 'sourceAnchors')
  }
  return next
}

export function reduceLearnerState(state: LearnerState, event: LearnerStateEvent): LearnerState {
  const observation = normalizeObservation(event.observation)
  assertEventSourceMatrix(event, observation)
  const fingerprint = learnerStateEventFingerprint(event)
  const applied = state.appliedEventIds.find(item => item.id === observation.id)
  if (applied) {
    if (applied.fingerprint === fingerprint) return state
    throw new TypeError(
      `observation id ${observation.id} was replayed with different content (conflicting event payload)`,
    )
  }

  let next: LearnerState = { ...state }
  switch (event.type) {
    case 'goal_observed':
      next.goal = normalizeRequiredText(event.goal, 'goal')
      break
    case 'request_kind_observed':
      next.requestKind = assertEnum(event.requestKind, REQUEST_KINDS, 'requestKind')
      break
    case 'prior_knowledge_observed': {
      if (event.level === undefined && event.items === undefined) {
        throw new TypeError('prior_knowledge_observed requires level or items')
      }
      if (event.level !== undefined) next.level = assertEnum(event.level, LEVELS, 'level')
      if (event.items !== undefined) {
        next.priorKnowledge = event.mode === 'replace'
          ? normalizeStringList(event.items, MAX_PRIOR_KNOWLEDGE, 'priorKnowledge')
          : appendBoundedUnique(state.priorKnowledge, event.items, MAX_PRIOR_KNOWLEDGE, 'priorKnowledge')
      }
      break
    }
    case 'gap_observed':
      next.gap = assertEnum(event.gap, GAPS, 'gap')
      if (event.misconceptions !== undefined) {
        next.misconceptions = event.misconceptionMode === 'replace'
          ? normalizeStringList(event.misconceptions, MAX_MISCONCEPTIONS, 'misconceptions')
          : appendBoundedUnique(
              state.misconceptions,
              event.misconceptions,
              MAX_MISCONCEPTIONS,
              'misconceptions',
            )
      }
      break
    case 'readiness_observed':
      next.readiness = assertEnum(event.readiness, READINESS_VALUES, 'readiness')
      if (next.readiness === 'needs-foothold') {
        next.supportLevel = maxSupportLevel(state.supportLevel, 4)
      } else if (next.readiness === 'can-reason') {
        next.supportLevel = lowerSupportLevel(state.supportLevel)
      }
      break
    case 'progress_observed':
      next.progressSignal = assertEnum(event.progressSignal, PROGRESS_SIGNALS, 'progressSignal')
      if (next.progressSignal === 'stuck') {
        next.supportLevel = maxSupportLevel(state.supportLevel, 4)
      } else if (next.progressSignal === 'shutdown-risk') {
        next.supportLevel = 5
      } else if (next.progressSignal === 'progressing') {
        next.supportLevel = lowerSupportLevel(state.supportLevel)
      }
      break
    case 'urgency_observed':
      next.urgency = assertEnum(event.urgency, URGENCY_VALUES, 'urgency')
      break
    case 'assessment_context_observed':
      next.assessmentContext = assertEnum(
        event.assessmentContext,
        ASSESSMENT_CONTEXTS,
        'assessmentContext',
      )
      break
    case 'learner_evidence_observed': {
      const evidence = normalizeEvidence(event.evidence, observation)
      next.mastery = masteryFromEvidence(state.mastery, [evidence])
      next.evidence = boundEvidence([...state.evidence, evidence], next.mastery)
      if (isIndependentlyCorrectEvidence(evidence)) {
        next.supportLevel = evidence.kind === 'transfer' && evidence.transferContext === 'fresh'
          ? 0
          : lowerSupportLevel(state.supportLevel)
      } else {
        const incorrectStreak = trailingIncorrectEvidence(next.evidence)
        if (incorrectStreak >= 2) {
          next.supportLevel = maxSupportLevel(
            state.supportLevel,
            Math.min(5, incorrectStreak) as LearnerSupportLevel,
          )
        }
      }
      break
    }
    case 'assistant_move_observed':
      if (observation.source !== 'assistant-output') {
        throw new TypeError('An assistant move must be observed from assistant output')
      }
      next.lastMove = assertEnum(event.move, TEACHING_MOVES, 'lastMove')
      break
    case 'source_anchors_observed':
      next.sourceAnchors = event.mode === 'replace'
        ? normalizeStringList(event.anchors, MAX_SOURCE_ANCHORS, 'sourceAnchors')
        : appendBoundedUnique(state.sourceAnchors, event.anchors, MAX_SOURCE_ANCHORS, 'sourceAnchors')
      break
    case 'state_corrected':
      next = applyCorrection(state, event.correction, observation)
      break
    default: {
      const unreachable: never = event
      throw new TypeError(`Unknown learner state event: ${String(unreachable)}`)
    }
  }

  assertMasteryEvidenceConsistency(next)

  return freezeState({
    ...next,
    revision: state.revision + 1,
    appliedEventIds: [...state.appliedEventIds, { id: observation.id, fingerprint }]
      .slice(-MAX_APPLIED_EVENT_IDS),
  })
}

/**
 * Clears pedagogical hypotheses without forgetting replay ids. Keeping those
 * ids prevents an async event from before Reset from restoring stale state.
 */
export function resetLearnerState(state: LearnerState): LearnerState {
  const initial = createInitialLearnerState(state.sessionId)
  return freezeState({
    ...initial,
    revision: state.revision + 1,
    appliedEventIds: state.appliedEventIds,
  })
}

const SNAPSHOT_KEYS = [
  'protocol',
  'tentative',
  'revision',
  'goal',
  'requestKind',
  'level',
  'priorKnowledge',
  'gap',
  'misconceptions',
  'readiness',
  'progressSignal',
  'urgency',
  'supportLevel',
  'assessmentContext',
  'mastery',
  'evidence',
  'lastMove',
  'sourceAnchors',
  'appliedEventIds',
] as const

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`)
  }
  return value as Record<string, unknown>
}

function assertExactKeys(
  value: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[],
  label: string,
): void {
  const allowed = new Set([...required, ...optional])
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new TypeError(`${label} contains unknown field: ${key}`)
  }
  for (const key of required) {
    if (!Object.hasOwn(value, key)) throw new TypeError(`${label} is missing required field: ${key}`)
  }
}

function strictString(value: unknown, label: string): string {
  if (typeof value !== 'string') throw new TypeError(`${label} must be a string`)
  const normalized = normalizeRequiredText(value, label)
  if (normalized !== value) throw new TypeError(`${label} must be normalized and at most ${MAX_STORED_TEXT} characters`)
  return value
}

function strictStringList(value: unknown, limit: number | undefined, label: string): readonly string[] {
  if (!Array.isArray(value)) throw new TypeError(`${label} must be an array`)
  if (limit !== undefined && value.length > limit) throw new TypeError(`${label} exceeds its item limit of ${limit}`)
  const result = value.map((item, index) => strictString(item, `${label}[${index}]`))
  if (new Set(result).size !== result.length) throw new TypeError(`${label} must not contain duplicates`)
  return Object.freeze(result)
}

function strictNonNegativeInteger(value: unknown, label: string): number {
  if (typeof value !== 'number') throw new TypeError(`${label} must be a number`)
  return normalizeCount(value, label)
}

function parseSnapshotInput(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'string') return asRecord(value, label)
  let parsed: unknown
  try {
    parsed = JSON.parse(value) as unknown
  } catch (error) {
    throw new TypeError(`${label} must be valid JSON`, { cause: error })
  }
  return asRecord(parsed, label)
}

function parseSnapshotEvidence(value: unknown): readonly LearnerEvidence[] {
  if (!Array.isArray(value)) throw new TypeError('learner state snapshot evidence must be an array')
  if (value.length > MAX_LEARNER_EVIDENCE) {
    throw new TypeError(`learner state snapshot evidence exceeds its item limit of ${MAX_LEARNER_EVIDENCE}`)
  }
  return freezeEvidence(value.map((item, index) => {
    const record = asRecord(item, `learner state snapshot evidence[${index}]`)
    const kind = assertEnum(
      strictString(record.kind, `learner state snapshot evidence[${index}].kind`),
      EVIDENCE_KINDS,
      `learner state snapshot evidence[${index}].kind`,
    ) as LearnerEvidenceKind
    assertExactKeys(
      record,
      [
        'kind', 'summary', 'confidence', 'correctness', 'independence', 'source',
        ...(kind === 'transfer' ? ['transferContext'] : []),
      ],
      ['turn'],
      `learner state snapshot evidence[${index}]`,
    )
    const source = assertEnum(
      strictString(record.source, `learner state snapshot evidence[${index}].source`),
      new Set(['learner-message', 'learner-action', 'user-correction']),
      `learner state snapshot evidence[${index}].source`,
    ) as LearnerEvidence['source']
    const turn = record.turn === undefined
      ? undefined
      : strictNonNegativeInteger(record.turn, `learner state snapshot evidence[${index}].turn`)
    const base = {
      summary: strictString(record.summary, `learner state snapshot evidence[${index}].summary`),
      confidence: assertEnum(
        strictString(record.confidence, `learner state snapshot evidence[${index}].confidence`),
        EVIDENCE_CONFIDENCE,
        `learner state snapshot evidence[${index}].confidence`,
      ) as LearnerEvidenceConfidence,
      correctness: assertEnum(
        strictString(record.correctness, `learner state snapshot evidence[${index}].correctness`),
        EVIDENCE_CORRECTNESS,
        `learner state snapshot evidence[${index}].correctness`,
      ) as LearnerEvidenceCorrectness,
      independence: assertEnum(
        strictString(record.independence, `learner state snapshot evidence[${index}].independence`),
        EVIDENCE_INDEPENDENCE,
        `learner state snapshot evidence[${index}].independence`,
      ) as LearnerEvidenceIndependence,
      source,
      ...(turn === undefined ? {} : { turn }),
    }
    if (kind === 'transfer') {
      return {
        ...base,
        kind,
        transferContext: assertEnum(
          strictString(
            record.transferContext,
            `learner state snapshot evidence[${index}].transferContext`,
          ),
          TRANSFER_CONTEXTS,
          `learner state snapshot evidence[${index}].transferContext`,
        ) as LearnerTransferContext,
      }
    }
    return { ...base, kind } as LearnerEvidence
  }))
}

function parseAppliedEventFence(value: unknown): readonly AppliedLearnerStateEvent[] {
  if (!Array.isArray(value)) throw new TypeError('learner state snapshot appliedEventIds must be an array')
  if (value.length > MAX_APPLIED_EVENT_IDS) {
    throw new TypeError(`learner state snapshot appliedEventIds exceeds its item limit of ${MAX_APPLIED_EVENT_IDS}`)
  }
  const parsed = value.map((item, index) => {
    const record = asRecord(item, `learner state snapshot appliedEventIds[${index}]`)
    assertExactKeys(
      record,
      ['id', 'fingerprint'],
      [],
      `learner state snapshot appliedEventIds[${index}]`,
    )
    const id = strictString(record.id, `learner state snapshot appliedEventIds[${index}].id`)
    const fingerprint = strictString(
      record.fingerprint,
      `learner state snapshot appliedEventIds[${index}].fingerprint`,
    )
    if (!/^[a-f0-9]{64}$/.test(fingerprint)) {
      throw new TypeError(`learner state snapshot appliedEventIds[${index}].fingerprint must be SHA-256 hex`)
    }
    return Object.freeze({ id, fingerprint })
  })
  if (new Set(parsed.map(item => item.id)).size !== parsed.length) {
    throw new TypeError('learner state snapshot appliedEventIds must not contain duplicate ids')
  }
  return Object.freeze(parsed)
}

/**
 * Strictly parses a full learner-state snapshot and binds it to the current
 * session supplied by the caller. Persisted data never owns lifecycle identity.
 * Unknown fields (including personality/style profiles) are rejected.
 */
export function parseLearnerStateSnapshot(value: unknown, expectedSessionId: string): LearnerState {
  const record = parseSnapshotInput(value, 'learner state snapshot')
  assertExactKeys(record, SNAPSHOT_KEYS, [], 'learner state snapshot')
  if (record.protocol !== LEARNER_STATE_PROTOCOL) {
    throw new TypeError(`learner state snapshot protocol must be ${LEARNER_STATE_PROTOCOL}`)
  }
  if (record.tentative !== true) throw new TypeError('learner state snapshot tentative must be true')

  const sessionId = normalizeSessionId(expectedSessionId)
  const goal = record.goal === null ? null : strictString(record.goal, 'learner state snapshot goal')
  const supportLevel = strictNonNegativeInteger(record.supportLevel, 'learner state snapshot supportLevel')
  const parsed: LearnerState = {
    protocol: LEARNER_STATE_PROTOCOL,
    tentative: true,
    sessionId,
    revision: strictNonNegativeInteger(record.revision, 'learner state snapshot revision'),
    goal,
    requestKind: assertEnum(
      strictString(record.requestKind, 'learner state snapshot requestKind'),
      REQUEST_KINDS,
      'learner state snapshot requestKind',
    ) as LearnerRequestKind,
    level: assertEnum(
      strictString(record.level, 'learner state snapshot level'),
      LEVELS,
      'learner state snapshot level',
    ) as LearnerLevel,
    priorKnowledge: strictStringList(
      record.priorKnowledge,
      MAX_PRIOR_KNOWLEDGE,
      'learner state snapshot priorKnowledge',
    ),
    gap: assertEnum(
      strictString(record.gap, 'learner state snapshot gap'),
      GAPS,
      'learner state snapshot gap',
    ) as LearnerGap,
    misconceptions: strictStringList(
      record.misconceptions,
      MAX_MISCONCEPTIONS,
      'learner state snapshot misconceptions',
    ),
    readiness: assertEnum(
      strictString(record.readiness, 'learner state snapshot readiness'),
      READINESS_VALUES,
      'learner state snapshot readiness',
    ) as LearnerReadiness,
    progressSignal: assertEnum(
      strictString(record.progressSignal, 'learner state snapshot progressSignal'),
      PROGRESS_SIGNALS,
      'learner state snapshot progressSignal',
    ) as LearnerProgressSignal,
    urgency: assertEnum(
      strictString(record.urgency, 'learner state snapshot urgency'),
      URGENCY_VALUES,
      'learner state snapshot urgency',
    ) as LearnerUrgency,
    supportLevel: normalizeSupportLevel(supportLevel),
    assessmentContext: assertEnum(
      strictString(record.assessmentContext, 'learner state snapshot assessmentContext'),
      ASSESSMENT_CONTEXTS,
      'learner state snapshot assessmentContext',
    ) as LearnerAssessmentContext,
    mastery: assertEnum(
      strictString(record.mastery, 'learner state snapshot mastery'),
      MASTERY_VALUES,
      'learner state snapshot mastery',
    ) as LearnerMastery,
    evidence: parseSnapshotEvidence(record.evidence),
    lastMove: assertEnum(
      strictString(record.lastMove, 'learner state snapshot lastMove'),
      TEACHING_MOVES,
      'learner state snapshot lastMove',
    ) as LearnerTeachingMove,
    sourceAnchors: strictStringList(
      record.sourceAnchors,
      MAX_SOURCE_ANCHORS,
      'learner state snapshot sourceAnchors',
    ),
    appliedEventIds: parseAppliedEventFence(record.appliedEventIds),
  }
  assertMasteryEvidenceConsistency(parsed)
  return freezeState(parsed)
}

function omitSessionIdentity(state: LearnerState): LearnerStateSnapshot {
  const { sessionId: _sessionId, ...snapshot } = state
  return Object.freeze(snapshot)
}

/** Stable, lossless JSON encoding for a full snapshot with identity omitted. */
export function serializeLearnerStateSnapshot(state: LearnerState): string {
  const snapshot = omitSessionIdentity(state)
  const validated = parseLearnerStateSnapshot(snapshot, state.sessionId)
  return JSON.stringify(omitSessionIdentity(validated))
}

/** Hydrates a persisted identity-free snapshot into exactly the current session. */
export function hydrateLearnerStateSnapshot(value: unknown, sessionId: string): LearnerState {
  return parseLearnerStateSnapshot(value, sessionId)
}

function normalizeSnapshotReason(value: unknown): LearnerStateSnapshotReason {
  if (value !== 'update' && value !== 'correction' && value !== 'reset') {
    throw new TypeError('learner state snapshot reason must be update, correction, or reset')
  }
  return value
}

function assertResetSnapshot(snapshot: LearnerState): void {
  const initial = createInitialLearnerState(snapshot.sessionId)
  const pedagogicalKeys = [
    'goal', 'requestKind', 'level', 'priorKnowledge', 'gap', 'misconceptions', 'readiness',
    'progressSignal', 'urgency', 'supportLevel', 'assessmentContext', 'mastery', 'evidence',
    'lastMove', 'sourceAnchors',
  ] as const
  for (const key of pedagogicalKeys) {
    if (JSON.stringify(snapshot[key]) !== JSON.stringify(initial[key])) {
      throw new TypeError(`reset learner state snapshot must clear ${key}`)
    }
  }
}

export function createLearnerStateSnapshotEvent(
  state: LearnerState,
  reason: LearnerStateSnapshotReason,
): LearnerStateSnapshotEvent {
  const hydrated = parseLearnerStateSnapshot(JSON.parse(serializeLearnerStateSnapshot(state)), state.sessionId)
  const snapshot = omitSessionIdentity(hydrated)
  const normalizedReason = normalizeSnapshotReason(reason)
  if (normalizedReason === 'reset') assertResetSnapshot(hydrated)
  return Object.freeze({
    protocol: LEARNER_STATE_EVENT_PROTOCOL,
    reason: normalizedReason,
    snapshot,
  })
}

export function parseLearnerStateSnapshotEvent(
  value: unknown,
  expectedSessionId: string,
): LearnerStateSnapshotEvent {
  const record = parseSnapshotInput(value, 'learner state snapshot event')
  assertExactKeys(record, ['protocol', 'reason', 'snapshot'], [], 'learner state snapshot event')
  if (record.protocol !== LEARNER_STATE_EVENT_PROTOCOL) {
    throw new TypeError(`learner state event protocol must be ${LEARNER_STATE_EVENT_PROTOCOL}`)
  }
  const reason = normalizeSnapshotReason(record.reason)
  const hydrated = parseLearnerStateSnapshot(record.snapshot, expectedSessionId)
  if (reason === 'reset') assertResetSnapshot(hydrated)
  const snapshot = omitSessionIdentity(hydrated)
  return Object.freeze({ protocol: LEARNER_STATE_EVENT_PROTOCOL, reason, snapshot })
}

/** Losslessly folds the latest valid full snapshot for exactly one session. */
export function foldLearnerStateSession(
  sessionId: string,
  events: readonly SessionEvent[],
): LearnerState {
  let state = createInitialLearnerState(sessionId)
  for (const event of events) {
    if (event.type !== 'learning/state') continue
    const payload = parseLearnerStateSnapshotEvent(event.data, state.sessionId)
    const candidate = hydrateLearnerStateSnapshot(payload.snapshot, state.sessionId)
    if (candidate.revision < state.revision) {
      throw new TypeError(
        `learner state revision regressed from ${state.revision} to ${candidate.revision} at session event ${event.seq}`,
      )
    }
    if (candidate.revision === state.revision) {
      if (serializeLearnerStateSnapshot(candidate) !== serializeLearnerStateSnapshot(state)) {
        throw new TypeError(`learner state revision ${candidate.revision} has conflicting snapshots`)
      }
      continue
    }
    state = candidate
  }
  return state
}

function safeQuoted(value: string, maxCodePoints = 120): string {
  const shortened = [...value].slice(0, maxCodePoints).join('')
  return JSON.stringify(shortened)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
}

function safeList(values: readonly string[]): string {
  return `[${values.map(value => safeQuoted(value, 80)).join(', ')}]`
}

/** A conservative tokenizer-free estimate suitable for enforcing a prompt budget. */
export function estimateLearnerStateTokens(text: string): number {
  const cjk = text.match(/[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\u3040-\u30ff\uac00-\ud7af]/gu)?.length ?? 0
  const withoutCjk = text.replace(/[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\u3040-\u30ff\uac00-\ud7af]/gu, ' ')
  const pieces = withoutCjk.match(/[A-Za-z0-9_/@.-]+|[^\sA-Za-z0-9_/@.-]/g) ?? []
  return cjk + pieces.reduce((total, piece) => {
    if (/^[A-Za-z0-9_/@.-]+$/.test(piece)) return total + Math.max(1, Math.ceil(piece.length / 4))
    return total + 1
  }, 0)
}

interface TranscriptLine {
  order: number
  priority: number
  text: string
}

function transcriptText(lines: readonly TranscriptLine[]): string {
  return [...lines]
    .sort((left, right) => left.order - right.order)
    .map(line => line.text)
    .join('\n')
}

/**
 * Renders model-facing V4.1 state without lifecycle ids or raw event metadata.
 * Optional evidence is admitted by priority until the 100-300 token budget is
 * full; the XML-like envelope always remains closed and injection-safe.
 */
export function renderLearnerStateTranscript(
  state: LearnerState,
  options: { maxTokens?: number } = {},
): string {
  const requestedBudget = options.maxTokens ?? DEFAULT_TRANSCRIPT_TOKEN_BUDGET
  if (!Number.isFinite(requestedBudget)) throw new TypeError('maxTokens must be finite')
  const maxTokens = Math.max(100, Math.min(300, Math.floor(requestedBudget)))
  const envelope: TranscriptLine[] = [
    { order: 0, priority: Infinity, text: `<learner_state protocol="${LEARNER_STATE_PROTOCOL}" tentative="true">` },
    { order: 1000, priority: Infinity, text: '</learner_state>' },
  ]
  const accepted = [...envelope]
  const fits = (candidate: TranscriptLine): boolean =>
    estimateLearnerStateTokens(transcriptText([...accepted, candidate])) <= maxTokens
  const admit = (candidate: TranscriptLine): boolean => {
    if (!fits(candidate)) return false
    accepted.push(candidate)
    return true
  }

  // Small-budget core: these short fields retain the next-move signal while
  // leaving room to crop a CJK goal. No scalar line is unconditionally required.
  const core: TranscriptLine[] = [
    { order: 20, priority: 100, text: `request_kind: ${state.requestKind}` },
    { order: 50, priority: 95, text: `gap: ${state.gap}` },
    { order: 80, priority: 100, text: `progress_signal: ${state.progressSignal}` },
    { order: 100, priority: 95, text: `support_need: ${state.supportLevel}/5` },
    { order: 120, priority: 100, text: `mastery: ${state.mastery}` },
  ]
  for (const line of core.sort((left, right) => right.priority - left.priority)) admit(line)

  if (state.goal === null) {
    admit({ order: 10, priority: 100, text: 'goal: unknown' })
  } else {
    // Find the longest safe prefix that fits the actual token budget. This is
    // deliberately code-point based so surrogate pairs are never split.
    const goalLength = Math.min(96, [...state.goal].length)
    for (let length = goalLength; length >= 1; length -= 1) {
      if (admit({ order: 10, priority: 100, text: `goal: ${safeQuoted(state.goal, length)}` })) break
    }
  }

  const optional: TranscriptLine[] = [
    { order: 30, priority: 78, text: `level: ${state.level}` },
    { order: 70, priority: 82, text: `readiness: ${state.readiness}` },
    { order: 90, priority: 86, text: `urgency: ${state.urgency}` },
    { order: 110, priority: 76, text: `assessment_context: ${state.assessmentContext}` },
  ]
  if (state.priorKnowledge.length) {
    optional.push({ order: 40, priority: 65, text: `prior_knowledge: ${safeList(state.priorKnowledge)}` })
  }
  if (state.misconceptions.length) {
    optional.push({ order: 60, priority: 80, text: `misconceptions: ${safeList(state.misconceptions)}` })
  }
  const recentEvidence = state.evidence.slice(-4)
  recentEvidence.forEach((item, index) => {
    const transferContext = item.kind === 'transfer' ? `/${item.transferContext}` : ''
    optional.push({
      order: 200 + index,
      priority: item.kind === 'transfer' ? 100 : 90 + index,
      // Keep at least the highest-value evidence usable under a tight 180-token
      // transcript budget, including for CJK text where one code point is often
      // close to one token.
      text: `evidence: ${item.kind}${transferContext}/${item.correctness}/${item.independence}/${item.confidence}: ${safeQuoted(item.summary, 40)}`,
    })
  })
  if (state.sourceAnchors.length) {
    optional.push({ order: 300, priority: 60, text: `source_anchors: ${safeList(state.sourceAnchors)}` })
  }

  for (const candidate of optional.sort((left, right) => right.priority - left.priority)) {
    admit(candidate)
  }
  const rendered = transcriptText(accepted)
  if (estimateLearnerStateTokens(rendered) > maxTokens) {
    throw new Error('learner state transcript exceeded its hard token budget')
  }
  return rendered
}

export interface LearnerStateSessionStore {
  /** Idempotent for a refresh/re-attachment to an already-open session. */
  beginSession(sessionId: string): LearnerState
  getSession(sessionId: string): LearnerState | undefined
  dispatch(sessionId: string, event: LearnerStateEvent): LearnerState
  /** CAS write for async work; rejects an event computed before Reset/update. */
  compareAndDispatch(
    sessionId: string,
    expectedRevision: number,
    event: LearnerStateEvent,
  ): LearnerState
  correctSession(
    sessionId: string,
    correction: LearnerStateCorrection,
    observation: ObservableLearnerEvent & { source: 'user-correction' },
  ): LearnerState
  resetSession(sessionId: string): LearnerState
  /** CAS Reset for callers that must not clear a concurrently updated state. */
  compareAndReset(sessionId: string, expectedRevision: number): LearnerState
  endSession(sessionId: string): boolean
  clear(): void
  sessionIds(): readonly string[]
}

/** Creates an in-memory-only store. There is intentionally no module singleton. */
export function createLearnerStateSessionStore(): LearnerStateSessionStore {
  const sessions = new Map<string, LearnerState>()

  function existing(sessionId: string): LearnerState {
    const id = normalizeSessionId(sessionId)
    const state = sessions.get(id)
    if (!state) throw new Error(`Learner state session is not active: ${id}`)
    return state
  }

  function assertRevision(state: LearnerState, expectedRevision: number): void {
    const expected = normalizeCount(expectedRevision, 'expectedRevision')
    if (state.revision !== expected) {
      throw new Error(`Learner state revision changed: expected ${expected}, current ${state.revision}`)
    }
  }

  return Object.freeze({
    beginSession(sessionId: string): LearnerState {
      const id = normalizeSessionId(sessionId)
      const current = sessions.get(id)
      if (current) return current
      const initial = createInitialLearnerState(id)
      sessions.set(id, initial)
      return initial
    },
    getSession(sessionId: string): LearnerState | undefined {
      return sessions.get(normalizeSessionId(sessionId))
    },
    dispatch(sessionId: string, event: LearnerStateEvent): LearnerState {
      const current = existing(sessionId)
      const next = reduceLearnerState(current, event)
      if (next !== current) sessions.set(current.sessionId, next)
      return next
    },
    compareAndDispatch(
      sessionId: string,
      expectedRevision: number,
      event: LearnerStateEvent,
    ): LearnerState {
      const current = existing(sessionId)
      assertRevision(current, expectedRevision)
      const next = reduceLearnerState(current, event)
      if (next !== current) sessions.set(current.sessionId, next)
      return next
    },
    correctSession(
      sessionId: string,
      correction: LearnerStateCorrection,
      observation: ObservableLearnerEvent & { source: 'user-correction' },
    ): LearnerState {
      return this.dispatch(sessionId, { type: 'state_corrected', correction, observation })
    },
    resetSession(sessionId: string): LearnerState {
      const current = existing(sessionId)
      const reset = resetLearnerState(current)
      sessions.set(current.sessionId, reset)
      return reset
    },
    compareAndReset(sessionId: string, expectedRevision: number): LearnerState {
      const current = existing(sessionId)
      assertRevision(current, expectedRevision)
      const reset = resetLearnerState(current)
      sessions.set(current.sessionId, reset)
      return reset
    },
    endSession(sessionId: string): boolean {
      return sessions.delete(normalizeSessionId(sessionId))
    },
    clear(): void {
      sessions.clear()
    },
    sessionIds(): readonly string[] {
      return Object.freeze([...sessions.keys()])
    },
  })
}
