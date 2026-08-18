/** Client entry: one composer takeover and one replayable keyed tool renderer. */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-tool/client'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import { LearningComposer, selectLearningActivity } from './LearningComposer.tsx'
import { LearningToolView } from './LearningToolView.tsx'
import { en, zh } from './locales.ts'

export { ActivityRendererRegistry, activityRendererRegistry } from './ActivityRenderer.tsx'
export { subscribeLearningUiLifecycle, type LearningUiLifecycleEvent } from './lifecycle.ts'

const NS = 'interactive-learning'
export const LEARNING_TOOL_VIEW_KEYS = [
  'learning_visual',
  // Replay support for conversations created by the retired blocking protocol.
  'learning_activity',
  'learning_question',
  'learning_reveal',
] as const

export const name = 'interactive-learning-client'
export const inject = ['slots', 'locale']

export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'interactive-learning: dictionaries')

  ctx.slots.inject('conversation.composer', () => ctx.slots.register({
    name: 'conversation.composer',
    select: selectLearningActivity,
    priority: -100,
    locale: NS,
  }, LearningComposer))

  for (const key of LEARNING_TOOL_VIEW_KEYS) {
    ctx.slots.inject('tool.call.toolview', () => ctx.slots.register({
      name: 'tool.call.toolview',
      key,
      locale: NS,
    }, LearningToolView))
  }
}
