export type LearningUiLifecycleName = 'learning.call.stream_started' | 'learning.call.args_completed' | 'learning.ui.presented' | 'learning.animation.started' | 'learning.animation.finished' | 'learning.continue.accepted';
export interface LearningUiLifecycleEvent {
    name: LearningUiLifecycleName;
    at: number;
    phase?: 'question' | 'reveal';
    seq?: number;
    storageKey?: string;
    callId?: string;
}
type Listener = (event: LearningUiLifecycleEvent) => void;
export declare function subscribeLearningUiLifecycle(listener: Listener): () => void;
export declare function emitLearningUiLifecycle(event: Omit<LearningUiLifecycleEvent, 'at'>): void;
export declare function emitLearningCallLifecycle(name: 'learning.call.stream_started' | 'learning.call.args_completed', projection: Pick<LearningUiLifecycleEvent, 'callId' | 'phase' | 'seq'>): void;
export {};
//# sourceMappingURL=lifecycle.d.ts.map