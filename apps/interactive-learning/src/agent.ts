/** Model-facing entry mounted only by the `learning` preset. */
import type { Context } from '@deepseek-ai/cordis'
import {
  defineTool,
  type ParameterPropertySpec,
  type ToolDefinition,
  type ToolRunContext,
  type ToolRuntime,
  type ValueSchemaSpec,
} from '@deepseek-ai/dsh-tools'
import type SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import {
  CHECKPOINT_PROTOCOL,
  CHECKPOINT_RESULT_PROTOCOL,
  LEARNING_CHECKPOINT_EVIDENCE_KINDS,
  LEARNING_CHECKPOINT_KINDS,
  VISUAL_PROTOCOL_V4,
  VISUAL_RESULT_PROTOCOL_V4,
  MAX_VISUAL_MATH_DEPTH,
  MATH_BINARY_OPERATORS,
  MATH_UNARY_OPERATORS,
  LearningProtocolError,
  parseLearningCheckpointV1,
  parseLearningVisualV4,
  type LearningCheckpointResultV1,
  type LearningVisualResultV4,
} from './protocol.ts'
import type {
  LearningActivityBroker,
  LearningStateUpdateResult,
  ObservableLearnerStateUpdate,
} from './broker.ts'
import type {
  LearnerStateCorrection,
  ObservableLearnerEvent,
} from './learner-state.ts'
import { LEARNING_TEACHING_POLICY } from './teaching-policy.ts'

export const name = 'interactive-learning-agent'
export const inject = ['tools', 'systemPrompt', 'learningActivities']

type LearningAgentContext = Context & {
  tools: ToolRuntime
  systemPrompt: SystemPrompt
  learningActivities: LearningActivityBroker
}

function closeParameterRoot<T extends ToolDefinition>(tool: T): T {
  return { ...tool, parameters: { ...tool.parameters, additionalProperties: false } } as T
}

const parameter = { type: 'object', additionalProperties: false, properties: {
  id: {
    type: 'string',
    description: 'Identifier: 1 to 32 characters, start with a lowercase letter, then use only a-z, 0-9, _ or -. The id x is reserved for the chart axis.',
    required: true,
  },
  label: { type: 'string', required: true },
  min: { type: 'number', required: true },
  max: { type: 'number', required: true },
  step: { type: 'number', required: true },
  initial: { type: 'number', required: true },
} } as const

function mathExpressionSchema(depth: number): ValueSchemaSpec {
  const leaves: [ValueSchemaSpec, ValueSchemaSpec] = [
    { type: 'object', additionalProperties: false, properties: {
      op: { type: 'string', const: 'constant', required: true },
      value: { type: 'number', required: true },
    } },
    { type: 'object', additionalProperties: false, properties: {
      op: { type: 'string', const: 'variable', required: true },
      name: {
        type: 'string',
        description: 'Use x or one of this visual\'s parameter ids.',
        required: true,
      },
    } },
  ]
  if (depth <= 1) return { oneOf: leaves }
  const nested = mathExpressionSchema(depth - 1)
  return { oneOf: [
    ...leaves,
    { type: 'object', additionalProperties: false, properties: {
      op: {
        type: 'string',
        enum: MATH_UNARY_OPERATORS,
        required: true,
      },
      value: { ...nested, required: true },
    } },
    { type: 'object', additionalProperties: false, properties: {
      op: { type: 'string', enum: MATH_BINARY_OPERATORS, required: true },
      left: { ...nested, required: true },
      right: { ...nested, required: true },
    } },
  ] }
}

function required(schema: ValueSchemaSpec): ParameterPropertySpec {
  return { ...schema, required: true } as ParameterPropertySpec
}

// Shared with the runtime parser: enough for sigmoid(b0 + b1*x), still bounded.
const expression = mathExpressionSchema(MAX_VISUAL_MATH_DEPTH)
const requiredExpression = required(expression)
const identifier = {
  type: 'string',
  description: 'Identifier: 1 to 32 characters, start with a lowercase letter, then use only a-z, 0-9, _ or -.',
} as const
const tone = { type: 'string', enum: ['blue', 'green', 'red', 'orange', 'purple', 'gray'] } as const
const stroke = { type: 'string', enum: ['solid', 'dashed', 'dotted'] } as const
const point = { type: 'object', additionalProperties: false, properties: {
  x: { type: 'number', required: true },
  y: { type: 'number', required: true },
  label: { type: 'string' },
} } as const
const coordinate = { type: 'object', additionalProperties: false, properties: {
  x: { type: 'number', required: true },
  y: { type: 'number', required: true },
} } as const
const axis = { type: 'object', additionalProperties: false, properties: {
  label: { type: 'string' },
  min: { type: 'number', required: true },
  max: { type: 'number', required: true },
} } as const
const curveSeries = { type: 'object', additionalProperties: false, properties: {
  type: { type: 'string', const: 'curve', required: true },
  id: { ...identifier, required: true },
  label: { type: 'string', required: true },
  expression: requiredExpression,
  tone,
  stroke,
} } as const
const pointSeries = { type: 'object', additionalProperties: false, properties: {
  type: { type: 'string', const: 'points', required: true },
  id: { ...identifier, required: true },
  label: { type: 'string', required: true },
  points: { type: 'array', required: true, items: point, description: '1 to 256 points.' },
  tone,
} } as const
const lineSeries = { type: 'object', additionalProperties: false, properties: {
  type: { type: 'string', const: 'line', required: true },
  id: { ...identifier, required: true },
  label: { type: 'string', required: true },
  points: { type: 'array', required: true, items: point, description: '1 to 256 points.' },
  tone,
  stroke,
} } as const
const barSeries = { type: 'object', additionalProperties: false, properties: {
  type: { type: 'string', const: 'bars', required: true },
  id: { ...identifier, required: true },
  label: { type: 'string', required: true },
  points: { type: 'array', required: true, items: point, description: '1 to 64 bars.' },
  tone,
} } as const

const plotContent = { type: 'object', additionalProperties: false, properties: {
  kind: {
    type: 'string', const: 'plot', required: true,
    description: 'Functions, quantitative data, probability, distributions, or tangent/secant geometry on Cartesian axes.',
  },
  parameters: {
    type: 'array', items: parameter,
    description: 'Optional; omit for a static plot. Use at most three only when changing the value teaches the mechanism.',
  },
  xAxis: { ...axis, required: true, properties: {
    ...axis.properties,
    samples: { type: 'integer', description: 'Optional curve samples from 24 to 256.' },
  } },
  yAxis: required(axis),
  series: {
    type: 'array', required: true, items: { oneOf: [curveSeries, pointSeries, lineSeries, barSeries] },
    description: '1 to 8 series.',
  },
  metrics: { type: 'array', items: {
    type: 'object', additionalProperties: false, properties: {
      id: { ...identifier, required: true },
      label: { type: 'string', required: true },
      expression: requiredExpression,
      digits: { type: 'integer' },
      suffix: { type: 'string' },
    },
  }, description: 'Optional; at most 4 metrics.' },
} } as const

const nodeGroup = { type: 'object', additionalProperties: false, properties: {
  id: { ...identifier, required: true },
  label: { type: 'string', required: true },
} } as const
const node = { type: 'object', additionalProperties: false, properties: {
  id: { ...identifier, required: true },
  label: { type: 'string', required: true },
  detail: { type: 'string' },
  group: { type: 'string' },
  tone,
} } as const
const edge = { type: 'object', additionalProperties: false, properties: {
  id: { ...identifier, required: true },
  from: { type: 'string', required: true },
  to: { type: 'string', required: true },
  label: { type: 'string' },
  detail: { type: 'string' },
  tone,
  stroke,
  directed: { type: 'boolean' },
} } as const
const nodeLinkContent = { type: 'object', additionalProperties: false, properties: {
  kind: {
    type: 'string', const: 'node_link', required: true,
    description: 'Networks, fully connected layers, trees, causality, concept maps, state transitions, and dependency topology.',
  },
  layout: { type: 'string', enum: ['layered', 'hierarchy', 'radial'], required: true },
  groups: {
    type: 'array', items: nodeGroup,
    description: 'Optional 1 to 12 ordered layers for layered layout; every node must reference one group.',
  },
  nodes: { type: 'array', items: node, required: true, description: '2 to 48 nodes.' },
  edges: { type: 'array', items: edge, required: true, description: '1 to 160 edges; include every semantically required connection.' },
} } as const

const sceneBase = {
  id: { ...identifier, required: true },
  label: { type: 'string' },
  detail: { type: 'string' },
  tone,
} as const
const sceneElement = { oneOf: [
  { type: 'object', additionalProperties: false, properties: {
    type: { type: 'string', const: 'point', required: true }, ...sceneBase,
    x: { type: 'number', required: true }, y: { type: 'number', required: true }, size: { type: 'number' },
  } },
  { type: 'object', additionalProperties: false, properties: {
    type: { type: 'string', enum: ['segment', 'arrow'], required: true }, ...sceneBase,
    x1: { type: 'number', required: true }, y1: { type: 'number', required: true },
    x2: { type: 'number', required: true }, y2: { type: 'number', required: true }, stroke,
  } },
  { type: 'object', additionalProperties: false, properties: {
    type: { type: 'string', const: 'circle', required: true }, ...sceneBase,
    cx: { type: 'number', required: true }, cy: { type: 'number', required: true }, r: { type: 'number', required: true },
  } },
  { type: 'object', additionalProperties: false, properties: {
    type: { type: 'string', const: 'rect', required: true }, ...sceneBase,
    x: { type: 'number', required: true }, y: { type: 'number', required: true },
    width: { type: 'number', required: true }, height: { type: 'number', required: true },
  } },
  { type: 'object', additionalProperties: false, properties: {
    type: { type: 'string', const: 'polygon', required: true }, ...sceneBase,
    points: { type: 'array', required: true, items: coordinate, description: '3 to 24 polygon vertices.' },
  } },
  { type: 'object', additionalProperties: false, properties: {
    type: { type: 'string', const: 'label', required: true }, ...sceneBase,
    x: { type: 'number', required: true }, y: { type: 'number', required: true }, text: { type: 'string', required: true },
  } },
] } as const
const sceneContent = { type: 'object', additionalProperties: false, properties: {
  kind: {
    type: 'string', const: 'scene_2d', required: true,
    description: 'Geometry, vectors, forces, spatial relationships, and annotated scientific schematics.',
  },
  xAxis: required(axis),
  yAxis: required(axis),
  grid: { type: 'boolean' },
  elements: { type: 'array', items: sceneElement, required: true, description: '1 to 64 scene elements.' },
} } as const

const relationSubject = { type: 'object', additionalProperties: false, properties: {
  id: { ...identifier, required: true }, label: { type: 'string', required: true },
  detail: { type: 'string' }, tone,
} } as const
const relationAxisItem = { type: 'object', additionalProperties: false, properties: {
  id: { ...identifier, required: true }, label: { type: 'string', required: true },
} } as const
const comparisonContent = { type: 'object', additionalProperties: false, properties: {
  kind: { type: 'string', const: 'relation', required: true },
  variant: { type: 'string', const: 'comparison', required: true },
  subjects: { type: 'array', items: relationSubject, required: true, description: '2 to 4 subjects.' },
  rows: { type: 'array', required: true, items: {
    type: 'object', additionalProperties: false, properties: {
      id: { ...identifier, required: true }, label: { type: 'string', required: true }, detail: { type: 'string' },
      cells: { type: 'array', required: true, items: {
        type: 'object', additionalProperties: false, properties: {
          subjectId: { type: 'string', required: true }, value: { type: 'string', required: true }, tone,
        },
      }, description: '1 to 4 cells; each subjectId must reference a declared subject.' },
    },
  }, description: '1 to 16 comparison rows.' },
} } as const
const matrixContent = { type: 'object', additionalProperties: false, properties: {
  kind: { type: 'string', const: 'relation', required: true },
  variant: { type: 'string', const: 'matrix', required: true },
  rows: { type: 'array', items: relationAxisItem, required: true, description: '1 to 10 matrix rows.' },
  columns: { type: 'array', items: relationAxisItem, required: true, description: '1 to 10 matrix columns.' },
  cells: { type: 'array', required: true, items: {
    type: 'object', additionalProperties: false, properties: {
      id: { ...identifier, required: true }, rowId: { type: 'string', required: true },
      columnId: { type: 'string', required: true }, label: { type: 'string', required: true },
      detail: { type: 'string' }, tone,
    },
  }, description: '1 to 64 matrix cells; rowId and columnId must reference declared axes.' },
} } as const
const setsContent = { type: 'object', additionalProperties: false, properties: {
  kind: { type: 'string', const: 'relation', required: true },
  variant: { type: 'string', const: 'sets', required: true },
  sets: { type: 'array', items: relationSubject, required: true, description: '2 to 3 sets.' },
  items: { type: 'array', required: true, items: {
    type: 'object', additionalProperties: false, properties: {
      id: { ...identifier, required: true }, label: { type: 'string', required: true },
      setIds: {
        type: 'array', items: { type: 'string' }, required: true,
        description: '1 to 3 unique ids referencing declared sets.',
      }, detail: { type: 'string' },
    },
  }, description: '1 to 24 set items.' },
} } as const
const relationContent = { oneOf: [comparisonContent, matrixContent, setsContent] } as const

const timelineEvent = { type: 'object', additionalProperties: false, properties: {
  id: { ...identifier, required: true },
  time: { type: 'string', required: true },
  label: { type: 'string', required: true },
  detail: { type: 'string' },
  position: { type: 'number', description: 'Optional normalized position from 0 to 1. Provide it for every event or omit it for every event.' },
  tone,
} } as const
const timelineContent = { type: 'object', additionalProperties: false, properties: {
  kind: {
    type: 'string', const: 'timeline', required: true,
    description: 'Ordered historical events, scientific discoveries, biographies, eras, or other chronology where time order is the structure.',
  },
  orientation: { type: 'string', enum: ['horizontal', 'vertical'] },
  events: { type: 'array', items: timelineEvent, required: true, description: '2 to 32 events in chronological order.' },
  eras: { type: 'array', items: {
    type: 'object', additionalProperties: false, properties: {
      id: { ...identifier, required: true }, label: { type: 'string', required: true },
      startEventId: { type: 'string', required: true }, endEventId: { type: 'string', required: true },
      detail: { type: 'string' }, tone,
    },
  }, description: 'Optional 1 to 8 eras; startEventId and endEventId must reference declared events in order.' },
} } as const

const formulaStepsContent = { type: 'object', additionalProperties: false, properties: {
  kind: {
    type: 'string', const: 'formula_steps', required: true,
    description: 'A derivation, algebraic transformation, proof chain, or symbolic simplification where the rule between steps matters. Not for merely recalling one formula.',
  },
  notation: { type: 'string', description: 'Optional short notation key used across the derivation.' },
  steps: { type: 'array', required: true, items: {
    type: 'object', additionalProperties: false, properties: {
      id: { ...identifier, required: true },
      expression: {
        type: 'string',
        required: true,
        description: 'One LaTeX display expression without dollar delimiters; use commands such as \\lim_{h \\to 0} and ^{\\prime}.',
      },
      label: { type: 'string' }, rule: { type: 'string' }, detail: { type: 'string' }, tone,
    },
  }, description: '2 to 16 formula steps.' },
  conclusion: { type: 'string' },
} } as const

const studyMapContent = { type: 'object', additionalProperties: false, properties: {
  kind: {
    type: 'string', const: 'study_map', required: true,
    description: 'A navigable overview of a supplied document, chapter, slide deck, or multi-concept learning source. Preserve source sections and anchors instead of flattening the material.',
  },
  sourceLabel: { type: 'string', required: true },
  goal: { type: 'string' },
  sections: { type: 'array', required: true, items: {
    type: 'object', additionalProperties: false, properties: {
      id: { ...identifier, required: true }, label: { type: 'string', required: true },
      anchor: { type: 'string', description: 'Human-readable source location, such as Chapter 2 or pp. 18–23.' },
      summary: { type: 'string' },
    },
  }, description: '1 to 16 source sections.' },
  concepts: { type: 'array', required: true, items: {
    type: 'object', additionalProperties: false, properties: {
      id: { ...identifier, required: true }, label: { type: 'string', required: true },
      sectionId: { type: 'string', required: true }, detail: { type: 'string' },
      prerequisiteIds: {
        type: 'array', items: { type: 'string' },
        description: 'Optional; at most 8 unique declared concept ids, excluding this concept, with no cycles.',
      },
      role: { type: 'string', enum: ['foundation', 'core', 'extension', 'practice'] },
      tone,
    },
  }, description: '1 to 48 concepts; every sectionId must reference a declared section.' },
} } as const

const recallDeckContent = { type: 'object', additionalProperties: false, properties: {
  kind: {
    type: 'string', const: 'recall_deck', required: true,
    description: 'A requested flashcard or active-recall set with hidden answers, hints, and local review state. Use only after the relevant material is known.',
  },
  instructions: { type: 'string' },
  cards: { type: 'array', required: true, items: {
    type: 'object', additionalProperties: false, properties: {
      id: { ...identifier, required: true }, prompt: { type: 'string', required: true },
      answer: { type: 'string', required: true }, hint: { type: 'string' },
      tags: { type: 'array', items: { type: 'string' }, description: 'Optional; at most 6 unique labels.' },
    },
  }, description: '2 to 32 recall cards.' },
} } as const

const sequence = { type: 'object', additionalProperties: false, properties: {
  initialFrameId: { type: 'string' },
  frames: { type: 'array', required: true, items: {
    type: 'object', additionalProperties: false, properties: {
      id: { ...identifier, required: true }, label: { type: 'string', required: true },
      description: { type: 'string' },
      focusIds: {
        type: 'array', items: { type: 'string' }, required: true,
        description: 'At most 64 unique ids already declared by content.',
      },
    },
  }, description: '2 to 12 sequence frames.' },
} } as const

const checkpointOption = { type: 'object', additionalProperties: false, properties: {
  id: { ...identifier, required: true },
  label: { type: 'string', required: true },
} } as const

const checkpointResponse = { oneOf: [
  { type: 'object', additionalProperties: false, properties: {
    text: { type: 'string', required: true },
  } },
  { type: 'object', additionalProperties: false, properties: {
    optionId: { ...identifier, required: true },
  } },
  { type: 'object', additionalProperties: false, properties: {
    number: { type: 'number', required: true },
  } },
] } as const

const checkpointOutput = { oneOf: [
  { type: 'object', additionalProperties: false, properties: {
    protocol: { type: 'string', const: CHECKPOINT_RESULT_PROTOCOL, required: true },
    checkpointId: { type: 'string', required: true },
    status: { type: 'string', const: 'submitted', required: true },
    response: { ...checkpointResponse, required: true },
    receiptId: { type: 'string', required: true },
  } },
  { type: 'object', additionalProperties: false, properties: {
    protocol: { type: 'string', const: CHECKPOINT_RESULT_PROTOCOL, required: true },
    checkpointId: { type: 'string', required: true },
    status: { type: 'string', enum: ['skipped', 'cancelled'], required: true },
    receiptId: { type: 'string', required: true },
  } },
] } as const

const learnerObservation = { type: 'object', additionalProperties: false, properties: {
  id: {
    type: 'string',
    required: true,
    description: 'Stable id for this one concrete observation within the current session.',
  },
  source: {
    type: 'string',
    enum: ['learner-message', 'learner-action'],
    required: true,
  },
  summary: {
    type: 'string',
    required: true,
    description: 'Concise concrete utterance/action/source fact supporting the update; never a hidden trait.',
  },
  turn: { type: 'integer' },
} } as const

const sourceMaterialObservation = { type: 'object', additionalProperties: false, properties: {
  id: { type: 'string', required: true },
  source: { type: 'string', const: 'source-material', required: true },
  summary: { type: 'string', required: true },
  turn: { type: 'integer' },
} } as const

const userCorrectionObservation = { type: 'object', additionalProperties: false, properties: {
  id: { type: 'string', required: true },
  source: { type: 'string', const: 'user-correction', required: true },
  summary: { type: 'string', required: true },
  turn: { type: 'integer' },
} } as const

const learnerEvidenceFields = {
  summary: { type: 'string', required: true },
  confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
  correctness: { type: 'string', enum: ['correct', 'incorrect', 'unknown'] },
  independence: { type: 'string', enum: ['independent', 'guided', 'unknown'] },
} as const

const learnerEvidenceInput = { oneOf: [
  { type: 'object', additionalProperties: false, properties: {
    kind: {
      type: 'string',
      enum: ['attempt', 'prediction', 'explanation', 'contrast', 'error'],
      required: true,
    },
    ...learnerEvidenceFields,
  } },
  { type: 'object', additionalProperties: false, properties: {
    kind: { type: 'string', const: 'transfer', required: true },
    transferContext: { type: 'string', enum: ['same', 'fresh', 'unknown'], required: true },
    ...learnerEvidenceFields,
  } },
] } as const

const learnerStateEvent = { oneOf: [
  { type: 'object', additionalProperties: false, properties: {
    type: { type: 'string', const: 'goal_observed', required: true },
    goal: { type: 'string', required: true },
    observation: { ...learnerObservation, required: true },
  } },
  { type: 'object', additionalProperties: false, properties: {
    type: { type: 'string', const: 'request_kind_observed', required: true },
    requestKind: {
      type: 'string',
      enum: ['concept', 'procedure', 'topic', 'source-study', 'practice', 'resource', 'direct-task', 'unknown'],
      required: true,
    },
    observation: { ...learnerObservation, required: true },
  } },
  { type: 'object', additionalProperties: false, properties: {
    type: { type: 'string', const: 'prior_knowledge_observed', required: true },
    level: { type: 'string', enum: ['novice', 'intermediate', 'advanced', 'unknown'] },
    items: { type: 'array', items: { type: 'string' } },
    mode: { type: 'string', enum: ['append', 'replace'] },
    observation: { ...learnerObservation, required: true },
  } },
  { type: 'object', additionalProperties: false, properties: {
    type: { type: 'string', const: 'gap_observed', required: true },
    gap: {
      type: 'string',
      enum: ['concept', 'procedure', 'notation', 'task-model', 'prerequisite', 'unknown'],
      required: true,
    },
    misconceptions: { type: 'array', items: { type: 'string' } },
    misconceptionMode: { type: 'string', enum: ['append', 'replace'] },
    observation: { ...learnerObservation, required: true },
  } },
  { type: 'object', additionalProperties: false, properties: {
    type: { type: 'string', const: 'readiness_observed', required: true },
    readiness: { type: 'string', enum: ['can-reason', 'needs-foothold', 'unknown'], required: true },
    observation: { ...learnerObservation, required: true },
  } },
  { type: 'object', additionalProperties: false, properties: {
    type: { type: 'string', const: 'progress_observed', required: true },
    progressSignal: {
      type: 'string',
      enum: ['progressing', 'impatient', 'stuck', 'shutdown-risk', 'unknown'],
      required: true,
    },
    observation: { ...learnerObservation, required: true },
  } },
  { type: 'object', additionalProperties: false, properties: {
    type: { type: 'string', const: 'urgency_observed', required: true },
    urgency: { type: 'string', enum: ['none', 'initial-blocker', 'later-pressure', 'unknown'], required: true },
    observation: { ...learnerObservation, required: true },
  } },
  { type: 'object', additionalProperties: false, properties: {
    type: { type: 'string', const: 'assessment_context_observed', required: true },
    assessmentContext: { type: 'string', enum: ['self-study', 'graded', 'unknown'], required: true },
    observation: { ...learnerObservation, required: true },
  } },
  { type: 'object', additionalProperties: false, properties: {
    type: { type: 'string', const: 'learner_evidence_observed', required: true },
    evidence: { ...learnerEvidenceInput, required: true },
    observation: { ...learnerObservation, required: true },
  } },
  { type: 'object', additionalProperties: false, properties: {
    type: { type: 'string', const: 'source_anchors_observed', required: true },
    anchors: { type: 'array', items: { type: 'string' }, required: true },
    mode: { type: 'string', enum: ['append', 'replace'] },
    observation: { ...sourceMaterialObservation, required: true },
  } },
] } as const

const learnerStateCorrection = { type: 'object', additionalProperties: false, properties: {
  goal: { oneOf: [{ type: 'string' }, { type: 'null' }] },
  requestKind: {
    type: 'string',
    enum: ['concept', 'procedure', 'topic', 'source-study', 'practice', 'resource', 'direct-task', 'unknown'],
  },
  level: { type: 'string', enum: ['novice', 'intermediate', 'advanced', 'unknown'] },
  priorKnowledge: { type: 'array', items: { type: 'string' } },
  gap: { type: 'string', enum: ['concept', 'procedure', 'notation', 'task-model', 'prerequisite', 'unknown'] },
  misconceptions: { type: 'array', items: { type: 'string' } },
  readiness: { type: 'string', enum: ['can-reason', 'needs-foothold', 'unknown'] },
  progressSignal: { type: 'string', enum: ['progressing', 'impatient', 'stuck', 'shutdown-risk', 'unknown'] },
  urgency: { type: 'string', enum: ['none', 'initial-blocker', 'later-pressure', 'unknown'] },
  supportLevel: { type: 'integer', enum: [0, 1, 2, 3, 4, 5] },
  assessmentContext: { type: 'string', enum: ['self-study', 'graded', 'unknown'] },
  mastery: { type: 'string', enum: ['unseen', 'emerging', 'transfer'] },
  evidence: { type: 'array', items: learnerEvidenceInput },
  lastMove: {
    type: 'string',
    enum: ['none', 'visual', 'checkpoint'],
  },
  sourceAnchors: { type: 'array', items: { type: 'string' } },
} } as const

const learnerStateUpdateOutput = { type: 'object', additionalProperties: false, properties: {
  status: { type: 'string', enum: ['updated', 'corrected', 'reset'], required: true },
  revision: { type: 'integer', required: true },
} } as const

function assertSingleCheckpointInModelStep(exec: ToolRunContext): void {
  const agent = exec.agent
  if (agent === undefined) {
    throw new LearningProtocolError(['learning_checkpoint requires a live agent session'])
  }
  const calls = agent.session.events.filter(event => event.type === 'tool/call')
  const ownCalls = calls.filter(event => event.data.callId === exec.callId)
  if (ownCalls.length === 0) {
    throw new LearningProtocolError(['learning_checkpoint callId is absent from the session tool/call log'])
  }
  const locations = new Set(ownCalls.map(event => `${String(event.data.turn)}:${String(event.data.step)}`))
  if (locations.size !== 1 || ownCalls.some(event => event.data.name !== 'learning_checkpoint')) {
    throw new LearningProtocolError(['learning_checkpoint callId does not identify one checkpoint model step'])
  }
  const own = ownCalls[ownCalls.length - 1]!
  const checkpointCallIds = new Set(calls
    .filter(event => event.data.turn === own.data.turn
      && event.data.step === own.data.step
      && event.data.name === 'learning_checkpoint')
    .map(event => String(event.data.callId)))
  if (checkpointCallIds.size > 1) {
    throw new LearningProtocolError(['a model step may contain at most one learning_checkpoint call'])
  }
}

export function apply(ctx: Context): void {
  const services = ctx as LearningAgentContext
  services.tools.register(closeParameterRoot(defineTool({
    name: 'learning_visual',
    description: [
      'Render one trusted, native, non-blocking semantic visual inline in the current teaching response.',
      'Choose the content kind by the concept itself: plot for quantitative axes; node_link for topology; scene_2d for space; relation for comparisons; timeline for chronology; formula_steps for derivations; study_map for supplied multi-section material; recall_deck for requested active recall.',
      'Do not call this tool merely because Learning mode is active. A request to recall a formula, definition, or short fact normally needs direct prose, not a chart.',
      'Never substitute a plot for a requested structure diagram. A fully connected neural layer is node_link with layered groups and all connections, not a sigmoid curve.',
      'The call completes immediately: after it returns, continue naturally with the interpretation and at most one ordinary conversational question.',
      'Optional sequence frames highlight ids already declared by the chosen content; they create local step-through exploration without taking over learner input.',
      'Plot curves use a closed recursive math AST. Metrics must depend only on declared parameters.',
      'Hard limits: the complete call must stay within 64 KiB; every id is 1 to 32 lowercase-safe characters; keep labels to 120 characters, ordinary detail text to 1000, LaTeX expressions to 500, recall prompts to 1000 and answers to 2000. Array limits are stated on each field and are mandatory.',
    ].join(' '),
    parameters: {
      protocol: { type: 'string', const: VISUAL_PROTOCOL_V4, required: true },
      title: { type: 'string', description: 'Concise visible and accessible visual title.', required: true },
      description: { type: 'string', description: 'Optional one-sentence exploration hint; do not repeat surrounding prose.' },
      content: {
        oneOf: [
          plotContent,
          nodeLinkContent,
          sceneContent,
          relationContent,
          timelineContent,
          formulaStepsContent,
          studyMapContent,
          recallDeckContent,
        ],
        required: true,
        description: 'Exactly one closed native visual content object. Never provide HTML, Markdown diagrams, SVG markup, or JavaScript.',
      },
      sequence,
      fallbackMarkdown: {
        type: 'string',
        description: 'Optional concise text equivalent for accessibility or an unavailable renderer; do not use it instead of valid content.',
      },
    },
    output: {
      schema: { type: 'object', additionalProperties: false, properties: {
        protocol: { type: 'string', const: VISUAL_RESULT_PROTOCOL_V4, required: true },
        status: { type: 'string', const: 'ready', required: true },
      } },
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }],
    },
    isConcurrencySafe: () => true,
    async execute(args, exec) {
      parseLearningVisualV4(args)
      services.learningActivities.recordVisual(exec.agent, String(exec.callId))
      return {
        protocol: VISUAL_RESULT_PROTOCOL_V4,
        status: 'ready',
      } satisfies LearningVisualResultV4
    },
    presentCall: args => ({
      card: 'generic',
      title: typeof args.title === 'string' ? args.title : 'Interactive visual',
      kind: 'read',
    }),
  })))

  services.tools.register(closeParameterRoot(defineTool({
    name: 'learning_state_update',
    description: [
      'Internal, immediate, non-rich session-state update from concrete observable evidence in the current learner message, learner action, or supplied source.',
      'Call only when the observation substantively changes the next teaching move; never call mechanically every turn and never infer a hidden trait, personality, emotion, or learning style.',
      'Use update for one new observation, correct only after an explicit user correction, and reset only at a real session-local learning-boundary reset.',
      'The Host reads the current revision synchronously and applies compare-and-swap protection; do not invent or guess revision metadata.',
      'Assistant visual and checkpoint moves are recorded automatically; do not duplicate them here. This tool performs no user wait and must not replace ordinary conversation.',
    ].join(' '),
    parameters: {
      action: { type: 'string', enum: ['update', 'correct', 'reset'], required: true },
      event: {
        ...learnerStateEvent,
        description: 'Required only for action=update; exactly one concrete observable state event.',
      },
      correction: {
        ...learnerStateCorrection,
        description: 'Required only for action=correct; fields explicitly corrected by the user.',
      },
      observation: {
        ...userCorrectionObservation,
        description: 'Required only for action=correct; the explicit user correction that justifies it.',
      },
    },
    output: {
      schema: learnerStateUpdateOutput,
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }],
    },
    isConcurrencySafe: () => false,
    async execute(args, exec) {
      const agent = exec.agent
      if (agent === undefined) throw new Error('learning_state_update requires a live agent session')
      const expectedRevision = services.learningActivities.learnerState(agent).revision
      if (args.action === 'update') {
        if (args.event === undefined || args.correction !== undefined || args.observation !== undefined) {
          throw new TypeError('action=update requires only event')
        }
        return services.learningActivities.updateLearnerState({
          action: 'update',
          agent,
          expectedRevision,
          event: args.event as unknown as ObservableLearnerStateUpdate,
        }) satisfies LearningStateUpdateResult
      }
      if (args.action === 'correct') {
        if (args.event !== undefined || args.correction === undefined || args.observation === undefined) {
          throw new TypeError('action=correct requires only correction and observation')
        }
        return services.learningActivities.updateLearnerState({
          action: 'correct',
          agent,
          expectedRevision,
          correction: args.correction as unknown as LearnerStateCorrection,
          observation: args.observation as unknown as ObservableLearnerEvent & { source: 'user-correction' },
        }) satisfies LearningStateUpdateResult
      }
      if (args.event !== undefined || args.correction !== undefined || args.observation !== undefined) {
        throw new TypeError('action=reset accepts no event, correction, or observation')
      }
      return services.learningActivities.updateLearnerState({
        action: 'reset',
        agent,
        expectedRevision,
      }) satisfies LearningStateUpdateResult
    },
  })))

  services.tools.register(closeParameterRoot(defineTool({
    name: 'learning_checkpoint',
    description: [
      'Optionally request one high-value learner contribution when their response materially changes the next teaching move.',
      'The normal path is ordinary non-blocking conversation; never call this once per turn or as a Continue ritual.',
      'Use only for a prediction, explanation, contrast, design choice, debugging diagnosis, boundary case, or transfer application.',
      'The payload is answer-free: never include a correct answer, grading rubric, solution, future step, Reveal, animation, or Continue content.',
      'Ask only one current-step prompt. A skipped, cancelled, unavailable, or failed checkpoint means continue in ordinary conversation without withholding teaching.',
      'The result is terminal for this tool call. Evaluate it only in the next model step.',
    ].join(' '),
    parameters: {
      protocol: { type: 'string', const: CHECKPOINT_PROTOCOL, required: true },
      kind: { type: 'string', enum: LEARNING_CHECKPOINT_KINDS, required: true },
      prompt: { type: 'string', required: true },
      context: { type: 'string' },
      expectedEvidence: { type: 'string', enum: LEARNING_CHECKPOINT_EVIDENCE_KINDS, required: true },
      options: {
        type: 'array',
        items: checkpointOption,
        description: 'Required only for single_choice; 2 to 8 answer-free options.',
      },
      fallbackMarkdown: {
        type: 'string',
        required: true,
        description: 'Self-sufficient ordinary-conversation fallback; never include the answer.',
      },
    },
    output: {
      schema: checkpointOutput,
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }],
    },
    isConcurrencySafe: () => false,
    async execute(args, exec) {
      const checkpoint = parseLearningCheckpointV1(args)
      assertSingleCheckpointInModelStep(exec)
      return await services.learningActivities.presentCheckpoint({
        checkpoint,
        agent: exec.agent,
        signal: exec.signal,
        callId: String(exec.callId),
      }) satisfies LearningCheckpointResultV1
    },
  })))

  services.systemPrompt.section({
    name: 'learning:policy',
    order: 20,
    text: LEARNING_TEACHING_POLICY,
  })
  services.systemPrompt.context({
    name: 'learning:learner-state',
    order: 20,
    text: context => {
      const agent = context.agent ?? services.agent
      return agent === undefined
        ? ''
        : services.learningActivities.learnerStateTranscript(agent, 300)
    },
  })
}
