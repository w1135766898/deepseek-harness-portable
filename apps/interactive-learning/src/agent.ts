/** Agent-plane entry mounted only by the `learning` preset. */
import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { defineTool, type ToolDefinition, type ToolRuntime } from '@deepseek-ai/dsh-tools'
import type SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import type { LearningActivityBroker } from './broker.ts'
import {
  ACTIVITY_PROTOCOL_V2,
  RESPONSE_PROTOCOL_V2,
  parseLearningActivityV2,
  type LearningQuestionResponseV2,
  type LearningRevealResponseV2,
} from './protocol.ts'

export const name = 'interactive-learning-agent'
export const inject = ['tools', 'systemPrompt', 'learningActivities']

type LearningAgentContext = Context & { tools: ToolRuntime; systemPrompt: SystemPrompt; learningActivities: LearningActivityBroker }

function closeParameterRoot<T extends ToolDefinition>(tool: T): T {
  return { ...tool, parameters: { ...tool.parameters, additionalProperties: false } } as T
}

export class LearningGateError extends Error {
  readonly code = 'MULTIPLE_LEARNING_GATES_IN_STEP'

  constructor() {
    super('A model step may execute only one Learning gate')
    this.name = 'LearningGateError'
  }
}

const claimedGateByAgent = new WeakMap<Agent, string>()

function openStepKey(agent: Agent): string | undefined {
  const closed = new Set<string>()
  const events = agent.session.events
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index]!
    if (event.type !== 'step/start' && event.type !== 'step/end') continue
    const key = `${String(event.data.turn)}:${String(event.data.step)}`
    if (event.type === 'step/end') closed.add(key)
    else if (!closed.has(key)) return key
  }
  return undefined
}

/** Claim the current durable model step, if one exists, for one Learning gate. */
export function assertLearningGateAvailable(agent: Agent | undefined): void {
  if (agent === undefined) return
  const key = openStepKey(agent)
  if (key === undefined) return
  if (claimedGateByAgent.get(agent) === key) throw new LearningGateError()
  claimedGateByAgent.set(agent, key)
}

const progress = { type: 'object', additionalProperties: false, properties: {
  current: { type: 'integer', description: '1-based progress position; must be 1 or greater.', required: true },
  total: { type: 'integer', description: 'Optional total round count; must be 1 or greater.' },
} } as const
const focus = { type: 'object', additionalProperties: false, required: true, properties: {
  title: { type: 'string', required: true }, progress,
} } as const
const frame = { type: 'object', additionalProperties: false, required: true, properties: {
  id: { type: 'string', description: 'Lowercase identifier starting with a letter; use only a-z, 0-9, _ or -.', required: true },
  title: { type: 'string', required: true }, content: { type: 'string' },
} } as const
const parameter = { type: 'object', additionalProperties: false, properties: {
  id: { type: 'string', description: 'Lowercase identifier starting with a letter.', required: true }, label: { type: 'string', required: true },
  min: { type: 'number', required: true }, max: { type: 'number', required: true },
  step: { type: 'number', required: true }, initial: { type: 'number', required: true },
} } as const
const expressionLeaf = { oneOf: [
  { type: 'object', additionalProperties: false, properties: {
    op: { type: 'string', const: 'constant', required: true }, value: { type: 'number', required: true },
  } },
  { type: 'object', additionalProperties: false, properties: {
    op: { type: 'string', const: 'variable', required: true }, name: { type: 'string', required: true },
  } },
] } as const
// Keep the model surface shallow and closed; the runtime parser remains the
// authority for the richer bounded expression AST used by legacy replay.
const expression = { oneOf: [
  ...expressionLeaf.oneOf,
  { type: 'object', additionalProperties: false, properties: {
    op: { type: 'string', enum: ['neg', 'abs', 'sqrt', 'sin', 'cos', 'exp', 'log'], required: true },
    value: { ...expressionLeaf, required: true },
  } },
  { type: 'object', additionalProperties: false, properties: {
    op: { type: 'string', enum: ['add', 'sub', 'mul', 'div', 'pow'], required: true },
    left: { ...expressionLeaf, required: true }, right: { ...expressionLeaf, required: true },
  } },
] } as const
const curve = { type: 'object', additionalProperties: false, properties: {
  id: { type: 'string', description: 'Lowercase identifier starting with a letter.', required: true }, label: { type: 'string', required: true },
  expression: { ...expression, required: true },
} } as const
const xAxis = { type: 'object', additionalProperties: false, required: true, properties: {
  label: { type: 'string' }, min: { type: 'number', required: true }, max: { type: 'number', required: true }, samples: { type: 'integer' },
} } as const
const structureItem = { type: 'object', additionalProperties: false, properties: {
  id: { type: 'string', description: 'Lowercase identifier starting with a letter.', required: true }, label: { type: 'string', required: true }, detail: { type: 'string' },
} } as const
const structureSide = { type: 'object', additionalProperties: false, required: true, properties: {
  title: { type: 'string', required: true }, items: { type: 'array', items: structureItem, required: true },
} } as const
const alignment = { type: 'object', additionalProperties: false, properties: {
  id: { type: 'string', description: 'Lowercase identifier starting with a letter.', required: true }, leftId: { type: 'string' }, rightId: { type: 'string' }, prompt: { type: 'string' },
} } as const
function optionalSchema<const T extends { readonly required: true }>(schema: T): Omit<T, 'required'> {
  const { required: _required, ...optional } = schema
  return optional
}
const questionVisual = { type: 'object', additionalProperties: false, properties: {
  kind: { type: 'string', enum: ['process', 'parameter', 'structure'], description: 'process requires frame; parameter requires parameters, xAxis and curves; structure requires left, right and alignments.', required: true },
  frame: optionalSchema(frame),
  parameters: { type: 'array', items: parameter }, xAxis: optionalSchema(xAxis),
  curves: { type: 'array', items: curve },
  left: optionalSchema(structureSide), right: optionalSchema(structureSide),
  alignments: { type: 'array', items: alignment },
} } as const
const revealVisual = { type: 'object', additionalProperties: false, properties: {
  kind: { type: 'string', enum: ['process', 'parameter', 'structure'], description: 'process requires before and after; parameter requires parameters, xAxis and curves; structure requires left, right and alignments.', required: true },
  before: optionalSchema(frame), after: optionalSchema(frame),
  parameters: { type: 'array', items: parameter }, xAxis: optionalSchema(xAxis),
  curves: { type: 'array', items: curve }, emphasis: { type: 'string' },
  left: optionalSchema(structureSide), right: optionalSchema(structureSide),
  alignments: { type: 'array', items: alignment },
  emphasisAlignmentIds: { type: 'array', items: { type: 'string' } },
} } as const
const responseBase = {
  protocol: { type: 'string', const: RESPONSE_PROTOCOL_V2, required: true },
  activityId: { type: 'string', required: true }, lessonToken: { type: 'string', required: true },
  roundToken: { type: 'string', required: true }, seq: { type: 'integer', required: true },
  receiptId: { type: 'string', required: true }, interactionState: { type: 'json' },
} as const

export function apply(ctx: Context): void {
  const services = ctx as LearningAgentContext
  services.tools.register(closeParameterRoot(defineTool({
    name: 'learning_question',
    description: 'Present exactly one current learning question and wait for the learner response. This call cannot contain an answer, reveal, or future round.',
    parameters: {
      protocol: { type: 'string', const: ACTIVITY_PROTOCOL_V2, required: true },
      phase: { type: 'string', const: 'question', required: true },
      lessonToken: { type: 'string', description: 'Omit for the first round; otherwise use the Host-issued lesson token.' },
      seq: { type: 'integer', required: true }, focus,
      prompt: { type: 'string', required: true }, scaffold: { type: 'string' },
      input: { type: 'object', additionalProperties: false, required: true, properties: {
        kind: { type: 'string', enum: ['single_choice', 'short_text', 'number'], required: true },
        options: { type: 'array', items: { type: 'object', additionalProperties: false, properties: {
          id: { type: 'string', description: 'Lowercase identifier starting with a letter, for example a, b, or option_1.', required: true }, label: { type: 'string', required: true },
        } } },
        placeholder: { type: 'string' }, maxLength: { type: 'integer' },
        min: { type: 'number' }, max: { type: 'number' }, step: { type: 'number' },
      } },
      visual: questionVisual, fallbackMarkdown: { type: 'string', required: true },
    },
    output: { schema: { type: 'object', additionalProperties: false, properties: {
      ...responseBase, phase: { type: 'string', const: 'question', required: true },
      action: { type: 'string', enum: ['submit', 'skip', 'cancel'], required: true }, answer: { type: 'json' },
    } }, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }] },
    isConcurrencySafe: () => false,
    async execute(args, exec) {
      const activity = parseLearningActivityV2(args)
      if (activity.phase !== 'question') throw new TypeError('learning_question requires the question phase')
      assertLearningGateAvailable(exec.agent)
      return services.learningActivities.presentQuestion({
        activity, callId: String(exec.callId), ...(exec.agent === undefined ? {} : { agent: exec.agent }), signal: exec.signal,
      }) as Promise<LearningQuestionResponseV2>
    },
    presentCall: args => ({ card: 'generic', title: args.focus.title, kind: 'read' }),
  })))

  services.tools.register(closeParameterRoot(defineTool({
    name: 'learning_reveal',
    description: 'Evaluate the learner response, reveal only that same round, and wait for animation completion plus explicit continue.',
    parameters: {
      protocol: { type: 'string', const: ACTIVITY_PROTOCOL_V2, required: true },
      phase: { type: 'string', const: 'reveal', required: true },
      lessonToken: { type: 'string', required: true }, roundToken: { type: 'string', required: true },
      seq: { type: 'integer', required: true }, focus,
      feedback: { type: 'object', additionalProperties: false, required: true, properties: {
        verdict: { type: 'string', enum: ['correct', 'partial', 'misconception', 'neutral'] },
        learnerEcho: { type: 'string' }, explanation: { type: 'string', required: true }, answer: { type: 'string' },
      } },
      visual: revealVisual,
      animation: { type: 'object', additionalProperties: false, required: true, properties: {
        kind: { type: 'string', enum: ['draw', 'morph', 'highlight', 'step_complete'], required: true },
        preferredDurationMs: { type: 'integer' }, reducedMotion: { type: 'string', const: 'commit-final-state', required: true },
      } },
      advance: { type: 'object', additionalProperties: false, required: true, properties: {
        mode: { type: 'string', const: 'user-after-animation', required: true }, label: { type: 'string' },
      } },
      fallbackMarkdown: { type: 'string', required: true },
    },
    output: { schema: { type: 'object', additionalProperties: false, properties: {
      ...responseBase, phase: { type: 'string', const: 'reveal', required: true },
      action: { type: 'string', enum: ['continue', 'skip', 'cancel'], required: true },
      animation: { type: 'object', additionalProperties: false, required: true, properties: {
        completed: { type: 'boolean', required: true }, skipped: { type: 'boolean' },
        reducedMotion: { type: 'boolean' }, error: { type: 'string' },
      } },
    } }, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }] },
    isConcurrencySafe: () => false,
    async execute(args, exec) {
      const activity = parseLearningActivityV2(args)
      if (activity.phase !== 'reveal') throw new TypeError('learning_reveal requires the reveal phase')
      assertLearningGateAvailable(exec.agent)
      return services.learningActivities.presentReveal({
        activity, callId: String(exec.callId), ...(exec.agent === undefined ? {} : { agent: exec.agent }), signal: exec.signal,
      }) as Promise<LearningRevealResponseV2>
    },
    presentCall: args => ({ card: 'generic', title: args.focus.title, kind: 'read' }),
  })))

  services.systemPrompt.section({
    name: 'learning:policy', order: 20,
    text: [
      'The user selected Learning mode. Diagnose only the missing gap, then choose the smallest useful move: direct explanation, guided discovery, a parallel worked example, one interactive round, or a reflective pause. Adapt to learner evidence, give a foothold when they are stuck, and end explicitly after demonstrated understanding.',
      'Use ask_user_question only for a user-owned choice about direction, depth, or pace that materially changes the lesson. Ask exactly one single-select question with two or three broad mutually exclusive options. Infer a reasonable default instead of opening a choice merely to display controls; teaching evidence belongs in learning_question.',
      'An interactive round has one hard gate per model step. Ask exactly one current question with learning_question. After its result, evaluate that response with learning_reveal. Wait for the reveal result before constructing the next question. A short bridge sentence may precede a gate, but no second question may appear outside it.',
      'Question content is current-round only and contains no answer or future title. Reveal content is same-round only and contains no next question. Fallbacks follow the same phase boundary. These are protocol boundaries, not a reason to force an activity when concise teaching is better.',
      'If focus.progress is present, current is 1-based (never 0) and total is at least current.',
      'Load the interactive-teaching skill when a multi-turn lesson needs teaching judgment beyond these standing rules.',
    ].join('\n\n'),
  })
}
