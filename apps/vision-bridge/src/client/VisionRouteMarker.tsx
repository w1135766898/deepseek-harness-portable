/**
 * Composer-side visual-route preparation marker.
 *
 * InputBar and ui-attachment already own paste, upload, previews, and durable
 * history.  This entry only observes the public InputZone snapshot and gives
 * users an honest indication that the pending image turn will use the visual
 * route; it never replaces or mutates the normal composer.
 */

import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import { planVisionTurn } from './vision-route.ts'
import type { VisionLocaleKey } from './locales.ts'
import type { VisionCardFace } from './vision-card-controller.ts'
import css from './VisionRouteMarker.module.css'

export type VisionRouteMarkerProps =
  PropsRuntime<'conversation.composer.dock'>
  & PropsLocale<'vision-bridge'>
  & InjectFace<VisionCardFace>

export function VisionRouteMarker({ input, t, useVisionCard }: VisionRouteMarkerProps) {
  const enabled = useVisionCard(state => state.enabled)
  const plan = planVisionTurn(input.imageIds)
  if (!enabled || plan.kind === 'text') return null

  return (
    <div className={css.root} data-route={plan.kind} role="status" aria-live="polite">
      <span className={css.dot} aria-hidden="true" />
      <span>{t('visionTurnReady' satisfies VisionLocaleKey)}</span>
      <span className={css.count}>
        {t('visionTurnImages', { count: plan.imageCount } satisfies Record<string, unknown>)}
      </span>
      <span className={css.srOnly}>{t('visionTurnRestore' satisfies VisionLocaleKey)}</span>
    </div>
  )
}
