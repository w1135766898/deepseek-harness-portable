/**
 * Small, deterministic routing hints for the Learning preset.
 *
 * The model still owns the final wording and teaching judgment. This helper
 * exists so the high-priority ambiguity rule is testable and reusable by
 * canaries without copying prompt prose into another subsystem.
 */
import { type LearnIntentDecision } from './learn-intent.ts';
export type LearningRoute = 'calibrate' | 'teach-minimum' | 'overview' | 'direct' | 'continue';
export interface LearningRouteDecision {
    route: LearningRoute;
    reason: 'short-learning-request' | 'explicit-learning' | 'explicit-beginner' | 'explicit-overview' | 'current-or-contested' | 'specific-goal' | 'definition' | 'bare-concept' | 'confusion-repair' | 'learning-path' | 'resource-creation' | 'active-segment' | 'direct';
    intent: LearnIntentDecision;
}
/** Session-local route memory. This is not learner state and is never a profile. */
export interface LearningRouteSession {
    active: boolean;
    decision?: LearningRouteDecision;
}
export interface LearningTurnRouteDecision extends LearningRouteDecision {
    /** True when this user message stays inside the prior active segment. */
    inherited: boolean;
    /** Whether the resulting route keeps a learning segment open. */
    segment: 'active' | 'closed';
}
/**
 * Classify only the first-turn shape. It deliberately does not infer a
 * learner level from jargon or topic name.
 */
export declare function routeLearningRequest(text: string): LearningRouteDecision;
/**
 * Resolve one claimed user message with the session's current segment in
 * mind. The first-turn classifier remains intentionally narrow; once a
 * learning segment is active, ordinary learner responses inherit its route.
 * Only an explicit non-learning task, reset, or topic switch closes it.
 */
export declare function routeLearningTurn(text: string, session?: LearningRouteSession): LearningTurnRouteDecision;
//# sourceMappingURL=teaching-route.d.ts.map