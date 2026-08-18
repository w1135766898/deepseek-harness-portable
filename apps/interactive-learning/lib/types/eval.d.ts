import type { LearningVisualV4 } from './protocol.ts';
export type TeachingVisualKind = LearningVisualV4['content']['kind'];
export interface TeachingEvalCase {
    id: string;
    learnerPrompt: string;
    expectedActivityKind: TeachingVisualKind | null;
    requiredContinuationTerms: string[];
    responseEvidence?: string;
    shouldEndSegment?: boolean;
    rationale: string;
}
export interface TeachingEvalCandidate {
    caseId: string;
    activityKind: TeachingVisualKind | null;
    continuation: string;
    endedSegment: boolean;
}
export interface TeachingEvalVerdict {
    caseId: string;
    passed: boolean;
    checks: Array<{
        name: string;
        passed: boolean;
        detail: string;
    }>;
}
/** Retired V2 Question/Reveal event vocabulary, retained only for replay audits. */
export type LegacyV2ReplayEventType = 'assistant-text' | 'learning-question-call' | 'learning-question-result' | 'learning-reveal-call' | 'animation-finished' | 'continue-enabled' | 'continue-committed' | 'learning-reveal-result';
export interface LegacyV2ReplayEvent {
    at: number;
    type: LegacyV2ReplayEventType;
    /** Stable model-step identity. Required for Learning tool calls. */
    stepId?: string;
    payload?: unknown;
    text?: string;
}
export interface LegacyV2ReplayCandidate {
    events: readonly LegacyV2ReplayEvent[];
    /** Exact strings which must not appear before the first question result. */
    answerMarkers?: readonly string[];
    /** Exact strings which must not appear before the preceding reveal resolves. */
    futureMarkers?: readonly string[];
}
/**
 * Read-only deterministic audit for conversations created by the retired V2
 * Question → Reveal → animation → Continue protocol. This is intentionally
 * excluded from the default V4.1 eval and must never be used as the current
 * teaching contract.
 */
export declare function gradeLegacyV2ReplayTranscript(candidate: LegacyV2ReplayCandidate): TeachingEvalVerdict;
/**
 * Versioned, credential-free MVP rubric. A remote or local model collector can
 * emit TeachingEvalCandidate JSON and feed it to the same deterministic gate.
 */
export declare const TEACHING_EVAL_CASES: readonly TeachingEvalCase[];
export declare function gradeTeachingCandidate(scenario: TeachingEvalCase, candidate: TeachingEvalCandidate): TeachingEvalVerdict;
export declare function gradeTeachingSuite(candidates: readonly TeachingEvalCandidate[]): TeachingEvalVerdict[];
/** Reference outputs exercise the rubric itself; they are not presented as model-quality evidence. */
export declare const OFFLINE_REFERENCE_CANDIDATES: readonly TeachingEvalCandidate[];
export declare function offlineContinuation(explanation: string): string;
export type TeachingTrajectoryDecision = 'direct' | 'calibrate' | 'scaffold' | 'accelerate' | 'foothold' | 'transfer' | 'complete' | 'fallback';
export interface TeachingTrajectoryTurn {
    learner: string;
    assistant: string;
    decision: TeachingTrajectoryDecision;
    focusQuestionCount: number;
    hasScaffold: boolean;
    supportLevel: 0 | 1 | 2 | 3 | 4 | 5;
    progressSignal: 'progressing' | 'impatient' | 'stuck' | 'shutdown-risk' | 'unknown';
    mastery: 'unseen' | 'emerging' | 'transfer';
    usedLearnerEvidence?: readonly string[];
    /** Exact source locations cited by this turn; empty means it made no source-backed claim. */
    sourceAnchors?: readonly string[];
    hintFingerprint?: string;
    genericPraise?: boolean;
    leakedAnswer?: boolean;
    richTools?: readonly ('learning_visual' | 'learning_checkpoint')[];
    endedSegment?: boolean;
    toolFailure?: {
        tool: 'learning_visual' | 'learning_checkpoint';
        fallbackMarkdown: string;
        composerAvailable: boolean;
        extraGateCreated: boolean;
    };
    checkpointResult?: {
        status: 'submitted' | 'skipped' | 'cancelled';
        composerRestored: boolean;
        extraGateCreated: boolean;
        leakedAnswer: boolean;
        leakedFutureContent: boolean;
    };
}
export interface TeachingTrajectoryCase {
    id: string;
    rationale: string;
    expectedDecisionAt?: Readonly<Record<number, TeachingTrajectoryDecision>>;
    evidenceEligibleTurns?: readonly number[];
    supportEscalation?: {
        fromTurn: number;
        toTurn: number;
        minimumIncrease: number;
    };
    stopTurn?: number;
    toolFailureTurn?: number;
    checkpointStatusAt?: {
        turn: number;
        status: 'submitted' | 'skipped' | 'cancelled';
    };
    /** Exact observed anchors required whenever the scripted turn makes a source claim. */
    sourceAnchorsAt?: Readonly<Record<number, readonly string[]>>;
    /** Turns where a decorative visual would be a routing error. */
    visualForbiddenTurns?: readonly number[];
}
export interface TeachingTrajectoryCandidate {
    caseId: string;
    turns: readonly TeachingTrajectoryTurn[];
}
/**
 * Scripted V4.1 branches. These are deterministic transcript fixtures, not a
 * claim that a model has met the rubric until captured model runs are graded.
 */
export declare const TEACHING_TRAJECTORY_CASES: readonly TeachingTrajectoryCase[];
/** Deterministic structural grading for one 6–12 turn V4.1 teaching trace. */
export declare function gradeTeachingTrajectory(scenario: TeachingTrajectoryCase, candidate: TeachingTrajectoryCandidate): TeachingEvalVerdict;
export declare function gradeTeachingTrajectorySuite(candidates: readonly TeachingTrajectoryCandidate[]): TeachingEvalVerdict[];
/** Reference traces exercise the deterministic grader and CLI without credentials. */
export declare const OFFLINE_TRAJECTORY_CANDIDATES: readonly TeachingTrajectoryCandidate[];
export interface TeachingTrajectoryMetrics {
    assistantTurns: number;
    withinQuestionLimitTurns: number;
    focusedQuestionTurns: number;
    scaffoldedQuestionTurns: number;
    evidenceEligibleTurns: number;
    evidenceUsingTurns: number;
    feedbackTurns: number;
    genericPraiseTurns: number;
    repeatedHintTurns: number;
    richToolTurns: number;
    overRichToolTurns: number;
    evidenceLeakTurns: number;
    stuckTransitions: number;
    supportEscalatedTransitions: number;
    masteryTransitions: number;
    stoppedAfterMasteryTransitions: number;
    sourceClaimTurns: number;
    sourceAnchoredTurns: number;
    noVisualExpectedTurns: number;
    unnecessaryVisualTurns: number;
}
/** Numerators and denominators stay explicit so percentages cannot hide missing opportunities. */
export declare function summarizeTeachingTrajectories(candidates: readonly TeachingTrajectoryCandidate[], scenarios?: readonly TeachingTrajectoryCase[]): TeachingTrajectoryMetrics;
//# sourceMappingURL=eval.d.ts.map