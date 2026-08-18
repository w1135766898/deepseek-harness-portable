import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import AgentRegistry, { type Agent } from '@deepseek-ai/dsh-agent'
import UserQuestionService, {
  type AskUserQuestionRequest,
} from '@deepseek-ai/dsh-user-questions'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import { LearningActivityBroker } from '../src/broker.ts'
import * as learningAgent from '../src/agent.ts'
import {
  ACTIVITY_PROTOCOL_V2,
  RESPONSE_PROTOCOL_V2,
  LearningProtocolError,
  type LearningQuestionV2,
  type LearningRevealV2,
} from '../src/protocol.ts'
import { decodeLearningWaitDetail, decodeLearningWaitQuestionId } from '../src/transport.ts'
import { parameterActivity } from './fixtures.ts'

function stubAgent(id: string): Agent {
  const agentId = id as Agent['id']
  return { id: agentId, session: { id: agentId, header: { delegationDepth: 0 } } } as unknown as Agent
}

async function setup(richClient: boolean) {
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

describe('LearningActivityBroker', () => {
  it('keeps V1 on the static legacy replay path without registering a wait', async () => {
    const ctx = await setup(true)
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

  it('adds exactly the two V2 gate tools through the Agent entry', async () => {
    const ctx = new Context()
    await ctx.plugin(AgentRegistry)
    await ctx.plugin(UserQuestionService)
    await ctx.plugin(ToolRuntime)
    await ctx.plugin(SystemPrompt)
    await ctx.plugin(LearningActivityBroker)
    await ctx.plugin(learningAgent)
    const schemas = ctx.tools.schemas()
    expect(schemas.map(tool => tool.name)).toEqual(['learning_question', 'learning_reveal'])
    expect(JSON.stringify(schemas)).not.toContain('"additionalProperties":true')
    const question = schemas[0]?.parameters as { additionalProperties?: unknown; properties?: Record<string, unknown> }
    const reveal = schemas[1]?.parameters as { additionalProperties?: unknown; properties?: Record<string, unknown> }
    expect(question.additionalProperties).toBe(false)
    expect(reveal.additionalProperties).toBe(false)
    expect(question.properties).not.toHaveProperty('answer')
    expect(question.properties).not.toHaveProperty('steps')
    expect(question.properties).not.toHaveProperty('reveal')
    expect(reveal.properties).not.toHaveProperty('input')
    expect(reveal.properties).not.toHaveProperty('nextQuestion')
    expect(reveal.properties).not.toHaveProperty('steps')
  })

})
function questionGate(seq = 0, lessonToken?: string): LearningQuestionV2 {
  return {
    protocol: ACTIVITY_PROTOCOL_V2, phase: 'question', seq,
    ...(lessonToken === undefined ? {} : { lessonToken }),
    focus: { title: `Round ${String(seq + 1)}` }, prompt: 'Which item leaves?',
    input: { kind: 'short_text', maxLength: 50 }, fallbackMarkdown: 'Which item leaves?',
  }
}

function revealGate(question: { lessonToken: string; roundToken: string; seq: number }): LearningRevealV2 {
  return {
    protocol: ACTIVITY_PROTOCOL_V2, phase: 'reveal',
    lessonToken: question.lessonToken, roundToken: question.roundToken, seq: question.seq,
    focus: { title: `Round ${String(question.seq + 1)}` },
    feedback: { explanation: 'FIFO removes the oldest item.', answer: 'A' },
    animation: { kind: 'step_complete', reducedMotion: 'commit-final-state' },
    advance: { mode: 'user-after-animation' }, fallbackMarkdown: 'A leaves first.',
  }
}

describe('LearningActivityBroker v2 coordinator', () => {
  it('uses two opaque durable waits and does not resolve Reveal before continue', async () => {
    const ctx = await setup(true)
    const agent = stubAgent('v2-sequence')
    ctx.agents.enter(agent, undefined)
    const requests: AskUserQuestionRequest[] = []
    let releaseReveal: (() => void) | undefined
    const revealReady = new Promise<void>(resolve => { releaseReveal = resolve })
    const events: unknown[] = []
    ctx.learningActivities.observe(event => events.push(event))
    ctx.userQuestions.registerProvider({
      async ask(request) {
        requests.push(request)
        const envelope = decodeLearningWaitDetail(request.questions[0]?.detail)
        if (envelope === undefined) throw new Error('missing v2 wait projection')
        expect(decodeLearningWaitQuestionId(request.questions[0]?.id)).toBe(envelope.waitId)
        expect(request.questions[0]?.id).not.toContain(envelope.activity.fallbackMarkdown)
        if (envelope.phase === 'question') return { answers: [{
          id: request.questions[0]?.id ?? '', selected: [], custom: JSON.stringify({
            protocol: RESPONSE_PROTOCOL_V2, phase: 'question', activityId: envelope.activityId,
            lessonToken: envelope.lessonToken, roundToken: envelope.roundToken, seq: envelope.seq,
            action: 'submit', answer: { text: 'A', secretEvidence: 'must-not-be-observed' }, receiptId: 'receipt_question',
          }),
        }] }
        await revealReady
        return { answers: [{
          id: request.questions[0]?.id ?? '', selected: [], custom: JSON.stringify({
            protocol: RESPONSE_PROTOCOL_V2, phase: 'reveal', activityId: envelope.activityId,
            lessonToken: envelope.lessonToken, roundToken: envelope.roundToken, seq: envelope.seq,
            action: 'continue', animation: { completed: true }, receiptId: 'receipt_reveal',
          }),
        }] }
      },
    })

    const question = await ctx.learningActivities.presentQuestion({ activity: questionGate(), agent, callId: 'call_question' })
    expect(question).toMatchObject({ phase: 'question', action: 'submit', seq: 0 })
    await expect(ctx.learningActivities.presentQuestion({ activity: questionGate(), agent, callId: 'call_question' }))
      .resolves.toEqual(question)
    expect(requests).toHaveLength(1)
    const reveal = ctx.learningActivities.presentReveal({ activity: revealGate(question), agent, callId: 'call_reveal' })
    await Promise.resolve()
    expect(ctx.learningActivities.pendingCount).toBe(1)
    let settled = false
    void reveal.then(() => { settled = true })
    await Promise.resolve()
    expect(settled).toBe(false)
    releaseReveal?.()
    await expect(reveal).resolves.toMatchObject({ phase: 'reveal', action: 'continue', animation: { completed: true } })
    expect(requests).toHaveLength(2)
    expect(JSON.stringify(events)).not.toContain('must-not-be-observed')
    const eventNames = events.map(event => (event as { name: string }).name)
    expect(eventNames).toContain('learning.call.args_completed')
    expect(eventNames).toContain('learning.model.next_step_started')
    expect(eventNames.indexOf('learning.wait.resolved')).toBeLessThan(eventNames.indexOf('learning.model.next_step_started'))

    await expect(ctx.learningActivities.presentQuestion({
      activity: questionGate(2, question.lessonToken), agent,
    })).rejects.toBeInstanceOf(LearningProtocolError)
  })

  it('rejects a Reveal that does not match an answered Question token', async () => {
    const ctx = await setup(true)
    const agent = stubAgent('v2-stale')
    ctx.agents.enter(agent, undefined)
    await expect(ctx.learningActivities.presentReveal({
      activity: revealGate({ lessonToken: 'unknown', roundToken: 'stale', seq: 0 }), agent,
    })).rejects.toThrow(/not active/)
  })
})
