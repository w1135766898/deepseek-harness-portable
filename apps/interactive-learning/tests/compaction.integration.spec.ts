import { Context } from '@deepseek-ai/cordis'
import AgentRegistry, { type Agent } from '@deepseek-ai/dsh-agent'
import { CallId, createUserMessage } from '@deepseek-ai/dsh-llm'
import SessionStore, { SessionId, type SessionEvent } from '@deepseek-ai/dsh-session'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import UserQuestionService from '@deepseek-ai/dsh-user-questions'
import { CompactionId, compactCheckpointSource } from '@deepseek-ai/dsh-compaction'
import { describe, expect, it } from 'vitest'
import '../src/bootstrap.ts'
import {
  LEARNER_STATE_SESSION_EVENT_TYPE,
  foldLearnerStateSession,
  renderLearnerStateTranscript,
  serializeLearnerStateSnapshot,
} from '../src/learner-state.ts'

async function mountLearningServices(): Promise<Context> {
  const ctx = new Context()
  await ctx.plugin(SessionStore)
  await ctx.plugin(AgentRegistry)
  await ctx.plugin(UserQuestionService)
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(SystemPrompt)
  const [{ LearningActivityBroker }, learningAgent] = await Promise.all([
    import('../src/broker.ts'),
    import('../src/agent.ts'),
  ])
  await ctx.plugin(LearningActivityBroker)
  await ctx.plugin(learningAgent)
  return ctx
}

function agentFor(session: { id: Agent['id'] } & Agent['session']): Agent {
  return { id: session.id, session } as unknown as Agent
}

const OBSERVATIONS = [
  {
    type: 'goal_observed',
    goal: 'Understand why gradients vanish',
    observation: {
      id: 'compaction-goal',
      source: 'learner-message',
      summary: 'The learner stated the goal in their own words.',
    },
  },
  {
    type: 'gap_observed',
    gap: 'notation',
    misconceptions: ['reads the product rule as a sum'],
    observation: {
      id: 'compaction-gap',
      source: 'learner-message',
      summary: 'The learner misread the derivative product as a sum.',
    },
  },
  {
    type: 'progress_observed',
    progressSignal: 'progressing',
    observation: {
      id: 'compaction-progress',
      source: 'learner-message',
      summary: 'The learner corrected the reading unaided.',
    },
  },
] as const

/**
 * Compaction replaces a span of the message surface with one checkpoint user
 * message. Learner state does not live on that surface: it is folded from
 * `learning/state` session events. This pins that separation, so a future
 * compaction backend cannot quietly take the session's pedagogical memory with
 * it when it summarizes the conversation.
 */
describe('learner state survives message-surface compaction', () => {
  it('folds identically after the whole surface is replaced by a checkpoint', async () => {
    const ctx = await mountLearningServices()
    const sessionId = SessionId('learning-state-compaction')
    const session = ctx.sessions.create(sessionId)
    const agent = agentFor(session)
    const disposeAgent = ctx.agents.register(agent)

    // A realistic surface: ordinary turns interleaved with state observations.
    for (const [index, event] of OBSERVATIONS.entries()) {
      session.append('user/message', createUserMessage({
        content: [{ type: 'text', text: `Learner turn ${String(index)}` }],
        source: { kind: 'user' },
      }), { surfaceOp: 'append' })

      const update = await ctx.tools.execute({
        signal: new AbortController().signal,
        callId: CallId(`compaction-update-${String(index)}`),
        name: 'learning_state_update',
        arguments: { action: 'update', event },
        agent,
      })
      expect(update.isError).toBe(false)
    }

    const before = ctx.learningActivities.learnerState(agent)
    expect(before.revision).toBe(OBSERVATIONS.length)
    expect(before.goal).toBe('Understand why gradients vanish')
    expect(before.gap).toBe('notation')

    const events = structuredClone(session.events) as SessionEvent[]
    const stateEvents = events.filter(event => event.type === LEARNER_STATE_SESSION_EVENT_TYPE)
    expect(stateEvents).toHaveLength(OBSERVATIONS.length)
    expect(events.length).toBeGreaterThan(stateEvents.length)

    // Exactly what a compaction backend produces: every surface message in the
    // span collapses into one replacement carrying checkpoint provenance.
    const checkpoint = {
      ...events[0],
      seq: events[0]?.seq,
      type: 'user/message',
      data: createUserMessage({
        content: [{ type: 'text', text: 'Summary of the conversation so far.' }],
        source: compactCheckpointSource(CompactionId('compaction-transaction')),
      }),
    } as unknown as SessionEvent
    const compacted = [checkpoint, ...stateEvents]

    const after = foldLearnerStateSession(String(sessionId), compacted)
    expect(serializeLearnerStateSnapshot(after)).toBe(serializeLearnerStateSnapshot(before))
    expect(renderLearnerStateTranscript(after, { maxTokens: 300 }))
      .toBe(renderLearnerStateTranscript(before, { maxTokens: 300 }))

    // Retaining only the newest snapshot is also sufficient: the fold is a
    // last-writer read, not a replay of every intermediate revision.
    const newestOnly = foldLearnerStateSession(String(sessionId), [checkpoint, stateEvents.at(-1) as SessionEvent])
    expect(serializeLearnerStateSnapshot(newestOnly)).toBe(serializeLearnerStateSnapshot(before))

    disposeAgent()
    await ctx.fiber.dispose()
  }, 30_000)

  it('names the one thing compaction must not drop', async () => {
    const ctx = await mountLearningServices()
    const sessionId = SessionId('learning-state-compaction-loss')
    const session = ctx.sessions.create(sessionId)
    const agent = agentFor(session)
    const disposeAgent = ctx.agents.register(agent)

    await ctx.tools.execute({
      signal: new AbortController().signal,
      callId: CallId('compaction-loss-update'),
      name: 'learning_state_update',
      arguments: { action: 'update', event: OBSERVATIONS[0] },
      agent,
    })
    const before = ctx.learningActivities.learnerState(agent)
    expect(before.revision).toBe(1)

    // The dependency is precise: surface events are irrelevant to the fold, and
    // `learning/state` events are the whole of it. A backend that discarded them
    // would silently reset the lesson's memory rather than fail loudly.
    const events = structuredClone(session.events) as SessionEvent[]
    const withoutState = events.filter(event => event.type !== LEARNER_STATE_SESSION_EVENT_TYPE)
    const lost = foldLearnerStateSession(String(sessionId), withoutState)
    expect(lost.revision).toBe(0)
    expect(lost.goal).toBeNull()

    disposeAgent()
    await ctx.fiber.dispose()
  }, 30_000)
})
