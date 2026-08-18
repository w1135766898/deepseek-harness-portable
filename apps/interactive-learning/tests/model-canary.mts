/**
 * Manual real-model canary for the semantic, non-blocking V4 learning_visual contract.
 *
 * Required environment:
 *   DSH_CANARY_API_KEY
 * Optional environment:
 *   DSH_CANARY_BASE_URL (default: https://api.xiaomimimo.com/v1)
 *   DSH_CANARY_MODEL    (default: mimo-v2.5)
 */
import { Context } from '@deepseek-ai/cordis'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import { CallId } from '@deepseek-ai/dsh-llm'
import UserQuestionService from '@deepseek-ai/dsh-user-questions'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import SystemPrompt, { renderPrompt } from '@deepseek-ai/dsh-system-prompt'
import { LearningActivityBroker } from '../src/broker.ts'
import * as learningAgent from '../src/agent.ts'
import {
  VISUAL_RESULT_PROTOCOL_V4,
  parseLearningVisualV4,
  type LearningVisualV4,
} from '../src/protocol.ts'

interface ToolCall {
  id: string
  type: 'function'
  function: { name: string; arguments: string }
}

interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | null
  tool_call_id?: string
  tool_calls?: ToolCall[]
}

interface ChatResponse {
  choices?: Array<{ message?: ChatMessage }>
  error?: { message?: string }
}

const apiKey = process.env.DSH_CANARY_API_KEY?.trim()
if (apiKey === undefined || apiKey === '') throw new Error('DSH_CANARY_API_KEY is required')
const baseUrl = (process.env.DSH_CANARY_BASE_URL ?? 'https://api.xiaomimimo.com/v1').replace(/\/$/, '')
const model = process.env.DSH_CANARY_MODEL ?? 'mimo-v2.5'

const ctx = new Context()
await ctx.plugin(AgentRegistry)
await ctx.plugin(UserQuestionService)
await ctx.plugin(ToolRuntime)
await ctx.plugin(SystemPrompt)
await ctx.plugin(LearningActivityBroker)
await ctx.plugin(learningAgent)

const schemas = ctx.tools.schemas()
if (schemas.length !== 1 || schemas[0]?.name !== 'learning_visual') {
  throw new Error(`expected only learning_visual, received ${schemas.map(schema => schema.name).join(', ')}`)
}
const tools = schemas.map(schema => ({
  type: 'function' as const,
  function: { name: schema.name, description: schema.description, parameters: schema.parameters },
}))
const assembledPrompt = await ctx.systemPrompt.assemble()
const messages: ChatMessage[] = [
  { role: 'system', content: renderPrompt(assembledPrompt) },
  {
    role: 'user',
    content: [
      'Teach me why logistic regression needs a sigmoid instead of a straight line.',
      'Use learning_visual exactly once to show observed 0/1 points beside a sigmoid curve.',
      'Include adjustable intercept and slope, and a metric for the decision boundary -intercept/slope.',
      'After the tool result, continue with a concise ordinary-text interpretation and then finish; do not call another tool.',
    ].join(' '),
  },
]

async function nextAssistant(): Promise<ChatMessage> {
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({ model, messages, tools, tool_choice: 'auto' }),
  })
  const body = await response.json() as ChatResponse
  if (!response.ok) {
    throw new Error(`canary provider returned ${String(response.status)}: ${body.error?.message ?? 'unknown error'}`)
  }
  const assistant = body.choices?.[0]?.message
  if (assistant === undefined) throw new Error('canary provider returned no assistant message')
  return assistant
}

function containsOp(value: unknown, expected: string): boolean {
  if (Array.isArray(value)) return value.some(item => containsOp(item, expected))
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>
  return record.op === expected || Object.values(record).some(item => containsOp(item, expected))
}

function validateCanaryVisual(call: ToolCall): LearningVisualV4 {
  if (call.function.name !== 'learning_visual') {
    throw new Error(`expected learning_visual, received ${call.function.name}`)
  }
  let visual: LearningVisualV4
  try {
    visual = parseLearningVisualV4(JSON.parse(call.function.arguments))
  } catch (cause) {
    throw new Error('model emitted an invalid learning_visual payload', { cause })
  }
  if (visual.content.kind !== 'plot') {
    throw new Error(`canary visual must use plot content, received ${visual.content.kind}`)
  }
  const curves = visual.content.series.filter(series => series.type === 'curve')
  if (!curves.some(curve => containsOp(curve.expression, 'sigmoid'))) {
    throw new Error('canary visual must contain a nested sigmoid curve expression')
  }
  if (!visual.content.series.some(series => series.type === 'points')) {
    throw new Error('canary visual must contain a static point series')
  }
  if (visual.content.metrics === undefined || visual.content.metrics.length === 0) {
    throw new Error('canary visual must contain a decision-boundary metric')
  }
  return visual
}

const first = await nextAssistant()
const calls = first.tool_calls ?? []
if (calls.length !== 1) {
  throw new Error(`expected exactly one learning_visual call, received ${String(calls.length)}`)
}
const call = calls[0]!
const visual = validateCanaryVisual(call)
messages.push(first)

const result = await ctx.tools.execute({
  signal: new AbortController().signal,
  callId: CallId(call.id),
  name: call.function.name,
  arguments: visual,
})
const expectedResult = { protocol: VISUAL_RESULT_PROTOCOL_V4, status: 'ready' }
if (result.isError || JSON.stringify(result.value) !== JSON.stringify(expectedResult)) {
  throw new Error(`learning_visual did not return the immediate ready result: ${JSON.stringify(result)}`)
}
if (ctx.learningActivities.pendingCount !== 0) {
  throw new Error('learning_visual incorrectly created a pending user-question wait')
}
messages.push({
  role: 'tool',
  tool_call_id: call.id,
  content: result.content.filter(item => item.type === 'text').map(item => item.text).join(''),
})

const followUp = await nextAssistant()
if ((followUp.tool_calls ?? []).length !== 0) {
  throw new Error(`expected ordinary text after the ready result, received ${(followUp.tool_calls ?? []).length} extra tool call(s)`)
}
if ((followUp.content?.trim() ?? '') === '') {
  throw new Error('model did not provide the ordinary-text interpretation after the visual')
}
messages.push(followUp)

console.log(JSON.stringify({
  passed: true,
  model,
  tool: 'learning_visual',
  result: expectedResult,
  series: visual.content.kind === 'plot' ? visual.content.series.map(series => series.type) : [],
  metrics: visual.content.kind === 'plot' ? visual.content.metrics?.map(metric => metric.id) : [],
  followUp: followUp.content,
}, null, 2))

await ctx.fiber.dispose()
