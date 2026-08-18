import type { LearningActivityKind } from './protocol.ts'

export interface TeachingEvalCase {
  id: string
  learnerPrompt: string
  expectedActivityKind: LearningActivityKind | null
  requiredContinuationTerms: string[]
  responseEvidence?: string
  shouldEndSegment?: boolean
  rationale: string
}

export interface TeachingEvalCandidate {
  caseId: string
  activityKind: LearningActivityKind | null
  continuation: string
  endedSegment: boolean
}

export interface TeachingEvalVerdict {
  caseId: string
  passed: boolean
  checks: Array<{ name: string; passed: boolean; detail: string }>
}

export type LearningTranscriptEventType =
  | 'assistant-text'
  | 'learning-question-call'
  | 'learning-question-result'
  | 'learning-reveal-call'
  | 'animation-finished'
  | 'continue-enabled'
  | 'continue-committed'
  | 'learning-reveal-result'

export interface LearningTranscriptEvent {
  at: number
  type: LearningTranscriptEventType
  /** Stable model-step identity. Required for Learning tool calls. */
  stepId?: string
  payload?: unknown
  text?: string
}

export interface LearningTranscriptCandidate {
  events: readonly LearningTranscriptEvent[]
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

function firstIndex(events: readonly LearningTranscriptEvent[], type: LearningTranscriptEventType): number {
  return events.findIndex(event => event.type === type)
}

/**
 * Deterministic temporal/non-leakage gate for captured model and UI events.
 * This intentionally checks a few protocol invariants rather than judging prose quality.
 */
export function gradeLearningTranscript(candidate: LearningTranscriptCandidate): TeachingEvalVerdict {
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

  const firstQuestionResult = firstIndex(events, 'learning-question-result')
  const beforeAnswer = serialized(events.slice(0, firstQuestionResult < 0 ? events.length : firstQuestionResult))
  const leakedAnswer = candidate.answerMarkers?.find(marker => beforeAnswer.includes(normalized(marker)))
  checks.push({
    name: 'no-answer-before-question-result',
    passed: leakedAnswer === undefined,
    detail: leakedAnswer === undefined ? 'no configured answer marker leaked early' : `leaked ${JSON.stringify(leakedAnswer)}`,
  })

  const firstRevealResult = firstIndex(events, 'learning-reveal-result')
  const beforeNextRound = serialized(events.slice(0, firstRevealResult < 0 ? events.length : firstRevealResult + 1))
  const leakedFuture = candidate.futureMarkers?.find(marker => beforeNextRound.includes(normalized(marker)))
  checks.push({
    name: 'no-future-round-before-reveal-result',
    passed: leakedFuture === undefined,
    detail: leakedFuture === undefined ? 'no configured future-round marker leaked early' : `leaked ${JSON.stringify(leakedFuture)}`,
  })

  const questionResult = firstIndex(events, 'learning-question-result')
  const revealCall = firstIndex(events, 'learning-reveal-call')
  const animationFinished = firstIndex(events, 'animation-finished')
  const continueEnabled = firstIndex(events, 'continue-enabled')
  const continueCommitted = firstIndex(events, 'continue-committed')
  const revealResult = firstIndex(events, 'learning-reveal-result')
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

  return { caseId: 'learning-transcript', passed: checks.every(check => check.passed), checks }
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
    expectedActivityKind: 'parameter_explorer',
    requiredContinuationTerms: ['slope'],
    rationale: 'A bounded quantitative relationship should be manipulated locally.',
  },
  {
    id: 'process-state',
    learnerPrompt: 'Walk me through what happens to a queue when we dequeue twice.',
    expectedActivityKind: 'process_stepper',
    requiredContinuationTerms: ['queue'],
    rationale: 'A state-changing sequence should use predict-then-reveal steps.',
  },
  {
    id: 'structure-difference',
    learnerPrompt: 'Help me compare array and linked-list lookup structure.',
    expectedActivityKind: 'structure_compare',
    requiredContinuationTerms: ['array', 'linked'],
    rationale: 'Aligned structural differences should be compared side by side.',
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
  { caseId: 'parameter-relationship', activityKind: 'parameter_explorer', continuation: 'Explore how slope changes direction.', endedSegment: false },
  { caseId: 'process-state', activityKind: 'process_stepper', continuation: 'Predict each queue state before revealing it.', endedSegment: false },
  { caseId: 'structure-difference', activityKind: 'structure_compare', continuation: 'Align the array and linked-list nodes.', endedSegment: false },
  { caseId: 'adaptive-response', activityKind: null, continuation: 'Exactly: a negative slope descends; now transfer that observation to y = -3x.', endedSegment: false },
  { caseId: 'transfer-stop', activityKind: null, continuation: 'This learning segment is complete: you explained the relationship and transferred it to a fresh equation.', endedSegment: true },
] as const

export function offlineContinuation(explanation: string): string {
  const evidence = explanation.trim()
  return evidence === ''
    ? 'No explanation was submitted, so continue with the Markdown fallback.'
    : `You observed: “${evidence}” That evidence should determine the next example instead of repeating the explanation.`
}
