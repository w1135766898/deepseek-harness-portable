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