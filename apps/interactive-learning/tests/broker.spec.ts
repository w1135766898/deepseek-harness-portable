import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import AgentRegistry, { type Agent } from '@deepseek-ai/dsh-agent'
import { CallId } from '@deepseek-ai/dsh-llm'
import UserQuestionService from '@deepseek-ai/dsh-user-questions'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import { LearningActivityBroker } from '../src/broker.ts'
import * as learningAgent from '../src/agent.ts'
import {
  VISUAL_PROTOCOL_V4,
  VISUAL_RESULT_PROTOCOL_V4,
} from '../src/protocol.ts'
import { parameterActivity, visualV4Catalog } from './fixtures.ts'

const testToolSignal = new AbortController().signal

function stubAgent(id: string): Agent {
  const agentId = id as Agent['id']
  return { id: agentId, session: { id: agentId, header: { delegationDepth: 0 } } } as unknown as Agent
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

describe('non-blocking Learning Agent v4', () => {
  it('exposes only learning_visual through a closed model schema', async () => {
    const ctx = await setupBroker(true)
    await ctx.plugin(ToolRuntime)
    await ctx.plugin(SystemPrompt)
    await ctx.plugin(learningAgent)

    const schemas = ctx.tools.schemas()
    expect(schemas.map(tool => tool.name)).toEqual(['learning_visual'])
    expect(JSON.stringify(schemas)).not.toContain('learning_question')
    expect(JSON.stringify(schemas)).not.toContain('learning_reveal')
    expect(JSON.stringify(schemas)).not.toContain('"additionalProperties":true')
    const parameters = schemas[0]?.parameters as {
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
    const completeSchema = JSON.stringify(schemas[0])
    for (const boundary of [
      '64 KiB', '1 to 32 characters', '1 to 8 series', '2 to 48 nodes', '1 to 160 edges',
      '1 to 64 scene elements', '2 to 32 events', '2 to 16 formula steps',
      '1 to 16 source sections', '1 to 48 concepts', '2 to 32 recall cards',
      '2 to 12 sequence frames', 'At most 64 unique ids',
    ]) expect(completeSchema).toContain(boundary)
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
})
