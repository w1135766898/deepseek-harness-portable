import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots';
import type { LearningActivityV2, LearningJson } from '../protocol.ts';
export interface RevealCompletion {
    completed: true;
    reducedMotion?: boolean;
}
export interface RoundActivityProps {
    activity: LearningActivityV2;
    completed?: boolean;
    initialAnswer?: LearningJson;
    storageKey?: string;
    t: TranslateNS<'interactive-learning'>;
    onSubmitAnswer?(answer: LearningJson, interactionState: LearningJson): Promise<void>;
    onContinue?(animation: RevealCompletion): Promise<void>;
    onCancel?(): Promise<void>;
}
export declare function RoundActivity({ activity, completed, initialAnswer, storageKey, t, onSubmitAnswer, onContinue, onCancel, }: RoundActivityProps): import("react").JSX.Element;
//# sourceMappingURL=RoundActivity.d.ts.map