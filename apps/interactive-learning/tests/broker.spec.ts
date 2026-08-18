import { describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import AgentRegistry, { type Agent } from '@deepseek-ai/dsh-agent'
import { CallId } from '@deepseek-ai/dsh-llm'
import UserQuestionService, { type AskUserQuestionRequest } from '@deepseek-ai/dsh-user-questions'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import { LearningActivityBroker } from '../src/broker.ts'
import * as learningAgent from '../src/agent.ts'
import {
  CHECKPOINT_PROTOCOL,
  CHECKPOINT_RESULT_PROTOCOL,
  VISUAL_PROTOCOL_V4,
  VISUAL_RESULT_PROTOCOL_V4,
  type LearningCheckpointResultV1,
  type LearningCheckpointV1,
} from '../src/protocol.ts'
import { decodeLearningCheckpointDetail } from '../src/transport.ts'
import {
  LEARNER_STATE_EVENT_PROTOCOL,
  LEARNER_STATE_SESSION_EVENT_TYPE,
} from '../src/learner-state.ts'
import { parameterActivity, visualV4Catalog } from './fixtures.ts'

const testToolSignal = new AbortController().signal

function stubAgent(id: string, events: readonly unknown[] = []): Agent {
  const agentId = id as Agent['id']
  const log = [...events] as Array<{ type: string; seq: number; time: number; data: unknown }>
  const session = {
    id: agentId,
    header: { delegationDepth: 0 },
    get events() { return Object.freeze([...log]) },
    append(type: string, data: unknown) {
      const event = Object.freeze({ type, seq: log.length, time: Date.now(), data: structuredClone(data) })
      log.push(event)
      return event
    },
  }
  return {
    id: agentId,
    session,
  } as unknown as Agent
}

function checkpoint(overrides: Partial<LearningCheckpointV1> = {}): LearningCheckpointV1 {
  return {
    protocol: CHECKPOINT_PROTOCOL,
    kind: 'prediction',
    prompt: 'Predict which queue item leaves next and explain why.',
    context: 'The queue currently contains A, B, C in that order.',
    expectedEvidence: 'prediction',
    fallbackMarkdown: 'Reply in the ordinary conversation with the next item and your reason.',
    ...overrides,
  }
}

function checkpointCall(callId: string, step = 1): unknown {
  return {
    type: 'tool/call', seq: step, time: step,
    data: { turn: 1, step, callId, name: 'learning_checkpoint', arguments: '{}' },
  }
}

function registerRoot(ctx: Context, agent: Agent): void {
  ctx.agents.register(agent)
}

function answerFor(
  request: AskUserQuestionRequest,
  status: LearningCheckpointResultV1['status'],
  options: { response?: { text: string }; receiptId?: string } = {},
): { answers: Array<{ id: string; selected: string[]; custom: string }> } {
  const question = request.questions[0]!
  const envelope = decodeLearningCheckpointDetail(question.detail)
  if (envelope === undefined) throw new Error('missing checkpoint envelope')
  const result = status === 'submitted'
    ? {
        protocol: CHECKPOINT_RESULT_PROTOCOL,
        checkpointId: envelope.checkpointId,
        status,
        response: options.response ?? { text: 'B leaves first because the queue is FIFO.' },
        receiptId: options.receiptId ?? 'receipt-checkpoint',
      }
    : {
        protocol: CHECKPOINT_RESULT_PROTOCOL,
        checkpointId: envelope.checkpointId,
        status,
        receiptId: options.receiptId ?? `receipt-${status}`,
      }
  return { answers: [{ id: question.id, selected: [], custom: JSON.stringify(result) }] }
}

async function setupBroker(richClient: boolean) {
  const ctx = new Context()
  await ctx.plugin(AgentRegistry)
  await ctx.plugin(UserQuestionService)
  if (richClient) {
    ctx.provide('clientModules', {
      graph: () => ({ rev: 'test', entries: [{ id: '@dsh-portable/interactive-learning', url: '/client.js', rev: 'x' }] }),
    } as never)
  }
  await ctx.plugin(LearningActivityBroker)
  return ctx
}

describe('LearningActivityBroker compatibility boundary', () => {
  it('keeps V1 on the static legacy replay path without registering a wait', async () => {
    const ctx = await setupBroker(true)
    await expect(ctx.learningActivities.present({ activity: parameterActivity(), agent: stubAgent('legacy') }))
      .resolves.toMatchObject({ action: 'skip', interactionState: { reason: 'legacy-replay-only' } })
    expect(ctx.learningActivities.pendingCount).toBe(0)
  })

  it('registers no global tool or prompt from the Host entry', async () => {
    const ctx = new Context()
    await ctx.plugin(AgentRegistry)
    await ctx.plugin(UserQuestionService)
    await ctx.plugin(ToolRuntime)
    await ctx.plugin(SystemPrompt)
    const toolsBefore = ctx.tools.schemas().map(tool => tool.name)
    const promptBefore = await ctx.systemPrompt.assemble()
    await ctx.plugin(LearningActivityBroker)
    expect(ctx.tools.schemas().map(tool => tool.name)).toEqual(toolsBefore)
    expect(await ctx.systemPrompt.assemble()).toEqual(promptBefore)
  })
})

describe('non-blocking Learning Agent v4.1', () => {
  it('exposes one visual and one optional answer-free checkpoint through closed model schemas', async () => {
    const ctx = await setupBroker(true)
    await ctx.plugin(ToolRuntime)
    await ctx.plugin(SystemPrompt)
    await ctx.plugin(learningAgent)

    const schemas = ctx.tools.schemas()
    expect(schemas.map(tool => tool.name)).toEqual([
      'learning_visual',
      'learning_state_update',
      'learning_checkpoint',
    ])
    expect(JSON.stringify(schemas)).not.toContain('learning_question')
    expect(JSON.stringify(schemas)).not.toContain('learning_reveal')
    expect(JSON.stringify(schemas)).not.toContain('"additionalProperties":true')
    const parameters = schemas.find(tool => tool.name === 'learning_visual')?.parameters as {
      additionalProperties?: unknown
      properties?: Record<string, unknown>
    }
    expect(parameters.additionalProperties).toBe(false)
    expect(parameters.properties).toHaveProperty('content')
    expect(parameters.properties).not.toHaveProperty('series')
    expect(parameters.properties).not.toHaveProperty('metrics')
    expect(parameters.properties).not.toHaveProperty('input')
    expect(parameters.properties).not.toHaveProperty('advance')
    const serialized = JSON.stringify(parameters.properties?.content)
    for (const discriminator of [
      'plot', 'node_link', 'scene_2d', 'relation', 'comparison', 'matrix', 'sets',
      'timeline', 'formula_steps', 'study_map', 'recall_deck',
    ]) expect(serialized).toContain(`"const":"${discriminator}"`)
    const completeSchema = JSON.stringify(schemas.find(tool => tool.name === 'learning_visual'))
    for (const boundary of [
      '64 KiB', '1 to 32 characters', '1 to 8 series', '2 to 48 nodes', '1 to 160 edges',
      '1 to 64 scene elements', '2 to 32 events', '2 to 16 formula steps',
      '1 to 16 source sections', '1 to 48 concepts', '2 to 32 recall cards',
      '2 to 12 sequence frames', 'At most 64 unique ids',
    ]) expect(completeSchema).toContain(boundary)

    const checkpointSchema = schemas.find(tool => tool.name === 'learning_checkpoint')
    const checkpointParameters = checkpointSchema?.parameters as {
      additionalProperties?: unknown
      properties?: Record<string, unknown>
    }
    expect(checkpointParameters.additionalProperties).toBe(false)
    expect(Object.keys(checkpointParameters.properties ?? {}).sort()).toEqual([
      'context', 'expectedEvidence', 'fallbackMarkdown', 'kind', 'options', 'prompt', 'protocol',
    ])
    for (const forbidden of ['answer', 'correctAnswer', 'rubric', 'solution', 'futureStep', 'reveal', 'animation', 'continue']) {
      expect(checkpointParameters.properties).not.toHaveProperty(forbidden)
    }
    expect(checkpointSchema?.description).toContain('never call this once per turn')
    expect(checkpointSchema?.description).toContain('Evaluate it only in the next model step')
    expect(checkpointSchema?.output).toBeUndefined()

    const stateSchema = schemas.find(tool => tool.name === 'learning_state_update')
    const stateParameters = stateSchema?.parameters as {
      additionalProperties?: unknown
      properties?: Record<string, unknown>
    }
    expect(stateParameters.additionalProperties).toBe(false)
    expect(Object.keys(stateParameters.properties ?? {}).sort()).toEqual([
      'action', 'correction', 'event', 'observation',
    ])
    expect(stateParameters.properties).not.toHaveProperty('expectedRevision')
    expect(stateSchema?.description).toContain('never call mechanically every turn')
    expect(ctx.tools.get('learning_state_update')?.presentCall).toBeUndefined()
  })

  it('accepts every catalog fixture, returns ready immediately, and never creates a user-question wait', async () => {
    const ctx = await setupBroker(true)
    await ctx.plugin(ToolRuntime)
    await ctx.plugin(SystemPrompt)
    await ctx.plugin(learningAgent)
    expect(ctx.learningActivities.pendingCount).toBe(0)

    const ready = { protocol: VISUAL_RESULT_PROTOCOL_V4, status: 'ready' }
    for (const [name, visual] of Object.entries(visualV4Catalog)) {
      const result = await ctx.tools.execute({
        signal: testToolSignal,
        callId: CallId(`visual-${name}`),
        name: 'learning_visual',
        arguments: visual,
      })
      expect(result).toEqual({
        content: [{ type: 'text', text: JSON.stringify(ready) }],
        isError: false,
        value: ready,
      })
    }
    expect(ctx.learningActivities.pendingCount).toBe(0)
    expect(visualV4Catalog.derivativePlot.protocol).toBe(VISUAL_PROTOCOL_V4)
  })

  it('rejects distinct checkpoint calls in one logged model step but permits an idempotent call replay', async () => {
    const ctx = await setupBroker(false)
    await ctx.plugin(ToolRuntime)
    await ctx.plugin(SystemPrompt)
    await ctx.plugin(learningAgent)

    const duplicateAgent = stubAgent('duplicate-step', [
      checkpointCall('checkpoint-a'),
      checkpointCall('checkpoint-b'),
    ])
    registerRoot(ctx, duplicateAgent)
    const rejected = await ctx.tools.execute({
      signal: testToolSignal,
      callId: CallId('checkpoint-a'),
      name: 'learning_checkpoint',
      arguments: checkpoint(),
      agent: duplicateAgent,
    })
    expect(rejected.isError).toBe(true)
    expect(JSON.stringify(rejected.content)).toContain('at most one learning_checkpoint call')

    const replayAgent = stubAgent('replay-step', [checkpointCall('checkpoint-replay')])
    registerRoot(ctx, replayAgent)
    const execute = () => ctx.tools.execute({
      signal: testToolSignal,
      callId: CallId('checkpoint-replay'),
      name: 'learning_checkpoint',
      arguments: checkpoint(),
      agent: replayAgent,
    })
    const first = await execute()
    const replay = await execute()
    expect(first.isError).toBe(false)
    expect(replay.value).toEqual(first.value)
    expect((replay.value as LearningCheckpointResultV1).receiptId)
      .toBe((first.value as LearningCheckpointResultV1).receiptId)
  })
})

describe('session-scoped learner-state Host wiring', () => {
  it('folds ordinary evidence into the next prompt, auto-records tools, resets, and clears cache', async () => {
    const ctx = await setupBroker(false)
    await ctx.plugin(ToolRuntime)
    await ctx.plugin(SystemPrompt)
    await ctx.plugin(learningAgent)
    const agent = stubAgent('state-chain')
    const disposeAgent = ctx.agents.register(agent)

    const stateContext = async (): Promise<string> => {
      const assembly = await ctx.systemPrompt.assemble({ scope: agent, agent })
      return assembly.contexts.find(item => item.name === 'learning:learner-state')?.text ?? ''
    }
    expect(await stateContext()).toContain('goal: unknown')
    expect(ctx.learningActivities.learnerState(agent)).toMatchObject({ revision: 0, mastery: 'unseen' })

    agent.session.append('user/message' as never, {
      id: 'ordinary-message-1',
      role: 'user',
      source: { kind: 'human' },
      content: [{ type: 'text', text: 'I need to understand FIFO queues.' }],
    } as never)
    const goalUpdate = {
      action: 'update',
      event: {
        type: 'goal_observed',
        goal: 'Understand FIFO queues',
        observation: {
          id: 'goal-message-1',
          source: 'learner-message',
          summary: 'The learner explicitly asked to understand FIFO queues.',
          turn: 1,
        },
      },
    } as const
    const updated = await ctx.tools.execute({
      signal: testToolSignal,
      callId: CallId('state-goal'),
      name: 'learning_state_update',
      arguments: goalUpdate,
      agent,
    })
    expect(updated).toMatchObject({ isError: false, value: { status: 'updated', revision: 1 } })
    expect(agent.session.events.at(-1)).toMatchObject({
      type: LEARNER_STATE_SESSION_EVENT_TYPE,
      data: {
        protocol: LEARNER_STATE_EVENT_PROTOCOL,
        reason: 'update',
        snapshot: { goal: 'Understand FIFO queues', revision: 1 },
      },
    })
    expect(agent.session.events.at(-1)?.data).not.toHaveProperty('snapshot.sessionId')
    expect(await stateContext()).toContain('goal: "Understand FIFO queues"')

    const stateEventsBeforeReplay = agent.session.events.filter(event => event.type === 'learning/state').length
    const replay = await ctx.tools.execute({
      signal: testToolSignal,
      callId: CallId('state-goal-replay'),
      name: 'learning_state_update',
      arguments: goalUpdate,
      agent,
    })
    expect(replay).toMatchObject({ isError: false, value: { status: 'updated', revision: 1 } })
    expect(agent.session.events.filter(event => event.type === 'learning/state')).toHaveLength(stateEventsBeforeReplay)

    const reorderedReplay = await ctx.tools.execute({
      signal: testToolSignal,
      callId: CallId('state-goal-reordered-replay'),
      name: 'learning_state_update',
      arguments: {
        event: {
          observation: {
            summary: 'The learner explicitly asked to understand FIFO queues.',
            turn: 1,
            source: 'learner-message',
            id: 'goal-message-1',
          },
          goal: 'Understand FIFO queues',
          type: 'goal_observed',
        },
        action: 'update',
      },
      agent,
    })
    expect(reorderedReplay).toMatchObject({ isError: false, value: { status: 'updated', revision: 1 } })
    expect(agent.session.events.filter(event => event.type === 'learning/state')).toHaveLength(stateEventsBeforeReplay)

    const conflictingReplay = await ctx.tools.execute({
      signal: testToolSignal,
      callId: CallId('state-goal-conflict'),
      name: 'learning_state_update',
      arguments: {
        ...goalUpdate,
        event: { ...goalUpdate.event, goal: 'A different goal with the same observation id' },
      },
      agent,
    })
    expect(conflictingReplay.isError).toBe(true)
    expect(JSON.stringify(conflictingReplay.content)).toContain('replayed')

    const corrected = await ctx.tools.execute({
      signal: testToolSignal,
      callId: CallId('state-correct'),
      name: 'learning_state_update',
      arguments: {
        action: 'correct',
        correction: { goal: 'Understand queue invariants' },
        observation: {
          id: 'goal-correction-1',
          source: 'user-correction',
          summary: 'The learner corrected the goal to queue invariants.',
          turn: 1,
        },
      },
      agent,
    })
    expect(corrected).toMatchObject({ isError: false, value: { status: 'corrected', revision: 2 } })

    await ctx.tools.execute({
      signal: testToolSignal,
      callId: CallId('state-stuck'),
      name: 'learning_state_update',
      arguments: {
        action: 'update',
        event: {
          type: 'progress_observed',
          progressSignal: 'stuck',
          observation: {
            id: 'stuck-message-1',
            source: 'learner-message',
            summary: 'The learner repeated the same incorrect queue model twice.',
          },
        },
      },
      agent,
    })
    expect(ctx.learningActivities.learnerState(agent)).toMatchObject({
      progressSignal: 'stuck',
      supportLevel: 4,
    })

    const skipped = await ctx.learningActivities.presentCheckpoint({
      checkpoint: checkpoint(), agent, callId: 'state-skipped-checkpoint',
    })
    expect(skipped.status).toBe('skipped')
    expect(ctx.learningActivities.learnerState(agent)).toMatchObject({
      progressSignal: 'stuck',
      lastMove: 'checkpoint',
    })

    const visual = await ctx.tools.execute({
      signal: testToolSignal,
      callId: CallId('state-visual'),
      name: 'learning_visual',
      arguments: visualV4Catalog.derivativePlot,
      agent,
    })
    expect(visual.isError).toBe(false)
    expect(ctx.learningActivities.learnerState(agent).lastMove).toBe('visual')

    const reset = await ctx.tools.execute({
      signal: testToolSignal,
      callId: CallId('state-reset'),
      name: 'learning_state_update',
      arguments: { action: 'reset' },
      agent,
    })
    expect(reset).toMatchObject({ isError: false, value: { status: 'reset' } })
    expect(ctx.learningActivities.learnerState(agent)).toMatchObject({
      goal: null,
      progressSignal: 'unknown',
      lastMove: 'none',
      mastery: 'unseen',
    })
    expect(agent.session.events.at(-1)).toMatchObject({
      type: 'learning/state',
      data: { reason: 'reset' },
    })

    expect(ctx.learningActivities.learnerStateCacheSize).toBe(1)
    disposeAgent()
    expect(ctx.learningActivities.learnerStateCacheSize).toBe(0)
    const fresh = stubAgent('state-chain')
    const disposeFresh = ctx.agents.register(fresh)
    expect(ctx.learningActivities.learnerState(fresh)).toMatchObject({ revision: 0, goal: null })
    disposeFresh()
  })

  it('re-folds full snapshots into a refreshed broker and dynamic prompt', async () => {
    const first = await setupBroker(false)
    await first.plugin(ToolRuntime)
    await first.plugin(SystemPrompt)
    await first.plugin(learningAgent)
    const original = stubAgent('state-refresh')
    await first.tools.execute({
      signal: testToolSignal,
      callId: CallId('state-refresh-update'),
      name: 'learning_state_update',
      arguments: {
        action: 'update',
        event: {
          type: 'goal_observed',
          goal: 'Resume queue learning',
          observation: {
            id: 'refresh-goal',
            source: 'learner-message',
            summary: 'The learner chose queue learning.',
          },
        },
      },
      agent: original,
    })

    const refreshed = await setupBroker(false)
    await refreshed.plugin(ToolRuntime)
    await refreshed.plugin(SystemPrompt)
    await refreshed.plugin(learningAgent)
    const resumed = stubAgent('state-refresh', original.session.events)
    expect(refreshed.learningActivities.learnerState(resumed)).toMatchObject({
      revision: 1,
      goal: 'Resume queue learning',
    })
    const assembly = await refreshed.systemPrompt.assemble({ scope: resumed, agent: resumed })
    expect(assembly.contexts.find(item => item.name === 'learning:learner-state')?.text)
      .toContain('goal: "Resume queue learning"')
  })

  it('keeps every retained pedagogical field reachable through closed observable event variants', async () => {
    const ctx = await setupBroker(false)
    await ctx.plugin(ToolRuntime)
    await ctx.plugin(SystemPrompt)
    await ctx.plugin(learningAgent)
    const agent = stubAgent('state-field-coverage')
    const applyEvent = async (event: Record<string, unknown>, index: number): Promise<void> => {
      const result = await ctx.tools.execute({
        signal: testToolSignal,
        callId: CallId(`state-field-${index}`),
        name: 'learning_state_update',
        arguments: { action: 'update', event },
        agent,
      })
      expect(result.isError, JSON.stringify(result.content)).toBe(false)
    }
    const learnerObservation = (id: string, summary: string) => ({
      id,
      source: 'learner-message',
      summary,
    })

    await applyEvent({
      type: 'request_kind_observed',
      requestKind: 'source-study',
      observation: learnerObservation('field-request', 'The learner asked to study the supplied source.'),
    }, 1)
    await applyEvent({
      type: 'prior_knowledge_observed',
      level: 'intermediate',
      items: ['array indexing'],
      mode: 'replace',
      observation: learnerObservation('field-prior', 'The learner correctly used array indexing.'),
    }, 2)
    await applyEvent({
      type: 'gap_observed',
      gap: 'task-model',
      misconceptions: ['treats queue removal as LIFO'],
      misconceptionMode: 'replace',
      observation: learnerObservation('field-gap', 'The learner removed the newest queue item twice.'),
    }, 3)
    await applyEvent({
      type: 'readiness_observed',
      readiness: 'needs-foothold',
      observation: learnerObservation('field-readiness', 'The learner cannot begin without the queue invariant.'),
    }, 4)
    await applyEvent({
      type: 'urgency_observed',
      urgency: 'initial-blocker',
      observation: learnerObservation('field-urgency', 'The first request stated a concrete current blocker.'),
    }, 5)
    await applyEvent({
      type: 'assessment_context_observed',
      assessmentContext: 'graded',
      observation: learnerObservation('field-assessment', 'The learner said this exact answer will be graded.'),
    }, 6)
    await applyEvent({
      type: 'source_anchors_observed',
      anchors: ['§2.1 Queue invariants'],
      mode: 'replace',
      observation: {
        id: 'field-source',
        source: 'source-material',
        summary: 'The supplied source contains §2.1 Queue invariants.',
      },
    }, 7)
    await applyEvent({
      type: 'learner_evidence_observed',
      evidence: {
        kind: 'transfer',
        transferContext: 'fresh',
        summary: 'Applied FIFO correctly to a fresh printer-job example.',
        confidence: 'high',
        correctness: 'correct',
        independence: 'independent',
      },
      observation: {
        id: 'field-transfer',
        source: 'learner-action',
        summary: 'The learner independently solved a fresh printer-job queue case.',
      },
    }, 8)
    await applyEvent({
      type: 'progress_observed',
      progressSignal: 'shutdown-risk',
      observation: learnerObservation('field-progress', 'The learner explicitly said they are shutting down.'),
    }, 9)

    expect(ctx.learningActivities.learnerState(agent)).toMatchObject({
      requestKind: 'source-study',
      level: 'intermediate',
      priorKnowledge: ['array indexing'],
      gap: 'task-model',
      misconceptions: ['treats queue removal as LIFO'],
      readiness: 'needs-foothold',
      progressSignal: 'shutdown-risk',
      urgency: 'initial-blocker',
      supportLevel: 5,
      assessmentContext: 'graded',
      mastery: 'transfer',
      sourceAnchors: ['§2.1 Queue invariants'],
    })
  })

  it('rejects source-matrix and transfer-context violations at the closed tool schema', async () => {
    const ctx = await setupBroker(false)
    await ctx.plugin(ToolRuntime)
    await ctx.plugin(SystemPrompt)
    await ctx.plugin(learningAgent)
    const agent = stubAgent('state-source-matrix')
    const execute = (event: unknown, callId: string) => ctx.tools.execute({
      signal: testToolSignal,
      callId: CallId(callId),
      name: 'learning_state_update',
      arguments: { action: 'update', event },
      agent,
    })

    const missingTransferContext = await execute({
      type: 'learner_evidence_observed',
      evidence: { kind: 'transfer', summary: 'fresh use' },
      observation: { id: 'bad-transfer', source: 'learner-action', summary: 'A learner action.' },
    }, 'bad-transfer')
    expect(missingTransferContext.isError).toBe(true)

    const nonTransferSmuggling = await execute({
      type: 'learner_evidence_observed',
      evidence: { kind: 'attempt', transferContext: 'fresh', summary: 'attempt' },
      observation: { id: 'bad-attempt', source: 'learner-action', summary: 'A learner action.' },
    }, 'bad-attempt')
    expect(nonTransferSmuggling.isError).toBe(true)

    const badSource = await execute({
      type: 'goal_observed',
      goal: 'invented from source',
      observation: { id: 'bad-source', source: 'source-material', summary: 'A source section.' },
    }, 'bad-source')
    expect(badSource.isError).toBe(true)
    expect(agent.session.events.filter(event => event.type === 'learning/state')).toHaveLength(0)
  })
})

describe('Learning checkpoint broker', () => {
  it('falls back immediately without a rich Client and replays the stable terminal receipt', async () => {
    const ctx = await setupBroker(false)
    const agent = stubAgent('no-client')
    const request = { checkpoint: checkpoint(), agent, callId: 'no-client-call' }

    const first = await ctx.learningActivities.presentCheckpoint(request)
    const replay = await ctx.learningActivities.presentCheckpoint(request)

    expect(first).toMatchObject({
      protocol: CHECKPOINT_RESULT_PROTOCOL,
      status: 'skipped',
    })
    expect(replay).toEqual(first)
    expect(ctx.learningActivities.pendingCount).toBe(0)
  })

  it.each(['submitted', 'skipped', 'cancelled'] as const)(
    'accepts the terminal %s result through exactly one user-result wait',
    async status => {
      const ctx = await setupBroker(true)
      const agent = stubAgent(`terminal-${status}`)
      registerRoot(ctx, agent)
      const ask = vi.fn(async (request: AskUserQuestionRequest) => answerFor(request, status))
      ctx.userQuestions.registerProvider({ ask })

      const result = await ctx.learningActivities.presentCheckpoint({
        checkpoint: checkpoint(), agent, callId: `call-${status}`,
      })

      expect(result.status).toBe(status)
      expect(ask).toHaveBeenCalledTimes(1)
      expect(ask.mock.calls[0]?.[0].questions).toHaveLength(1)
      expect(ctx.learningActivities.pendingCount).toBe(0)
      const state = ctx.learningActivities.learnerState(agent)
      expect(state.lastMove).toBe('checkpoint')
      expect(state.progressSignal).toBe('unknown')
      if (status === 'submitted') {
        expect(state.evidence.at(-1)).toMatchObject({
          kind: 'prediction',
          correctness: 'unknown',
          independence: 'unknown',
        })
        expect(state.mastery).toBe('unseen')
      } else expect(state.evidence).toEqual([])
    },
  )

  it('records submitted transfer evidence as unevaluated/unknown and never upgrades mastery', async () => {
    const ctx = await setupBroker(true)
    const agent = stubAgent('checkpoint-transfer-unknown')
    registerRoot(ctx, agent)
    ctx.userQuestions.registerProvider({
      ask: async request => answerFor(request, 'submitted', { receiptId: 'transfer-unknown-receipt' }),
    })

    await ctx.learningActivities.presentCheckpoint({
      checkpoint: checkpoint({
        kind: 'free_text',
        prompt: 'Apply FIFO to this fresh printer-job case and explain the result.',
        expectedEvidence: 'transfer',
      }),
      agent,
      callId: 'checkpoint-transfer-unknown-call',
    })
    expect(ctx.learningActivities.learnerState(agent)).toMatchObject({
      mastery: 'unseen',
      progressSignal: 'unknown',
      lastMove: 'checkpoint',
      evidence: [{
        kind: 'transfer',
        transferContext: 'unknown',
        correctness: 'unknown',
        independence: 'unknown',
      }],
    })
  })

  it('deduplicates one pending call and rejects altered replay content or a second pending call in the session', async () => {
    const ctx = await setupBroker(true)
    const agent = stubAgent('pending-session')
    registerRoot(ctx, agent)
    let resolveAnswer: ((answer: ReturnType<typeof answerFor>) => void) | undefined
    let seenRequest: AskUserQuestionRequest | undefined
    const ask = vi.fn((request: AskUserQuestionRequest) => {
      seenRequest = request
      return new Promise<ReturnType<typeof answerFor>>(resolve => { resolveAnswer = resolve })
    })
    ctx.userQuestions.registerProvider({ ask })
    const request = { checkpoint: checkpoint(), agent, callId: 'stable-call' }

    const first = ctx.learningActivities.presentCheckpoint(request)
    const replay = ctx.learningActivities.presentCheckpoint(request)
    await expect(ctx.learningActivities.presentCheckpoint({
      checkpoint: checkpoint({ prompt: 'A changed prompt.' }),
      agent,
      callId: 'stable-call',
    })).rejects.toThrow(/different content/)
    await expect(ctx.learningActivities.presentCheckpoint({
      checkpoint: checkpoint(),
      agent,
      callId: 'second-call',
    })).rejects.toThrow(/at most one pending learning checkpoint/)

    expect(ask).toHaveBeenCalledTimes(1)
    resolveAnswer?.(answerFor(seenRequest!, 'submitted'))
    const [result, replayed] = await Promise.all([first, replay])
    expect(replayed).toBe(result)
    expect(result.status).toBe('submitted')
  })

  it('allows one pending checkpoint in each of two sessions without crossing terminal results', async () => {
    const ctx = await setupBroker(true)
    const agentA = stubAgent('pending-a')
    const agentB = stubAgent('pending-b')
    registerRoot(ctx, agentA)
    registerRoot(ctx, agentB)
    const pending = new Map<string, {
      request: AskUserQuestionRequest
      resolve(answer: ReturnType<typeof answerFor>): void
    }>()
    const ask = vi.fn((request: AskUserQuestionRequest) => new Promise<ReturnType<typeof answerFor>>(resolve => {
      const envelope = decodeLearningCheckpointDetail(request.questions[0]!.detail)
      if (envelope === undefined) throw new Error('missing checkpoint detail')
      pending.set(envelope.sessionId, { request, resolve })
    }))
    ctx.userQuestions.registerProvider({ ask })

    const resultA = ctx.learningActivities.presentCheckpoint({
      checkpoint: checkpoint(), agent: agentA, callId: 'pending-a-call',
    })
    const resultB = ctx.learningActivities.presentCheckpoint({
      checkpoint: checkpoint(), agent: agentB, callId: 'pending-b-call',
    })
    expect(ctx.learningActivities.pendingCount).toBe(2)
    expect(ask).toHaveBeenCalledTimes(2)

    const waitB = pending.get('pending-b')!
    waitB.resolve(answerFor(waitB.request, 'cancelled', { receiptId: 'receipt-pending-b' }))
    const waitA = pending.get('pending-a')!
    waitA.resolve(answerFor(waitA.request, 'submitted', { receiptId: 'receipt-pending-a' }))
    await expect(resultB).resolves.toMatchObject({ status: 'cancelled', receiptId: 'receipt-pending-b' })
    await expect(resultA).resolves.toMatchObject({ status: 'submitted', receiptId: 'receipt-pending-a' })
    expect(ctx.learningActivities.pendingCount).toBe(0)
    expect(ctx.learningActivities.learnerState(agentA).evidence).toHaveLength(1)
    expect(ctx.learningActivities.learnerState(agentB).evidence).toHaveLength(0)
  })

  it('aborts on learner-state reset and rejects a late submission without restoring checkpoint state', async () => {
    const ctx = await setupBroker(true)
    const agent = stubAgent('checkpoint-reset')
    registerRoot(ctx, agent)
    let resolveAnswer: ((answer: ReturnType<typeof answerFor>) => void) | undefined
    let seenRequest: AskUserQuestionRequest | undefined
    ctx.userQuestions.registerProvider({
      ask(request) {
        seenRequest = request
        return new Promise(resolve => { resolveAnswer = resolve })
      },
    })

    const pending = ctx.learningActivities.presentCheckpoint({
      checkpoint: checkpoint({ expectedEvidence: 'transfer' }),
      agent,
      callId: 'checkpoint-before-reset',
    })
    expect(ctx.learningActivities.pendingCount).toBe(1)
    const current = ctx.learningActivities.learnerState(agent)
    expect(ctx.learningActivities.updateLearnerState({
      action: 'reset',
      agent,
      expectedRevision: current.revision,
    })).toMatchObject({ status: 'reset' })
    expect(ctx.learningActivities.pendingCount).toBe(0)
    await expect(pending).resolves.toMatchObject({ status: 'cancelled' })

    resolveAnswer?.(answerFor(seenRequest!, 'submitted', { receiptId: 'late-after-reset' }))
    await Promise.resolve()
    expect(ctx.learningActivities.learnerState(agent)).toMatchObject({
      evidence: [],
      lastMove: 'none',
      mastery: 'unseen',
    })
    expect(agent.session.events.filter(event => event.type === 'learning/state')).toHaveLength(1)
    expect(agent.session.events.at(-1)).toMatchObject({ data: { reason: 'reset' } })
  })

  it('fences a disposed checkpoint from a replacement session object reusing the same id', async () => {
    const ctx = await setupBroker(true)
    const original = stubAgent('reused-session-id')
    const disposeOriginal = ctx.agents.register(original)
    let resolveAnswer: ((answer: ReturnType<typeof answerFor>) => void) | undefined
    let seenRequest: AskUserQuestionRequest | undefined
    ctx.userQuestions.registerProvider({
      ask(request) {
        seenRequest = request
        return new Promise(resolve => { resolveAnswer = resolve })
      },
    })

    const pending = ctx.learningActivities.presentCheckpoint({
      checkpoint: checkpoint(),
      agent: original,
      callId: 'checkpoint-old-session-object',
    })
    expect(ctx.learningActivities.pendingCount).toBe(1)
    expect(ctx.learningActivities.checkpointCacheSize).toBe(3)
    disposeOriginal()
    expect(ctx.learningActivities.pendingCount).toBe(0)
    expect(ctx.learningActivities.checkpointCacheSize).toBe(0)

    const replacement = stubAgent('reused-session-id')
    const disposeReplacement = ctx.agents.register(replacement)
    await expect(pending).resolves.toMatchObject({ status: 'cancelled' })
    resolveAnswer?.(answerFor(seenRequest!, 'submitted', { receiptId: 'late-old-session-receipt' }))
    await Promise.resolve()

    expect(ctx.learningActivities.learnerState(replacement)).toMatchObject({
      revision: 0,
      evidence: [],
      lastMove: 'none',
    })
    expect(original.session.events.filter(event => event.type === 'learning/state')).toHaveLength(0)
    expect(replacement.session.events.filter(event => event.type === 'learning/state')).toHaveLength(0)

    const replacementPending = ctx.learningActivities.presentCheckpoint({
      checkpoint: checkpoint(),
      agent: replacement,
      callId: 'checkpoint-old-session-object',
    })
    expect(ctx.learningActivities.pendingCount).toBe(1)
    expect(ctx.learningActivities.checkpointCacheSize).toBe(3)
    ctx.emit('session/disposed', original.session as never)
    expect(ctx.learningActivities.pendingCount).toBe(1)
    expect(ctx.learningActivities.checkpointCacheSize).toBe(3)
    const replacementRequest = seenRequest!
    resolveAnswer?.(answerFor(replacementRequest, 'submitted', { receiptId: 'replacement-session-receipt' }))
    await expect(replacementPending).resolves.toMatchObject({
      status: 'submitted',
      receiptId: 'replacement-session-receipt',
    })
    expect(ctx.learningActivities.learnerState(replacement).evidence).toHaveLength(1)
    expect(ctx.learningActivities.checkpointCacheSize).toBe(2)
    disposeReplacement()
    expect(ctx.learningActivities.checkpointCacheSize).toBe(0)
  })

  it('settles abort and timeout once, then ignores a late submitted response', async () => {
    for (const mode of ['abort', 'timeout'] as const) {
      const ctx = await setupBroker(true)
      const agent = stubAgent(`late-${mode}`)
      registerRoot(ctx, agent)
      let resolveAnswer: ((answer: ReturnType<typeof answerFor>) => void) | undefined
      let seenRequest: AskUserQuestionRequest | undefined
      ctx.userQuestions.registerProvider({
        ask(request) {
          seenRequest = request
          return new Promise(resolve => { resolveAnswer = resolve })
        },
      })
      const controller = new AbortController()
      const request = {
        checkpoint: checkpoint(),
        agent,
        callId: `late-${mode}`,
        signal: controller.signal,
        timeoutMs: mode === 'timeout' ? 5 : 5_000,
      }
      const pending = ctx.learningActivities.presentCheckpoint(request)
      if (mode === 'abort') controller.abort()
      const terminal = await pending
      expect(terminal.status).toBe(mode === 'abort' ? 'cancelled' : 'skipped')
      expect(ctx.learningActivities.pendingCount).toBe(0)

      resolveAnswer?.(answerFor(seenRequest!, 'submitted', { receiptId: `late-receipt-${mode}` }))
      await Promise.resolve()
      const replay = await ctx.learningActivities.presentCheckpoint(request)
      expect(replay).toEqual(terminal)
    }
  })

  it('settles plugin disposal once and ignores a late response', async () => {
    const ctx = await setupBroker(true)
    const agent = stubAgent('dispose-pending')
    registerRoot(ctx, agent)
    let resolveAnswer: ((answer: ReturnType<typeof answerFor>) => void) | undefined
    let seenRequest: AskUserQuestionRequest | undefined
    let askCount = 0
    ctx.userQuestions.registerProvider({
      ask(request) {
        askCount += 1
        if (askCount === 1) {
          return Promise.resolve(answerFor(request, 'submitted', {
            receiptId: 'answer-before-plugin-dispose',
          }))
        }
        seenRequest = request
        return new Promise(resolve => { resolveAnswer = resolve })
      },
    })
    const broker = ctx.learningActivities
    await expect(broker.presentCheckpoint({
      checkpoint: checkpoint(), agent, callId: 'completed-before-dispose',
    })).resolves.toMatchObject({ status: 'submitted' })
    expect(broker.checkpointCacheSize).toBe(2)

    const request = { checkpoint: checkpoint(), agent, callId: 'dispose-call' }
    const pending = broker.presentCheckpoint(request)
    expect(broker.pendingCount).toBe(1)
    expect(broker.checkpointCacheSize).toBe(5)
    const observed = vi.fn()
    broker.observe(observed)

    await ctx.fiber.dispose()
    const terminal = await pending
    expect(terminal.status).toBe('cancelled')
    expect(broker.pendingCount).toBe(0)
    expect(broker.checkpointCacheSize).toBe(0)

    resolveAnswer?.(answerFor(seenRequest!, 'submitted', { receiptId: 'late-after-dispose' }))
    await Promise.resolve()
    expect(terminal.status).toBe('cancelled')
    expect(broker.checkpointCacheSize).toBe(0)
    broker.reportLifecycle({
      name: 'learning.call.stream_started', phase: 'question', activityId: 'after-dispose',
      lessonToken: 'lesson', roundToken: 'round', seq: 1,
    })
    expect(observed).not.toHaveBeenCalled()
  })

  it('degrades an unexpected provider failure to a skipped terminal result', async () => {
    const ctx = await setupBroker(true)
    const agent = stubAgent('provider-failure')
    registerRoot(ctx, agent)
    ctx.userQuestions.registerProvider({ ask: async () => { throw new Error('renderer crashed') } })

    await expect(ctx.learningActivities.presentCheckpoint({
      checkpoint: checkpoint(), agent, callId: 'provider-failure-call',
    })).resolves.toMatchObject({ status: 'skipped' })
    expect(ctx.learningActivities.pendingCount).toBe(0)
  })

  it('deduplicates an identical receipt and rejects the same receipt with different content', async () => {
    const ctx = await setupBroker(false)
    const agent = stubAgent('receipt-deduplication')
    const accept = (ctx.learningActivities as unknown as {
      acceptCheckpointReceipt(
        session: Agent['session'], result: LearningCheckpointResultV1,
      ): LearningCheckpointResultV1
    }).acceptCheckpointReceipt.bind(ctx.learningActivities)
    const original: LearningCheckpointResultV1 = {
      protocol: CHECKPOINT_RESULT_PROTOCOL,
      checkpointId: 'checkpoint-id',
      status: 'submitted',
      response: { text: 'observable answer' },
      receiptId: 'stable-receipt',
    }

    expect(accept(agent.session, original)).toBe(original)
    expect(accept(agent.session, { ...original, response: { text: 'observable answer' } })).toBe(original)
    expect(() => accept(agent.session, { ...original, response: { text: 'changed answer' } }))
      .toThrow(/receiptId was reused for different content/)
  })
})
