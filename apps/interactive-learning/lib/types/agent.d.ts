/** Agent-plane entry mounted only by the `learning` preset. */
import type { Context } from '@deepseek-ai/cordis';
import type { Agent } from '@deepseek-ai/dsh-agent';
export declare const name = "interactive-learning-agent";
export declare const inject: string[];
export declare class LearningGateError extends Error {
    readonly code = "MULTIPLE_LEARNING_GATES_IN_STEP";
    constructor();
}
/** Claim the current durable model step, if one exists, for one Learning gate. */
export declare function assertLearningGateAvailable(agent: Agent | undefined): void;
export declare function apply(ctx: Context): void;
//# sourceMappingURL=agent.d.ts.map