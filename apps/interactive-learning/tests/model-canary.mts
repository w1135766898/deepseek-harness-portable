/**
 * Manual real-model canary for the V2 Question -> Reveal -> Question contract.
 *
 * Required environment:
 *   DSH_CANARY_API_KEY
 * Optional environment:
 *   DSH_CANARY_BASE_URL (default: https://api.xiaomimimo.com/v1)
 *   DSH_CANARY_MODEL    (default: mimo-v2.5)
 */
import { Context } from '@deepseek-ai/cordis'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import UserQuestionService from '@deepseek-ai/dsh-user-questions'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import SystemPrompt, { renderPrompt } from '@deepseek-ai/dsh-system-prompt'
import { LearningActivityBroker } from '../src/broker.ts'
import * as learningAgent from '../src/agent.ts'
import {
  RESPONSE_PROTOCOL_V2,
  parseLearningActivityV2,
  type LearningActivityV2,
} from '../src/protocol.ts'
import { gradeLearningTranscript, type LearningTranscriptEvent } from '../src/eval.ts'

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

const tools = ctx.tools.schemas().map(schema => ({
  type: 'function' as const,
  function: { name: schema.name, description: schema.description, parameters: schema.parameters },
}))
const assembledPrompt = await ctx.systemPrompt.assemble()
const messages: ChatMessage[] = [
  { role: 'system', content: renderPrompt(assembledPrompt) },
  {
    role: 'user',
    content: [
      'Teach me queue FIFO using the interactive learning gates.',
      'Begin with exactly one learning_question at seq 0.',
      'After each tool result, follow the protocol: reveal the same round, then ask seq 1.',
      'Do not put an answer in Question or a next question in Reveal.',
    ].join(' '),
  },
]

async function nextGate(expectedName: 'learning_question' | 'learning_reveal'): Promise<{
  call: ToolCall
  activity: LearningActivityV2
  assistant: ChatMessage
}> {
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model,
      messages,
      tools,
      tool_choice: 'auto',
    }),
  })
  const body = await response.json() as ChatResponse
  if (!response.ok) throw new Error(`canary provider returned ${String(response.status)}: ${body.error?.message ?? 'unknown error'}`)
  const assistant = body.choices?.[0]?.message
  const calls = assistant?.tool_calls ?? []
  if (assistant === undefined || calls.length !== 1) {
    throw new Error(`expected exactly one ${expectedName} call, received ${String(calls.length)}`)
  }
  const call = calls[0]!
  if (call.function.name !== expectedName) {
    throw new Error(`expected ${expectedName}, received ${call.function.name}`)
  }
  const rawActivity = JSON.parse(call.function.arguments) as Record<string, unknown>
  let activity: LearningActivityV2
  try {
    activity = parseLearningActivityV2(rawActivity)
  } catch (cause) {
    const inputKind = typeof rawActivity.input === 'object' && rawActivity.input !== null
      ? (rawActivity.input as { kind?: unknown }).kind
      : typeof rawActivity.input
    throw new Error(`model emitted an invalid ${expectedName}: keys=${Object.keys(rawActivity).join(',')}; input=${String(inputKind)}`, { cause })
  }
  messages.push(assistant)
  return { call, activity, assistant }
}

function addToolResult(call: ToolCall, value: unknown): void {
  messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(value) })
}

function assistantTextEvent(message: ChatMessage, at: number): LearningTranscriptEvent | undefined {
  const text = message.content?.trim() ?? ''
  if (/[?？]/.test(text)) throw new Error('model emitted a second question in prose outside the Learning gate')
  return text === '' ? undefined : { at, type: 'assistant-text', text }
}

const events: LearningTranscriptEvent[] = []
const question0 = await nextGate('learning_question')
if (question0.activity.phase !== 'question' || question0.activity.seq !== 0) {
  throw new Error('first gate must be Question seq 0')
}
const question0Text = assistantTextEvent(question0.assistant, 0.5)
if (question0Text !== undefined) events.push(question0Text)
events.push({ at: 1, type: 'learning-question-call', stepId: 'canary-q0', payload: question0.activity })
const questionResult = {
  protocol: RESPONSE_PROTOCOL_V2,
  phase: 'question' as const,
  activityId: 'canary-question-0',
  lessonToken: 'canary-lesson',
  roundToken: 'canary-round-0',
  seq: 0,
  action: 'submit' as const,
  answer: 'The front (oldest) item leaves first.',
  receiptId: 'canary-receipt-question-0',
}
addToolResult(question0.call, questionResult)
events.push({ at: 2, type: 'learning-question-result', payload: questionResult })

const reveal0 = await nextGate('learning_reveal')
if (reveal0.activity.phase !== 'reveal'
  || reveal0.activity.seq !== 0
  || reveal0.activity.lessonToken !== questionResult.lessonToken
  || reveal0.activity.roundToken !== questionResult.roundToken) {
  throw new Error('Reveal did not preserve the Host-issued seq and tokens')
}
const reveal0Text = assistantTextEvent(reveal0.assistant, 2.5)
if (reveal0Text !== undefined) events.push(reveal0Text)
events.push({ at: 3, type: 'learning-reveal-call', stepId: 'canary-r0', payload: reveal0.activity })
events.push({ at: 4, type: 'animation-finished' }, { at: 4, type: 'continue-enabled' })
events.push({ at: 5, type: 'continue-committed' })
const revealResult = {
  protocol: RESPONSE_PROTOCOL_V2,
  phase: 'reveal' as const,
  activityId: 'canary-reveal-0',
  lessonToken: questionResult.lessonToken,
  roundToken: questionResult.roundToken,
  seq: 0,
  action: 'continue' as const,
  animation: { completed: true },
  receiptId: 'canary-receipt-reveal-0',
}
addToolResult(reveal0.call, revealResult)
events.push({ at: 6, type: 'learning-reveal-result', payload: revealResult })

const question1 = await nextGate('learning_question')
if (question1.activity.phase !== 'question'
  || question1.activity.seq !== 1
  || question1.activity.lessonToken !== questionResult.lessonToken) {
  throw new Error('next Question did not preserve the lesson token or increment seq')
}
const question1Text = assistantTextEvent(question1.assistant, 6.5)
if (question1Text !== undefined) events.push(question1Text)
events.push({ at: 7, type: 'learning-question-call', stepId: 'canary-q1', payload: question1.activity })

const explanationMarker = reveal0.activity.feedback.explanation.trim()
const answerMarkers = explanationMarker !== ''
  && !JSON.stringify(question0.activity).toLocaleLowerCase('en-US').includes(explanationMarker.toLocaleLowerCase('en-US'))
  ? [explanationMarker]
  : []
const nextTitle = question1.activity.focus.title.trim()
const futureMarkers = nextTitle !== '' && nextTitle !== question0.activity.focus.title.trim() ? [nextTitle] : []
const verdict = gradeLearningTranscript({ events, answerMarkers, futureMarkers })
if (!verdict.passed) {
  const failures = verdict.checks.filter(check => !check.passed).map(check => check.name).join(', ')
  throw new Error(`transcript gate failed: ${failures}`)
}

console.log(JSON.stringify({
  passed: true,
  model,
  gates: ['learning_question:0', 'learning_reveal:0', 'learning_question:1'],
  checks: verdict.checks.map(check => check.name),
}, null, 2))

await ctx.fiber.dispose()
