import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots';
import type { ComposerChainProps } from '@deepseek-ai/dsh-client-ui-conversation/client';
import type { PendingWait } from '@deepseek-ai/dsh-client-runtime/client';
import { type LearningActivityEnvelopeV1, type LearningWaitEnvelopeV2 } from '../protocol.ts';
export type LearningQuestionWait = PendingWait<'question'>;
export declare function envelopeOf(wait: LearningQuestionWait): LearningActivityEnvelopeV1 | LearningWaitEnvelopeV2 | undefined;
/** Pure composer-chain selector: only package-owned question envelopes are claimed. */
export declare function selectLearningActivity({ interactions, session }: ComposerChainProps): LearningQuestionWait | null;
type LearningComposerProps = {
    matched: LearningQuestionWait;
} & PropsLocale<'interactive-learning'>;
export declare function LearningComposer({ matched, t }: LearningComposerProps): null;
export declare function LearningInteraction({ matched, t }: LearningComposerProps): import("react").JSX.Element | null;
export {};
//# sourceMappingURL=LearningComposer.d.ts.map