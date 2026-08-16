/**
 * Client-side plugin entry for @dsh-portable/vision-bridge.
 * Mounts VisionCard into the `settings.plugin.item` slot.
 * @module @dsh-portable/vision-bridge/client
 */
import { zh, en } from "./locales.js";
import { VisionCard } from "./VisionCard.js";
import { VisionCardController } from "./vision-card-controller.js";
export const name = 'vision-bridge-client';
export const inject = ['slots', 'locale', 'connection', 'remote', 'settingsScope'];
export function apply(ctx) {
    // 1) Register i18n dictionary
    ctx.effect(() => ctx.locale.register('vision-bridge', { zh, en }), 'vision-bridge: dictionaries');
    // 2) Bind settings scope for 'vision' namespace
    const controller = new VisionCardController(ctx.settingsScope.bind({ namespace: 'vision' }));
    // 3) Register card into official settings.plugin.item slot
    ctx.slots.inject('settings.plugin.item', () => ctx.slots.register({
        name: 'settings.plugin.item',
        id: 'vision',
        order: 35,
        locale: 'vision-bridge',
        inject: () => controller.inject(),
    }, VisionCard));
}
//# sourceMappingURL=index.js.map