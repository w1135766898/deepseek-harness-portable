/**
 * Small pre-routing classifier for the Learning preset.
 *
 * It answers one narrow question: is the user asking to build understanding,
 * or asking for a different kind of help? Teaching route selection happens
 * after this boundary. The classifier is deliberately evidence-based; it does
 * not infer a learner level from topic vocabulary.
 */
export declare const LEARN_INTENT: "learn";
export type LearnIntent = typeof LEARN_INTENT | 'not-learn';
export type LearnTrigger = 'explicit-learning' | 'definition' | 'bare-concept' | 'confusion-repair' | 'learning-path' | 'conceptual-question' | 'explicit-overview' | 'current-topic' | 'resource-creation' | 'coding-task' | 'translation-task' | 'news-request' | 'resource-recommendation' | 'opinion-judgment' | 'unknown';
export interface LearnIntentDecision {
    intent: LearnIntent;
    trigger: LearnTrigger;
    /** A short stable explanation for tests and route diagnostics, not a model profile. */
    reason: string;
}
/** Classify the first-turn request before choosing a teaching route. */
export declare function classifyLearnIntent(input: string): LearnIntentDecision;
export declare function isLearnIntent(input: string): boolean;
/** Compact standing text; detailed diagnosis and moves stay in references. */
export declare const LEARNING_INTENT_POLICY: string;
//# sourceMappingURL=learn-intent.d.ts.map