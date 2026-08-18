import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import AgentRegistry, { type Agent } from '@deepseek-ai/dsh-agent'
import { CallId, createUserMessage } from '@deepseek-ai/dsh-llm'
import SessionStore, {
  KNOWN_SESSION_EVENT_TYPES,
  SessionId,
  type SessionEvent,
} from '@deepseek-ai/dsh-session'
import JsonlSessionPersistence from '@deepseek-ai/dsh-session-persistence-jsonl'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import UserQuestionService from '@deepseek-ai/dsh-user-questions'
import { afterEach, describe, expect, it } from 'vitest'

const temporaryRoots: string[] = []

afterEach(async () => {
  for (const root of temporaryRoots.splice(0)) {
    await rm(root, { recursive: true, force: true })
  }
})
async function mountPersistence(root: string): Promise<Context> {
  const ctx = new Context()
  await ctx.plugin(SessionStore)
  await ctx.plugin(JsonlSessionPersistence, {
    root,
    compression: 'none',
    writeBatchMaxDelayMs: 1,
  })
  return ctx
}

async function mountLearningServices(ctx: Context): Promise<void> {
  const [{ LearningActivityBroker }, learningAgent] = await Promise.all([
    import('../src/broker.ts'),
    import('../src/agent.ts'),
  ])
  await ctx.plugin(AgentRegistry)
  await ctx.plugin(UserQuestionService)
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(LearningActivityBroker)
  await ctx.plugin(learningAgent)
}

function agentFor(session: { id: Agent['id'] } & Agent['session']): Agent {
  return { id: session.id, session } as unknown as Agent
}

describe('Learning state durable load order', () => {
  it('imports bootstrap before persistence, writes JSONL, reboots, loads, folds, and injects the next prompt', async () => {
    const known = KNOWN_SESSION_EVENT_TYPES as Set<string>
    known.delete('learning/state')
    expect(known.has('learning/state')).toBe(false)

    // Importing bootstrap is itself the pre-loader registration operation.
    const bootstrap = await import('../src/bootstrap.ts?initial-persistence-order')
    expect(known.has('learning/state')).toBe(true)
    bootstrap.registerInteractiveLearningSessionCompatibility()
    bootstrap.registerInteractiveLearningSessionCompatibility()
    expect(known.has('learning/state')).toBe(true)

    const root = await mkdtemp(join(tmpdir(), 'dsh-learning-state-jsonl-'))
    temporaryRoots.push(root)
    const sessionId = SessionId('learning-state-durable')

    const first = await mountPersistence(root)
    await mountLearningServices(first)
    const originalSession = first.sessions.create(sessionId)
    const originalAgent = agentFor(originalSession)
    const disposeOriginalAgent = first.agents.register(originalAgent)
    originalSession.append('user/message', createUserMessage({
      content: [{ type: 'text', text: 'I want to understand queue invariants.' }],
      source: { kind: 'user' },
    }), { surfaceOp: 'append' })

    const update = await first.tools.execute({
      signal: new AbortController().signal,
      callId: CallId('durable-state-update'),
      name: 'learning_state_update',
      arguments: {
        action: 'update',
        event: {
          type: 'goal_observed',
          goal: 'Understand queue invariants',
          observation: {
            id: 'durable-goal-observation',
            source: 'learner-message',
            summary: 'The learner explicitly wants to understand queue invariants.',
          },
        },
      },
      agent: originalAgent,
    })
    expect(update).toMatchObject({ isError: false, value: { status: 'updated', revision: 1 } })
    expect(originalSession.events.at(-1)).toMatchObject({
      type: 'learning/state',
      data: { snapshot: { goal: 'Understand queue invariants', revision: 1 } },
    })
    await first.sessions.flush(originalSession)
    disposeOriginalAgent()
    await first.fiber.dispose()

    // Simulate the next process's empty downstream registration, then exercise
    // the runtime's real pre-boot preset import boundary before any load.
    known.delete('learning/state')
    expect(known.has('learning/state')).toBe(false)
    await import('../src/preset.ts?durable-reboot-preboot')
    expect(known.has('learning/state')).toBe(true)

    const second = await mountPersistence(root)
    const loaded = await second.sessionPersistence.load(sessionId)
    expect(loaded.events.some(event => event.type === 'learning/state')).toBe(true)
    const restoredSession = second.sessions.prepare(sessionId, {
      seed: structuredClone(loaded.events) as SessionEvent[],
      meta: structuredClone(loaded.meta),
      seedSource: 'persistence',
    })
    const detachSession = second.sessions.enter(restoredSession)
    second.sessions.announce(restoredSession)

    await mountLearningServices(second)
    const restoredAgent = agentFor(restoredSession)
    const disposeRestoredAgent = second.agents.register(restoredAgent)
    expect(second.learningActivities.learnerState(restoredAgent)).toMatchObject({
      revision: 1,
      goal: 'Understand queue invariants',
    })
    const assembly = await second.systemPrompt.assemble({ scope: restoredAgent, agent: restoredAgent })
    expect(assembly.contexts.find(item => item.name === 'learning:learner-state')?.text)
      .toContain('goal: "Understand queue invariants"')

    disposeRestoredAgent()
    detachSession()
    await second.fiber.dispose()
  }, 30_000)
})
