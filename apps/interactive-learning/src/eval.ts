import type { LearningVisualV4 } from './protocol.ts'

export type TeachingVisualKind = LearningVisualV4['content']['kind']

export interface TeachingEvalCase {
  id: string
  learnerPrompt: string
  expectedActivityKind: TeachingVisualKind | null
  requiredContinuationTerms: string[]
  responseEvidence?: string
  shouldEndSegment?: boolean
  rationale: string
}

export interface TeachingEvalCandidate {
  caseId: string
  activityKind: TeachingVisualKind | null
  continuation: string
  endedSegment: boolean
}

export interface TeachingEvalVerdict {
  caseId: string
  passed: boolean
  checks: Array<{ name: string; passed: boolean; detail: string }>
}

/** Retired V2 Question/Reveal event vocabulary, retained only for replay audits. */
export type LegacyV2ReplayEventType =
  | 'assistant-text'
  | 'learning-question-call'
  | 'learning-question-result'
  | 'learning-reveal-call'
  | 'animation-finished'
  | 'continue-enabled'
  | 'continue-committed'
  | 'learning-reveal-result'

export interface LegacyV2ReplayEvent {
  at: number
  type: LegacyV2ReplayEventType
  /** Stable model-step identity. Required for Learning tool calls. */
  stepId?: string
  payload?: unknown
  text?: string
}

export interface LegacyV2ReplayCandidate {
  events: readonly LegacyV2ReplayEvent[]
  /** Exact strings which must not appear before the first question result. */
  answerMarkers?: readonly string[]
  /** Exact strings which must not appear before the preceding reveal resolves. */
  futureMarkers?: readonly string[]
}

const QUESTION_FORBIDDEN_KEYS = new Set([
  'answer', 'correctAnswer', 'expected', 'explanation', 'futureSteps', 'nextPrompt',
  'nextQuestion', 'reveal', 'solution', 'steps',
])
const REVEAL_FORBIDDEN_KEYS = new Set([
  'futureSteps', 'input', 'nextPrompt', 'nextQuestion', 'prompt', 'steps',
])

function serialized(value: unknown): string {
  try {
    return JSON.stringify(value).toLocaleLowerCase('en-US')
  } catch {
    return ''
  }
}

function findForbiddenKey(value: unknown, forbidden: ReadonlySet<string>): string | undefined {
  const pending: unknown[] = [value]
  while (pending.length > 0) {
    const item = pending.pop()
    if (Array.isArray(item)) {
      pending.push(...item)
      continue
    }
    if (typeof item !== 'object' || item === null) continue
    for (const [key, child] of Object.entries(item)) {
      if (forbidden.has(key)) return key
      pending.push(child)
    }
  }
  return undefined
}

function firstLegacyV2Index(
  events: readonly LegacyV2ReplayEvent[],
  type: LegacyV2ReplayEventType,
): number {
  return events.findIndex(event => event.type === type)
}

/**
 * Read-only deterministic audit for conversations created by the retired V2
 * Question → Reveal → animation → Continue protocol. This is intentionally
 * excluded from the default V4.1 eval and must never be used as the current
 * teaching contract.
 */
export function gradeLegacyV2ReplayTranscript(
  candidate: LegacyV2ReplayCandidate,
): TeachingEvalVerdict {
  const checks: TeachingEvalVerdict['checks'] = []
  const events = candidate.events
  const questionCalls = events.filter(event => event.type === 'learning-question-call')
  const revealCalls = events.filter(event => event.type === 'learning-reveal-call')
  const learningCalls = [...questionCalls, ...revealCalls]
  const callsByStep = new Map<string, number>()
  let missingStepId = false
  for (const event of learningCalls) {
    if (event.stepId === undefined || event.stepId === '') {
      missingStepId = true
      continue
    }
    callsByStep.set(event.stepId, (callsByStep.get(event.stepId) ?? 0) + 1)
  }
  checks.push({
    name: 'one-learning-gate-per-model-step',
    passed: !missingStepId && [...callsByStep.values()].every(count => count === 1),
    detail: 'each model step must contain exactly one Question or Reveal gate',
  })

  const badQuestionKey = questionCalls
    .map(event => findForbiddenKey(event.payload, QUESTION_FORBIDDEN_KEYS))
    .find(key => key !== undefined)
  checks.push({
    name: 'question-shape-does-not-leak',
    passed: badQuestionKey === undefined,
    detail: badQuestionKey === undefined
      ? 'Question payload contains no Reveal/future-round fields'
      : `Question payload contains forbidden key ${badQuestionKey}`,
  })
  const badRevealKey = revealCalls
    .map(event => findForbiddenKey(event.payload, REVEAL_FORBIDDEN_KEYS))
    .find(key => key !== undefined)
  checks.push({
    name: 'reveal-shape-does-not-advance',
    passed: badRevealKey === undefined,
    detail: badRevealKey === undefined
      ? 'Reveal payload contains no next-question fields'
      : `Reveal payload contains forbidden key ${badRevealKey}`,
  })

  const firstQuestionResult = firstLegacyV2Index(events, 'learning-question-result')
  const beforeAnswer = serialized(events.slice(0, firstQuestionResult < 0 ? events.length : firstQuestionResult))
  const leakedAnswer = candidate.answerMarkers?.find(marker => beforeAnswer.includes(normalized(marker)))
  checks.push({
    name: 'no-answer-before-question-result',
    passed: leakedAnswer === undefined,
    detail: leakedAnswer === undefined ? 'no configured answer marker leaked early' : `leaked ${JSON.stringify(leakedAnswer)}`,
  })

  const firstRevealResult = firstLegacyV2Index(events, 'learning-reveal-result')
  const beforeNextRound = serialized(events.slice(0, firstRevealResult < 0 ? events.length : firstRevealResult + 1))
  const leakedFuture = candidate.futureMarkers?.find(marker => beforeNextRound.includes(normalized(marker)))
  checks.push({
    name: 'no-future-round-before-reveal-result',
    passed: leakedFuture === undefined,
    detail: leakedFuture === undefined ? 'no configured future-round marker leaked early' : `leaked ${JSON.stringify(leakedFuture)}`,
  })

  const questionResult = firstLegacyV2Index(events, 'learning-question-result')
  const revealCall = firstLegacyV2Index(events, 'learning-reveal-call')
  const animationFinished = firstLegacyV2Index(events, 'animation-finished')
  const continueEnabled = firstLegacyV2Index(events, 'continue-enabled')
  const continueCommitted = firstLegacyV2Index(events, 'continue-committed')
  const revealResult = firstLegacyV2Index(events, 'learning-reveal-result')
  const nextQuestion = events.findIndex((event, index) => index > revealResult && event.type === 'learning-question-call')
  const completeSequence = [questionResult, revealCall, animationFinished, continueEnabled, continueCommitted, revealResult, nextQuestion]
    .every(index => index >= 0)
  const chronological = completeSequence
    && questionResult < revealCall
    && animationFinished <= continueEnabled
    && continueEnabled <= continueCommitted
    && continueCommitted <= revealResult
    && revealResult < nextQuestion
    && events.every((event, index) => index === 0 || event.at >= events[index - 1]!.at)
  checks.push({
    name: 'question-reveal-next temporal gate',
    passed: chronological,
    detail: 'Question result < Reveal; animation <= continue; continue <= Reveal result < next Question',
  })

  return { caseId: 'legacy-v2-replay-transcript', passed: checks.every(check => check.passed), checks }
}

/**
 * Versioned, credential-free MVP rubric. A remote or local model collector can
 * emit TeachingEvalCandidate JSON and feed it to the same deterministic gate.
 */
export const TEACHING_EVAL_CASES: readonly TeachingEvalCase[] = [
  {
    id: 'simple-fact-no-visual',
    learnerPrompt: 'What is the capital of France? Give me the short answer.',
    expectedActivityKind: null,
    requiredContinuationTerms: ['paris'],
    rationale: 'One short fact does not benefit from an interactive visual.',
  },
  {
    id: 'parameter-relationship',
    learnerPrompt: 'Help me see how changing the sign of slope changes a line.',
    expectedActivityKind: 'plot',
    requiredContinuationTerms: ['slope'],
    rationale: 'A bounded quantitative relationship should be manipulated locally.',
  },
  {
    id: 'process-state',
    learnerPrompt: 'Walk me through what happens to a queue when we dequeue twice.',
    expectedActivityKind: 'node_link',
    requiredContinuationTerms: ['queue'],
    rationale: 'A non-blocking node-link sequence can expose state transitions without creating an answer gate.',
  },
  {
    id: 'structure-difference',
    learnerPrompt: 'Help me compare array and linked-list lookup structure.',
    expectedActivityKind: 'relation',
    requiredContinuationTerms: ['array', 'linked'],
    rationale: 'A native comparison relation makes the structural contrast directly inspectable.',
  },
  {
    id: 'fully-connected-network',
    learnerPrompt: 'Draw a fully connected neuron layer so I can see every connection.',
    expectedActivityKind: 'node_link',
    requiredContinuationTerms: ['connection', 'layer'],
    rationale: 'Topology must be rendered as layered nodes and explicit edges, never replaced by an activation curve.',
  },
  {
    id: 'derivative-formula-recall',
    learnerPrompt: 'I understand tangent slope; remind me of the derivative formula.',
    expectedActivityKind: null,
    requiredContinuationTerms: ['limit'],
    rationale: 'Formula recall needs the formula directly; a parameter plot would add irrelevant interaction.',
  },
  {
    id: 'vector-geometry',
    learnerPrompt: 'Show me geometrically how two vectors add head to tail.',
    expectedActivityKind: 'scene_2d',
    requiredContinuationTerms: ['vector'],
    rationale: 'A spatial construction belongs in a coordinate scene.',
  },
  {
    id: 'historical-chronology',
    learnerPrompt: 'Make an interactive timeline of the discoveries that led from classical genetics to DNA sequencing.',
    expectedActivityKind: 'timeline',
    requiredContinuationTerms: ['chronology'],
    rationale: 'Events and eras whose order is the explanatory structure require a dedicated timeline.',
  },
  {
    id: 'formula-derivation',
    learnerPrompt: 'Walk me through each algebraic transformation in the quadratic formula derivation.',
    expectedActivityKind: 'formula_steps',
    requiredContinuationTerms: ['derivation'],
    rationale: 'A symbolic derivation needs explicit expressions and named transition rules, not a generic plot.',
  },
  {
    id: 'reference-material-map',
    learnerPrompt: 'I attached a six-chapter study guide. Map its sections, key concepts, and prerequisites before we go deep.',
    expectedActivityKind: 'study_map',
    requiredContinuationTerms: ['section'],
    rationale: 'A multi-section source needs an anchored navigable overview before concept-level teaching.',
  },
  {
    id: 'requested-flashcards',
    learnerPrompt: 'Turn the material we just covered into active-recall flashcards with hints.',
    expectedActivityKind: 'recall_deck',
    requiredContinuationTerms: ['recall'],
    rationale: 'An explicit active-recall request should produce a native revealable deck.',
  },
  {
    id: 'adaptive-response',
    learnerPrompt: 'I predicted a negative slope would descend instead of rise. Continue from that.',
    expectedActivityKind: null,
    requiredContinuationTerms: ['descend', 'negative'],
    responseEvidence: 'descend',
    rationale: 'The continuation must name and use the learner evidence, not repeat the lesson.',
  },
  {
    id: 'transfer-stop',
    learnerPrompt: 'I can now explain slope and correctly applied it to y = -3x. Wrap up this segment.',
    expectedActivityKind: null,
    requiredContinuationTerms: ['complete'],
    shouldEndSegment: true,
    rationale: 'Successful transfer is the stop condition; another mechanical question is a failure.',
  },
] as const

function normalized(value: string): string {
  return value.trim().toLocaleLowerCase('en-US')
}

export function gradeTeachingCandidate(
  scenario: TeachingEvalCase,
  candidate: TeachingEvalCandidate,
): TeachingEvalVerdict {
  const text = normalized(candidate.continuation)
  const checks: TeachingEvalVerdict['checks'] = []
  checks.push({
    name: 'activity-selection',
    passed: candidate.activityKind === scenario.expectedActivityKind,
    detail: `expected ${scenario.expectedActivityKind ?? 'no activity'}, received ${candidate.activityKind ?? 'no activity'}`,
  })
  for (const term of scenario.requiredContinuationTerms) {
    checks.push({
      name: `continuation:${term}`,
      passed: text.includes(normalized(term)),
      detail: `continuation must contain evidence term ${JSON.stringify(term)}`,
    })
  }
  if (scenario.responseEvidence !== undefined) {
    checks.push({
      name: 'uses-learner-response',
      passed: text.includes(normalized(scenario.responseEvidence)),
      detail: `continuation must explicitly use learner evidence ${JSON.stringify(scenario.responseEvidence)}`,
    })
  }
  if (scenario.shouldEndSegment === true) {
    checks.push({
      name: 'ends-mastered-segment',
      passed: candidate.endedSegment && !text.includes('?'),
      detail: 'a mastered segment must be marked ended and must not append another question',
    })
  }
  return { caseId: scenario.id, passed: checks.every(check => check.passed), checks }
}

export function gradeTeachingSuite(candidates: readonly TeachingEvalCandidate[]): TeachingEvalVerdict[] {
  const byId = new Map(candidates.map(candidate => [candidate.caseId, candidate]))
  return TEACHING_EVAL_CASES.map(scenario => {
    const candidate = byId.get(scenario.id)
    if (candidate !== undefined) return gradeTeachingCandidate(scenario, candidate)
    return {
      caseId: scenario.id,
      passed: false,
      checks: [{ name: 'candidate-present', passed: false, detail: 'no candidate transcript was supplied' }],
    }
  })
}

/** Reference outputs exercise the rubric itself; they are not presented as model-quality evidence. */
export const OFFLINE_REFERENCE_CANDIDATES: readonly TeachingEvalCandidate[] = [
  { caseId: 'simple-fact-no-visual', activityKind: null, continuation: 'Paris.', endedSegment: true },
  { caseId: 'parameter-relationship', activityKind: 'plot', continuation: 'Explore how slope changes direction.', endedSegment: false },
  { caseId: 'process-state', activityKind: 'node_link', continuation: 'Follow each queue transition while keeping the ordinary conversation available.', endedSegment: false },
  { caseId: 'structure-difference', activityKind: 'relation', continuation: 'Compare how array and linked-list nodes connect.', endedSegment: false },
  { caseId: 'fully-connected-network', activityKind: 'node_link', continuation: 'Every connection between one layer and the next is visible.', endedSegment: false },
  { caseId: 'derivative-formula-recall', activityKind: null, continuation: 'Use the limit definition directly: f\'(x) = lim h→0 [f(x+h)−f(x)]/h.', endedSegment: false },
  { caseId: 'vector-geometry', activityKind: 'scene_2d', continuation: 'The second vector starts at the head of the first.', endedSegment: false },
  { caseId: 'historical-chronology', activityKind: 'timeline', continuation: 'Read the chronology from each discovery to the next.', endedSegment: false },
  { caseId: 'formula-derivation', activityKind: 'formula_steps', continuation: 'Each derivation step names the algebraic rule that justifies the next expression.', endedSegment: false },
  { caseId: 'reference-material-map', activityKind: 'study_map', continuation: 'Start from the source section map, then follow the prerequisite path into one concept.', endedSegment: false },
  { caseId: 'requested-flashcards', activityKind: 'recall_deck', continuation: 'Try active recall before revealing each answer.', endedSegment: false },
  { caseId: 'adaptive-response', activityKind: null, continuation: 'Exactly: a negative slope descends; now transfer that observation to y = -3x.', endedSegment: false },
  { caseId: 'transfer-stop', activityKind: null, continuation: 'This learning segment is complete: you explained the relationship and transferred it to a fresh equation.', endedSegment: true },
] as const

export function offlineContinuation(explanation: string): string {
  const evidence = explanation.trim()
  return evidence === ''
    ? 'No explanation was submitted, so continue with the Markdown fallback.'
    : `You observed: “${evidence}” That evidence should determine the next example instead of repeating the explanation.`
}

export type TeachingTrajectoryDecision =
  | 'direct'
  | 'calibrate'
  | 'scaffold'
  | 'accelerate'
  | 'foothold'
  | 'transfer'
  | 'complete'
  | 'fallback'

export interface TeachingTrajectoryTurn {
  learner: string
  assistant: string
  decision: TeachingTrajectoryDecision
  focusQuestionCount: number
  hasScaffold: boolean
  supportLevel: 0 | 1 | 2 | 3 | 4 | 5
  progressSignal: 'progressing' | 'impatient' | 'stuck' | 'shutdown-risk' | 'unknown'
  mastery: 'unseen' | 'emerging' | 'transfer'
  usedLearnerEvidence?: readonly string[]
  /** Exact source locations cited by this turn; empty means it made no source-backed claim. */
  sourceAnchors?: readonly string[]
  hintFingerprint?: string
  genericPraise?: boolean
  leakedAnswer?: boolean
  richTools?: readonly ('learning_visual' | 'learning_checkpoint')[]
  endedSegment?: boolean
  toolFailure?: {
    tool: 'learning_visual' | 'learning_checkpoint'
    fallbackMarkdown: string
    composerAvailable: boolean
    extraGateCreated: boolean
  }
  checkpointResult?: {
    status: 'submitted' | 'skipped' | 'cancelled'
    composerRestored: boolean
    extraGateCreated: boolean
    leakedAnswer: boolean
    leakedFutureContent: boolean
  }
}

export interface TeachingTrajectoryCase {
  id: string
  rationale: string
  expectedDecisionAt?: Readonly<Record<number, TeachingTrajectoryDecision>>
  evidenceEligibleTurns?: readonly number[]
  supportEscalation?: { fromTurn: number; toTurn: number; minimumIncrease: number }
  stopTurn?: number
  toolFailureTurn?: number
  checkpointStatusAt?: { turn: number; status: 'submitted' | 'skipped' | 'cancelled' }
  /** Exact observed anchors required whenever the scripted turn makes a source claim. */
  sourceAnchorsAt?: Readonly<Record<number, readonly string[]>>
  /** Turns where a decorative visual would be a routing error. */
  visualForbiddenTurns?: readonly number[]
}

export interface TeachingTrajectoryCandidate {
  caseId: string
  turns: readonly TeachingTrajectoryTurn[]
}

/**
 * Scripted V4.1 branches. These are deterministic transcript fixtures, not a
 * claim that a model has met the rubric until captured model runs are graded.
 */
export const TEACHING_TRAJECTORY_CASES: readonly TeachingTrajectoryCase[] = [
  {
    id: 'broad-topic-direct-explanation',
    rationale: 'A broad topic explicitly requesting a direct overview should start with useful exposition, not compulsory diagnosis.',
    expectedDecisionAt: { 0: 'direct' },
    visualForbiddenTurns: [0],
  },
  {
    id: 'urgent-first-turn-direct',
    rationale: 'A concrete deadline blocker stated at the outset should receive a useful direct answer.',
    expectedDecisionAt: { 0: 'direct' },
    visualForbiddenTurns: [0],
  },
  {
    id: 'mid-lesson-impatience-accelerates',
    rationale: 'A learner who has usable pieces but becomes impatient should get a narrower, faster scaffold.',
    expectedDecisionAt: { 2: 'accelerate' },
    evidenceEligibleTurns: [1, 2, 3],
  },
  {
    id: 'repeated-error-becomes-stuck',
    rationale: 'Repeated evidence of the same error must escalate to a concrete foothold instead of another paraphrased hint.',
    expectedDecisionAt: { 3: 'foothold' },
    evidenceEligibleTurns: [1, 2, 3, 4],
    supportEscalation: { fromTurn: 0, toTurn: 3, minimumIncrease: 3 },
  },
  {
    id: 'question-always-has-minimal-scaffold',
    rationale: 'Every learner-facing question must carry a small useful foothold.',
    expectedDecisionAt: { 0: 'scaffold', 2: 'scaffold', 4: 'transfer' },
    evidenceEligibleTurns: [1, 2, 3, 4],
  },
  {
    id: 'transfer-ends-segment',
    rationale: 'Independent transfer is the completion condition; no mechanical question follows it.',
    expectedDecisionAt: { 4: 'complete' },
    evidenceEligibleTurns: [1, 2, 3, 4],
    stopTurn: 4,
  },
  {
    id: 'source-study-preserves-anchors',
    rationale: 'Learning from supplied material must follow real source structure instead of flattening it into an unsourced summary.',
    expectedDecisionAt: { 0: 'direct', 2: 'scaffold', 4: 'transfer' },
    evidenceEligibleTurns: [2, 3, 4],
    sourceAnchorsAt: {
      0: ['Chapter 1: pp. 1-8', 'Chapter 2: pp. 9-17'],
      2: ['Chapter 2: p. 12'],
      4: ['Chapter 2: p. 16'],
    },
  },
  {
    id: 'visual-failure-falls-back-to-conversation',
    rationale: 'A failed optional visual leaves self-sufficient Markdown and the ordinary conversation usable.',
    expectedDecisionAt: { 1: 'fallback' },
    toolFailureTurn: 1,
  },
  {
    id: 'checkpoint-skip-is-strategy-evidence',
    rationale: 'Skipping a checkpoint is evidence for a smaller next move, not evidence of mastery.',
    expectedDecisionAt: { 2: 'foothold' },
    checkpointStatusAt: { turn: 1, status: 'skipped' },
  },
  {
    id: 'checkpoint-cancel-restores-conversation',
    rationale: 'Cancelling an optional checkpoint ends that gate and restores ordinary conversation without leaking content.',
    expectedDecisionAt: { 2: 'direct' },
    checkpointStatusAt: { turn: 1, status: 'cancelled' },
  },
  {
    id: 'checkpoint-failure-falls-back-to-conversation',
    rationale: 'A failed checkpoint leaves a safe Markdown prompt and does not create another gate.',
    expectedDecisionAt: { 1: 'fallback' },
    toolFailureTurn: 1,
  },
] as const

function trajectoryCheck(
  checks: TeachingEvalVerdict['checks'],
  name: string,
  passed: boolean,
  detail: string,
): void {
  checks.push({ name, passed, detail })
}

/** Deterministic structural grading for one 6–12 turn V4.1 teaching trace. */
export function gradeTeachingTrajectory(
  scenario: TeachingTrajectoryCase,
  candidate: TeachingTrajectoryCandidate,
): TeachingEvalVerdict {
  const checks: TeachingEvalVerdict['checks'] = []
  const turns = candidate.turns
  trajectoryCheck(checks, 'trajectory-length', turns.length >= 6 && turns.length <= 12, 'a scripted trajectory contains 6–12 learner/assistant exchanges')
  trajectoryCheck(checks, 'one-focused-question-per-turn', turns.every(turn => turn.focusQuestionCount <= 1), 'every assistant turn has at most one focused question')
  trajectoryCheck(checks, 'question-has-scaffold', turns.every(turn => turn.focusQuestionCount === 0 || turn.hasScaffold), 'every focused question includes a useful scaffold')
  trajectoryCheck(checks, 'one-rich-tool-per-turn', turns.every(turn => (turn.richTools?.length ?? 0) <= 1), 'a turn contains at most one rich learning tool')
  trajectoryCheck(checks, 'no-generic-praise', turns.every(turn => turn.genericPraise !== true), 'feedback is specific rather than generic praise')
  trajectoryCheck(checks, 'no-configured-leakage', turns.every(turn => turn.leakedAnswer !== true), 'no answer or future-step marker is exposed early')
  trajectoryCheck(
    checks,
    'checkpoint-results-restore-safe-conversation',
    turns.every(turn => turn.checkpointResult === undefined
      || (turn.checkpointResult.composerRestored
        && !turn.checkpointResult.extraGateCreated
        && !turn.checkpointResult.leakedAnswer
        && !turn.checkpointResult.leakedFutureContent)),
    'checkpoint completion restores ordinary conversation with no extra gate or leaked answer/future content',
  )

  const fingerprints = turns.flatMap(turn => turn.hintFingerprint === undefined ? [] : [turn.hintFingerprint])
  trajectoryCheck(checks, 'no-repeated-hint', new Set(fingerprints).size === fingerprints.length, 'support changes instead of repeating the same hint')

  for (const [turnText, decision] of Object.entries(scenario.expectedDecisionAt ?? {})) {
    const turn = Number(turnText)
    trajectoryCheck(
      checks,
      `decision-at-${turn}`,
      turns[turn]?.decision === decision,
      `turn ${turn} must choose ${decision}`,
    )
  }

  for (const turn of scenario.evidenceEligibleTurns ?? []) {
    trajectoryCheck(
      checks,
      `uses-learner-evidence-at-${turn}`,
      (turns[turn]?.usedLearnerEvidence?.length ?? 0) > 0,
      `turn ${turn} must name observable learner evidence`,
    )
  }

  if (scenario.supportEscalation !== undefined) {
    const { fromTurn, toTurn, minimumIncrease } = scenario.supportEscalation
    const from = turns[fromTurn]?.supportLevel
    const to = turns[toTurn]?.supportLevel
    trajectoryCheck(
      checks,
      'support-escalates-when-stuck',
      from !== undefined && to !== undefined && to - from >= minimumIncrease,
      `support must increase by at least ${minimumIncrease} from turn ${fromTurn} to ${toTurn}`,
    )
  }

  if (scenario.stopTurn !== undefined) {
    const stop = turns[scenario.stopTurn]
    const later = turns.slice(scenario.stopTurn + 1)
    trajectoryCheck(
      checks,
      'stops-after-transfer',
      stop?.mastery === 'transfer'
        && stop.endedSegment === true
        && stop.focusQuestionCount === 0
        && later.every(turn => turn.focusQuestionCount === 0),
      'the transfer turn ends the segment and no later mechanical question appears',
    )
  }

  if (scenario.toolFailureTurn !== undefined) {
    const failure = turns[scenario.toolFailureTurn]?.toolFailure
    trajectoryCheck(
      checks,
      'tool-failure-has-self-sufficient-fallback',
      failure !== undefined
        && failure.fallbackMarkdown.trim().length > 0
        && failure.composerAvailable
        && !failure.extraGateCreated,
      'a failed rich tool preserves Markdown, creates no extra gate, and ordinary conversation can continue',
    )
    trajectoryCheck(
      checks,
      'conversation-continues-after-tool-failure',
      turns.length > scenario.toolFailureTurn + 1,
      'at least one later learner/assistant exchange follows the failed tool',
    )
  }

  if (scenario.checkpointStatusAt !== undefined) {
    const { turn, status } = scenario.checkpointStatusAt
    const result = turns[turn]?.checkpointResult
    trajectoryCheck(
      checks,
      `checkpoint-${status}-at-${turn}`,
      result?.status === status,
      `turn ${turn} must record a ${status} checkpoint result`,
    )
    trajectoryCheck(
      checks,
      'conversation-continues-after-checkpoint',
      turns.length > turn + 1,
      'a later ordinary learner/assistant exchange follows the checkpoint result',
    )
  }

  for (const [turnText, required] of Object.entries(scenario.sourceAnchorsAt ?? {})) {
    const turn = Number(turnText)
    const actual = turns[turn]?.sourceAnchors ?? []
    trajectoryCheck(
      checks,
      `source-anchors-at-${turn}`,
      actual.length === required.length && required.every(anchor => actual.includes(anchor)),
      `turn ${turn} must cite only the observed source anchors: ${required.join(', ')}`,
    )
  }

  for (const turn of scenario.visualForbiddenTurns ?? []) {
    trajectoryCheck(
      checks,
      `no-decorative-visual-at-${turn}`,
      !(turns[turn]?.richTools ?? []).includes('learning_visual'),
      `turn ${turn} must remain direct prose without a decorative visual`,
    )
  }

  return { caseId: scenario.id, passed: checks.every(check => check.passed), checks }
}

export function gradeTeachingTrajectorySuite(
  candidates: readonly TeachingTrajectoryCandidate[],
): TeachingEvalVerdict[] {
  const byId = new Map(candidates.map(candidate => [candidate.caseId, candidate]))
  return TEACHING_TRAJECTORY_CASES.map(scenario => {
    const candidate = byId.get(scenario.id)
    return candidate === undefined
      ? { caseId: scenario.id, passed: false, checks: [{ name: 'candidate-present', passed: false, detail: 'no trajectory was supplied' }] }
      : gradeTeachingTrajectory(scenario, candidate)
  })
}

function turn(
  learner: string,
  assistant: string,
  decision: TeachingTrajectoryDecision,
  changes: Partial<TeachingTrajectoryTurn> = {},
): TeachingTrajectoryTurn {
  return {
    learner,
    assistant,
    decision,
    focusQuestionCount: 0,
    hasScaffold: false,
    supportLevel: 0,
    progressSignal: 'unknown',
    mastery: 'unseen',
    ...changes,
  }
}

/** Reference traces exercise the deterministic grader and CLI without credentials. */
export const OFFLINE_TRAJECTORY_CANDIDATES: readonly TeachingTrajectoryCandidate[] = [
  {
    caseId: 'broad-topic-direct-explanation',
    turns: [
      turn('Give me a direct overview of the French Revolution; do not quiz me first.', 'The short arc is fiscal crisis, political rupture in 1789, radicalization, republic and Terror, then reaction and Napoleon. I will keep causes, phases, and consequences distinct.', 'direct'),
      turn('Start with the fiscal crisis.', 'War debt and an unequal tax system left the monarchy unable to close its deficit through the existing political machinery.', 'direct'),
      turn('Why did that become a political crisis?', 'New taxation required consent the crown could not obtain, so convening the Estates-General opened the question of who represented the nation.', 'direct'),
      turn('Then the Third Estate changed the rules?', 'Yes. Declaring itself the National Assembly shifted legitimacy from hereditary estates toward national representation.', 'scaffold', { usedLearnerEvidence: ['Third Estate changed the rules'] }),
      turn('So financial failure exposed a legitimacy problem.', 'That is the causal connection: the deficit forced a representative confrontation the old regime could not contain.', 'transfer', { mastery: 'emerging', usedLearnerEvidence: ['financial failure exposed a legitimacy problem'] }),
      turn('That overview is enough.', 'The essential arc is fiscal constraint becoming a struggle over sovereignty, then escalating through war and internal conflict.', 'complete', { mastery: 'transfer', endedSegment: true }),
    ],
  },
  {
    caseId: 'urgent-first-turn-direct',
    turns: [
      turn('Production is down and my deadline is in 20 minutes. How do I roll back this migration?', 'Use the recorded down migration, verify the target revision, then run the rollback command.', 'direct'),
      turn('I found revision 42.', 'Check that 42 is the last known-good revision before applying it.', 'direct'),
      turn('It is.', 'Run the rollback and watch the migration log for a clean completion.', 'direct'),
      turn('The rollback completed.', 'Verify the health endpoint and one representative write.', 'direct'),
      turn('Both pass.', 'The immediate blocker is resolved; record the failed revision for follow-up.', 'complete', { mastery: 'transfer' }),
      turn('Done.', 'You now have a verified recovery path.', 'complete', { mastery: 'transfer', endedSegment: true }),
    ],
  },
  {
    caseId: 'mid-lesson-impatience-accelerates',
    turns: [
      turn('Teach me why a negative slope descends.', 'Slope is vertical change divided by horizontal change. What sign does the vertical change have when x increases?', 'scaffold', { focusQuestionCount: 1, hasScaffold: true, supportLevel: 1, hintFingerprint: 'rise-over-run-sign' }),
      turn('The vertical change is negative.', 'You identified the negative numerator. On a one-unit move right, where must the point move?', 'scaffold', { focusQuestionCount: 1, hasScaffold: true, supportLevel: 1, progressSignal: 'progressing', mastery: 'emerging', usedLearnerEvidence: ['negative vertical change'], hintFingerprint: 'one-unit-right' }),
      turn('Just tell me; I am running out of patience.', 'Your sign reasoning is already in place: a positive x move pairs with a negative y move. Apply that once to the point (0, 0): where is the next point?', 'accelerate', { focusQuestionCount: 1, hasScaffold: true, supportLevel: 2, progressSignal: 'impatient', mastery: 'emerging', usedLearnerEvidence: ['negative numerator'], hintFingerprint: 'origin-application' }),
      turn('(1, -1).', 'Exactly that coordinate uses your negative vertical change; the line therefore descends as x grows.', 'transfer', { progressSignal: 'progressing', mastery: 'transfer', usedLearnerEvidence: ['(1, -1)'] }),
      turn('So -3 means down three for each one right.', 'That is the mechanism, stated in your own terms.', 'complete', { mastery: 'transfer' }),
      turn('Got it.', 'This segment is complete.', 'complete', { mastery: 'transfer', endedSegment: true }),
    ],
  },
  {
    caseId: 'repeated-error-becomes-stuck',
    turns: [
      turn('I think array lookup is O(n) because the array has n items.', 'An index names an offset from the start. Which part of that address calculation depends on scanning earlier items?', 'scaffold', { focusQuestionCount: 1, hasScaffold: true, supportLevel: 1, hintFingerprint: 'offset-address' }),
      turn('It still has to scan all n items.', 'Your model still includes a scan. Contrast index lookup with searching for an unknown value: which one already supplies the position?', 'scaffold', { focusQuestionCount: 1, hasScaffold: true, supportLevel: 2, progressSignal: 'progressing', usedLearnerEvidence: ['still has to scan'], hintFingerprint: 'index-vs-search' }),
      turn('Both scan because there are n slots.', 'You are applying the same scan rule to both cases. A memory address is base + index × item-size; point to the term that requires visiting another slot.', 'scaffold', { focusQuestionCount: 1, hasScaffold: true, supportLevel: 3, progressSignal: 'stuck', usedLearnerEvidence: ['both scan'], hintFingerprint: 'address-formula' }),
      turn('I have no idea.', 'Concrete foothold: for index 7 the machine computes base + 7 × item-size directly; it does not read slots 0–6. What changes when the value is unknown instead?', 'foothold', { focusQuestionCount: 1, hasScaffold: true, supportLevel: 4, progressSignal: 'stuck', usedLearnerEvidence: ['no idea', 'repeated scan model'], hintFingerprint: 'concrete-index-seven' }),
      turn('Then it must compare values until it finds the unknown one.', 'That contrast repairs the model: known index computes one address; unknown value requires search.', 'transfer', { supportLevel: 4, progressSignal: 'progressing', mastery: 'transfer', usedLearnerEvidence: ['compare values'] }),
      turn('So lookup by index is O(1), search can be O(n).', 'You distinguished the two operations and transferred the rule.', 'complete', { supportLevel: 4, mastery: 'transfer', endedSegment: true }),
    ],
  },
  {
    caseId: 'question-always-has-minimal-scaffold',
    turns: [
      turn('Why does a queue use FIFO?', 'A queue preserves arrival order. If A arrives before B, which item must leave first?', 'scaffold', { focusQuestionCount: 1, hasScaffold: true, supportLevel: 1, hintFingerprint: 'arrival-order' }),
      turn('A.', 'Your answer preserves the first arrival; that is the first “F” in FIFO.', 'scaffold', { mastery: 'emerging', usedLearnerEvidence: ['A'] }),
      turn('What if C arrives next?', 'The current order is B then C. Which item is now at the front?', 'scaffold', { focusQuestionCount: 1, hasScaffold: true, supportLevel: 1, mastery: 'emerging', usedLearnerEvidence: ['C arrives next'], hintFingerprint: 'current-order' }),
      turn('B.', 'Right: adding C at the back did not change B at the front.', 'scaffold', { mastery: 'emerging', usedLearnerEvidence: ['B'] }),
      turn('Give me a fresh case.', 'For arrivals X, Y, Z followed by one removal, the remaining order starts with Y. What would the full remaining order be?', 'transfer', { focusQuestionCount: 1, hasScaffold: true, supportLevel: 1, mastery: 'emerging', usedLearnerEvidence: ['fresh case'], hintFingerprint: 'fresh-xyz' }),
      turn('Y, Z.', 'That transfer shows you can apply FIFO to a new sequence.', 'complete', { mastery: 'transfer', usedLearnerEvidence: ['Y, Z'], endedSegment: true }),
    ],
  },
  {
    caseId: 'transfer-ends-segment',
    turns: [
      turn('Help me distinguish stack and queue removal.', 'A stack removes the most recent item; a queue removes the earliest. Which one matches undo history?', 'scaffold', { focusQuestionCount: 1, hasScaffold: true, supportLevel: 1, hintFingerprint: 'undo-recency' }),
      turn('A stack, because undo starts with the latest action.', 'Your reason uses recency, the defining stack rule.', 'scaffold', { mastery: 'emerging', usedLearnerEvidence: ['latest action'] }),
      turn('And a printer queue removes the oldest job.', 'That applies the queue rule to a distinct case.', 'transfer', { mastery: 'emerging', usedLearnerEvidence: ['oldest job'] }),
      turn('Fresh case: browser back is a stack; ticketing is a queue.', 'You correctly distinguished both structures across two new cases.', 'transfer', { mastery: 'emerging', usedLearnerEvidence: ['browser back', 'ticketing'] }),
      turn('So I can choose based on newest-first versus oldest-first.', 'This segment is complete: you explained the distinction and transferred it.', 'complete', { mastery: 'transfer', usedLearnerEvidence: ['newest-first versus oldest-first'], endedSegment: true }),
      turn('Thanks.', 'You have the essential decision rule.', 'complete', { mastery: 'transfer', endedSegment: true }),
    ],
  },
  {
    caseId: 'source-study-preserves-anchors',
    turns: [
      turn('Help me learn this two-chapter handout, not just summarize it.', 'The supplied structure is Chapter 1: pp. 1-8 for definitions and Chapter 2: pp. 9-17 for applications. We will use that dependency instead of flattening both chapters.', 'direct', { sourceAnchors: ['Chapter 1: pp. 1-8', 'Chapter 2: pp. 9-17'] }),
      turn('I know the definition from chapter 1.', 'Then we can treat the Chapter 1 definition as prior knowledge and focus on how Chapter 2 applies it.', 'direct', { usedLearnerEvidence: ['know the definition'] }),
      turn('The worked example on page 12 loses me.', 'Chapter 2: p. 12 holds the input fixed while changing the boundary condition. Which term in the displayed equation is therefore allowed to change?', 'scaffold', { focusQuestionCount: 1, hasScaffold: true, supportLevel: 2, mastery: 'emerging', usedLearnerEvidence: ['page 12 loses me'], sourceAnchors: ['Chapter 2: p. 12'], hintFingerprint: 'p12-held-input' }),
      turn('Only the boundary term changes.', 'Your answer uses the exact contrast in the page-12 example; the input term stays invariant.', 'scaffold', { mastery: 'emerging', usedLearnerEvidence: ['boundary term changes'] }),
      turn('On page 16 the same rule should make the output rise.', 'Chapter 2: p. 16 is a fresh application, and your prediction correctly carries the invariant into it.', 'transfer', { mastery: 'transfer', usedLearnerEvidence: ['page 16 output rise'], sourceAnchors: ['Chapter 2: p. 16'] }),
      turn('I can now follow the two examples.', 'You used Chapter 1 as the prerequisite and transferred the rule between two anchored Chapter 2 cases; this segment is complete.', 'complete', { mastery: 'transfer', endedSegment: true }),
    ],
  },
  {
    caseId: 'visual-failure-falls-back-to-conversation',
    turns: [
      turn('Show how slope changes a line.', 'First, slope is the change in y for one unit of x.', 'scaffold'),
      turn('Can I see it?', 'The visual failed, so use this text equivalent: positive slope rises left-to-right; negative slope falls; zero slope stays horizontal.', 'fallback', {
        richTools: ['learning_visual'],
        toolFailure: { tool: 'learning_visual', fallbackMarkdown: 'Positive rises; negative falls; zero stays horizontal.', composerAvailable: true, extraGateCreated: false },
      }),
      turn('Then -2 falls two units per step right?', 'Yes; your “falls two” wording correctly combines sign and magnitude.', 'scaffold', { mastery: 'emerging', usedLearnerEvidence: ['falls two'] }),
      turn('At x=1 from the origin it reaches y=-2.', 'That prediction follows directly from the slope.', 'transfer', { mastery: 'emerging', usedLearnerEvidence: ['y=-2'] }),
      turn('At x=3 it reaches y=-6.', 'You transferred the same relationship to a new input.', 'complete', { mastery: 'transfer' }),
      turn('Done.', 'The visual was optional; your numerical predictions demonstrate the concept.', 'complete', { mastery: 'transfer', endedSegment: true }),
    ],
  },
  {
    caseId: 'checkpoint-skip-is-strategy-evidence',
    turns: [
      turn('Help me understand why binary search halves the range.', 'Start from eight sorted items: one midpoint comparison can rule out one whole side.', 'scaffold'),
      turn('I would rather skip the prediction.', 'The optional prediction was skipped.', 'scaffold', {
        richTools: ['learning_checkpoint'],
        checkpointResult: { status: 'skipped', composerRestored: true, extraGateCreated: false, leakedAnswer: false, leakedFutureContent: false },
      }),
      turn('Can we use a smaller example?', 'Concrete foothold: with four items, compare the middle item first; only two candidates can remain. Which side remains if the target is smaller?', 'foothold', { focusQuestionCount: 1, hasScaffold: true, supportLevel: 3, hintFingerprint: 'four-item-midpoint' }),
      turn('The left side.', 'That answer uses the ordering rule to discard the right half.', 'scaffold', { mastery: 'emerging', usedLearnerEvidence: ['left side'] }),
      turn('With eight, it becomes four after one comparison.', 'You transferred the same halving rule to the larger range.', 'transfer', { mastery: 'transfer', usedLearnerEvidence: ['eight becomes four'] }),
      turn('Understood.', 'The segment is complete.', 'complete', { mastery: 'transfer', endedSegment: true }),
    ],
  },
  {
    caseId: 'checkpoint-cancel-restores-conversation',
    turns: [
      turn('Teach me the cache hit/miss distinction.', 'A hit finds the requested value in the cache; a miss must fetch it elsewhere.', 'scaffold'),
      turn('Cancel the prediction card.', 'The optional checkpoint was cancelled.', 'scaffold', {
        richTools: ['learning_checkpoint'],
        checkpointResult: { status: 'cancelled', composerRestored: true, extraGateCreated: false, leakedAnswer: false, leakedFutureContent: false },
      }),
      turn('Just explain the example in normal chat.', 'Directly: if key A is cached, requesting A is a hit; requesting absent key B is a miss and triggers the backing store.', 'direct'),
      turn('Then a second request for B may hit after it is cached.', 'Yes; your second request changes outcome because the first miss populated B.', 'transfer', { mastery: 'emerging', usedLearnerEvidence: ['second request for B'] }),
      turn('A hit avoids the backing-store fetch.', 'That states the operational distinction.', 'complete', { mastery: 'transfer' }),
      turn('Done.', 'Ordinary conversation remained sufficient.', 'complete', { mastery: 'transfer', endedSegment: true }),
    ],
  },
  {
    caseId: 'checkpoint-failure-falls-back-to-conversation',
    turns: [
      turn('Ask me for one prediction about the water cycle.', 'Use the phase-change rule to predict what cooling water vapor does.', 'scaffold'),
      turn('The card did not load.', 'The checkpoint failed, so answer in ordinary chat if useful: “When vapor cools, I predict …”.', 'fallback', {
        richTools: ['learning_checkpoint'],
        toolFailure: { tool: 'learning_checkpoint', fallbackMarkdown: 'When vapor cools, I predict …', composerAvailable: true, extraGateCreated: false },
      }),
      turn('I predict it condenses into droplets.', 'Your prediction applies condensation to cooling vapor.', 'scaffold', { mastery: 'emerging', usedLearnerEvidence: ['condenses into droplets'] }),
      turn('Those droplets can form clouds.', 'That connects the phase change to the visible system.', 'transfer', { mastery: 'emerging', usedLearnerEvidence: ['form clouds'] }),
      turn('Then precipitation returns water to the surface.', 'You completed the mechanism across a new step.', 'complete', { mastery: 'transfer' }),
      turn('Finished.', 'The failed tool did not block the learning path.', 'complete', { mastery: 'transfer', endedSegment: true }),
    ],
  },
] as const

export interface TeachingTrajectoryMetrics {
  assistantTurns: number
  withinQuestionLimitTurns: number
  focusedQuestionTurns: number
  scaffoldedQuestionTurns: number
  evidenceEligibleTurns: number
  evidenceUsingTurns: number
  feedbackTurns: number
  genericPraiseTurns: number
  repeatedHintTurns: number
  richToolTurns: number
  overRichToolTurns: number
  evidenceLeakTurns: number
  stuckTransitions: number
  supportEscalatedTransitions: number
  masteryTransitions: number
  stoppedAfterMasteryTransitions: number
  sourceClaimTurns: number
  sourceAnchoredTurns: number
  noVisualExpectedTurns: number
  unnecessaryVisualTurns: number
}

/** Numerators and denominators stay explicit so percentages cannot hide missing opportunities. */
export function summarizeTeachingTrajectories(
  candidates: readonly TeachingTrajectoryCandidate[],
  scenarios: readonly TeachingTrajectoryCase[] = TEACHING_TRAJECTORY_CASES,
): TeachingTrajectoryMetrics {
  const scenarioById = new Map(scenarios.map(scenario => [scenario.id, scenario]))
  const metrics: TeachingTrajectoryMetrics = {
    assistantTurns: 0,
    withinQuestionLimitTurns: 0,
    focusedQuestionTurns: 0,
    scaffoldedQuestionTurns: 0,
    evidenceEligibleTurns: 0,
    evidenceUsingTurns: 0,
    feedbackTurns: 0,
    genericPraiseTurns: 0,
    repeatedHintTurns: 0,
    richToolTurns: 0,
    overRichToolTurns: 0,
    evidenceLeakTurns: 0,
    stuckTransitions: 0,
    supportEscalatedTransitions: 0,
    masteryTransitions: 0,
    stoppedAfterMasteryTransitions: 0,
    sourceClaimTurns: 0,
    sourceAnchoredTurns: 0,
    noVisualExpectedTurns: 0,
    unnecessaryVisualTurns: 0,
  }
  for (const candidate of candidates) {
    const scenario = scenarioById.get(candidate.caseId)
    const seenHints = new Set<string>()
    for (const [index, current] of candidate.turns.entries()) {
      metrics.assistantTurns += 1
      if (current.focusQuestionCount <= 1) metrics.withinQuestionLimitTurns += 1
      if (current.focusQuestionCount > 0) {
        metrics.focusedQuestionTurns += 1
        if (current.hasScaffold) metrics.scaffoldedQuestionTurns += 1
      }
      if (scenario?.evidenceEligibleTurns?.includes(index) === true) {
        metrics.evidenceEligibleTurns += 1
        if ((current.usedLearnerEvidence?.length ?? 0) > 0) metrics.evidenceUsingTurns += 1
      }
      if (current.decision !== 'calibrate') {
        metrics.feedbackTurns += 1
        if (current.genericPraise === true) metrics.genericPraiseTurns += 1
      }
      if (current.hintFingerprint !== undefined) {
        if (seenHints.has(current.hintFingerprint)) metrics.repeatedHintTurns += 1
        seenHints.add(current.hintFingerprint)
      }
      if (current.leakedAnswer === true
        || current.checkpointResult?.leakedAnswer === true
        || current.checkpointResult?.leakedFutureContent === true) metrics.evidenceLeakTurns += 1
      const richTools = current.richTools?.length ?? 0
      if (richTools > 0) metrics.richToolTurns += 1
      if (richTools > 1) metrics.overRichToolTurns += 1
      if (current.sourceAnchors !== undefined) {
        metrics.sourceClaimTurns += 1
        const required = scenario?.sourceAnchorsAt?.[index]
        if (required !== undefined
          && current.sourceAnchors.length === required.length
          && required.every(anchor => current.sourceAnchors?.includes(anchor))) {
          metrics.sourceAnchoredTurns += 1
        }
      }
      if (scenario?.visualForbiddenTurns?.includes(index) === true) {
        metrics.noVisualExpectedTurns += 1
        if ((current.richTools ?? []).includes('learning_visual')) metrics.unnecessaryVisualTurns += 1
      }
    }
    if (scenario?.supportEscalation !== undefined) {
      metrics.stuckTransitions += 1
      const { fromTurn, toTurn, minimumIncrease } = scenario.supportEscalation
      const from = candidate.turns[fromTurn]?.supportLevel
      const to = candidate.turns[toTurn]?.supportLevel
      if (from !== undefined && to !== undefined && to - from >= minimumIncrease) {
        metrics.supportEscalatedTransitions += 1
      }
    }
    if (scenario?.stopTurn !== undefined) {
      metrics.masteryTransitions += 1
      const stop = candidate.turns[scenario.stopTurn]
      if (stop?.mastery === 'transfer' && stop.endedSegment === true && stop.focusQuestionCount === 0) {
        metrics.stoppedAfterMasteryTransitions += 1
      }
    }
  }
  return metrics
}
