/**
 * Manual real-model canary for the Learning preset's first-turn routing and
 * progressive-disclosure teaching loop.
 *
 * This is still a small, provider-dependent canary rather than a statistical
 * teaching-quality benchmark. It deliberately exercises two model turns:
 *   1. an underspecified "learn X" request must elicit calibration;
 *   2. after the learner supplies level and goal, the model teaches one
 *      minimum concept, selects one visual kind, uses its narrowed schema,
 *      and returns to ordinary prose without another tool call.
 *
 * Required environment:
 *   DSH_CANARY_API_KEY
 * Optional environment:
 *   DSH_CANARY_BASE_URL (default: https://api.xiaomimimo.com/v1)
 *   DSH_CANARY_MODEL    (default: mimo-v2.5)
 *   DSH_CANARY_CAPTURE_PATH (optional JSON output consumable by eval-cli)
 */
import { writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { Context } from '@deepseek-ai/cordis'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import { CallId } from '@deepseek-ai/dsh-llm'
import UserQuestionService from '@deepseek-ai/dsh-user-questions'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import SystemPrompt, { renderPrompt } from '@deepseek-ai/dsh-system-prompt'
import { LearningActivityBroker } from '../src/broker.ts'
import * as learningAgent from '../src/agent.ts'
import {
  TEACHING_EVAL_CASES,
  gradeTeachingCandidate,
  type TeachingEvalCandidate,
} from '../src/eval.ts'
import { routeLearningRequest } from '../src/teaching-route.ts'
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

interface ModelToolSchema {
  name: string
  description: string
  parameters: unknown
}

const apiKey = process.env.DSH_CANARY_API_KEY?.trim()
if (apiKey === undefined || apiKey === '') throw new Error('DSH_CANARY_API_KEY is required')
const baseUrl = (process.env.DSH_CANARY_BASE_URL ?? 'https://api.xiaomimimo.com/v1').replace(/\/$/, '')
const model = process.env.DSH_CANARY_MODEL ?? 'mimo-v2.5'

const ctx = new Context()
await ctx.plugin(AgentRegistry)
await ctx.plugin(UserQuestionService)
// The canary asserts the rendered path, so it must advertise the Learning
// Client the way a real Web composition does; without it learning_visual
// correctly reports that nothing was rendered.
ctx.provide('clientModules', {
  graph: () => ({
    rev: 'canary',
    entries: [{ id: '@dsh-portable/interactive-learning', url: '/client.js', rev: 'canary' }],
  }),
} as never)
await ctx.plugin(ToolRuntime)
await ctx.plugin(SystemPrompt)
await ctx.plugin(LearningActivityBroker)
await ctx.plugin(learningAgent)

const visualToolNames = new Set(['learning_visual_select', 'learning_visual'])

function modelTools(): ModelToolSchema[] {
  return ctx.tools.schemas()
    .filter(schema => visualToolNames.has(schema.name))
    .map(schema => ({
      name: schema.name,
      description: schema.description,
      parameters: schema.parameters,
    }))
}

const initialCatalog = modelTools().map(tool => tool.name)
if (!initialCatalog.includes('learning_visual_select') || initialCatalog.includes('learning_visual')) {
  throw new Error(`initial Learning catalog must expose only the visual selector, received ${initialCatalog.join(', ')}`)
}

const assembledPrompt = await ctx.systemPrompt.assemble()
const renderedPrompt = renderPrompt(assembledPrompt)
const messages: ChatMessage[] = [
  { role: 'system', content: renderedPrompt },
  { role: 'user', content: 'Learn logistic regression.' },
]

async function nextAssistant(): Promise<ChatMessage> {
  const tools = modelTools().map(tool => ({
    type: 'function' as const,
    function: { name: tool.name, description: tool.description, parameters: tool.parameters },
  }))
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

function textOf(message: ChatMessage): string {
  return message.content?.trim() ?? ''
}

function countQuestionMarks(value: string): number {
  return [...value].filter(character => character === '?' || character === '？').length
}

function containsOp(value: unknown, expected: string): boolean {
  if (Array.isArray(value)) return value.some(item => containsOp(item, expected))
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>
  return record.op === expected || Object.values(record).some(item => containsOp(item, expected))
}

function parseToolArguments(call: ToolCall): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(call.function.arguments)
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new TypeError('arguments must be an object')
    }
    return parsed as Record<string, unknown>
  } catch (cause) {
    throw new Error(`model emitted invalid ${call.function.name} arguments`, { cause })
  }
}

function validateCanaryVisual(call: ToolCall): LearningVisualV4 {
  if (call.function.name !== 'learning_visual') {
    throw new Error(`expected learning_visual after the selector, received ${call.function.name}`)
  }
  let visual: LearningVisualV4
  try {
    visual = parseLearningVisualV4(parseToolArguments(call))
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

function contentFromResult(result: { content: Array<{ type: string; text?: string }> }): string {
  return result.content
    .filter(item => item.type === 'text')
    .map(item => item.text ?? '')
    .join('')
}

const routeDecision = routeLearningRequest('Learn logistic regression.')
if (routeDecision.route !== 'calibrate') {
  throw new Error(`route helper regressed: expected calibrate, received ${routeDecision.route}`)
}

const calibration = await nextAssistant()
if ((calibration.tool_calls ?? []).length !== 0) {
  throw new Error('underspecified learning request triggered a tool before calibration')
}
if (countQuestionMarks(textOf(calibration)) !== 1) {
  throw new Error(`underspecified learning request must ask exactly one calibration question: ${textOf(calibration)}`)
}
messages.push(calibration)
messages.push({
  role: 'user',
  content: [
    'I am a complete beginner and want the minimum concept first.',
    'Explain why logistic regression uses a sigmoid instead of a straight line.',
    'Use exactly one plot visual to show observed 0/1 points beside the sigmoid curve, with adjustable intercept and slope and a -intercept/slope decision-boundary metric.',
    'After the visual result, explain it in concise ordinary text and ask at most one focused question. Do not call learning_state_update in this canary.',
  ].join(' '),
})

let assistant = await nextAssistant()
messages.push(assistant)
let selectorCall: ToolCall | undefined
let visualCall: ToolCall | undefined
let visual: LearningVisualV4 | undefined
let visualResult: unknown

for (let step = 0; step < 4; step += 1) {
  const calls = assistant.tool_calls ?? []
  if (calls.length === 0) break
  if (calls.length !== 1) throw new Error(`expected one teaching tool call per model step, received ${String(calls.length)}`)
  const call = calls[0]!
  if (call.function.name === 'learning_visual_select') {
    if (selectorCall !== undefined) throw new Error('model selected more than one visual')
    selectorCall = call
    const selection = parseToolArguments(call)
    if (selection.kind !== 'plot') {
      throw new Error(`canary model selected ${String(selection.kind)}; expected plot for this relationship`)
    }
    const selected = await ctx.tools.execute({
      signal: new AbortController().signal,
      callId: CallId(call.id),
      name: call.function.name,
      arguments: selection,
    })
    if (selected.isError || (selected.value as { status?: unknown } | undefined)?.status !== 'selected') {
      throw new Error(`learning_visual_select failed: ${JSON.stringify(selected)}`)
    }
    messages.push({
      role: 'tool',
      tool_call_id: call.id,
      content: contentFromResult(selected),
    })
    const exposed = modelTools().map(tool => tool.name)
    if (!exposed.includes('learning_visual') || exposed.filter(name => name === 'learning_visual').length !== 1) {
      throw new Error(`selector did not expose exactly one visual payload schema: ${exposed.join(', ')}`)
    }
    assistant = await nextAssistant()
    messages.push(assistant)
    continue
  }
  if (call.function.name === 'learning_visual') {
    if (selectorCall === undefined) throw new Error('model called the full visual schema before selecting a kind')
    if (visualCall !== undefined) throw new Error('model called learning_visual more than once')
    visualCall = call
    visual = validateCanaryVisual(call)
    const result = await ctx.tools.execute({
      signal: new AbortController().signal,
      callId: CallId(call.id),
      name: call.function.name,
      arguments: parseToolArguments(call),
    })
    const expectedResult = { protocol: VISUAL_RESULT_PROTOCOL_V4, status: 'ready' }
    if (result.isError || JSON.stringify(result.value) !== JSON.stringify(expectedResult)) {
      throw new Error(`learning_visual did not return the immediate ready result: ${JSON.stringify(result)}`)
    }
    if (ctx.learningActivities.pendingCount !== 0) {
      throw new Error('learning_visual incorrectly created a pending user-question wait')
    }
    visualResult = expectedResult
    messages.push({
      role: 'tool',
      tool_call_id: call.id,
      content: contentFromResult(result),
    })
    assistant = await nextAssistant()
    messages.push(assistant)
    break
  }
  throw new Error(`unexpected canary tool call: ${call.function.name}`)
}

if (selectorCall === undefined || visualCall === undefined || visual === undefined) {
  throw new Error('the beginner teaching turn did not complete selector → visual progressive disclosure')
}
if ((assistant.tool_calls ?? []).length !== 0) {
  throw new Error(`expected ordinary text after the ready result, received ${(assistant.tool_calls ?? []).length} extra tool call(s)`)
}
if (textOf(assistant) === '') {
  throw new Error('model did not provide the ordinary-text interpretation after the visual')
}

const capture: TeachingEvalCandidate = {
  caseId: 'parameter-relationship',
  activityKind: 'plot',
  continuation: assistant.content ?? '',
  endedSegment: false,
}
const teachingScenario = TEACHING_EVAL_CASES.find(item => item.id === capture.caseId)
if (teachingScenario === undefined) throw new Error('parameter-relationship teaching scenario is missing')
const teachingVerdict = gradeTeachingCandidate(teachingScenario, capture)
if (!teachingVerdict.passed) {
  throw new Error(`real-model canary failed the deterministic teaching rubric: ${JSON.stringify(teachingVerdict.checks)}`)
}

const capturePath = process.env.DSH_CANARY_CAPTURE_PATH?.trim()
if (capturePath !== undefined && capturePath !== '') {
  const artifact = {
    ...capture,
    provenance: {
      evidence: 'real-model-canary',
      model,
      capturedAt: new Date().toISOString(),
      promptSha256: createHash('sha256')
        .update(JSON.stringify(messages), 'utf8')
        .digest('hex'),
      grader: 'gradeTeachingCandidate@v4.1',
      scope: 'two-turn route → minimum teaching → lazy visual schema canary; not a statistical teaching-quality result',
    },
    rawTranscript: messages,
    observedToolExecution: {
      selector: { name: selectorCall.function.name, arguments: parseToolArguments(selectorCall) },
      visual: { name: visualCall.function.name, arguments: visual },
      result: visualResult,
      pendingCount: ctx.learningActivities.pendingCount,
    },
  }
  await writeFile(capturePath, JSON.stringify([artifact], undefined, 2) + '\n', 'utf8')
}

console.log(JSON.stringify({
  passed: true,
  evidence: 'real-model-canary',
  scope: 'two-turn route → minimum teaching → lazy visual schema; not a statistical teaching-quality result',
  model,
  route: routeDecision,
  calibrationQuestion: calibration.content,
  selector: selectorCall.function.name,
  visual: visual.content.kind,
  result: visualResult,
  series: visual.content.kind === 'plot' ? visual.content.series.map(series => series.type) : [],
  metrics: visual.content.kind === 'plot' ? visual.content.metrics?.map(metric => metric.id) : [],
  followUp: assistant.content,
  teachingVerdict,
  ...(capturePath === undefined || capturePath === '' ? {} : { capturePath }),
}, null, 2))

await ctx.fiber.dispose()
