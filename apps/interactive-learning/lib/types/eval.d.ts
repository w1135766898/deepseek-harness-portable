import type { LearningActivityKind } from './protocol.ts';
export interface TeachingEvalCase {
    id: string;
    learnerPrompt: string;
    expectedActivityKind: LearningActivityKind | null;
    requiredContinuationTerms: string[];
    responseEvidence?: string;
    shouldEndSegment?: boolean;
    rationale: string;
}
export interface TeachingEvalCandidate {
    caseId: string;
    activityKind: LearningActivityKind | null;
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
export type LearningTranscriptEventType = 'assistant-text' | 'learning-question-call' | 'learning-question-result' | 'learning-reveal-call' | 'animation-finished' | 'continue-enabled' | 'continue-committed' | 'learning-reveal-result';
export interface LearningTranscriptEvent {
    at: number;
    type: LearningTranscriptEventType;
    /** Stable model-step identity. Required for Learning tool calls. */
    stepId?: string;
    payload?: unknown;
    text?: string;
}
export interface LearningTranscriptCandidate {
    events: readonly LearningTranscriptEvent[];
    /** Exact strings which must not appear before the first question result. */
    answerMarkers?: readonly string[];
    /** Exact strings which must not appear before the preceding reveal resolves. */
    futureMarkers?: readonly string[];
}
/**
 * Deterministic temporal/non-leakage gate for captured model and UI events.
 * This intentionally checks a few protocol invariants rather than judging prose quality.
 */
export declare function gradeLearningTranscript(candidate: LearningTranscriptCandidate): TeachingEvalVerdict;
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
//# sourceMappingURL=eval.d.ts.map