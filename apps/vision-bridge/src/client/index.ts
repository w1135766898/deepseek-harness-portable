/**
 * Client-side plugin entry for @dsh-portable/vision-bridge.
 * Mounts VisionCard into the `settings.plugin.item` slot.
 * @module @dsh-portable/vision-bridge/client
 */

import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings-plugins/client'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import { zh, en } from './locales.ts'
import { VisionCard } from './VisionCard.tsx'
import { VisionCardController, type VisionSettings } from './vision-card-controller.ts'

export const name = 'vision-bridge-client'
export const inject = ['slots', 'locale', 'settingsScope']

export function apply(ctx: ClientContext): void {
  // 1) Register i18n dictionary
  ctx.effect(
    () => ctx.locale.register('vision-bridge', { zh, en }),
    'vision-bridge: dictionaries',
  )

  // 2) Bind settings scope for 'vision' namespace
  const controller = new VisionCardController(
    ctx.settingsScope.bind<VisionSettings>({ namespace: 'vision' }),
  )

  // 3) Register card into official settings.plugin.item slot
  ctx.slots.inject('settings.plugin.item', () =>
    ctx.slots.register(
      {
        name: 'settings.plugin.item',
        id: 'vision',
        order: 35,
        locale: 'vision-bridge',
        inject: () => controller.inject(),
      },
      VisionCard,
    ),
  )
}
