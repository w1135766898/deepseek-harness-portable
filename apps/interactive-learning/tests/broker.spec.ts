import { describe, expect, it } from 'vitest'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import AgentRegistry, { type Agent } from '@deepseek-ai/dsh-agent'
import UserQuestionService, {
  UserQuestionError,
  type AskUserQuestionRequest,
} from '@deepseek-ai/dsh-user-questions'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import { CallId } from '@deepseek-ai/dsh-llm'
import { LearningActivityBroker } from '../src/broker.ts'
import * as learningAgent from '../src/agent.ts'
import { RESPONSE_PROTOCOL } from '../src/protocol.ts'
import { decodeLearningDetail } from '../src/transport.ts'
import { parameterActivity } from './fixtures.ts'

interface MockLlmServer {
  baseURL: string
  requests: readonly { body: unknown }[]
  close(): Promise<void>
}

type StartMockLlmServer = (options: {
  host?: string
  port?: number
  apiKey?: string
  sequence: readonly string[]
  successText?: string
  toolName?: string
  toolArguments?: string
}) => Promise<MockLlmServer>

async function mockLlmServer(): Promise<StartMockLlmServer> {
  const moduleUrl = pathToFileURL(resolve(
    import.meta.dirname,
    '../../../vendor/deepseek-harness/packages/test-support/llm-mock-server/lib/index.js',
  )).href
  const module = await import(/* @vite-ignore */ moduleUrl) as { startMockLlmServer: StartMockLlmServer }
  return module.startMockLlmServer
}

async function completion(baseURL: string, body: unknown): Promise<{
  text: string
  toolCall?: { id: string; name: string; arguments: string }
}> {
  const response = await fetch(`${baseURL}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      authorization: 'Bearer learning-e2e-key',
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  if (!response.ok) throw new Error(`mock completion failed: ${String(response.status)}`)
  let text = ''
  let toolCall: { id: string; name: string; arguments: string } | undefined
  for (const line of (await response.text()).split(/\r?\n/)) {
    if (!line.startsWith('data: ')) continue
    const data = line.slice('data: '.length)
    if (data === '[DONE]') continue
    const event = JSON.parse(data) as {
      choices?: Array<{
        delta?: {
          content?: string
          tool_calls?: Array<{
            id?: string
            function?: { name?: string; arguments?: string }
          }>
        }
      }>
    }
    const delta = event.choices?.[0]?.delta
    text += delta?.content ?? ''
    const chunk = delta?.tool_calls?.[0]
    if (chunk !== undefined) {
      toolCall ??= { id: '', name: '', arguments: '' }
      toolCall.id ||= chunk.id ?? ''
      toolCall.name ||= chunk.function?.name ?? ''
      toolCall.arguments += chunk.function?.arguments ?? ''
    }
  }
  return { text, ...(toolCall === undefined ? {} : { toolCall }) }
}

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
  it('falls back immediately when the Client capability is absent', async () => {
    const ctx = await setup(false)
    const result = await ctx.learningActivities.present({ activity: parameterActivity() })
    expect(result).toMatchObject({ action: 'skip', interactionState: { reason: 'client-capability-unavailable' } })
  })

  it('generates the trusted activity id and returns a structured Client response', async () => {
    const ctx = await setup(true)
    const agent = stubAgent('root')
    ctx.agents.enter(agent, undefined)
    const seen: AskUserQuestionRequest[] = []
    ctx.userQuestions.registerProvider({
      async ask(request) {
        seen.push(request)
        const envelope = decodeLearningDetail(request.questions[0]?.detail)
        if (envelope === undefined) throw new Error('missing learning envelope')
        return {
          answers: [{
            id: request.questions[0]?.id ?? '',
            selected: [],
            custom: JSON.stringify({
              protocol: RESPONSE_PROTOCOL,
              activityId: envelope.activityId,
              action: 'submit',
              answer: { explanation: 'The line changes direction.' },
            }),
          }],
        }
      },
    })

    const result = await ctx.learningActivities.present({ activity: parameterActivity(), agent })
    const envelope = decodeLearningDetail(seen[0]?.questions[0]?.detail)
    expect(envelope?.activityId).toMatch(/^[0-9a-f-]{36}$/)
    expect(seen[0]?.questions[0]?.id).toBe(`learning:${envelope?.activityId}`)
    expect(result).toMatchObject({ activityId: envelope?.activityId, action: 'submit' })
  })

  it('turns user cancellation into a canonical cancel response', async () => {
    const ctx = await setup(true)
    const agent = stubAgent('root')
    ctx.agents.enter(agent, undefined)
    ctx.userQuestions.registerProvider({
      ask: () => Promise.reject(new UserQuestionError('cancelled', 'ASK_CANCELLED')),
    })
    await expect(ctx.learningActivities.present({ activity: parameterActivity(), agent }))
      .resolves.toMatchObject({ action: 'cancel', interactionState: { reason: 'user-cancelled' } })
  })

  it('bounds an incompatible or unresponsive Client and clears the pending lease', async () => {
    const ctx = await setup(true)
    const agent = stubAgent('root-timeout')
    ctx.agents.enter(agent, undefined)
    ctx.userQuestions.registerProvider({
      ask: request => new Promise((_resolve, reject) => {
        request.signal?.addEventListener('abort', () => {
          reject(new UserQuestionError('aborted', 'ASK_ABORTED'))
        }, { once: true })
      }),
    })

    await expect(ctx.learningActivities.present({ activity: parameterActivity(), agent, timeoutMs: 15 }))
      .resolves.toMatchObject({ action: 'skip', interactionState: { reason: 'client-response-timeout' } })
    expect(ctx.learningActivities.pendingCount).toBe(0)
  })

  it('keeps a disconnected wait recoverable until the same Client responds', async () => {
    const ctx = await setup(true)
    const agent = stubAgent('root-reconnect')
    ctx.agents.enter(agent, undefined)
    ctx.userQuestions.registerProvider({
      ask: request => new Promise(resolveAnswer => {
        const envelope = decodeLearningDetail(request.questions[0]?.detail)
        if (envelope === undefined) throw new Error('missing learning envelope')
        setTimeout(() => resolveAnswer({ answers: [{
          id: request.questions[0]?.id ?? '',
          selected: [],
          custom: JSON.stringify({
            protocol: RESPONSE_PROTOCOL,
            activityId: envelope.activityId,
            action: 'submit',
            answer: { explanation: 'reconnected answer' },
          }),
        }] }), 10)
      }),
    })

    const pending = ctx.learningActivities.present({ activity: parameterActivity(), agent, timeoutMs: 1_000 })
    expect(ctx.learningActivities.pendingCount).toBe(1)
    await expect(pending).resolves.toMatchObject({ action: 'submit', answer: { explanation: 'reconnected answer' } })
    expect(ctx.learningActivities.pendingCount).toBe(0)
  })

  it('cancels and clears the wait when the owning session aborts', async () => {
    const ctx = await setup(true)
    const agent = stubAgent('root-abort')
    ctx.agents.enter(agent, undefined)
    ctx.userQuestions.registerProvider({
      ask: request => new Promise((_resolve, reject) => request.signal?.addEventListener('abort', () => {
        reject(new UserQuestionError('aborted', 'ASK_ABORTED'))
      }, { once: true })),
    })
    const owner = new AbortController()
    const pending = ctx.learningActivities.present({
      activity: parameterActivity(), agent, signal: owner.signal, timeoutMs: 1_000,
    })
    owner.abort()
    await expect(pending).resolves.toMatchObject({ action: 'cancel', interactionState: { reason: 'session-aborted' } })
    expect(ctx.learningActivities.pendingCount).toBe(0)
  })

  it('aborts every pending wait when the Host plugin is disposed', async () => {
    const ctx = await setup(true)
    const broker = ctx.learningActivities
    const agent = stubAgent('root-dispose')
    ctx.agents.enter(agent, undefined)
    ctx.userQuestions.registerProvider({
      ask: request => new Promise((_resolve, reject) => request.signal?.addEventListener('abort', () => {
        reject(new UserQuestionError('aborted', 'ASK_ABORTED'))
      }, { once: true })),
    })
    const pending = broker.present({ activity: parameterActivity(), agent, timeoutMs: 1_000 })
    expect(broker.pendingCount).toBe(1)
    await ctx.fiber.dispose()
    await expect(pending).resolves.toMatchObject({ action: 'cancel', interactionState: { reason: 'plugin-disposed' } })
    expect(broker.pendingCount).toBe(0)
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

  it('adds exactly one model tool through the Agent entry', async () => {
    const ctx = new Context()
    await ctx.plugin(AgentRegistry)
    await ctx.plugin(UserQuestionService)
    await ctx.plugin(ToolRuntime)
    await ctx.plugin(SystemPrompt)
    await ctx.plugin(LearningActivityBroker)
    await ctx.plugin(learningAgent)
    expect(ctx.tools.schemas().map(tool => tool.name)).toEqual(['learning_activity'])
  })

  it('carries one model tool call through the Host wait and returns the canonical learner response', async () => {
    const ctx = await setup(true)
    await ctx.plugin(ToolRuntime)
    await ctx.plugin(SystemPrompt)
    await ctx.plugin(learningAgent)
    const agent = stubAgent('root')
    ctx.agents.enter(agent, undefined)
    let activityId = ''
    ctx.userQuestions.registerProvider({
      async ask(request) {
        const envelope = decodeLearningDetail(request.questions[0]?.detail)
        if (envelope === undefined) throw new Error('missing learning envelope')
        activityId = envelope.activityId
        return {
          answers: [{
            id: request.questions[0]?.id ?? '',
            selected: [],
            custom: JSON.stringify({
              protocol: RESPONSE_PROTOCOL,
              activityId,
              action: 'submit',
              answer: { parameters: { slope: -2 }, explanation: 'The direction flips.' },
              interactionState: { parameters: { slope: -2 } },
            }),
          }],
        }
      },
    })

    const result = await ctx.tools.execute({
      callId: CallId('learning-call-1'),
      name: 'learning_activity',
      arguments: parameterActivity(),
      agent,
      signal: new AbortController().signal,
    })

    expect(result.isError).toBe(false)
    expect(result.value).toEqual({
      protocol: RESPONSE_PROTOCOL,
      activityId,
      action: 'submit',
      answer: { parameters: { slope: -2 }, explanation: 'The direction flips.' },
      interactionState: { parameters: { slope: -2 } },
    })
    expect(result.content).toEqual([{ type: 'text', text: JSON.stringify(result.value) }])
  })

  it('returns cancellation through the same model-visible tool result contract', async () => {
    const ctx = await setup(true)
    await ctx.plugin(ToolRuntime)
    await ctx.plugin(SystemPrompt)
    await ctx.plugin(learningAgent)
    const agent = stubAgent('root')
    ctx.agents.enter(agent, undefined)
    ctx.userQuestions.registerProvider({
      ask: () => Promise.reject(new UserQuestionError('cancelled', 'ASK_CANCELLED')),
    })

    const result = await ctx.tools.execute({
      callId: CallId('learning-call-cancelled'),
      name: 'learning_activity',
      arguments: parameterActivity(),
      agent,
      signal: new AbortController().signal,
    })

    expect(result).toMatchObject({
      isError: false,
      value: { protocol: RESPONSE_PROTOCOL, action: 'cancel' },
    })
    expect(JSON.parse((result.content[0] as { text: string }).text)).toEqual(result.value)
  })

  it('round-trips a mock model tool call, learner submission, and model continuation', async () => {
    const startMockLlmServer = await mockLlmServer()
    const activity = parameterActivity()
    const continuation = 'The negative slope now descends from left to right; apply that observation to y = -3x.'
    const server = await startMockLlmServer({
      host: '127.0.0.1',
      port: 0,
      apiKey: 'learning-e2e-key',
      sequence: ['tool_call_success', 'success'],
      successText: continuation,
      toolName: 'learning_activity',
      toolArguments: JSON.stringify(activity),
    })
    try {
      const first = await completion(server.baseURL, {
        model: 'deepseek-v4-flash',
        stream: true,
        messages: [{ role: 'user', content: 'Help me understand how the sign of slope changes a line.' }],
        tools: [{ type: 'function', function: { name: 'learning_activity', parameters: { type: 'object' } } }],
      })
      expect(first.toolCall).toMatchObject({ id: 'mock-call-1', name: 'learning_activity' })
      expect(JSON.parse(first.toolCall?.arguments ?? '')).toEqual(activity)

      const ctx = await setup(true)
      await ctx.plugin(ToolRuntime)
      await ctx.plugin(SystemPrompt)
      await ctx.plugin(learningAgent)
      const agent = stubAgent('root')
      ctx.agents.enter(agent, undefined)
      ctx.userQuestions.registerProvider({
        async ask(request) {
          const envelope = decodeLearningDetail(request.questions[0]?.detail)
          if (envelope === undefined) throw new Error('missing learning envelope')
          return {
            answers: [{
              id: request.questions[0]?.id ?? '',
              selected: [],
              custom: JSON.stringify({
                protocol: RESPONSE_PROTOCOL,
                activityId: envelope.activityId,
                action: 'submit',
                answer: { parameters: { slope: -2 }, explanation: 'It descends instead of rising.' },
              }),
            }],
          }
        },
      })
      const toolResult = await ctx.tools.execute({
        callId: CallId(first.toolCall?.id ?? ''),
        name: first.toolCall?.name ?? '',
        arguments: JSON.parse(first.toolCall?.arguments ?? ''),
        agent,
        signal: new AbortController().signal,
      })
      expect(toolResult.isError).toBe(false)

      const second = await completion(server.baseURL, {
        model: 'deepseek-v4-flash',
        stream: true,
        messages: [
          { role: 'user', content: 'Help me understand how the sign of slope changes a line.' },
          {
            role: 'assistant',
            content: null,
            tool_calls: [{
              id: first.toolCall?.id,
              type: 'function',
              function: { name: first.toolCall?.name, arguments: first.toolCall?.arguments },
            }],
          },
          { role: 'tool', tool_call_id: first.toolCall?.id, content: (toolResult.content[0] as { text: string }).text },
        ],
      })
      expect(second.text).toBe(continuation)
      expect(JSON.stringify(server.requests[1]?.body)).toContain('It descends instead of rising.')
    } finally {
      await server.close()
    }
  })
})
