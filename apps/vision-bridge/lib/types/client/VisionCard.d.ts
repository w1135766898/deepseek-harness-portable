/**
 * Visual settings card registered into `settings.plugin.item`.
 * @module @dsh-portable/vision-bridge/client/VisionCard
 */
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
import type { VisionCardFace } from './vision-card-controller.ts';
export type VisionCardProps = PropsRuntime<'settings.plugin.item'> & PropsLocale<'vision-bridge'> & InjectFace<VisionCardFace>;
export declare function VisionCard(props: VisionCardProps): import("react").JSX.Element | null;
//# sourceMappingURL=VisionCard.d.ts.map