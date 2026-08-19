import { describe, expect, it } from 'vitest'
import {
  OFFLINE_TRAJECTORY_CANDIDATES,
  TEACHING_TRAJECTORY_CASES,
  gradeTeachingTrajectorySuite,
  summarizeTeachingTrajectories,
  type TeachingTrajectoryCandidate,
} from '../src/eval.ts'

function changed(
  caseId: string,
  turnIndex: number,
  patch: Partial<TeachingTrajectoryCandidate['turns'][number]>,
): TeachingTrajectoryCandidate[] {
  return OFFLINE_TRAJECTORY_CANDIDATES.map(candidate => candidate.caseId !== caseId
    ? candidate
    : {
        ...candidate,
        turns: candidate.turns.map((turn, index) => index === turnIndex ? { ...turn, ...patch } : turn),
      })
}

describe('V4.1 multi-turn grader/rubric sanity fixtures (not model-behavior evidence)', () => {
  it('covers the required counterfactual branches and grades the offline fixture traces', () => {
    expect(TEACHING_TRAJECTORY_CASES.map(item => item.id)).toEqual([
      'plan-yields-to-demonstrated-transfer',
      'unavailable-visual-continues-in-prose',
      'notation-gap-decodes-symbols',
      'task-model-gap-restates-the-question',
      'broad-topic-direct-explanation',
      'urgent-first-turn-direct',
      'mid-lesson-impatience-accelerates',
      'repeated-error-becomes-stuck',
      'question-always-has-minimal-scaffold',
      'transfer-ends-segment',
      'source-study-preserves-anchors',
      'visual-failure-falls-back-to-conversation',
      'checkpoint-skip-is-strategy-evidence',
      'checkpoint-cancel-restores-conversation',
      'checkpoint-failure-falls-back-to-conversation',
    ])
    expect(OFFLINE_TRAJECTORY_CANDIDATES.every(candidate => candidate.turns.length >= 6 && candidate.turns.length <= 12)).toBe(true)
    expect(gradeTeachingTrajectorySuite(OFFLINE_TRAJECTORY_CANDIDATES).every(verdict => verdict.passed)).toBe(true)
  })

  it('distinguishes first-turn urgency, mid-lesson impatience, and repeated-error stuckness', () => {
    const urgent = changed('urgent-first-turn-direct', 0, { decision: 'calibrate', focusQuestionCount: 1, hasScaffold: false })
    expect(gradeTeachingTrajectorySuite(urgent).find(item => item.caseId === 'urgent-first-turn-direct')?.passed).toBe(false)

    const impatient = changed('mid-lesson-impatience-accelerates', 2, { decision: 'direct', usedLearnerEvidence: [] })
    expect(gradeTeachingTrajectorySuite(impatient).find(item => item.caseId === 'mid-lesson-impatience-accelerates')?.passed).toBe(false)

    const stuck = changed('repeated-error-becomes-stuck', 3, { decision: 'scaffold', supportLevel: 2 })
    expect(gradeTeachingTrajectorySuite(stuck).find(item => item.caseId === 'repeated-error-becomes-stuck')?.passed).toBe(false)
  })

  it('rejects empty questions, repeated hints, generic praise, leakage, and post-transfer questioning', () => {
    const emptyQuestion = changed('question-always-has-minimal-scaffold', 0, { hasScaffold: false })
    expect(gradeTeachingTrajectorySuite(emptyQuestion).find(item => item.caseId === 'question-always-has-minimal-scaffold')?.passed).toBe(false)

    const repeatedHint = changed('question-always-has-minimal-scaffold', 2, { hintFingerprint: 'arrival-order' })
    expect(gradeTeachingTrajectorySuite(repeatedHint).find(item => item.caseId === 'question-always-has-minimal-scaffold')?.passed).toBe(false)

    const genericPraise = changed('question-always-has-minimal-scaffold', 1, { genericPraise: true })
    expect(gradeTeachingTrajectorySuite(genericPraise).find(item => item.caseId === 'question-always-has-minimal-scaffold')?.passed).toBe(false)

    const leaked = changed('question-always-has-minimal-scaffold', 0, { leakedAnswer: true })
    expect(gradeTeachingTrajectorySuite(leaked).find(item => item.caseId === 'question-always-has-minimal-scaffold')?.passed).toBe(false)

    const afterTransfer = changed('transfer-ends-segment', 4, { endedSegment: false, focusQuestionCount: 1, hasScaffold: true })
    expect(gradeTeachingTrajectorySuite(afterTransfer).find(item => item.caseId === 'transfer-ends-segment')?.passed).toBe(false)
  })

  it('rejects a lesson kept alive only by unfinished plan steps', () => {
    // The whole point of the case is that the route is not a completion
    // contract, so a fixture that finished the plan would prove nothing.
    const finished = changed('plan-yields-to-demonstrated-transfer', 4, { planRemaining: 0 })
    const finishedVerdict = gradeTeachingTrajectorySuite(finished)
      .find(item => item.caseId === 'plan-yields-to-demonstrated-transfer')
    expect(finishedVerdict?.passed).toBe(false)
    expect(finishedVerdict?.checks.find(check => check.name === 'transfer-outranks-an-unfinished-plan')?.passed).toBe(false)

    // Continuing to question the learner after transfer is the failure the
    // remaining steps would otherwise be used to justify.
    const keptGoing = changed('plan-yields-to-demonstrated-transfer', 5, { focusQuestionCount: 1, hasScaffold: true })
    expect(gradeTeachingTrajectorySuite(keptGoing)
      .find(item => item.caseId === 'plan-yields-to-demonstrated-transfer')?.passed).toBe(false)
  })

  it('rejects prose that points at a visual the learner never saw', () => {
    // The tool succeeded but this composition rendered nothing, so naming an
    // on-screen figure describes something that is not there.
    const phantom = changed('unavailable-visual-continues-in-prose', 0, { referencesFigure: true })
    const verdict = gradeTeachingTrajectorySuite(phantom)
      .find(item => item.caseId === 'unavailable-visual-continues-in-prose')
    expect(verdict?.passed).toBe(false)
    expect(verdict?.checks.find(check => check.name === 'no-reference-to-an-unrendered-visual')?.passed).toBe(false)

    // Referring to a figure that did render is ordinary teaching.
    const rendered = changed('unavailable-visual-continues-in-prose', 0, { visualStatus: 'ready', referencesFigure: true })
    expect(gradeTeachingTrajectorySuite(rendered)
      .find(item => item.caseId === 'unavailable-visual-continues-in-prose')?.passed).toBe(true)
  })

  it('rejects a turn that answers a different failure mode than the learner shows', () => {
    // Explaining what an average means to someone who already has the concept
    // and is only blocked by the shorthand is the classic mis-routed answer.
    const conceptualDetour = changed('notation-gap-decodes-symbols', 0, { addressedGap: 'concept' })
    const detourVerdict = gradeTeachingTrajectorySuite(conceptualDetour)
      .find(item => item.caseId === 'notation-gap-decodes-symbols')
    expect(detourVerdict?.passed).toBe(false)
    expect(detourVerdict?.checks.find(check => check.name === 'addresses-observed-gap-at-0')?.passed).toBe(false)

    // Jumping to epsilon-delta mechanics before the learner knows what the
    // exercise is asking for answers a procedure gap they do not have.
    const prematureMethod = changed('task-model-gap-restates-the-question', 0, { addressedGap: 'procedure' })
    const methodVerdict = gradeTeachingTrajectorySuite(prematureMethod)
      .find(item => item.caseId === 'task-model-gap-restates-the-question')
    expect(methodVerdict?.passed).toBe(false)
    expect(methodVerdict?.checks.find(check => check.name === 'addresses-observed-gap-at-0')?.passed).toBe(false)

    // A misread of the learner is a failure even when the answer is coherent.
    const misreadLearner = changed('notation-gap-decodes-symbols', 2, { observedGap: 'concept', addressedGap: 'concept' })
    expect(gradeTeachingTrajectorySuite(misreadLearner)
      .find(item => item.caseId === 'notation-gap-decodes-symbols')?.passed).toBe(false)
  })

  it('requires a self-sufficient fallback and ordinary conversation after tool failure', () => {
    const noFallback = changed('visual-failure-falls-back-to-conversation', 1, {
      toolFailure: {
        tool: 'learning_visual',
        fallbackMarkdown: '',
        composerAvailable: false,
        extraGateCreated: true,
      },
    })
    const verdict = gradeTeachingTrajectorySuite(noFallback)
      .find(item => item.caseId === 'visual-failure-falls-back-to-conversation')
    expect(verdict?.passed).toBe(false)
    expect(verdict?.checks.find(check => check.name === 'tool-failure-has-self-sufficient-fallback')?.passed).toBe(false)
  })

  it('rejects a fabricated source anchor even when the turn otherwise looks instructional', () => {
    const fabricated = changed('source-study-preserves-anchors', 2, {
      sourceAnchors: ['Chapter 9: p. 99'],
    })
    const verdict = gradeTeachingTrajectorySuite(fabricated)
      .find(item => item.caseId === 'source-study-preserves-anchors')
    expect(verdict?.passed).toBe(false)
    expect(verdict?.checks.find(check => check.name === 'source-anchors-at-2')?.passed).toBe(false)
  })

  it('separately rejects unsafe skipped, cancelled, and failed checkpoint recovery', () => {
    const skipped = changed('checkpoint-skip-is-strategy-evidence', 1, {
      checkpointResult: { status: 'skipped', composerRestored: false, extraGateCreated: true, leakedAnswer: true, leakedFutureContent: false },
    })
    expect(gradeTeachingTrajectorySuite(skipped).find(item => item.caseId === 'checkpoint-skip-is-strategy-evidence')?.passed).toBe(false)

    const cancelled = changed('checkpoint-cancel-restores-conversation', 1, {
      checkpointResult: { status: 'cancelled', composerRestored: false, extraGateCreated: false, leakedAnswer: false, leakedFutureContent: true },
    })
    expect(gradeTeachingTrajectorySuite(cancelled).find(item => item.caseId === 'checkpoint-cancel-restores-conversation')?.passed).toBe(false)

    const failed = changed('checkpoint-failure-falls-back-to-conversation', 1, {
      toolFailure: { tool: 'learning_checkpoint', fallbackMarkdown: '', composerAvailable: false, extraGateCreated: true },
    })
    expect(gradeTeachingTrajectorySuite(failed).find(item => item.caseId === 'checkpoint-failure-falls-back-to-conversation')?.passed).toBe(false)
  })

  it('reports explicit metric numerators and denominators', () => {
    const metrics = summarizeTeachingTrajectories(OFFLINE_TRAJECTORY_CANDIDATES)
    expect(metrics.focusedQuestionTurns).toBeGreaterThan(0)
    expect(metrics.withinQuestionLimitTurns).toBe(metrics.assistantTurns)
    expect(metrics.scaffoldedQuestionTurns).toBe(metrics.focusedQuestionTurns)
    expect(metrics.evidenceEligibleTurns).toBeGreaterThan(0)
    expect(metrics.evidenceUsingTurns).toBe(metrics.evidenceEligibleTurns)
    expect(metrics.genericPraiseTurns).toBe(0)
    expect(metrics.repeatedHintTurns).toBe(0)
    expect(metrics.overRichToolTurns).toBe(0)
    expect(metrics.evidenceLeakTurns).toBe(0)
    expect(metrics.supportEscalatedTransitions).toBe(metrics.stuckTransitions)
    expect(metrics.stoppedAfterMasteryTransitions).toBe(metrics.masteryTransitions)
    expect(metrics.sourceClaimTurns).toBeGreaterThan(0)
    expect(metrics.sourceAnchoredTurns).toBe(metrics.sourceClaimTurns)
    expect(metrics.unnecessaryVisualTurns).toBe(0)
  })
})
