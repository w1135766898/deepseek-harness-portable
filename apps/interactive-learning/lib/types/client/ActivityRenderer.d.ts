import type { ComponentType } from 'react';
import type { LearningActivityKind } from '../protocol.ts';
import type { ActivityRendererProps } from './types.ts';
type TrustedActivityRenderer = ComponentType<ActivityRendererProps>;
/**
 * Dispatch table for trusted, package-supplied React components. Extending the
 * protocol means registering another compiled component here, never accepting
 * model-provided HTML or JavaScript.
 */
export declare class ActivityRendererRegistry {
    #private;
    register(kind: LearningActivityKind, renderer: TrustedActivityRenderer): () => void;
    resolve(kind: LearningActivityKind): TrustedActivityRenderer | undefined;
    kinds(): LearningActivityKind[];
}
export declare const activityRendererRegistry: ActivityRendererRegistry;
export declare function ActivityRenderer(props: ActivityRendererProps): import("react").JSX.Element | null;
export {};
//# sourceMappingURL=ActivityRenderer.d.ts.map