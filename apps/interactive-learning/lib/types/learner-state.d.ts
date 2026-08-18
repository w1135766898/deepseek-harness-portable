/**
 * Session-local, tentative teaching state for the Learning preset.
 *
 * A caller owns the in-memory store and feeds it explicit observable events.
 * Strict identity-free snapshots may be written to the owning session log for
 * resume/fork replay, but are never a cross-session learner profile.
 */
import { type SessionEvent } from '@deepseek-ai/dsh-session';
export declare const LEARNER_STATE_PROTOCOL: "dsh-learning/learner-state@1";
export declare const LEARNER_STATE_EVENT_PROTOCOL: "dsh-learning/state-event@1";
export declare const LEARNER_STATE_SESSION_EVENT_TYPE: "learning/state";
export declare const MAX_LEARNER_EVIDENCE = 8;
export declare const MAX_APPLIED_EVENT_IDS = 64;
export declare const MAX_PRIOR_KNOWLEDGE = 8;
export declare const MAX_MISCONCEPTIONS = 6;
export declare const MAX_SOURCE_ANCHORS = 8;
export declare const DEFAULT_TRANSCRIPT_TOKEN_BUDGET = 300;
export type LearnerRequestKind = 'concept' | 'procedure' | 'topic' | 'source-study' | 'practice' | 'resource' | 'direct-task' | 'unknown';
export type LearnerLevel = 'novice' | 'intermediate' | 'advanced' | 'unknown';
export type LearnerGap = 'concept' | 'procedure' | 'notation' | 'task-model' | 'prerequisite' | 'unknown';
export type LearnerReadiness = 'can-reason' | 'needs-foothold' | 'unknown';
export type LearnerProgressSignal = 'progressing' | 'impatient' | 'stuck' | 'shutdown-risk' | 'unknown';
/** Captures both urgency and when the learner expressed it. */
export type LearnerUrgency = 'none' | 'initial-blocker' | 'later-pressure' | 'unknown';
export type LearnerSupportLevel = 0 | 1 | 2 | 3 | 4 | 5;
export type LearnerAssessmentContext = 'self-study' | 'graded' | 'unknown';
export type LearnerMastery = 'unseen' | 'emerging' | 'transfer';
export type LearnerTeachingMove = 'none' | 'visual' | 'checkpoint';
export type LearnerEvidenceKind = 'attempt' | 'prediction' | 'explanation' | 'contrast' | 'transfer' | 'error';
export type LearnerEvidenceConfidence = 'low' | 'medium' | 'high';
export type LearnerEvidenceCorrectness = 'correct' | 'incorrect' | 'unknown';
export type LearnerEvidenceIndependence = 'independent' | 'guided' | 'unknown';
export type LearnerTransferContext = 'same' | 'fresh' | 'unknown';
type NonTransferEvidenceKind = Exclude<LearnerEvidenceKind, 'transfer'>;
export type ObservableEventSource = 'learner-message' | 'learner-action' | 'assistant-output' | 'source-material' | 'user-correction';
export interface ObservableLearnerEvent {
    /** Stable within one session; a replay with the same id is ignored. */
    id: string;
    source: ObservableEventSource;
    /** The concrete utterance/action that justifies emitting this event. */
    summary: string;
    turn?: number;
}
interface LearnerEvidenceBase {
    summary: string;
    confidence: LearnerEvidenceConfidence;
    correctness: LearnerEvidenceCorrectness;
    independence: LearnerEvidenceIndependence;
    source: Extract<ObservableEventSource, 'learner-message' | 'learner-action' | 'user-correction'>;
    turn?: number;
}
export type LearnerEvidence = (LearnerEvidenceBase & {
    kind: 'transfer';
    transferContext: LearnerTransferContext;
}) | (LearnerEvidenceBase & {
    kind: NonTransferEvidenceKind;
    transferContext?: never;
});
interface LearnerEvidenceInputBase {
    summary: string;
    confidence?: LearnerEvidenceConfidence;
    /** Unknown until feedback/evaluation has established correctness. */
    correctness?: LearnerEvidenceCorrectness;
    /** Unknown for a bare checkpoint submission; guided work cannot prove mastery. */
    independence?: LearnerEvidenceIndependence;
}
export type LearnerEvidenceInput = (LearnerEvidenceInputBase & {
    kind: 'transfer';
    transferContext: LearnerTransferContext;
}) | (LearnerEvidenceInputBase & {
    kind: NonTransferEvidenceKind;
    transferContext?: never;
});
export interface LearnerState {
    protocol: typeof LEARNER_STATE_PROTOCOL;
    /** Every pedagogical field below is a revisable hypothesis. */
    tentative: true;
    sessionId: string;
    revision: number;
    goal: string | null;
    requestKind: LearnerRequestKind;
    level: LearnerLevel;
    priorKnowledge: readonly string[];
    gap: LearnerGap;
    misconceptions: readonly string[];
    readiness: LearnerReadiness;
    progressSignal: LearnerProgressSignal;
    urgency: LearnerUrgency;
    supportLevel: LearnerSupportLevel;
    assessmentContext: LearnerAssessmentContext;
    mastery: LearnerMastery;
    evidence: readonly LearnerEvidence[];
    lastMove: LearnerTeachingMove;
    sourceAnchors: readonly string[];
    /** Bounded replay/conflict fence. Never included in the model transcript. */
    appliedEventIds: readonly AppliedLearnerStateEvent[];
}
export interface AppliedLearnerStateEvent {
    id: string;
    /** SHA-256 of the canonical JSON event payload. */
    fingerprint: string;
}
export type LearnerStateEvent = {
    type: 'goal_observed';
    goal: string;
    observation: ObservableLearnerEvent;
} | {
    type: 'request_kind_observed';
    requestKind: LearnerRequestKind;
    observation: ObservableLearnerEvent;
} | {
    type: 'prior_knowledge_observed';
    level?: LearnerLevel;
    items?: readonly string[];
    mode?: 'append' | 'replace';
    observation: ObservableLearnerEvent;
} | {
    type: 'gap_observed';
    gap: LearnerGap;
    misconceptions?: readonly string[];
    misconceptionMode?: 'append' | 'replace';
    observation: ObservableLearnerEvent;
} | {
    type: 'readiness_observed';
    readiness: LearnerReadiness;
    observation: ObservableLearnerEvent;
} | {
    type: 'progress_observed';
    progressSignal: LearnerProgressSignal;
    observation: ObservableLearnerEvent;
} | {
    type: 'urgency_observed';
    urgency: LearnerUrgency;
    observation: ObservableLearnerEvent;
} | {
    type: 'assessment_context_observed';
    assessmentContext: LearnerAssessmentContext;
    observation: ObservableLearnerEvent;
} | {
    type: 'learner_evidence_observed';
    evidence: LearnerEvidenceInput;
    observation: ObservableLearnerEvent;
} | {
    type: 'assistant_move_observed';
    move: LearnerTeachingMove;
    observation: ObservableLearnerEvent;
} | {
    type: 'source_anchors_observed';
    anchors: readonly string[];
    mode?: 'append' | 'replace';
    observation: ObservableLearnerEvent;
} | {
    type: 'state_corrected';
    correction: LearnerStateCorrection;
    observation: ObservableLearnerEvent & {
        source: 'user-correction';
    };
};
/** Only pedagogical fields are correctable; lifecycle identity is not. */
export interface LearnerStateCorrection {
    goal?: string | null;
    requestKind?: LearnerRequestKind;
    level?: LearnerLevel;
    priorKnowledge?: readonly string[];
    gap?: LearnerGap;
    misconceptions?: readonly string[];
    readiness?: LearnerReadiness;
    progressSignal?: LearnerProgressSignal;
    urgency?: LearnerUrgency;
    supportLevel?: LearnerSupportLevel;
    assessmentContext?: LearnerAssessmentContext;
    mastery?: LearnerMastery;
    evidence?: readonly LearnerEvidenceInput[];
    lastMove?: LearnerTeachingMove;
    sourceAnchors?: readonly string[];
}
export type LearnerStateSnapshotReason = 'update' | 'correction' | 'reset';
/** Persisted payload deliberately omits lifecycle identity. */
export type LearnerStateSnapshot = Omit<LearnerState, 'sessionId'>;
/**
 * Log-only event payload. `snapshot` is complete so resume is a latest-valid-
 * snapshot fold rather than a replay of model inferences.
 */
export interface LearnerStateSnapshotEvent {
    protocol: typeof LEARNER_STATE_EVENT_PROTOCOL;
    reason: LearnerStateSnapshotReason;
    snapshot: LearnerStateSnapshot;
}
declare module '@deepseek-ai/dsh-session/types' {
    interface SessionEventMap {
        /** Full, log-only learner-state snapshot; never projected into model history. */
        'learning/state': LearnerStateSnapshotEvent;
    }
}
/**
 * Registers the required (non-ignorable) log event with persistence readers.
 * Startup owns calling this function; it is idempotent and does not append.
 */
export declare function registerLearningSessionEventType(): void;
export declare function createInitialLearnerState(sessionId: string): LearnerState;
export declare function reduceLearnerState(state: LearnerState, event: LearnerStateEvent): LearnerState;
/**
 * Clears pedagogical hypotheses without forgetting replay ids. Keeping those
 * ids prevents an async event from before Reset from restoring stale state.
 */
export declare function resetLearnerState(state: LearnerState): LearnerState;
/**
 * Strictly parses a full learner-state snapshot and binds it to the current
 * session supplied by the caller. Persisted data never owns lifecycle identity.
 * Unknown fields (including personality/style profiles) are rejected.
 */
export declare function parseLearnerStateSnapshot(value: unknown, expectedSessionId: string): LearnerState;
/** Stable, lossless JSON encoding for a full snapshot with identity omitted. */
export declare function serializeLearnerStateSnapshot(state: LearnerState): string;
/** Hydrates a persisted identity-free snapshot into exactly the current session. */
export declare function hydrateLearnerStateSnapshot(value: unknown, sessionId: string): LearnerState;
export declare function createLearnerStateSnapshotEvent(state: LearnerState, reason: LearnerStateSnapshotReason): LearnerStateSnapshotEvent;
export declare function parseLearnerStateSnapshotEvent(value: unknown, expectedSessionId: string): LearnerStateSnapshotEvent;
/** Losslessly folds the latest valid full snapshot for exactly one session. */
export declare function foldLearnerStateSession(sessionId: string, events: readonly SessionEvent[]): LearnerState;
/** A conservative tokenizer-free estimate suitable for enforcing a prompt budget. */
export declare function estimateLearnerStateTokens(text: string): number;
/**
 * Renders model-facing V4.1 state without lifecycle ids or raw event metadata.
 * Optional evidence is admitted by priority until the 100-300 token budget is
 * full; the XML-like envelope always remains closed and injection-safe.
 */
export declare function renderLearnerStateTranscript(state: LearnerState, options?: {
    maxTokens?: number;
}): string;
export interface LearnerStateSessionStore {
    /** Idempotent for a refresh/re-attachment to an already-open session. */
    beginSession(sessionId: string): LearnerState;
    getSession(sessionId: string): LearnerState | undefined;
    dispatch(sessionId: string, event: LearnerStateEvent): LearnerState;
    /** CAS write for async work; rejects an event computed before Reset/update. */
    compareAndDispatch(sessionId: string, expectedRevision: number, event: LearnerStateEvent): LearnerState;
    correctSession(sessionId: string, correction: LearnerStateCorrection, observation: ObservableLearnerEvent & {
        source: 'user-correction';
    }): LearnerState;
    resetSession(sessionId: string): LearnerState;
    /** CAS Reset for callers that must not clear a concurrently updated state. */
    compareAndReset(sessionId: string, expectedRevision: number): LearnerState;
    endSession(sessionId: string): boolean;
    clear(): void;
    sessionIds(): readonly string[];
}
/** Creates an in-memory-only store. There is intentionally no module singleton. */
export declare function createLearnerStateSessionStore(): LearnerStateSessionStore;
export {};
//# sourceMappingURL=learner-state.d.ts.map