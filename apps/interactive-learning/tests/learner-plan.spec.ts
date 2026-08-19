import { describe, expect, it } from 'vitest'
import {
  MAX_PLAN_STEPS,
  createInitialLearnerState,
  createLearnerStateSnapshotEvent,
  hydrateLearnerStateSnapshot,
  reduceLearnerState,
  renderLearnerStateTranscript,
  resetLearnerState,
  serializeLearnerStateSnapshot,
  type LearnerState,
  type LearnerStateEvent,
} from '../src/learner-state.ts'

function observation(id: string, summary: string) {
  return { id, source: 'learner-message', summary } as const
}

const ROUTE: LearnerStateEvent = {
  type: 'plan_observed',
  objective: 'Derive the chain rule and apply it',
  steps: [
    { id: 'limits', label: 'Recall the limit definition' },
    { id: 'compose', label: 'Differentiate a composition by hand' },
    { id: 'apply', label: 'Apply it to a fresh function' },
  ],
  observation: observation('plan-1', 'The learner asked for a route through three dependent ideas.'),
}

function withRoute(): LearnerState {
  return reduceLearnerState(createInitialLearnerState('plan-session'), ROUTE)
}

describe('session-scoped learning plan', () => {
  it('starts with no plan, because most segments need none', () => {
    expect(createInitialLearnerState('plan-session').plan).toBeNull()
  })

  it('records a route and marks exactly one step active', () => {
    const state = withRoute()
    expect(state.plan?.objective).toBe('Derive the chain rule and apply it')
    expect(state.plan?.steps.map(step => step.status)).toEqual(['active', 'pending', 'pending'])
    expect(state.revision).toBe(1)
  })

  it('honours an explicit active step', () => {
    const state = reduceLearnerState(createInitialLearnerState('plan-session'), {
      ...ROUTE,
      activeStepId: 'compose',
      observation: observation('plan-active', 'The learner already had the limit definition.'),
    } as LearnerStateEvent)
    expect(state.plan?.steps.map(step => step.status)).toEqual(['pending', 'active', 'pending'])
  })

  it('advances a step only by evidence and moves the active marker forward', () => {
    const advanced = reduceLearnerState(withRoute(), {
      type: 'plan_step_evidenced',
      stepId: 'limits',
      observation: observation('plan-2', 'The learner restated the limit definition unaided.'),
    })
    expect(advanced.plan?.steps.map(step => step.status)).toEqual(['evidenced', 'active', 'pending'])
  })

  it('keeps evidenced progress when the route is revised', () => {
    const advanced = reduceLearnerState(withRoute(), {
      type: 'plan_step_evidenced',
      stepId: 'limits',
      observation: observation('plan-3', 'The learner restated the limit definition unaided.'),
    })
    // A revised route must not erase what the learner already demonstrated.
    const revised = reduceLearnerState(advanced, {
      type: 'plan_observed',
      objective: 'Derive the chain rule and apply it',
      steps: [
        { id: 'limits', label: 'Recall the limit definition' },
        { id: 'notation', label: 'Decode the composition notation' },
        { id: 'apply', label: 'Apply it to a fresh function' },
      ],
      observation: observation('plan-4', 'A notation gap appeared, so the route changed.'),
    })
    expect(revised.plan?.steps.map(step => `${step.id}:${step.status}`))
      .toEqual(['limits:evidenced', 'notation:active', 'apply:pending'])
  })

  it('rejects an unusable route or an undeclared step', () => {
    const base = createInitialLearnerState('plan-session')
    expect(() => reduceLearnerState(base, {
      ...ROUTE,
      steps: Array.from({ length: MAX_PLAN_STEPS + 1 }, (_, index) => ({ id: `s${String(index)}`, label: `Step ${String(index)}` })),
      observation: observation('plan-too-many', 'Too many steps.'),
    } as LearnerStateEvent)).toThrow(/1 to 6 steps/)

    expect(() => reduceLearnerState(base, {
      ...ROUTE,
      steps: [{ id: 'dup', label: 'One' }, { id: 'dup', label: 'Two' }],
      observation: observation('plan-dup', 'Duplicate ids.'),
    } as LearnerStateEvent)).toThrow(/repeat a step id/)

    expect(() => reduceLearnerState(base, {
      ...ROUTE,
      activeStepId: 'missing',
      observation: observation('plan-missing-active', 'Unknown active step.'),
    } as LearnerStateEvent)).toThrow(/must name a declared step/)

    expect(() => reduceLearnerState(withRoute(), {
      type: 'plan_step_evidenced',
      stepId: 'nope',
      observation: observation('plan-missing', 'Unknown step.'),
    })).toThrow(/must name a declared step/)

    expect(() => reduceLearnerState(base, {
      type: 'plan_step_evidenced',
      stepId: 'limits',
      observation: observation('plan-no-route', 'No route yet.'),
    })).toThrow(/requires an observed plan/)
  })

  it('survives a durable snapshot round trip', () => {
    const state = reduceLearnerState(withRoute(), {
      type: 'plan_step_evidenced',
      stepId: 'limits',
      observation: observation('plan-5', 'The learner restated the limit definition unaided.'),
    })
    const event = createLearnerStateSnapshotEvent(state, 'update')
    const restored = hydrateLearnerStateSnapshot(event.snapshot, 'plan-session')
    expect(serializeLearnerStateSnapshot(restored)).toBe(serializeLearnerStateSnapshot(state))
    expect(restored.plan?.steps.map(step => step.status)).toEqual(['evidenced', 'active', 'pending'])
  })

  it('is cleared by a learning-boundary reset', () => {
    const reset = resetLearnerState(withRoute())
    expect(reset.plan).toBeNull()
    // The reset snapshot contract must also police the new field.
    expect(() => createLearnerStateSnapshotEvent(reset, 'reset')).not.toThrow()
    expect(() => createLearnerStateSnapshotEvent(withRoute(), 'reset')).toThrow(/must clear plan/)
  })

  it('projects the objective and current step without listing the whole route', () => {
    const transcript = renderLearnerStateTranscript(withRoute(), { maxTokens: 300 })
    expect(transcript).toContain('plan: "Derive the chain rule and apply it" (0/3 evidenced)')
    expect(transcript).toContain('plan_step: "Recall the limit definition"')
    // The steps the learner has not reached are deliberately absent, so the
    // route cannot be read back as a checklist to march through.
    expect(transcript).not.toContain('Apply it to a fresh function')
  })

  it('never spends the transcript budget the core diagnosis needs', () => {
    const state = reduceLearnerState(withRoute(), {
      type: 'gap_observed',
      gap: 'notation',
      observation: observation('plan-6', 'The learner misread the composition notation.'),
    })
    const tight = renderLearnerStateTranscript(state, { maxTokens: 100 })
    expect(tight).toContain('gap: notation')
    expect(tight).toContain('mastery:')
  })
})

describe('plan events through the model-facing tool', () => {
  it('records and advances a route end to end, and shows it to the next model step', async () => {
    const { Context } = await import('@deepseek-ai/cordis')
    const AgentRegistry = (await import('@deepseek-ai/dsh-agent')).default
    const { CallId } = await import('@deepseek-ai/dsh-llm')
    const SessionStore = (await import('@deepseek-ai/dsh-session')).default
    const SystemPrompt = (await import('@deepseek-ai/dsh-system-prompt')).default
    const ToolRuntime = (await import('@deepseek-ai/dsh-tools')).default
    const UserQuestionService = (await import('@deepseek-ai/dsh-user-questions')).default
    await import('../src/bootstrap.ts')

    const ctx = new Context()
    await ctx.plugin(SessionStore)
    await ctx.plugin(AgentRegistry)
    await ctx.plugin(UserQuestionService)
    await ctx.plugin(ToolRuntime)
    await ctx.plugin(SystemPrompt)
    await ctx.plugin((await import('../src/broker.ts')).LearningActivityBroker)
    await ctx.plugin(await import('../src/agent.ts'))

    const { SessionId } = await import('@deepseek-ai/dsh-session')
    const session = ctx.sessions.create(SessionId('plan-tool-session'))
    const agent = { id: session.id, session } as never
    const disposeAgent = ctx.agents.register(agent)
    const run = (callId: string, event: unknown) => ctx.tools.execute({
      signal: new AbortController().signal,
      callId: CallId(callId),
      name: 'learning_state_update',
      arguments: { action: 'update', event },
      agent,
    })

    const recorded = await run('plan-record', {
      type: 'plan_observed',
      objective: 'Read the notes and derive the chain rule',
      steps: [
        { id: 'skim', label: 'Skim chapter 2 for the composition rule' },
        { id: 'derive', label: 'Derive it from the limit definition' },
      ],
      observation: { id: 'tool-plan-1', source: 'learner-message', summary: 'The learner asked for a route through the notes.' },
    })
    expect(recorded).toMatchObject({ isError: false, value: { status: 'updated', revision: 1 } })

    const advanced = await run('plan-advance', {
      type: 'plan_step_evidenced',
      stepId: 'skim',
      observation: { id: 'tool-plan-2', source: 'learner-message', summary: 'The learner quoted the rule from chapter 2.' },
    })
    expect(advanced).toMatchObject({ isError: false, value: { status: 'updated', revision: 2 } })
    expect(ctx.learningActivities.learnerState(agent).plan?.steps.map(step => step.status))
      .toEqual(['evidenced', 'active'])

    const assembly = await ctx.systemPrompt.assemble({ scope: agent, agent })
    const injected = assembly.contexts.find(item => item.name === 'learning:learner-state')?.text ?? ''
    expect(injected).toContain('plan: "Read the notes and derive the chain rule" (1/2 evidenced)')
    expect(injected).toContain('plan_step: "Derive it from the limit definition"')

    disposeAgent()
    await ctx.fiber.dispose()
  }, 30_000)
})
