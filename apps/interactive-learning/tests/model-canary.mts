/**
 * Manual real-model canary for the Learning preset.
 *
 * This is a small provider-dependent matrix, not a statistical teaching
 * benchmark. It checks the boundary that is easy to regress in prompting:
 * learn intent, bare concepts, confusion repair, expert terminology, current
 * topics, opening deadlines versus later impatience, self-study versus graded
 * work, requested study resources, representation changes, fresh transfer,
 * and one real semantic visual path.
 *
 * Required environment: DSH_CANARY_API_KEY
 * Optional: DSH_CANARY_BASE_URL, DSH_CANARY_MODEL, DSH_CANARY_CAPTURE_PATH
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
  LEARNING_CANARY_MATRIX,
  TEACHING_EVAL_CASES,
  gradeTeachingCandidate,
  type LearningCanaryScenario,
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

interface CanaryCheck {
  name: string
  passed: boolean
  detail: string
}

interface CanaryScenarioResult {
  id: string
  route: ReturnType<typeof routeLearningRequest>
  responses: string[]
  checks: CanaryCheck[]
  passed: boolean
  rawTranscript: ChatMessage[]
}

const apiKey = process.env.DSH_CANARY_API_KEY?.trim()
if (apiKey === undefined || apiKey === '') throw new Error('DSH_CANARY_API_KEY is required')
const baseUrl = (process.env.DSH_CANARY_BASE_URL ?? 'https://api.xiaomimimo.com/v1').replace(/\/$/, '')
const model = process.env.DSH_CANARY_MODEL ?? 'mimo-v2.5'

const ctx = new Context()
await ctx.plugin(AgentRegistry)
await ctx.plugin(UserQuestionService)
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
    .map(schema => ({ name: schema.name, description: schema.description, parameters: schema.parameters }))
}

const initialCatalog = modelTools().map(tool => tool.name)
if (!initialCatalog.includes('learning_visual_select') || initialCatalog.includes('learning_visual')) {
  throw new Error(`initial Learning catalog must expose only the visual selector, received ${initialCatalog.join(', ')}`)
}

const assembledPrompt = await ctx.systemPrompt.assemble()
const renderedPrompt = renderPrompt(assembledPrompt)

function textOf(message: ChatMessage): string {
  return message.content?.trim() ?? ''
}

function countQuestionMarks(value: string): number {
  return [...value].filter(character => character === '?' || character === '？').length
}

function lower(value: string): string {
  return value.toLocaleLowerCase('en-US')
}

function includesAny(value: string, terms: readonly string[]): boolean {
  const text = lower(value)
  return terms.some(term => text.includes(lower(term)))
}

function addCheck(checks: CanaryCheck[], name: string, passed: boolean, detail: string): void {
  checks.push({ name, passed, detail })
}

function canaryMessages(prompt: string): ChatMessage[] {
  return [
    { role: 'system', content: renderedPrompt },
    { role: 'user', content: prompt },
  ]
}

async function nextAssistant(messages: ChatMessage[]): Promise<ChatMessage> {
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

function validateMatrixScenario(
  scenario: LearningCanaryScenario,
  route: ReturnType<typeof routeLearningRequest>,
  responses: readonly string[],
  toolCalls: readonly ToolCall[],
): CanaryCheck[] {
  const checks: CanaryCheck[] = []
  addCheck(checks, 'intent', route.intent.intent === scenario.expectedIntent, `expected ${scenario.expectedIntent}, received ${route.intent.intent}`)
  addCheck(checks, 'trigger', route.intent.trigger === scenario.expectedTrigger, `expected ${scenario.expectedTrigger}, received ${route.intent.trigger}`)
  addCheck(checks, 'route', route.route === scenario.expectedRoute, `expected ${scenario.expectedRoute}, received ${route.route}`)
  addCheck(checks, 'ordinary-text-path', toolCalls.length === 0, `expected no visual tool calls, received ${String(toolCalls.length)}`)

  const first = responses[0] ?? ''
  const last = responses.at(-1) ?? ''
  switch (scenario.responseShape) {
    case 'calibration':
      addCheck(checks, 'one-calibration-question', countQuestionMarks(first) === 1, 'a bare concept should get one route-changing question')
      addCheck(checks, 'calibration-is-not-empty', first !== '', 'calibration must still provide a useful first turn')
      break
    case 'repair':
      addCheck(checks, 'names-confused-concepts', includesAny(first, ['precision']) && includesAny(first, ['recall']), 'repair should name both sides of the reported confusion')
      addCheck(checks, 'repair-question-limit', countQuestionMarks(first) <= 1, 'repair should ask at most one focused question')
      break
    case 'expert-calibration':
      addCheck(checks, 'uses-expert-terms', includesAny(first, ['heteroskedastic', 'ordered probit', 'probit']), 'expert terminology should be preserved while the model calibrates')
      addCheck(checks, 'expert-question-limit', countQuestionMarks(first) <= 1, 'expert calibration should stay brief')
      break
    case 'current-overview':
      addCheck(checks, 'covers-the-contrast', includesAny(first, ['open']) && includesAny(first, ['closed']), 'the overview should preserve the contested contrast')
      addCheck(checks, 'overview-is-substantive', first.length >= 120, 'a requested topic overview should not be only a calibration question')
      break
    case 'urgent-direct':
      addCheck(checks, 'urgent-response-is-substantive', first.length >= 80, 'an opening deadline or later impatience needs useful direct help')
      addCheck(checks, 'urgent-response-not-a-questionnaire', countQuestionMarks(first) <= 1, 'pressure should not trigger a diagnostic interview')
      if (responses.length > 1) {
        addCheck(checks, 'impatience-keeps-a-foothold', includesAny(last, ['slope', 'negative', 'down', 'point']), 'mid-lesson impatience should get a narrowed foothold or parallel step')
      }
      break
    case 'self-study-direct':
      addCheck(checks, 'self-study-gets-help', includesAny(first, ['transaction', 'rollback']), 'self-study should receive the requested explanation')
      addCheck(checks, 'self-study-not-refused', !includesAny(first, ['cannot help with', 'i can\'t help', 'not allowed']), 'self-study should not receive an unnecessary integrity refusal')
      break
    case 'graded-boundary':
      addCheck(checks, 'graded-boundary-visible', includesAny(first, ['parallel', 'your case', 'try', 'reason', 'choose']), 'assessed work should be redirected to reasoning or a parallel example')
      addCheck(checks, 'no-final-answer-language', !/(?:\b(?:the\s+)?answer\s+is\b|\bsubmit\s+this\b|(?:^|\n)\s*(?:final\s+answer|answer|solution)\s*:)/i.test(first), 'graded work must not receive a final-answer dump')
      break
    case 'flashcards':
      addCheck(checks, 'flashcards-produced', includesAny(first, ['flashcard', 'q:', 'question']) || countQuestionMarks(first) >= 3, 'the requested recall cards should be produced directly')
      addCheck(checks, 'multiple-cards', countQuestionMarks(first) >= 3 || (first.match(/\b(?:card|q\.?)[\s#\d]*/gi)?.length ?? 0) >= 3, 'the resource should contain several retrieval prompts')
      break
    case 'study-guide':
      addCheck(checks, 'study-guide-produced', includesAny(first, ['derivative', 'limit']) && includesAny(first, ['power rule', 'power']), 'the requested sequence should be present')
      addCheck(checks, 'study-guide-structured', first.length >= 140, 'a study guide should have a usable structure')
      break
    case 'fresh-transfer-stop':
      addCheck(checks, 'second-turn-is-new', responses.length > 1 && responses[1] !== first, 'the repair turn must not repeat the same explanation text')
      addCheck(checks, 'new-representation', includesAny(responses[1] ?? '', ['analogy', 'picture', 'concrete', 'contrast', 'example', 'different', 'queue', 'line', 'arrival']), 'the learner requested a changed representation')
      addCheck(checks, 'fresh-transfer-named', includesAny(last, ['complete', 'transfer', 'y, z', 'fifo']), 'the closing turn should recognize the fresh application')
      addCheck(checks, 'no-post-transfer-question', countQuestionMarks(last) === 0, 'fresh transfer is the stop condition')
      break
  }
  return checks
}

async function runMatrixScenario(scenario: LearningCanaryScenario): Promise<CanaryScenarioResult> {
  const route = routeLearningRequest(scenario.prompt)
  const messages = canaryMessages(`${scenario.prompt}\n\nFor this canary case, use ordinary text and do not call a visual tool.`)
  const responses: string[] = []
  const toolCalls: ToolCall[] = []
  const turns = [scenario.prompt, ...(scenario.followUps ?? [])]
  for (let index = 0; index < turns.length; index += 1) {
    const assistant = await nextAssistant(messages)
    responses.push(textOf(assistant))
    toolCalls.push(...(assistant.tool_calls ?? []))
    messages.push(assistant)
    const nextUser = turns[index + 1]
    if (nextUser !== undefined) messages.push({ role: 'user', content: nextUser })
  }
  const checks = validateMatrixScenario(scenario, route, responses, toolCalls)
  return {
    id: scenario.id,
    route,
    responses,
    checks,
    passed: checks.every(check => check.passed),
    rawTranscript: messages,
  }
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
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) throw new TypeError('arguments must be an object')
    return parsed as Record<string, unknown>
  } catch (cause) {
    throw new Error(`model emitted invalid ${call.function.name} arguments`, { cause })
  }
}

function contentFromResult(result: { content: Array<{ type: string; text?: string }> }): string {
  return result.content.filter(item => item.type === 'text').map(item => item.text ?? '').join('')
}

function validateCanaryVisual(call: ToolCall): LearningVisualV4 {
  if (call.function.name !== 'learning_visual') throw new Error(`expected learning_visual after the selector, received ${call.function.name}`)
  let visual: LearningVisualV4
  try { visual = parseLearningVisualV4(parseToolArguments(call)) } catch (cause) { throw new Error('model emitted an invalid learning_visual payload', { cause }) }
  if (visual.content.kind !== 'plot') throw new Error(`canary visual must use plot content, received ${visual.content.kind}`)
  const curves = visual.content.series.filter(series => series.type === 'curve')
  if (!curves.some(curve => containsOp(curve.expression, 'sigmoid'))) throw new Error('canary visual must contain a nested sigmoid curve expression')
  if (!visual.content.series.some(series => series.type === 'points')) throw new Error('canary visual must contain a static point series')
  if (visual.content.metrics === undefined || visual.content.metrics.length === 0) throw new Error('canary visual must contain a decision-boundary metric')
  return visual
}

async function runVisualScenario(): Promise<{
  messages: ChatMessage[]
  visual: LearningVisualV4
  selector: ToolCall
  visualCall: ToolCall
  result: unknown
  teachingVerdict: ReturnType<typeof gradeTeachingCandidate>
}> {
  const messages: ChatMessage[] = [
    { role: 'system', content: renderedPrompt },
    { role: 'user', content: 'Learn logistic regression.' },
  ]
  const route = routeLearningRequest('Learn logistic regression.')
  if (route.route !== 'calibrate') throw new Error(`route helper regressed: expected calibrate, received ${route.route}`)
  let assistant = await nextAssistant(messages)
  if ((assistant.tool_calls ?? []).length !== 0 || countQuestionMarks(textOf(assistant)) !== 1) {
    throw new Error(`underspecified learning request must ask exactly one calibration question: ${textOf(assistant)}`)
  }
  messages.push(assistant)
  messages.push({
    role: 'user',
    content: [
      'I am a complete beginner and want the minimum concept first.',
      'Explain why logistic regression uses a sigmoid instead of a straight line.',
      'Use exactly one plot visual to show observed 0/1 points beside the sigmoid curve, with adjustable intercept and slope and a -intercept/slope decision-boundary metric.',
      'Bind the selector to the learner action of comparing one observed point with the curve and to one paired question. After the visual result, explain it in concise ordinary text and ask at most one focused question. Do not call learning_state_update in this canary.',
    ].join(' '),
  })

  let selector: ToolCall | undefined
  let visualCall: ToolCall | undefined
  let visual: LearningVisualV4 | undefined
  let resultValue: unknown
  for (let step = 0; step < 4; step += 1) {
    assistant = await nextAssistant(messages)
    const calls = assistant.tool_calls ?? []
    if (calls.length === 0) break
    if (calls.length !== 1) throw new Error(`expected one teaching tool call per model step, received ${String(calls.length)}`)
    const call = calls[0]!
    if (call.function.name === 'learning_visual_select') {
      if (selector !== undefined) throw new Error('model selected more than one visual')
      selector = call
      const selection = parseToolArguments(call)
      if (selection.kind !== 'plot') throw new Error(`canary model selected ${String(selection.kind)}; expected plot`)
      if (typeof selection.learnerAction !== 'string' && typeof selection.pairedQuestion !== 'string') throw new Error('visual selector did not include learnerAction or pairedQuestion')
      const selected = await ctx.tools.execute({
        signal: new AbortController().signal,
        callId: CallId(call.id),
        name: call.function.name,
        arguments: selection,
      })
      if (selected.isError || (selected.value as { status?: unknown } | undefined)?.status !== 'selected') throw new Error(`learning_visual_select failed: ${JSON.stringify(selected)}`)
      messages.push({ role: 'assistant', content: assistant.content, tool_calls: assistant.tool_calls })
      messages.push({ role: 'tool', tool_call_id: call.id, content: contentFromResult(selected) })
      const exposed = modelTools().map(tool => tool.name)
      if (!exposed.includes('learning_visual') || exposed.filter(name => name === 'learning_visual').length !== 1) throw new Error(`selector did not expose exactly one visual payload schema: ${exposed.join(', ')}`)
      continue
    }
    if (call.function.name === 'learning_visual') {
      if (selector === undefined) throw new Error('model called the full visual schema before selecting a kind')
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
      if (result.isError || JSON.stringify(result.value) !== JSON.stringify(expectedResult)) throw new Error(`learning_visual did not return the immediate ready result: ${JSON.stringify(result)}`)
      if (ctx.learningActivities.pendingCount !== 0) throw new Error('learning_visual incorrectly created a pending user-question wait')
      resultValue = expectedResult
      messages.push({ role: 'assistant', content: assistant.content, tool_calls: assistant.tool_calls })
      messages.push({ role: 'tool', tool_call_id: call.id, content: contentFromResult(result) })
      assistant = await nextAssistant(messages)
      messages.push(assistant)
      break
    }
    throw new Error(`unexpected canary tool call: ${call.function.name}`)
  }
  if (selector === undefined || visualCall === undefined || visual === undefined) throw new Error('visual case did not complete selector → visual progressive disclosure')
  if ((assistant.tool_calls ?? []).length !== 0 || textOf(assistant) === '') throw new Error('visual case did not return ordinary text after the ready result')
  const capture: TeachingEvalCandidate = { caseId: 'parameter-relationship', activityKind: 'plot', continuation: assistant.content ?? '', endedSegment: false }
  const scenario = TEACHING_EVAL_CASES.find(item => item.id === capture.caseId)
  if (scenario === undefined) throw new Error('parameter-relationship teaching scenario is missing')
  const teachingVerdict = gradeTeachingCandidate(scenario, capture)
  if (!teachingVerdict.passed) throw new Error(`real-model visual case failed the deterministic rubric: ${JSON.stringify(teachingVerdict.checks)}`)
  return { messages, visual, selector, visualCall, result: resultValue, teachingVerdict }
}

const matrixResults: CanaryScenarioResult[] = []
for (const scenario of LEARNING_CANARY_MATRIX) {
  const result = await runMatrixScenario(scenario)
  matrixResults.push(result)
  if (!result.passed) throw new Error(`real-model canary failed ${scenario.id}: ${JSON.stringify(result.checks.filter(check => !check.passed))}`)
}
const visualResult = await runVisualScenario()

const capturePath = process.env.DSH_CANARY_CAPTURE_PATH?.trim()
if (capturePath !== undefined && capturePath !== '') {
  const artifact = {
    caseId: 'parameter-relationship',
    activityKind: 'plot',
    continuation: visualResult.messages.at(-1)?.content ?? '',
    endedSegment: false,
    provenance: {
      evidence: 'real-model-canary',
      model,
      capturedAt: new Date().toISOString(),
      promptSha256: createHash('sha256').update(JSON.stringify({ matrix: matrixResults, visual: visualResult.messages }), 'utf8').digest('hex'),
      grader: 'gradeTeachingCandidate@v4.1 plus learning-canary-matrix@1',
      scope: 'learn intent matrix plus selector → visual → ordinary prose; not a statistical teaching-quality result',
    },
    matrix: matrixResults,
    rawTranscript: visualResult.messages,
    observedToolExecution: {
      selector: { name: visualResult.selector.function.name, arguments: parseToolArguments(visualResult.selector) },
      visual: { name: visualResult.visualCall.function.name, arguments: visualResult.visual },
      result: visualResult.result,
      pendingCount: ctx.learningActivities.pendingCount,
    },
  }
  await writeFile(capturePath, JSON.stringify([artifact], undefined, 2) + '\n', 'utf8')
}

console.log(JSON.stringify({
  passed: true,
  evidence: 'real-model-canary',
  scope: 'learn intent matrix plus selector → visual → ordinary prose; not a statistical teaching-quality result',
  model,
  scenarios: matrixResults.map(result => ({ id: result.id, passed: result.passed, route: result.route, checks: result.checks })),
  visual: {
    selector: visualResult.selector.function.name,
    kind: visualResult.visual.content.kind,
    result: visualResult.result,
    series: visualResult.visual.content.kind === 'plot' ? visualResult.visual.content.series.map(series => series.type) : [],
    metrics: visualResult.visual.content.kind === 'plot' ? visualResult.visual.content.metrics?.map(metric => metric.id) : [],
    teachingVerdict: visualResult.teachingVerdict,
  },
  ...(capturePath === undefined || capturePath === '' ? {} : { capturePath }),
}, null, 2))

await ctx.fiber.dispose()
