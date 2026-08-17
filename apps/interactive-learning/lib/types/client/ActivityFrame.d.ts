import type { ReactNode } from 'react';
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots';
import type { LearningActivityV1 } from '../protocol.ts';
export declare function ActivityFrame({ activity, busy, error, children, onSkip, onCancel, t, }: {
    activity: LearningActivityV1;
    busy: boolean;
    error: string | null;
    children: ReactNode;
    onSkip(): void;
    onCancel(): void;
    t: TranslateNS<'interactive-learning'>;
}): import("react").JSX.Element;
//# sourceMappingURL=ActivityFrame.d.ts.map