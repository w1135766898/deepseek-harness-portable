import { Context, Service } from '@deepseek-ai/cordis';
import type { Agent } from '@deepseek-ai/dsh-agent';
import { type LearningActivityV1, type LearningResponseV1 } from './protocol.ts';
export declare const INTERACTIVE_LEARNING_PACKAGE = "@dsh-portable/interactive-learning";
export declare const DEFAULT_LEARNING_WAIT_TIMEOUT_MS: number;
declare module '@deepseek-ai/cordis' {
    interface Context {
        learningActivities: LearningActivityBroker;
    }
}
export interface PresentLearningActivityRequest {
    activity: LearningActivityV1;
    agent?: Agent;
    signal?: AbortSignal;
    /** Bounded wait for a compatible Client response. Primarily configurable by tests/embedders. */
    timeoutMs?: number;
}
/**
 * Host-side interaction coordinator. It owns validation and activity identity,
 * then reuses the pinned kernel's durable question wait for transport.
 */
export declare class LearningActivityBroker extends Service {
    static inject: string[];
    private readonly pendingActivities;
    constructor(ctx: Context);
    /** Diagnostics/test seam; no activity payloads or learner answers are exposed. */
    get pendingCount(): number;
    /** Whether this Web composition advertises the matching Client bundle. */
    private hasRichClient;
    present(request: PresentLearningActivityRequest): Promise<LearningResponseV1>;
}
export default LearningActivityBroker;
//# sourceMappingURL=broker.d.ts.map