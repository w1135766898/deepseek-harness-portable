/** Agent-plane entry mounted only by the `learning` preset. */
import type { Context } from '@deepseek-ai/cordis'
import { defineTool, type ToolRuntime } from '@deepseek-ai/dsh-tools'
import type SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import type { LearningActivityBroker } from './broker.ts'
import {
  ACTIVITY_PROTOCOL,
  RESPONSE_PROTOCOL,
  parseLearningActivity,
} from './protocol.ts'

export const name = 'interactive-learning-agent'
export const inject = ['tools', 'systemPrompt', 'learningActivities']

type LearningAgentContext = Context & {
  tools: ToolRuntime
  systemPrompt: SystemPrompt
  learningActivities: LearningActivityBroker
}

const description = [
  'Present one focused, interactive teaching activity and wait for the learner response.',
  'Use parameter_explorer for bounded quantitative relationships, process_stepper for predict-then-reveal sequences,',
  'or structure_compare for aligned structural differences. Do not use it for facts or notation that one short explanation resolves.',
].join(' ')

export function apply(ctx: Context): void {
  const services = ctx as LearningAgentContext
  services.tools.register(defineTool({
    name: 'learning_activity',
    description,
    parameters: {
      protocol: {
        type: 'string',
        const: ACTIVITY_PROTOCOL,
        required: true,
        description: `Protocol literal ${ACTIVITY_PROTOCOL}.`,
      },
      kind: {
        type: 'string',
        enum: ['parameter_explorer', 'process_stepper', 'structure_compare'],
        required: true,
        description: 'The single renderer whose interaction best exposes the target relationship.',
      },
      title: { type: 'string', required: true, description: 'Short learner-facing activity title.' },
      objective: { type: 'string', required: true, description: 'The one understanding this activity should establish.' },
      prompt: { type: 'string', required: true, description: 'The focused question the learner should answer through the activity.' },
      scaffold: { type: 'string', description: 'Optional minimal hint; do not reveal the full answer.' },
      payload: {
        type: 'object',
        additionalProperties: true,
        required: true,
        description: [
          'Renderer payload. parameter_explorer: {parameters:[{id,label,min,max,step,initial}],xAxis:{label?,min,max,samples?},curves:[{id,label,expression}],question?};',
          'process_stepper: {steps:[{id,title,content,checkpoint?:{question,options?}}],question?};',
          'structure_compare: {left:{title,items:[{id,label,detail?}]},right:{...},alignments:[{id,leftId?,rightId?,prompt?}],question?}.',
          'Expressions are closed AST nodes: constant/value, variable/name, binary add|sub|mul|div|pow with left/right, or unary neg|abs|sqrt|sin|cos|exp|log with value.',
        ].join(' '),
      },
      fallbackMarkdown: {
        type: 'string',
        required: true,
        description: 'A complete non-interactive teaching fallback that still asks for a learner response.',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          protocol: { type: 'string', const: RESPONSE_PROTOCOL, required: true },
          activityId: { type: 'string', required: true },
          action: { type: 'string', enum: ['submit', 'skip', 'cancel'], required: true },
          answer: { type: 'json' },
          interactionState: { type: 'json' },
        },
      },
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }],
    },
    isConcurrencySafe: () => false,
    async execute(args, exec) {
      const activity = parseLearningActivity(args)
      return services.learningActivities.present({
        activity,
        ...(exec.agent === undefined ? {} : { agent: exec.agent }),
        signal: exec.signal,
      })
    },
    presentCall(args) {
      return { card: 'generic', title: args.title, kind: 'read' }
    },
  }))

  services.systemPrompt.section({
    name: 'learning:policy',
    order: 20,
    text: [
      'The user explicitly selected Learning mode. Treat requests to teach, explain, practise, derive, or understand as learning requests even when the subject is coding, writing, or calculation. Distinguish “teach me to do this” from “do this for me”; if the user only wants task completion, respond directly and briefly state that Standard or Code mode is better suited.',
      'Start from the learner’s stated objective and the smallest unresolved gap. When the gap is unclear, use one diagnostic question or a tiny prediction. Then choose the least elaborate useful teaching move: direct explanation, guided discovery, a parallel worked example, one interactive activity, or a reflective pause. A focused question each round is a useful default, not a rigid output rule. Never withhold a necessary explanation merely to remain Socratic.',
      'Adapt to the learner’s response. Name the specific evidence in their answer, repair only the remaining misconception, and ask for transfer to a fresh example when useful. If the learner asks to speed up or switch to direct explanation, do so immediately. End the teaching segment explicitly once they can explain or apply the idea; do not continue questioning mechanically.',
      'Load the interactive-teaching skill when the request needs a multi-turn lesson, when choosing among teaching moves is non-obvious, or when you need detailed activity payload contracts and the evaluation rubric.',
    ].join('\n\n'),
  })

  services.systemPrompt.section({
    name: 'tool:learning_activity',
    order: 150,
    text: [
      'Use learning_activity only when manipulating a parameter, revealing a process state-by-state, or aligning structural differences materially improves understanding.',
      'Use at most one activity at a time. Ask for a prediction or decision before revealing the key relationship, then wait for the tool result.',
      'Continue from the returned response: address the learner’s actual choice or explanation instead of repeating the preceding explanation.',
      'If the action is skip or cancel, continue briefly in Markdown. Never generate HTML, JavaScript, React, network code, or executable widget content.',
    ].join(' '),
  })
}
