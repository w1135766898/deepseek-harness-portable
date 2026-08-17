import { LearningComposer, selectLearningActivity } from "./LearningComposer.js";
import { LearningToolView } from "./LearningToolView.js";
import { en, zh } from "./locales.js";
export { ActivityRendererRegistry, activityRendererRegistry } from "./ActivityRenderer.js";
const NS = 'interactive-learning';
export const name = 'interactive-learning-client';
export const inject = ['slots', 'locale'];
export function apply(ctx) {
    ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'interactive-learning: dictionaries');
    ctx.slots.inject('conversation.composer', () => ctx.slots.register({
        name: 'conversation.composer',
        select: selectLearningActivity,
        priority: -100,
        locale: NS,
    }, LearningComposer));
    ctx.slots.inject('tool.call.toolview', () => ctx.slots.register({
        name: 'tool.call.toolview',
        key: 'learning_activity',
        locale: NS,
    }, LearningToolView));
}
//# sourceMappingURL=index.js.map