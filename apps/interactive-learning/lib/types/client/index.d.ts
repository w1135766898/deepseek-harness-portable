/** Client entry: one composer takeover and one replayable keyed tool renderer. */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client';
export { ActivityRendererRegistry, activityRendererRegistry } from './ActivityRenderer.tsx';
export { subscribeLearningUiLifecycle, type LearningUiLifecycleEvent } from './lifecycle.ts';
export declare const LEARNING_TOOL_VIEW_KEYS: readonly ["learning_visual", "learning_checkpoint", "learning_state_update", "learning_activity", "learning_question", "learning_reveal"];
/** Learner-state writes are internal bookkeeping and never produce a card. */
export declare function LearningStateUpdateToolView(): null;
export declare const name = "interactive-learning-client";
export declare const inject: string[];
export declare function apply(ctx: ClientContext): void;
//# sourceMappingURL=index.d.ts.map