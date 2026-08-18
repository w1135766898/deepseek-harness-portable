/** Client entry: one composer takeover and one replayable keyed tool renderer. */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client';
export { ActivityRendererRegistry, activityRendererRegistry } from './ActivityRenderer.tsx';
export { subscribeLearningUiLifecycle, type LearningUiLifecycleEvent } from './lifecycle.ts';
export declare const LEARNING_TOOL_VIEW_KEYS: readonly ["learning_activity", "learning_question", "learning_reveal"];
export declare const name = "interactive-learning-client";
export declare const inject: string[];
export declare function apply(ctx: ClientContext): void;
//# sourceMappingURL=index.d.ts.map