import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots';
import type { ComposerChainProps } from '@deepseek-ai/dsh-client-ui-conversation/client';
import type { PendingWait } from '@deepseek-ai/dsh-client-runtime/client';
export type LearningQuestionWait = PendingWait<'question'>;
/** Pure composer-chain selector: only package-owned question envelopes are claimed. */
export declare function selectLearningActivity({ interactions, session }: ComposerChainProps): LearningQuestionWait | null;
type LearningComposerProps = {
    matched: LearningQuestionWait;
} & PropsLocale<'interactive-learning'>;
export declare function LearningComposer({ matched, t }: LearningComposerProps): import("react").JSX.Element | null;
export {};
//# sourceMappingURL=LearningComposer.d.ts.map