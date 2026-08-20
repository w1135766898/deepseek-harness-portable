/**
 * Small, deterministic routing hints for the Learning preset.
 *
 * The model still owns the final wording and teaching judgment. This helper
 * exists so the high-priority ambiguity rule is testable and reusable by
 * canaries without copying prompt prose into another subsystem.
 */
export type LearningRoute = 'calibrate' | 'teach-minimum' | 'overview' | 'direct';
export interface LearningRouteDecision {
    route: LearningRoute;
    reason: 'short-learning-request' | 'explicit-beginner' | 'explicit-overview' | 'current-or-contested' | 'specific-goal' | 'direct';
}
/**
 * Classify only the first-turn shape. It deliberately does not infer a
 * learner level from jargon or topic name.
 */
export declare function routeLearningRequest(text: string): LearningRouteDecision;
//# sourceMappingURL=teaching-route.d.ts.map