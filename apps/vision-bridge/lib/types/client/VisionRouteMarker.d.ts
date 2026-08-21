/**
 * Composer-side visual-route preparation marker.
 *
 * InputBar and ui-attachment already own paste, upload, previews, and durable
 * history.  This entry only observes the public InputZone snapshot and gives
 * users an honest indication that the pending image turn will use the visual
 * route; it never replaces or mutates the normal composer.
 */
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
import type { VisionCardFace } from './vision-card-controller.ts';
export type VisionRouteMarkerProps = PropsRuntime<'conversation.composer.dock'> & PropsLocale<'vision-bridge'> & InjectFace<VisionCardFace>;
export declare function VisionRouteMarker({ input, t, useVisionCard }: VisionRouteMarkerProps): import("react").JSX.Element | null;
//# sourceMappingURL=VisionRouteMarker.d.ts.map