/** Versioned, declarative protocol shared by the Host, Agent, and Client. */

export const ACTIVITY_PROTOCOL = 'dsh-learning/activity@1' as const
export const RESPONSE_PROTOCOL = 'dsh-learning/response@1' as const
export const TRANSPORT_PROTOCOL = 'dsh-learning/transport@1' as const
export const ACTIVITY_PROTOCOL_V2 = 'dsh-learning/activity@2' as const
export const RESPONSE_PROTOCOL_V2 = 'dsh-learning/response@2' as const
export const TRANSPORT_PROTOCOL_V2 = 'dsh-learning/wait@2' as const
export const VISUAL_PROTOCOL_V3 = 'dsh-learning/visual@3' as const
export const VISUAL_RESULT_PROTOCOL_V3 = 'dsh-learning/visual-result@3' as const
export const VISUAL_PROTOCOL_V4 = 'dsh-learning/visual@4' as const
export const VISUAL_RESULT_PROTOCOL_V4 = 'dsh-learning/visual-result@4' as const
export const CHECKPOINT_PROTOCOL = 'dsh-learning/checkpoint@1' as const
export const CHECKPOINT_RESULT_PROTOCOL = 'dsh-learning/checkpoint-result@1' as const
export const CHECKPOINT_TRANSPORT_PROTOCOL = 'dsh-learning/checkpoint-wait@1' as const
export const LEARNING_CHECKPOINT_KINDS = [
  'free_text',
  'single_choice',
  'numeric',
  'prediction',
  'code_slot',
] as const
export const LEARNING_CHECKPOINT_EVIDENCE_KINDS = [
  'attempt',
  'prediction',
  'explanation',
  'contrast',
  'transfer',
] as const
export const LEARNING_VISUAL_KINDS_V4 = [
  'plot',
  'node_link',
  'scene_2d',
  'relation',
  'timeline',
  'formula_steps',
  'study_map',
  'recall_deck',
] as const
export const LEARNING_ACTIVITY_KINDS = [
  'parameter_explorer',
  'process_stepper',
  'structure_compare',
] as const

export const MAX_ACTIVITY_BYTES = 64 * 1024
export const MAX_RESPONSE_BYTES = 32 * 1024
export const MAX_MATH_DEPTH = 8
export const MAX_MATH_NODES = 64
export const MAX_VISUAL_MATH_DEPTH = 4
export const MATH_BINARY_OPERATORS = ['add', 'sub', 'mul', 'div', 'pow'] as const
export const MATH_UNARY_OPERATORS = ['neg', 'abs', 'sqrt', 'sin', 'cos', 'exp', 'log', 'sigmoid'] as const

export type LearningActivityKind = typeof LEARNING_ACTIVITY_KINDS[number]
export type LearningAction = 'submit' | 'skip' | 'cancel'
export type LearningJson = null | boolean | number | string | LearningJson[] | { [key: string]: LearningJson }
export type LearningCheckpointKindV1 = typeof LEARNING_CHECKPOINT_KINDS[number]
export type LearningCheckpointEvidenceKindV1 = typeof LEARNING_CHECKPOINT_EVIDENCE_KINDS[number]

export type MathExpressionV1 =
  | { op: 'constant'; value: number }
  | { op: 'variable'; name: string }
  | { op: 'add' | 'sub' | 'mul' | 'div' | 'pow'; left: MathExpressionV1; right: MathExpressionV1 }
  | { op: 'neg' | 'abs' | 'sqrt' | 'sin' | 'cos' | 'exp' | 'log' | 'sigmoid'; value: MathExpressionV1 }

export interface ParameterDefinitionV1 {
  id: string
  label: string
  min: number
  max: number
  step: number
  initial: number
}

export interface ParameterCurveV1 {
  id: string
  label: string
  expression: MathExpressionV1
}

export interface ParameterExplorerPayloadV1 {
  parameters: ParameterDefinitionV1[]
  xAxis: { label?: string; min: number; max: number; samples?: number }
  curves: ParameterCurveV1[]
  question?: string
}

export interface ProcessCheckpointV1 {
  question: string
  options?: string[]
}

export interface ProcessStepV1 {
  id: string
  title: string
  content: string
  checkpoint?: ProcessCheckpointV1
}

export interface ProcessStepperPayloadV1 {
  steps: ProcessStepV1[]
  question?: string
}

export interface StructureItemV1 {
  id: string
  label: string
  detail?: string
}

export interface StructureAlignmentV1 {
  id: string
  leftId?: string
  rightId?: string
  prompt?: string
}

export interface StructureComparePayloadV1 {
  left: { title: string; items: StructureItemV1[] }
  right: { title: string; items: StructureItemV1[] }
  alignments: StructureAlignmentV1[]
  question?: string
}

interface ActivityBaseV1<K extends LearningActivityKind, P> {
  protocol: typeof ACTIVITY_PROTOCOL
  kind: K
  title: string
  objective: string
  prompt: string
  scaffold?: string
  payload: P
  fallbackMarkdown: string
}

export type LearningActivityV1 =
  | ActivityBaseV1<'parameter_explorer', ParameterExplorerPayloadV1>
  | ActivityBaseV1<'process_stepper', ProcessStepperPayloadV1>
  | ActivityBaseV1<'structure_compare', StructureComparePayloadV1>

export interface LearningResponseV1 {
  protocol: typeof RESPONSE_PROTOCOL
  activityId: string
  action: LearningAction
  answer?: LearningJson
  interactionState?: LearningJson
}

export interface LearningActivityEnvelopeV1 {
  transport: typeof TRANSPORT_PROTOCOL
  activityId: string
  activity: LearningActivityV1
}

export type LearningActivityEnvelopeInputV1 = Omit<LearningActivityEnvelopeV1, 'transport'>

export interface LearningFocusV2 { title: string; progress?: { current: number; total?: number } }
export type LearningInputV2 =
  | { kind: 'single_choice'; options: Array<{ id: string; label: string }> }
  | { kind: 'short_text'; placeholder?: string; maxLength?: number }
  | { kind: 'number'; min?: number; max?: number; step?: number }
export interface LearningFrameV2 { id: string; title: string; content?: string }
export type LearningQuestionVisualV2 =
  | { kind: 'process'; frame: LearningFrameV2 }
  | { kind: 'parameter'; parameters: ParameterDefinitionV1[]; xAxis: ParameterExplorerPayloadV1['xAxis']; curves: ParameterCurveV1[] }
  | { kind: 'structure'; left: StructureComparePayloadV1['left']; right: StructureComparePayloadV1['right']; alignments: StructureAlignmentV1[] }
export type LearningRevealVisualV2 =
  | { kind: 'process'; before: LearningFrameV2; after: LearningFrameV2 }
  | { kind: 'parameter'; parameters: ParameterDefinitionV1[]; xAxis: ParameterExplorerPayloadV1['xAxis']; curves: ParameterCurveV1[]; emphasis?: string }
  | { kind: 'structure'; left: StructureComparePayloadV1['left']; right: StructureComparePayloadV1['right']; alignments: StructureAlignmentV1[]; emphasisAlignmentIds?: string[] }
export interface LearningQuestionV2 {
  protocol: typeof ACTIVITY_PROTOCOL_V2; phase: 'question'; lessonToken?: string; seq: number
  focus: LearningFocusV2; prompt: string; scaffold?: string; input: LearningInputV2
  visual?: LearningQuestionVisualV2; fallbackMarkdown: string
}
export interface LearningRevealV2 {
  protocol: typeof ACTIVITY_PROTOCOL_V2; phase: 'reveal'; lessonToken: string; roundToken: string; seq: number
  focus: LearningFocusV2
  feedback: { verdict?: 'correct' | 'partial' | 'misconception' | 'neutral'; learnerEcho?: string; explanation: string; answer?: string }
  visual?: LearningRevealVisualV2
  animation: { kind: 'draw' | 'morph' | 'highlight' | 'step_complete'; preferredDurationMs?: number; reducedMotion: 'commit-final-state' }
  advance: { mode: 'user-after-animation'; label?: string }; fallbackMarkdown: string
}
export type LearningActivityV2 = LearningQuestionV2 | LearningRevealV2
interface LearningResponseBaseV2 {
  protocol: typeof RESPONSE_PROTOCOL_V2; activityId: string; lessonToken: string; roundToken: string
  seq: number; receiptId: string; interactionState?: LearningJson
}
export interface LearningQuestionResponseV2 extends LearningResponseBaseV2 {
  phase: 'question'; action: 'submit' | 'skip' | 'cancel'; answer?: LearningJson
}
export interface LearningRevealResponseV2 extends LearningResponseBaseV2 {
  phase: 'reveal'; action: 'continue' | 'skip' | 'cancel'
  animation: { completed: boolean; skipped?: boolean; reducedMotion?: boolean; error?: string }
}
export type LearningResponseV2 = LearningQuestionResponseV2 | LearningRevealResponseV2
export interface LearningWaitEnvelopeV2 {
  transport: typeof TRANSPORT_PROTOCOL_V2; waitId: string; activityId: string; callId?: string
  lessonToken: string; roundToken: string; seq: number; phase: 'question' | 'reveal'; activity: LearningActivityV2
}
export type LearningWaitEnvelopeInputV2 = Omit<LearningWaitEnvelopeV2, 'transport'>

export interface LearningCheckpointOptionV1 {
  id: string
  label: string
}

/** One answer-free, current-step learner contribution request. */
export interface LearningCheckpointV1 {
  protocol: typeof CHECKPOINT_PROTOCOL
  kind: LearningCheckpointKindV1
  prompt: string
  context?: string
  expectedEvidence: LearningCheckpointEvidenceKindV1
  options?: LearningCheckpointOptionV1[]
  fallbackMarkdown: string
}

export type LearningCheckpointResponseV1 =
  | { text: string }
  | { optionId: string }
  | { number: number }

interface LearningCheckpointResultBaseV1 {
  protocol: typeof CHECKPOINT_RESULT_PROTOCOL
  checkpointId: string
  receiptId: string
}

export interface LearningCheckpointSubmittedResultV1 extends LearningCheckpointResultBaseV1 {
  status: 'submitted'
  response: LearningCheckpointResponseV1
}

export interface LearningCheckpointSkippedResultV1 extends LearningCheckpointResultBaseV1 {
  status: 'skipped'
}

export interface LearningCheckpointCancelledResultV1 extends LearningCheckpointResultBaseV1 {
  status: 'cancelled'
}

export type LearningCheckpointResultV1 =
  | LearningCheckpointSubmittedResultV1
  | LearningCheckpointSkippedResultV1
  | LearningCheckpointCancelledResultV1

/** Durable safe projection used only to recover one pending checkpoint wait. */
export interface LearningCheckpointWaitEnvelopeV1 {
  transport: typeof CHECKPOINT_TRANSPORT_PROTOCOL
  sessionId: string
  callId: string
  waitId: string
  checkpointId: string
  checkpoint: LearningCheckpointV1
}

export type LearningCheckpointWaitEnvelopeInputV1 = Omit<LearningCheckpointWaitEnvelopeV1, 'transport'>

export type LearningVisualToneV3 = 'blue' | 'green' | 'red' | 'orange' | 'purple' | 'gray'
export type LearningVisualStrokeV3 = 'solid' | 'dashed' | 'dotted'
export interface LearningVisualAxisV3 {
  label?: string
  min: number
  max: number
  samples?: number
}
export interface LearningVisualCurveV3 {
  type: 'curve'
  id: string
  label: string
  expression: MathExpressionV1
  tone?: LearningVisualToneV3
  stroke?: LearningVisualStrokeV3
}
export interface LearningVisualPointV3 {
  x: number
  y: number
  label?: string
}
export interface LearningVisualPointSeriesV3 {
  type: 'points'
  id: string
  label: string
  points: LearningVisualPointV3[]
  tone?: LearningVisualToneV3
}
export type LearningVisualSeriesV3 = LearningVisualCurveV3 | LearningVisualPointSeriesV3
export interface LearningVisualMetricV3 {
  id: string
  label: string
  expression: MathExpressionV1
  digits?: number
  suffix?: string
}

/**
 * A non-blocking, replayable visual embedded in the assistant's normal turn.
 * It never owns learner input: the ordinary conversation composer remains live.
 */
export interface LearningVisualV3 {
  protocol: typeof VISUAL_PROTOCOL_V3
  kind: 'parameter_chart'
  title: string
  description?: string
  parameters: ParameterDefinitionV1[]
  xAxis: LearningVisualAxisV3
  yAxis: LearningVisualAxisV3
  series: LearningVisualSeriesV3[]
  metrics?: LearningVisualMetricV3[]
}

export interface LearningVisualResultV3 {
  protocol: typeof VISUAL_RESULT_PROTOCOL_V3
  status: 'ready'
}

export type LearningVisualKindV4 = typeof LEARNING_VISUAL_KINDS_V4[number]
export type LearningVisualToneV4 = LearningVisualToneV3
export type LearningVisualStrokeV4 = LearningVisualStrokeV3

export interface LearningVisualLineSeriesV4 {
  type: 'line'
  id: string
  label: string
  points: LearningVisualPointV3[]
  tone?: LearningVisualToneV4
  stroke?: LearningVisualStrokeV4
}

export interface LearningVisualBarSeriesV4 {
  type: 'bars'
  id: string
  label: string
  points: LearningVisualPointV3[]
  tone?: LearningVisualToneV4
}

export type LearningPlotSeriesV4 =
  | LearningVisualCurveV3
  | LearningVisualPointSeriesV3
  | LearningVisualLineSeriesV4
  | LearningVisualBarSeriesV4

export interface LearningPlotV4 {
  kind: 'plot'
  parameters?: ParameterDefinitionV1[]
  xAxis: LearningVisualAxisV3
  yAxis: LearningVisualAxisV3
  series: LearningPlotSeriesV4[]
  metrics?: LearningVisualMetricV3[]
}

export interface LearningNodeGroupV4 {
  id: string
  label: string
}

export interface LearningNodeV4 {
  id: string
  label: string
  detail?: string
  group?: string
  tone?: LearningVisualToneV4
}

export interface LearningEdgeV4 {
  id: string
  from: string
  to: string
  label?: string
  detail?: string
  tone?: LearningVisualToneV4
  stroke?: LearningVisualStrokeV4
  directed?: boolean
}

export interface LearningNodeLinkV4 {
  kind: 'node_link'
  layout: 'layered' | 'hierarchy' | 'radial'
  groups?: LearningNodeGroupV4[]
  nodes: LearningNodeV4[]
  edges: LearningEdgeV4[]
}

interface LearningSceneElementBaseV4 {
  id: string
  label?: string
  detail?: string
  tone?: LearningVisualToneV4
}

export interface LearningScenePointV4 extends LearningSceneElementBaseV4 {
  type: 'point'
  x: number
  y: number
  size?: number
}

export interface LearningSceneSegmentV4 extends LearningSceneElementBaseV4 {
  type: 'segment' | 'arrow'
  x1: number
  y1: number
  x2: number
  y2: number
  stroke?: LearningVisualStrokeV4
}

export interface LearningSceneCircleV4 extends LearningSceneElementBaseV4 {
  type: 'circle'
  cx: number
  cy: number
  r: number
}

export interface LearningSceneRectV4 extends LearningSceneElementBaseV4 {
  type: 'rect'
  x: number
  y: number
  width: number
  height: number
}

export interface LearningScenePolygonV4 extends LearningSceneElementBaseV4 {
  type: 'polygon'
  points: Array<{ x: number; y: number }>
}

export interface LearningSceneLabelV4 extends LearningSceneElementBaseV4 {
  type: 'label'
  x: number
  y: number
  text: string
}

export type LearningSceneElementV4 =
  | LearningScenePointV4
  | LearningSceneSegmentV4
  | LearningSceneCircleV4
  | LearningSceneRectV4
  | LearningScenePolygonV4
  | LearningSceneLabelV4

export interface LearningScene2DV4 {
  kind: 'scene_2d'
  xAxis: LearningVisualAxisV3
  yAxis: LearningVisualAxisV3
  grid?: boolean
  elements: LearningSceneElementV4[]
}

export interface LearningRelationSubjectV4 {
  id: string
  label: string
  detail?: string
  tone?: LearningVisualToneV4
}

export interface LearningRelationComparisonRowV4 {
  id: string
  label: string
  cells: Array<{ subjectId: string; value: string; tone?: LearningVisualToneV4 }>
  detail?: string
}

export interface LearningComparisonRelationV4 {
  kind: 'relation'
  variant: 'comparison'
  subjects: LearningRelationSubjectV4[]
  rows: LearningRelationComparisonRowV4[]
}

export interface LearningRelationAxisItemV4 {
  id: string
  label: string
}

export interface LearningRelationMatrixCellV4 {
  id: string
  rowId: string
  columnId: string
  label: string
  detail?: string
  tone?: LearningVisualToneV4
}

export interface LearningMatrixRelationV4 {
  kind: 'relation'
  variant: 'matrix'
  rows: LearningRelationAxisItemV4[]
  columns: LearningRelationAxisItemV4[]
  cells: LearningRelationMatrixCellV4[]
}

export interface LearningRelationSetV4 {
  id: string
  label: string
  detail?: string
  tone?: LearningVisualToneV4
}

export interface LearningRelationSetItemV4 {
  id: string
  label: string
  setIds: string[]
  detail?: string
}

export interface LearningSetsRelationV4 {
  kind: 'relation'
  variant: 'sets'
  sets: LearningRelationSetV4[]
  items: LearningRelationSetItemV4[]
}

export type LearningRelationV4 =
  | LearningComparisonRelationV4
  | LearningMatrixRelationV4
  | LearningSetsRelationV4

export interface LearningTimelineEventV4 {
  id: string
  time: string
  label: string
  detail?: string
  /** Optional normalized position from 0 to 1; omit for equal spacing. */
  position?: number
  tone?: LearningVisualToneV4
}

export interface LearningTimelineEraV4 {
  id: string
  label: string
  startEventId: string
  endEventId: string
  detail?: string
  tone?: LearningVisualToneV4
}

export interface LearningTimelineV4 {
  kind: 'timeline'
  orientation?: 'horizontal' | 'vertical'
  events: LearningTimelineEventV4[]
  eras?: LearningTimelineEraV4[]
}

export interface LearningFormulaStepV4 {
  id: string
  /** A single trusted Markdown-math expression, preferably LaTeX without delimiters. */
  expression: string
  label?: string
  /** The named rule that transforms the preceding expression into this one. */
  rule?: string
  detail?: string
  tone?: LearningVisualToneV4
}

export interface LearningFormulaStepsV4 {
  kind: 'formula_steps'
  notation?: string
  steps: LearningFormulaStepV4[]
  conclusion?: string
}

export interface LearningStudySectionV4 {
  id: string
  label: string
  /** Human-readable source location such as “Chapter 2” or “pp. 18–23”. */
  anchor?: string
  summary?: string
}

export interface LearningStudyConceptV4 {
  id: string
  label: string
  sectionId: string
  detail?: string
  prerequisiteIds?: string[]
  role?: 'foundation' | 'core' | 'extension' | 'practice'
  tone?: LearningVisualToneV4
}

export interface LearningStudyMapV4 {
  kind: 'study_map'
  sourceLabel: string
  goal?: string
  sections: LearningStudySectionV4[]
  concepts: LearningStudyConceptV4[]
}

export interface LearningRecallCardV4 {
  id: string
  prompt: string
  answer: string
  hint?: string
  tags?: string[]
}

export interface LearningRecallDeckV4 {
  kind: 'recall_deck'
  instructions?: string
  cards: LearningRecallCardV4[]
}

export type LearningVisualContentV4 =
  | LearningPlotV4
  | LearningNodeLinkV4
  | LearningScene2DV4
  | LearningRelationV4
  | LearningTimelineV4
  | LearningFormulaStepsV4
  | LearningStudyMapV4
  | LearningRecallDeckV4

export interface LearningVisualFrameV4 {
  id: string
  label: string
  description?: string
  focusIds: string[]
}

export interface LearningVisualSequenceV4 {
  initialFrameId?: string
  frames: LearningVisualFrameV4[]
}

/**
 * A semantic, non-blocking visual. The content discriminator selects a trusted
 * native renderer; arbitrary markup and executable payloads are never accepted.
 */
export interface LearningVisualV4 {
  protocol: typeof VISUAL_PROTOCOL_V4
  title: string
  description?: string
  content: LearningVisualContentV4
  sequence?: LearningVisualSequenceV4
  fallbackMarkdown?: string
}

export interface LearningVisualResultV4 {
  protocol: typeof VISUAL_RESULT_PROTOCOL_V4
  status: 'ready'
}

/** A stable, actionable protocol rejection surfaced to the tool call. */
export class LearningProtocolError extends Error {
  readonly code = 'INVALID_LEARNING_ACTIVITY'

  constructor(readonly issues: readonly string[]) {
    super(`Invalid Learning Activity: ${issues.join('; ')}`)
    this.name = 'LearningProtocolError'
  }
}

type RecordValue = Record<string, unknown>

function record(value: unknown): value is RecordValue {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function onlyKeys(value: RecordValue, allowed: readonly string[], path: string, issues: string[]): void {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) issues.push(`${path}.${key} is not supported`)
  }
}

function text(value: unknown, path: string, issues: string[], max = 8_000): value is string {
  if (typeof value !== 'string' || value.trim() === '') {
    issues.push(`${path} must be a non-empty string`)
    return false
  }
  if (value.length > max) issues.push(`${path} exceeds ${String(max)} characters`)
  return true
}

function finite(value: unknown, path: string, issues: string[]): value is number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    issues.push(`${path} must be a finite number`)
    return false
  }
  return true
}

function id(value: unknown, path: string, issues: string[]): value is string {
  if (typeof value !== 'string' || !/^[a-z][a-z0-9_-]{0,31}$/.test(value)) {
    issues.push(`${path} must match ^[a-z][a-z0-9_-]{0,31}$`)
    return false
  }
  return true
}

function uniqueIds(values: readonly RecordValue[], path: string, issues: string[]): void {
  const seen = new Set<string>()
  for (const [index, value] of values.entries()) {
    if (typeof value.id !== 'string') continue
    if (seen.has(value.id)) issues.push(`${path}[${String(index)}].id duplicates ${value.id}`)
    seen.add(value.id)
  }
}

function jsonBytes(value: unknown): number | undefined {
  try {
    return new TextEncoder().encode(JSON.stringify(value)).byteLength
  } catch {
    return undefined
  }
}

function validateJson(value: unknown, path: string, issues: string[]): value is LearningJson {
  const stack: Array<{ value: unknown; path: string; depth: number }> = [{ value, path, depth: 0 }]
  let nodes = 0
  while (stack.length > 0) {
    const current = stack.pop() as { value: unknown; path: string; depth: number }
    nodes += 1
    if (nodes > 512) {
      issues.push(`${path} exceeds 512 JSON nodes`)
      return false
    }
    if (current.depth > 12) {
      issues.push(`${current.path} exceeds JSON depth 12`)
      return false
    }
    const item = current.value
    if (item === null || typeof item === 'string' || typeof item === 'boolean') continue
    if (typeof item === 'number') {
      if (!Number.isFinite(item)) issues.push(`${current.path} must contain finite numbers`)
      continue
    }
    if (Array.isArray(item)) {
      for (let index = item.length - 1; index >= 0; index -= 1) {
        stack.push({ value: item[index], path: `${current.path}[${String(index)}]`, depth: current.depth + 1 })
      }
      continue
    }
    if (record(item)) {
      for (const [key, child] of Object.entries(item)) {
        stack.push({ value: child, path: `${current.path}.${key}`, depth: current.depth + 1 })
      }
      continue
    }
    issues.push(`${current.path} must be lossless JSON`)
  }
  return issues.length === 0
}

function validateMath(
  value: unknown,
  parameterIds: ReadonlySet<string>,
  path: string,
  issues: string[],
  allowX = true,
  maxDepth = MAX_MATH_DEPTH,
): void {
  const binary = new Set<string>(MATH_BINARY_OPERATORS)
  const unary = new Set<string>(MATH_UNARY_OPERATORS)
  const stack: Array<{ value: unknown; path: string; depth: number }> = [{ value, path, depth: 1 }]
  let nodes = 0
  while (stack.length > 0) {
    const node = stack.pop() as { value: unknown; path: string; depth: number }
    nodes += 1
    if (nodes > MAX_MATH_NODES) {
      issues.push(`${path} exceeds ${String(MAX_MATH_NODES)} AST nodes`)
      return
    }
    if (node.depth > maxDepth) {
      issues.push(`${node.path} exceeds AST depth ${String(maxDepth)}`)
      return
    }
    if (!record(node.value) || typeof node.value.op !== 'string') {
      issues.push(`${node.path} must be a mathematical AST node`)
      continue
    }
    const expression = node.value
    const op = expression.op as string
    if (op === 'constant') {
      onlyKeys(expression, ['op', 'value'], node.path, issues)
      if (finite(expression.value, `${node.path}.value`, issues) && Math.abs(expression.value) > 1e12) {
        issues.push(`${node.path}.value exceeds the numeric limit`)
      }
    } else if (op === 'variable') {
      onlyKeys(expression, ['op', 'name'], node.path, issues)
      if (typeof expression.name !== 'string'
        || (!parameterIds.has(expression.name) && !(allowX && expression.name === 'x'))) {
        issues.push(`${node.path}.name must be ${allowX ? 'x or ' : ''}a declared parameter id`)
      }
    } else if (binary.has(op)) {
      onlyKeys(expression, ['op', 'left', 'right'], node.path, issues)
      stack.push(
        { value: expression.right, path: `${node.path}.right`, depth: node.depth + 1 },
        { value: expression.left, path: `${node.path}.left`, depth: node.depth + 1 },
      )
    } else if (unary.has(op)) {
      onlyKeys(expression, ['op', 'value'], node.path, issues)
      stack.push({ value: expression.value, path: `${node.path}.value`, depth: node.depth + 1 })
    } else {
      issues.push(`${node.path}.op is unknown`)
    }
  }
}

function validateParameterExplorer(payload: unknown, issues: string[]): void {
  if (!record(payload)) {
    issues.push('activity.payload must be an object')
    return
  }
  onlyKeys(payload, ['parameters', 'xAxis', 'curves', 'question'], 'activity.payload', issues)
  if (!Array.isArray(payload.parameters) || payload.parameters.length < 1 || payload.parameters.length > 2) {
    issues.push('activity.payload.parameters must contain 1 or 2 parameters')
    return
  }
  const parameters = payload.parameters.filter(record)
  if (parameters.length !== payload.parameters.length) issues.push('activity.payload.parameters entries must be objects')
  uniqueIds(parameters, 'activity.payload.parameters', issues)
  for (const [index, parameter] of parameters.entries()) {
    const path = `activity.payload.parameters[${String(index)}]`
    onlyKeys(parameter, ['id', 'label', 'min', 'max', 'step', 'initial'], path, issues)
    id(parameter.id, `${path}.id`, issues)
    text(parameter.label, `${path}.label`, issues, 120)
    const min = parameter.min
    const max = parameter.max
    const step = parameter.step
    const initial = parameter.initial
    const minOk = finite(min, `${path}.min`, issues)
    const maxOk = finite(max, `${path}.max`, issues)
    const stepOk = finite(step, `${path}.step`, issues)
    const initialOk = finite(initial, `${path}.initial`, issues)
    if (minOk && maxOk && min >= max) issues.push(`${path}.min must be less than max`)
    if (stepOk && step <= 0) issues.push(`${path}.step must be positive`)
    if (minOk && maxOk && stepOk && step > max - min) {
      issues.push(`${path}.step must not exceed the parameter range`)
    }
    if (minOk && maxOk && initialOk && (initial < min || initial > max)) {
      issues.push(`${path}.initial must be inside the parameter range`)
    }
  }
  if (!record(payload.xAxis)) {
    issues.push('activity.payload.xAxis must be an object')
  } else {
    onlyKeys(payload.xAxis, ['label', 'min', 'max', 'samples'], 'activity.payload.xAxis', issues)
    if (payload.xAxis.label !== undefined) text(payload.xAxis.label, 'activity.payload.xAxis.label', issues, 120)
    const xMin = payload.xAxis.min
    const xMax = payload.xAxis.max
    const samples = payload.xAxis.samples
    const minOk = finite(xMin, 'activity.payload.xAxis.min', issues)
    const maxOk = finite(xMax, 'activity.payload.xAxis.max', issues)
    if (minOk && maxOk && xMin >= xMax) issues.push('activity.payload.xAxis.min must be less than max')
    if (samples !== undefined
      && (typeof samples !== 'number' || !Number.isInteger(samples) || samples < 16 || samples > 256)) {
      issues.push('activity.payload.xAxis.samples must be an integer from 16 to 256')
    }
  }
  if (!Array.isArray(payload.curves) || payload.curves.length < 1 || payload.curves.length > 3) {
    issues.push('activity.payload.curves must contain 1 to 3 curves')
  } else {
    const curves = payload.curves.filter(record)
    if (curves.length !== payload.curves.length) issues.push('activity.payload.curves entries must be objects')
    uniqueIds(curves, 'activity.payload.curves', issues)
    const parameterIds = new Set(parameters.map(item => typeof item.id === 'string' ? item.id : ''))
    for (const [index, curve] of curves.entries()) {
      const path = `activity.payload.curves[${String(index)}]`
      onlyKeys(curve, ['id', 'label', 'expression'], path, issues)
      id(curve.id, `${path}.id`, issues)
      text(curve.label, `${path}.label`, issues, 120)
      validateMath(curve.expression, parameterIds, `${path}.expression`, issues)
    }
  }
  if (payload.question !== undefined) text(payload.question, 'activity.payload.question', issues, 2_000)
}

function validateProcessStepper(payload: unknown, issues: string[]): void {
  if (!record(payload)) {
    issues.push('activity.payload must be an object')
    return
  }
  onlyKeys(payload, ['steps', 'question'], 'activity.payload', issues)
  if (!Array.isArray(payload.steps) || payload.steps.length < 2 || payload.steps.length > 12) {
    issues.push('activity.payload.steps must contain 2 to 12 steps')
    return
  }
  const steps = payload.steps.filter(record)
  if (steps.length !== payload.steps.length) issues.push('activity.payload.steps entries must be objects')
  uniqueIds(steps, 'activity.payload.steps', issues)
  for (const [index, step] of steps.entries()) {
    const path = `activity.payload.steps[${String(index)}]`
    onlyKeys(step, ['id', 'title', 'content', 'checkpoint'], path, issues)
    id(step.id, `${path}.id`, issues)
    text(step.title, `${path}.title`, issues, 200)
    text(step.content, `${path}.content`, issues, 4_000)
    if (step.checkpoint !== undefined) {
      if (!record(step.checkpoint)) {
        issues.push(`${path}.checkpoint must be an object`)
      } else {
        onlyKeys(step.checkpoint, ['question', 'options'], `${path}.checkpoint`, issues)
        text(step.checkpoint.question, `${path}.checkpoint.question`, issues, 2_000)
        if (step.checkpoint.options !== undefined) {
          if (!Array.isArray(step.checkpoint.options)
            || step.checkpoint.options.length < 2 || step.checkpoint.options.length > 6
            || !step.checkpoint.options.every(option => typeof option === 'string' && option.trim() !== '')) {
            issues.push(`${path}.checkpoint.options must contain 2 to 6 non-empty strings`)
          }
        }
      }
    }
  }
  if (payload.question !== undefined) text(payload.question, 'activity.payload.question', issues, 2_000)
}

function validateStructureSide(value: unknown, path: string, issues: string[]): RecordValue[] {
  if (!record(value)) {
    issues.push(`${path} must be an object`)
    return []
  }
  onlyKeys(value, ['title', 'items'], path, issues)
  text(value.title, `${path}.title`, issues, 200)
  if (!Array.isArray(value.items) || value.items.length < 1 || value.items.length > 20) {
    issues.push(`${path}.items must contain 1 to 20 items`)
    return []
  }
  const items = value.items.filter(record)
  if (items.length !== value.items.length) issues.push(`${path}.items entries must be objects`)
  uniqueIds(items, `${path}.items`, issues)
  for (const [index, item] of items.entries()) {
    const itemPath = `${path}.items[${String(index)}]`
    onlyKeys(item, ['id', 'label', 'detail'], itemPath, issues)
    id(item.id, `${itemPath}.id`, issues)
    text(item.label, `${itemPath}.label`, issues, 500)
    if (item.detail !== undefined) text(item.detail, `${itemPath}.detail`, issues, 2_000)
  }
  return items
}

function validateStructureCompare(payload: unknown, issues: string[]): void {
  if (!record(payload)) {
    issues.push('activity.payload must be an object')
    return
  }
  onlyKeys(payload, ['left', 'right', 'alignments', 'question'], 'activity.payload', issues)
  const left = validateStructureSide(payload.left, 'activity.payload.left', issues)
  const right = validateStructureSide(payload.right, 'activity.payload.right', issues)
  const leftIds = new Set(left.map(item => typeof item.id === 'string' ? item.id : ''))
  const rightIds = new Set(right.map(item => typeof item.id === 'string' ? item.id : ''))
  if (!Array.isArray(payload.alignments) || payload.alignments.length < 1 || payload.alignments.length > 24) {
    issues.push('activity.payload.alignments must contain 1 to 24 rows')
  } else {
    const alignments = payload.alignments.filter(record)
    if (alignments.length !== payload.alignments.length) issues.push('activity.payload.alignments entries must be objects')
    uniqueIds(alignments, 'activity.payload.alignments', issues)
    for (const [index, alignment] of alignments.entries()) {
      const path = `activity.payload.alignments[${String(index)}]`
      onlyKeys(alignment, ['id', 'leftId', 'rightId', 'prompt'], path, issues)
      id(alignment.id, `${path}.id`, issues)
      if (alignment.leftId === undefined && alignment.rightId === undefined) issues.push(`${path} must reference at least one side`)
      if (alignment.leftId !== undefined && (typeof alignment.leftId !== 'string' || !leftIds.has(alignment.leftId))) {
        issues.push(`${path}.leftId must reference a left item`)
      }
      if (alignment.rightId !== undefined && (typeof alignment.rightId !== 'string' || !rightIds.has(alignment.rightId))) {
        issues.push(`${path}.rightId must reference a right item`)
      }
      if (alignment.prompt !== undefined) text(alignment.prompt, `${path}.prompt`, issues, 1_000)
    }
  }
  if (payload.question !== undefined) text(payload.question, 'activity.payload.question', issues, 2_000)
}

/** Validate and narrow an untrusted model-provided activity. */
export function parseLearningActivity(value: unknown): LearningActivityV1 {
  const issues: string[] = []
  const bytes = jsonBytes(value)
  if (bytes === undefined) issues.push('activity must be serializable JSON')
  else if (bytes > MAX_ACTIVITY_BYTES) issues.push(`activity exceeds ${String(MAX_ACTIVITY_BYTES)} bytes`)
  if (!record(value)) throw new LearningProtocolError([...issues, 'activity must be an object'])
  onlyKeys(value, ['protocol', 'kind', 'title', 'objective', 'prompt', 'scaffold', 'payload', 'fallbackMarkdown'], 'activity', issues)
  if (value.protocol !== ACTIVITY_PROTOCOL) issues.push(`activity.protocol must be ${ACTIVITY_PROTOCOL}`)
  if (!(LEARNING_ACTIVITY_KINDS as readonly unknown[]).includes(value.kind)) issues.push('activity.kind is unknown')
  text(value.title, 'activity.title', issues, 200)
  text(value.objective, 'activity.objective', issues, 1_000)
  text(value.prompt, 'activity.prompt', issues, 2_000)
  if (value.scaffold !== undefined) text(value.scaffold, 'activity.scaffold', issues, 4_000)
  text(value.fallbackMarkdown, 'activity.fallbackMarkdown', issues, 16_000)
  if (value.kind === 'parameter_explorer') validateParameterExplorer(value.payload, issues)
  else if (value.kind === 'process_stepper') validateProcessStepper(value.payload, issues)
  else if (value.kind === 'structure_compare') validateStructureCompare(value.payload, issues)
  if (issues.length > 0) throw new LearningProtocolError(issues)
  return value as unknown as LearningActivityV1
}

/** Validate and narrow a Client response before it returns to the model. */
export function parseLearningResponse(value: unknown, expectedActivityId?: string): LearningResponseV1 {
  const issues: string[] = []
  const bytes = jsonBytes(value)
  if (bytes === undefined) issues.push('response must be serializable JSON')
  else if (bytes > MAX_RESPONSE_BYTES) issues.push(`response exceeds ${String(MAX_RESPONSE_BYTES)} bytes`)
  if (!record(value)) throw new LearningProtocolError([...issues, 'response must be an object'])
  onlyKeys(value, ['protocol', 'activityId', 'action', 'answer', 'interactionState'], 'response', issues)
  if (value.protocol !== RESPONSE_PROTOCOL) issues.push(`response.protocol must be ${RESPONSE_PROTOCOL}`)
  if (typeof value.activityId !== 'string' || value.activityId === '') issues.push('response.activityId must be a non-empty string')
  if (expectedActivityId !== undefined && value.activityId !== expectedActivityId) issues.push('response.activityId does not match the pending activity')
  if (value.action !== 'submit' && value.action !== 'skip' && value.action !== 'cancel') issues.push('response.action is unknown')
  if (value.answer !== undefined) validateJson(value.answer, 'response.answer', issues)
  if (value.interactionState !== undefined) validateJson(value.interactionState, 'response.interactionState', issues)
  if (issues.length > 0) throw new LearningProtocolError(issues)
  return value as unknown as LearningResponseV1
}

function integer(value: unknown, path: string, issues: string[], min = 0): value is number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min) {
    issues.push(`${path} must be an integer >= ${String(min)}`)
    return false
  }
  return true
}

function token(value: unknown, path: string, issues: string[]): value is string {
  if (typeof value !== 'string' || value.length < 1 || value.length > 128 || !/^[A-Za-z0-9_-]+$/.test(value)) {
    issues.push(`${path} must be an opaque token of 1 to 128 URL-safe characters`)
    return false
  }
  return true
}

function validateFocusV2(value: unknown, path: string, issues: string[]): void {
  if (!record(value)) {
    issues.push(`${path} must be an object`)
    return
  }
  onlyKeys(value, ['title', 'progress'], path, issues)
  text(value.title, `${path}.title`, issues, 200)
  if (value.progress !== undefined) {
    if (!record(value.progress)) issues.push(`${path}.progress must be an object`)
    else {
      onlyKeys(value.progress, ['current', 'total'], `${path}.progress`, issues)
      const currentOk = integer(value.progress.current, `${path}.progress.current`, issues, 1)
      const totalOk = value.progress.total === undefined
        ? false
        : integer(value.progress.total, `${path}.progress.total`, issues, 1)
      if (currentOk && totalOk && (value.progress.current as number) > (value.progress.total as number)) {
        issues.push(`${path}.progress.current must not exceed total`)
      }
    }
  }
}

function validateInputV2(value: unknown, issues: string[]): void {
  const path = 'activity.input'
  if (!record(value)) {
    issues.push(`${path} must be an object`)
    return
  }
  if (value.kind === 'single_choice') {
    onlyKeys(value, ['kind', 'options'], path, issues)
    if (!Array.isArray(value.options) || value.options.length < 2 || value.options.length > 8) {
      issues.push(`${path}.options must contain 2 to 8 options`)
      return
    }
    const options = value.options.filter(record)
    if (options.length !== value.options.length) issues.push(`${path}.options entries must be objects`)
    uniqueIds(options, `${path}.options`, issues)
    for (const [index, option] of options.entries()) {
      const optionPath = `${path}.options[${String(index)}]`
      onlyKeys(option, ['id', 'label'], optionPath, issues)
      id(option.id, `${optionPath}.id`, issues)
      text(option.label, `${optionPath}.label`, issues, 500)
    }
  } else if (value.kind === 'short_text') {
    onlyKeys(value, ['kind', 'placeholder', 'maxLength'], path, issues)
    if (value.placeholder !== undefined) text(value.placeholder, `${path}.placeholder`, issues, 500)
    if (value.maxLength !== undefined
      && (!integer(value.maxLength, `${path}.maxLength`, issues, 1) || (value.maxLength as number) > 8_000)) {
      issues.push(`${path}.maxLength must not exceed 8000`)
    }
  } else if (value.kind === 'number') {
    onlyKeys(value, ['kind', 'min', 'max', 'step'], path, issues)
    const minOk = value.min === undefined ? false : finite(value.min, `${path}.min`, issues)
    const maxOk = value.max === undefined ? false : finite(value.max, `${path}.max`, issues)
    const stepOk = value.step === undefined ? false : finite(value.step, `${path}.step`, issues)
    if (minOk && maxOk && (value.min as number) >= (value.max as number)) issues.push(`${path}.min must be less than max`)
    if (stepOk && (value.step as number) <= 0) issues.push(`${path}.step must be positive`)
  } else {
    issues.push(`${path}.kind is unknown`)
  }
}

function validateFrameV2(value: unknown, path: string, issues: string[]): void {
  if (!record(value)) {
    issues.push(`${path} must be an object`)
    return
  }
  onlyKeys(value, ['id', 'title', 'content'], path, issues)
  id(value.id, `${path}.id`, issues)
  text(value.title, `${path}.title`, issues, 200)
  if (value.content !== undefined) text(value.content, `${path}.content`, issues, 4_000)
}

function validateParameterVisualV2(value: RecordValue, path: string, issues: string[], reveal: boolean): void {
  onlyKeys(value, reveal
    ? ['kind', 'parameters', 'xAxis', 'curves', 'emphasis']
    : ['kind', 'parameters', 'xAxis', 'curves'], path, issues)
  validateParameterExplorer({ parameters: value.parameters, xAxis: value.xAxis, curves: value.curves }, issues)
  if (reveal && value.emphasis !== undefined) text(value.emphasis, `${path}.emphasis`, issues, 2_000)
}

function validateStructureVisualV2(value: RecordValue, path: string, issues: string[], reveal: boolean): void {
  onlyKeys(value, reveal
    ? ['kind', 'left', 'right', 'alignments', 'emphasisAlignmentIds']
    : ['kind', 'left', 'right', 'alignments'], path, issues)
  validateStructureCompare({ left: value.left, right: value.right, alignments: value.alignments }, issues)
  if (reveal && value.emphasisAlignmentIds !== undefined) {
    if (!Array.isArray(value.emphasisAlignmentIds)
      || !value.emphasisAlignmentIds.every(item => typeof item === 'string')) {
      issues.push(`${path}.emphasisAlignmentIds must be an array of ids`)
    }
  }
}

function validateVisualV2(value: unknown, phase: 'question' | 'reveal', issues: string[]): void {
  const path = 'activity.visual'
  if (!record(value)) {
    issues.push(`${path} must be an object`)
    return
  }
  if (value.kind === 'process') {
    if (phase === 'question') {
      onlyKeys(value, ['kind', 'frame'], path, issues)
      validateFrameV2(value.frame, `${path}.frame`, issues)
    } else {
      onlyKeys(value, ['kind', 'before', 'after'], path, issues)
      validateFrameV2(value.before, `${path}.before`, issues)
      validateFrameV2(value.after, `${path}.after`, issues)
    }
  } else if (value.kind === 'parameter') {
    validateParameterVisualV2(value, path, issues, phase === 'reveal')
  } else if (value.kind === 'structure') {
    validateStructureVisualV2(value, path, issues, phase === 'reveal')
  } else {
    issues.push(`${path}.kind is unknown`)
  }
}

/** Strict live protocol. V1 is intentionally parsed separately for legacy replay only. */
export function parseLearningActivityV2(value: unknown): LearningActivityV2 {
  const issues: string[] = []
  const bytes = jsonBytes(value)
  if (bytes === undefined) issues.push('activity must be serializable JSON')
  else if (bytes > MAX_ACTIVITY_BYTES) issues.push(`activity exceeds ${String(MAX_ACTIVITY_BYTES)} bytes`)
  if (!record(value)) throw new LearningProtocolError([...issues, 'activity must be an object'])
  if (value.protocol !== ACTIVITY_PROTOCOL_V2) issues.push(`activity.protocol must be ${ACTIVITY_PROTOCOL_V2}`)
  if (value.phase === 'question') {
    onlyKeys(value, ['protocol', 'phase', 'lessonToken', 'seq', 'focus', 'prompt', 'scaffold', 'input', 'visual', 'fallbackMarkdown'], 'activity', issues)
    if (value.lessonToken !== undefined) token(value.lessonToken, 'activity.lessonToken', issues)
    integer(value.seq, 'activity.seq', issues)
    validateFocusV2(value.focus, 'activity.focus', issues)
    text(value.prompt, 'activity.prompt', issues, 2_000)
    if (value.scaffold !== undefined) text(value.scaffold, 'activity.scaffold', issues, 4_000)
    validateInputV2(value.input, issues)
    if (value.visual !== undefined) validateVisualV2(value.visual, 'question', issues)
    text(value.fallbackMarkdown, 'activity.fallbackMarkdown', issues, 16_000)
  } else if (value.phase === 'reveal') {
    onlyKeys(value, ['protocol', 'phase', 'lessonToken', 'roundToken', 'seq', 'focus', 'feedback', 'visual', 'animation', 'advance', 'fallbackMarkdown'], 'activity', issues)
    token(value.lessonToken, 'activity.lessonToken', issues)
    token(value.roundToken, 'activity.roundToken', issues)
    integer(value.seq, 'activity.seq', issues)
    validateFocusV2(value.focus, 'activity.focus', issues)
    if (!record(value.feedback)) issues.push('activity.feedback must be an object')
    else {
      onlyKeys(value.feedback, ['verdict', 'learnerEcho', 'explanation', 'answer'], 'activity.feedback', issues)
      if (value.feedback.verdict !== undefined
        && !['correct', 'partial', 'misconception', 'neutral'].includes(value.feedback.verdict as string)) {
        issues.push('activity.feedback.verdict is unknown')
      }
      if (value.feedback.learnerEcho !== undefined) text(value.feedback.learnerEcho, 'activity.feedback.learnerEcho', issues, 2_000)
      text(value.feedback.explanation, 'activity.feedback.explanation', issues, 8_000)
      if (value.feedback.answer !== undefined) text(value.feedback.answer, 'activity.feedback.answer', issues, 4_000)
    }
    if (value.visual !== undefined) validateVisualV2(value.visual, 'reveal', issues)
    if (!record(value.animation)) issues.push('activity.animation must be an object')
    else {
      onlyKeys(value.animation, ['kind', 'preferredDurationMs', 'reducedMotion'], 'activity.animation', issues)
      if (!['draw', 'morph', 'highlight', 'step_complete'].includes(value.animation.kind as string)) issues.push('activity.animation.kind is unknown')
      if (value.animation.preferredDurationMs !== undefined
        && (!integer(value.animation.preferredDurationMs, 'activity.animation.preferredDurationMs', issues, 0)
          || (value.animation.preferredDurationMs as number) > 10_000)) {
        issues.push('activity.animation.preferredDurationMs must not exceed 10000')
      }
      if (value.animation.reducedMotion !== 'commit-final-state') issues.push('activity.animation.reducedMotion must be commit-final-state')
    }
    if (!record(value.advance)) issues.push('activity.advance must be an object')
    else {
      onlyKeys(value.advance, ['mode', 'label'], 'activity.advance', issues)
      if (value.advance.mode !== 'user-after-animation') issues.push('activity.advance.mode must be user-after-animation')
      if (value.advance.label !== undefined) text(value.advance.label, 'activity.advance.label', issues, 120)
    }
    text(value.fallbackMarkdown, 'activity.fallbackMarkdown', issues, 16_000)
  } else {
    issues.push('activity.phase must be question or reveal')
  }
  if (issues.length > 0) throw new LearningProtocolError(issues)
  return value as unknown as LearningActivityV2
}

export type ExpectedLearningResponseV2 = Partial<Pick<LearningResponseV2,
  'activityId' | 'phase' | 'lessonToken' | 'roundToken' | 'seq'>>

/** Validate a phase-bound Client receipt before the Broker changes lesson state. */
export function parseLearningResponseV2(value: unknown, expected: ExpectedLearningResponseV2 = {}): LearningResponseV2 {
  const issues: string[] = []
  const bytes = jsonBytes(value)
  if (bytes === undefined) issues.push('response must be serializable JSON')
  else if (bytes > MAX_RESPONSE_BYTES) issues.push(`response exceeds ${String(MAX_RESPONSE_BYTES)} bytes`)
  if (!record(value)) throw new LearningProtocolError([...issues, 'response must be an object'])
  if (value.phase === 'question') {
    onlyKeys(value, ['protocol', 'phase', 'activityId', 'lessonToken', 'roundToken', 'seq', 'action', 'answer', 'receiptId', 'interactionState'], 'response', issues)
    if (!['submit', 'skip', 'cancel'].includes(value.action as string)) issues.push('response.action is unknown')
    if (value.answer !== undefined) validateJson(value.answer, 'response.answer', issues)
  } else if (value.phase === 'reveal') {
    onlyKeys(value, ['protocol', 'phase', 'activityId', 'lessonToken', 'roundToken', 'seq', 'action', 'animation', 'receiptId', 'interactionState'], 'response', issues)
    if (!['continue', 'skip', 'cancel'].includes(value.action as string)) issues.push('response.action is unknown')
    if (!record(value.animation)) issues.push('response.animation must be an object')
    else {
      onlyKeys(value.animation, ['completed', 'skipped', 'reducedMotion', 'error'], 'response.animation', issues)
      if (typeof value.animation.completed !== 'boolean') issues.push('response.animation.completed must be boolean')
      if (value.animation.skipped !== undefined && typeof value.animation.skipped !== 'boolean') issues.push('response.animation.skipped must be boolean')
      if (value.animation.reducedMotion !== undefined && typeof value.animation.reducedMotion !== 'boolean') issues.push('response.animation.reducedMotion must be boolean')
      if (value.animation.error !== undefined && typeof value.animation.error !== 'string') issues.push('response.animation.error must be a string')
      if (value.action === 'continue' && value.animation.completed !== true) issues.push('response.animation.completed must be true before continue')
    }
  } else {
    issues.push('response.phase must be question or reveal')
  }
  if (value.protocol !== RESPONSE_PROTOCOL_V2) issues.push(`response.protocol must be ${RESPONSE_PROTOCOL_V2}`)
  token(value.activityId, 'response.activityId', issues)
  token(value.lessonToken, 'response.lessonToken', issues)
  token(value.roundToken, 'response.roundToken', issues)
  integer(value.seq, 'response.seq', issues)
  token(value.receiptId, 'response.receiptId', issues)
  if (value.interactionState !== undefined) validateJson(value.interactionState, 'response.interactionState', issues)
  for (const [key, expectedValue] of Object.entries(expected)) {
    if (expectedValue !== undefined && value[key] !== expectedValue) issues.push(`response.${key} does not match the pending activity`)
  }
  if (issues.length > 0) throw new LearningProtocolError(issues)
  return value as unknown as LearningResponseV2
}

const CHECKPOINT_RAW_HTML = /<(?:!DOCTYPE\b|!--|\/?[A-Za-z][^<>]*>)/i
const CHECKPOINT_LEAKAGE_COPY = /\b(?:correct\s+answer|model\s+answer|answer\s+key|(?:the\s+)?answer\s*(?:is|was|[:：])|solution\s*[:：]|expected\s+(?:answer|response|result)\s*[:：]|grading\s+rubric|scoring\s+rubric|future\s+(?:step|question)|next\s+question\s*:)|(?:正确|标准|参考|模型)(?:答案|解答)|标准解\s*[:：]?|(?:答案|解答)\s*[:：]|答案(?:是|为)|评分(?:标准|细则)|下一(?:步|题|个问题)|后续步骤|未来步骤/iu

/** Canonical fail-closed predicate shared by protocol parsing and Client fallback extraction. */
export function isLearningCheckpointDisplayTextSafe(value: string): boolean {
  return !CHECKPOINT_RAW_HTML.test(value) && !CHECKPOINT_LEAKAGE_COPY.test(value)
}

function checkpointDisplayText(
  value: unknown,
  path: string,
  issues: string[],
  max: number,
): value is string {
  const valid = text(value, path, issues, max)
  if (valid && !isLearningCheckpointDisplayTextSafe(value)) {
    issues.push(`${path} must not contain raw HTML, an answer key, scoring rubric, or future-step copy`)
    return false
  }
  return valid
}

/** Strict, answer-free protocol for one optional learner checkpoint. */
export function parseLearningCheckpointV1(value: unknown): LearningCheckpointV1 {
  const issues: string[] = []
  const bytes = jsonBytes(value)
  if (bytes === undefined) issues.push('checkpoint must be serializable JSON')
  else if (bytes > MAX_ACTIVITY_BYTES) issues.push(`checkpoint exceeds ${String(MAX_ACTIVITY_BYTES)} bytes`)
  if (!record(value)) throw new LearningProtocolError([...issues, 'checkpoint must be an object'])

  onlyKeys(
    value,
    ['protocol', 'kind', 'prompt', 'context', 'expectedEvidence', 'options', 'fallbackMarkdown'],
    'checkpoint',
    issues,
  )
  if (value.protocol !== CHECKPOINT_PROTOCOL) {
    issues.push(`checkpoint.protocol must be ${CHECKPOINT_PROTOCOL}`)
  }
  if (!LEARNING_CHECKPOINT_KINDS.includes(value.kind as LearningCheckpointKindV1)) {
    issues.push(`checkpoint.kind must be one of ${LEARNING_CHECKPOINT_KINDS.join(', ')}`)
  }
  checkpointDisplayText(value.prompt, 'checkpoint.prompt', issues, 2_000)
  if (value.context !== undefined) checkpointDisplayText(value.context, 'checkpoint.context', issues, 4_000)
  if (!LEARNING_CHECKPOINT_EVIDENCE_KINDS.includes(value.expectedEvidence as LearningCheckpointEvidenceKindV1)) {
    issues.push(`checkpoint.expectedEvidence must be one of ${LEARNING_CHECKPOINT_EVIDENCE_KINDS.join(', ')}`)
  }
  checkpointDisplayText(value.fallbackMarkdown, 'checkpoint.fallbackMarkdown', issues, 8_000)

  if (value.kind === 'single_choice') {
    if (!Array.isArray(value.options) || value.options.length < 2 || value.options.length > 8) {
      issues.push('checkpoint.options must contain 2 to 8 options for single_choice')
    } else {
      const options = value.options.filter(record)
      if (options.length !== value.options.length) issues.push('checkpoint.options entries must be objects')
      uniqueIds(options, 'checkpoint.options', issues)
      for (const [index, option] of options.entries()) {
        const path = `checkpoint.options[${String(index)}]`
        onlyKeys(option, ['id', 'label'], path, issues)
        id(option.id, `${path}.id`, issues)
        checkpointDisplayText(option.label, `${path}.label`, issues, 500)
      }
    }
  } else if (value.options !== undefined) {
    issues.push('checkpoint.options is supported only for single_choice')
  }

  if (issues.length > 0) throw new LearningProtocolError(issues)
  return value as unknown as LearningCheckpointV1
}

export interface ExpectedLearningCheckpointResultV1 {
  checkpointId?: string
  checkpoint?: LearningCheckpointV1
}

/** Validate one phase-bound checkpoint receipt before the Host accepts it. */
export function parseLearningCheckpointResultV1(
  value: unknown,
  expected: ExpectedLearningCheckpointResultV1 = {},
): LearningCheckpointResultV1 {
  const issues: string[] = []
  const bytes = jsonBytes(value)
  if (bytes === undefined) issues.push('checkpoint result must be serializable JSON')
  else if (bytes > MAX_RESPONSE_BYTES) {
    issues.push(`checkpoint result exceeds ${String(MAX_RESPONSE_BYTES)} bytes`)
  }
  if (!record(value)) throw new LearningProtocolError([...issues, 'checkpoint result must be an object'])

  const submitted = value.status === 'submitted'
  onlyKeys(
    value,
    submitted
      ? ['protocol', 'checkpointId', 'status', 'response', 'receiptId']
      : ['protocol', 'checkpointId', 'status', 'receiptId'],
    'checkpointResult',
    issues,
  )
  if (value.protocol !== CHECKPOINT_RESULT_PROTOCOL) {
    issues.push(`checkpointResult.protocol must be ${CHECKPOINT_RESULT_PROTOCOL}`)
  }
  token(value.checkpointId, 'checkpointResult.checkpointId', issues)
  token(value.receiptId, 'checkpointResult.receiptId', issues)
  if (!['submitted', 'skipped', 'cancelled'].includes(value.status as string)) {
    issues.push('checkpointResult.status must be submitted, skipped, or cancelled')
  }
  if (expected.checkpointId !== undefined && value.checkpointId !== expected.checkpointId) {
    issues.push('checkpointResult.checkpointId does not match the pending checkpoint')
  }

  let checkpoint: LearningCheckpointV1 | undefined
  if (expected.checkpoint !== undefined) {
    try {
      checkpoint = parseLearningCheckpointV1(expected.checkpoint)
    } catch (cause) {
      if (cause instanceof LearningProtocolError) {
        issues.push(...cause.issues.map(issue => `expected ${issue}`))
      } else throw cause
    }
  }

  if (submitted) {
    if (!record(value.response)) {
      issues.push('checkpointResult.response must be an object when submitted')
    } else {
      const response = value.response
      const responsePath = 'checkpointResult.response'
      const expectedKind = checkpoint?.kind
      const shape = expectedKind === 'single_choice'
        ? 'optionId'
        : expectedKind === 'numeric'
          ? 'number'
          : expectedKind === undefined
            ? undefined
            : 'text'

      if (shape === 'optionId' || (shape === undefined && Object.hasOwn(response, 'optionId'))) {
        onlyKeys(response, ['optionId'], responsePath, issues)
        const optionIdOk = id(response.optionId, `${responsePath}.optionId`, issues)
        if (optionIdOk && checkpoint?.options !== undefined
          && !checkpoint.options.some(option => option.id === response.optionId)) {
          issues.push(`${responsePath}.optionId must reference a declared checkpoint option`)
        }
      } else if (shape === 'number' || (shape === undefined && Object.hasOwn(response, 'number'))) {
        onlyKeys(response, ['number'], responsePath, issues)
        finite(response.number, `${responsePath}.number`, issues)
      } else if (shape === 'text' || (shape === undefined && Object.hasOwn(response, 'text'))) {
        onlyKeys(response, ['text'], responsePath, issues)
        text(response.text, `${responsePath}.text`, issues, expectedKind === 'code_slot' ? 16_000 : 8_000)
      } else {
        issues.push(`${responsePath} must contain exactly one of text, optionId, or number`)
        onlyKeys(response, [], responsePath, issues)
      }
    }
  } else if (value.response !== undefined) {
    // `onlyKeys` reports the unsupported field; retain an explicit semantic issue too.
    issues.push('checkpointResult.response is allowed only when status is submitted')
  }

  if (issues.length > 0) throw new LearningProtocolError(issues)
  return value as unknown as LearningCheckpointResultV1
}

const VISUAL_TONES_V3 = new Set<LearningVisualToneV3>(['blue', 'green', 'red', 'orange', 'purple', 'gray'])
const VISUAL_STROKES_V3 = new Set<LearningVisualStrokeV3>(['solid', 'dashed', 'dotted'])

function validateVisualAxisV3(value: unknown, path: string, issues: string[], samplesAllowed: boolean): void {
  if (!record(value)) {
    issues.push(`${path} must be an object`)
    return
  }
  onlyKeys(value, samplesAllowed ? ['label', 'min', 'max', 'samples'] : ['label', 'min', 'max'], path, issues)
  if (value.label !== undefined) text(value.label, `${path}.label`, issues, 120)
  const minOk = finite(value.min, `${path}.min`, issues)
  const maxOk = finite(value.max, `${path}.max`, issues)
  if (minOk && maxOk && (value.min as number) >= (value.max as number)) {
    issues.push(`${path}.min must be less than max`)
  }
  if (samplesAllowed && value.samples !== undefined
    && (!integer(value.samples, `${path}.samples`, issues, 24) || (value.samples as number) > 256)) {
    issues.push(`${path}.samples must be an integer from 24 to 256`)
  }
}

function validateVisualParametersV3(value: unknown, issues: string[]): RecordValue[] {
  const path = 'visual.parameters'
  if (!Array.isArray(value) || value.length < 1 || value.length > 3) {
    issues.push(`${path} must contain 1 to 3 parameters`)
    return []
  }
  const parameters = value.filter(record)
  if (parameters.length !== value.length) issues.push(`${path} entries must be objects`)
  uniqueIds(parameters, path, issues)
  for (const [index, parameter] of parameters.entries()) {
    const itemPath = `${path}[${String(index)}]`
    onlyKeys(parameter, ['id', 'label', 'min', 'max', 'step', 'initial'], itemPath, issues)
    id(parameter.id, `${itemPath}.id`, issues)
    if (parameter.id === 'x') issues.push(`${itemPath}.id must not use the reserved x-axis variable`)
    text(parameter.label, `${itemPath}.label`, issues, 120)
    const minOk = finite(parameter.min, `${itemPath}.min`, issues)
    const maxOk = finite(parameter.max, `${itemPath}.max`, issues)
    const stepOk = finite(parameter.step, `${itemPath}.step`, issues)
    const initialOk = finite(parameter.initial, `${itemPath}.initial`, issues)
    if (minOk && maxOk && (parameter.min as number) >= (parameter.max as number)) {
      issues.push(`${itemPath}.min must be less than max`)
    }
    if (stepOk && (parameter.step as number) <= 0) issues.push(`${itemPath}.step must be positive`)
    if (minOk && maxOk && stepOk && (parameter.step as number) > (parameter.max as number) - (parameter.min as number)) {
      issues.push(`${itemPath}.step must not exceed the parameter range`)
    }
    if (minOk && maxOk && initialOk
      && ((parameter.initial as number) < (parameter.min as number)
        || (parameter.initial as number) > (parameter.max as number))) {
      issues.push(`${itemPath}.initial must be inside the parameter range`)
    }
  }
  return parameters
}

/** Validate the preferred, non-blocking visual protocol. */
export function parseLearningVisualV3(value: unknown): LearningVisualV3 {
  const issues: string[] = []
  const bytes = jsonBytes(value)
  if (bytes === undefined) issues.push('visual must be serializable JSON')
  else if (bytes > MAX_ACTIVITY_BYTES) issues.push(`visual exceeds ${String(MAX_ACTIVITY_BYTES)} bytes`)
  if (!record(value)) throw new LearningProtocolError([...issues, 'visual must be an object'])
  onlyKeys(value, ['protocol', 'kind', 'title', 'description', 'parameters', 'xAxis', 'yAxis', 'series', 'metrics'], 'visual', issues)
  if (value.protocol !== VISUAL_PROTOCOL_V3) issues.push(`visual.protocol must be ${VISUAL_PROTOCOL_V3}`)
  if (value.kind !== 'parameter_chart') issues.push('visual.kind must be parameter_chart')
  text(value.title, 'visual.title', issues, 200)
  if (value.description !== undefined) text(value.description, 'visual.description', issues, 1_000)
  const parameters = validateVisualParametersV3(value.parameters, issues)
  const parameterIds = new Set(parameters.flatMap(parameter => typeof parameter.id === 'string' ? [parameter.id] : []))
  validateVisualAxisV3(value.xAxis, 'visual.xAxis', issues, true)
  validateVisualAxisV3(value.yAxis, 'visual.yAxis', issues, false)

  if (!Array.isArray(value.series) || value.series.length < 1 || value.series.length > 8) {
    issues.push('visual.series must contain 1 to 8 series')
  } else {
    const series = value.series.filter(record)
    if (series.length !== value.series.length) issues.push('visual.series entries must be objects')
    uniqueIds(series, 'visual.series', issues)
    let curveCount = 0
    for (const [index, item] of series.entries()) {
      const path = `visual.series[${String(index)}]`
      id(item.id, `${path}.id`, issues)
      text(item.label, `${path}.label`, issues, 160)
      if (item.tone !== undefined && !VISUAL_TONES_V3.has(item.tone as LearningVisualToneV3)) {
        issues.push(`${path}.tone is unknown`)
      }
      if (item.type === 'curve') {
        curveCount += 1
        onlyKeys(item, ['type', 'id', 'label', 'expression', 'tone', 'stroke'], path, issues)
        if (item.stroke !== undefined && !VISUAL_STROKES_V3.has(item.stroke as LearningVisualStrokeV3)) {
          issues.push(`${path}.stroke is unknown`)
        }
        validateMath(item.expression, parameterIds, `${path}.expression`, issues, true, MAX_VISUAL_MATH_DEPTH)
      } else if (item.type === 'points') {
        onlyKeys(item, ['type', 'id', 'label', 'points', 'tone'], path, issues)
        if (!Array.isArray(item.points) || item.points.length < 1 || item.points.length > 128) {
          issues.push(`${path}.points must contain 1 to 128 points`)
          continue
        }
        for (const [pointIndex, point] of item.points.entries()) {
          const pointPath = `${path}.points[${String(pointIndex)}]`
          if (!record(point)) {
            issues.push(`${pointPath} must be an object`)
            continue
          }
          onlyKeys(point, ['x', 'y', 'label'], pointPath, issues)
          finite(point.x, `${pointPath}.x`, issues)
          finite(point.y, `${pointPath}.y`, issues)
          if (point.label !== undefined) text(point.label, `${pointPath}.label`, issues, 160)
        }
      } else {
        issues.push(`${path}.type must be curve or points`)
      }
    }
    if (curveCount === 0) issues.push('visual.series must contain at least one curve')
  }

  if (value.metrics !== undefined) {
    if (!Array.isArray(value.metrics) || value.metrics.length > 4) {
      issues.push('visual.metrics must contain at most 4 metrics')
    } else {
      const metrics = value.metrics.filter(record)
      if (metrics.length !== value.metrics.length) issues.push('visual.metrics entries must be objects')
      uniqueIds(metrics, 'visual.metrics', issues)
      for (const [index, metric] of metrics.entries()) {
        const path = `visual.metrics[${String(index)}]`
        onlyKeys(metric, ['id', 'label', 'expression', 'digits', 'suffix'], path, issues)
        id(metric.id, `${path}.id`, issues)
        text(metric.label, `${path}.label`, issues, 160)
        validateMath(metric.expression, parameterIds, `${path}.expression`, issues, false, MAX_VISUAL_MATH_DEPTH)
        if (metric.digits !== undefined
          && (!integer(metric.digits, `${path}.digits`, issues) || (metric.digits as number) > 6)) {
          issues.push(`${path}.digits must be an integer from 0 to 6`)
        }
        if (metric.suffix !== undefined) text(metric.suffix, `${path}.suffix`, issues, 80)
      }
    }
  }

  if (issues.length > 0) throw new LearningProtocolError(issues)
  return value as unknown as LearningVisualV3
}

function validateVisualToneV4(value: unknown, path: string, issues: string[]): void {
  if (value !== undefined && !VISUAL_TONES_V3.has(value as LearningVisualToneV3)) {
    issues.push(`${path} is unknown`)
  }
}

function validateVisualStrokeV4(value: unknown, path: string, issues: string[]): void {
  if (value !== undefined && !VISUAL_STROKES_V3.has(value as LearningVisualStrokeV3)) {
    issues.push(`${path} is unknown`)
  }
}

function registerVisualIdV4(
  ids: Set<string>,
  value: unknown,
  path: string,
  issues: string[],
): void {
  if (typeof value !== 'string') return
  if (ids.has(value)) issues.push(`${path} duplicates visual id ${value}`)
  else ids.add(value)
}

function validateVisualParametersV4(value: unknown, issues: string[]): RecordValue[] {
  const path = 'visual.content.parameters'
  if (value === undefined) return []
  if (!Array.isArray(value) || value.length > 3) {
    issues.push(`${path} must contain at most 3 parameters`)
    return []
  }
  const parameters = value.filter(record)
  if (parameters.length !== value.length) issues.push(`${path} entries must be objects`)
  uniqueIds(parameters, path, issues)
  for (const [index, parameter] of parameters.entries()) {
    const itemPath = `${path}[${String(index)}]`
    onlyKeys(parameter, ['id', 'label', 'min', 'max', 'step', 'initial'], itemPath, issues)
    id(parameter.id, `${itemPath}.id`, issues)
    if (parameter.id === 'x') issues.push(`${itemPath}.id must not use the reserved x-axis variable`)
    text(parameter.label, `${itemPath}.label`, issues, 120)
    const minOk = finite(parameter.min, `${itemPath}.min`, issues)
    const maxOk = finite(parameter.max, `${itemPath}.max`, issues)
    const stepOk = finite(parameter.step, `${itemPath}.step`, issues)
    const initialOk = finite(parameter.initial, `${itemPath}.initial`, issues)
    if (minOk && maxOk && (parameter.min as number) >= (parameter.max as number)) {
      issues.push(`${itemPath}.min must be less than max`)
    }
    if (stepOk && (parameter.step as number) <= 0) issues.push(`${itemPath}.step must be positive`)
    if (minOk && maxOk && stepOk && (parameter.step as number) > (parameter.max as number) - (parameter.min as number)) {
      issues.push(`${itemPath}.step must not exceed the parameter range`)
    }
    if (minOk && maxOk && initialOk
      && ((parameter.initial as number) < (parameter.min as number)
        || (parameter.initial as number) > (parameter.max as number))) {
      issues.push(`${itemPath}.initial must be inside the parameter range`)
    }
  }
  return parameters
}

function validateVisualPointsV4(value: unknown, path: string, issues: string[], maximum = 256): void {
  if (!Array.isArray(value) || value.length < 1 || value.length > maximum) {
    issues.push(`${path} must contain 1 to ${String(maximum)} points`)
    return
  }
  for (const [index, point] of value.entries()) {
    const pointPath = `${path}[${String(index)}]`
    if (!record(point)) {
      issues.push(`${pointPath} must be an object`)
      continue
    }
    onlyKeys(point, ['x', 'y', 'label'], pointPath, issues)
    finite(point.x, `${pointPath}.x`, issues)
    finite(point.y, `${pointPath}.y`, issues)
    if (point.label !== undefined) text(point.label, `${pointPath}.label`, issues, 160)
  }
}

function validateVisualMetricsV4(
  value: unknown,
  parameterIds: ReadonlySet<string>,
  issues: string[],
): RecordValue[] {
  if (value === undefined) return []
  if (!Array.isArray(value) || value.length > 4) {
    issues.push('visual.content.metrics must contain at most 4 metrics')
    return []
  }
  const metrics = value.filter(record)
  if (metrics.length !== value.length) issues.push('visual.content.metrics entries must be objects')
  uniqueIds(metrics, 'visual.content.metrics', issues)
  for (const [index, metric] of metrics.entries()) {
    const path = `visual.content.metrics[${String(index)}]`
    onlyKeys(metric, ['id', 'label', 'expression', 'digits', 'suffix'], path, issues)
    id(metric.id, `${path}.id`, issues)
    text(metric.label, `${path}.label`, issues, 160)
    validateMath(metric.expression, parameterIds, `${path}.expression`, issues, false, MAX_VISUAL_MATH_DEPTH)
    if (metric.digits !== undefined
      && (!integer(metric.digits, `${path}.digits`, issues) || (metric.digits as number) > 6)) {
      issues.push(`${path}.digits must be an integer from 0 to 6`)
    }
    if (metric.suffix !== undefined) text(metric.suffix, `${path}.suffix`, issues, 80)
  }
  return metrics
}

function validatePlotV4(value: RecordValue, issues: string[]): Set<string> {
  const ids = new Set<string>()
  onlyKeys(value, ['kind', 'parameters', 'xAxis', 'yAxis', 'series', 'metrics'], 'visual.content', issues)
  const parameters = validateVisualParametersV4(value.parameters, issues)
  const parameterIds = new Set(parameters.flatMap(parameter => typeof parameter.id === 'string' ? [parameter.id] : []))
  for (const parameterId of parameterIds) registerVisualIdV4(ids, parameterId, 'visual.content.parameters', issues)
  validateVisualAxisV3(value.xAxis, 'visual.content.xAxis', issues, true)
  validateVisualAxisV3(value.yAxis, 'visual.content.yAxis', issues, false)
  if (!Array.isArray(value.series) || value.series.length < 1 || value.series.length > 8) {
    issues.push('visual.content.series must contain 1 to 8 series')
  } else {
    const series = value.series.filter(record)
    if (series.length !== value.series.length) issues.push('visual.content.series entries must be objects')
    uniqueIds(series, 'visual.content.series', issues)
    for (const [index, item] of series.entries()) {
      const path = `visual.content.series[${String(index)}]`
      if (id(item.id, `${path}.id`, issues)) registerVisualIdV4(ids, item.id, `${path}.id`, issues)
      text(item.label, `${path}.label`, issues, 160)
      validateVisualToneV4(item.tone, `${path}.tone`, issues)
      if (item.type === 'curve') {
        onlyKeys(item, ['type', 'id', 'label', 'expression', 'tone', 'stroke'], path, issues)
        validateVisualStrokeV4(item.stroke, `${path}.stroke`, issues)
        validateMath(item.expression, parameterIds, `${path}.expression`, issues, true, MAX_VISUAL_MATH_DEPTH)
      } else if (item.type === 'points' || item.type === 'bars') {
        onlyKeys(item, ['type', 'id', 'label', 'points', 'tone'], path, issues)
        validateVisualPointsV4(item.points, `${path}.points`, issues, item.type === 'bars' ? 64 : 256)
      } else if (item.type === 'line') {
        onlyKeys(item, ['type', 'id', 'label', 'points', 'tone', 'stroke'], path, issues)
        validateVisualStrokeV4(item.stroke, `${path}.stroke`, issues)
        validateVisualPointsV4(item.points, `${path}.points`, issues)
      } else {
        issues.push(`${path}.type must be curve, points, line, or bars`)
      }
    }
  }
  const metrics = validateVisualMetricsV4(value.metrics, parameterIds, issues)
  for (const [index, metric] of metrics.entries()) {
    if (typeof metric.id === 'string') registerVisualIdV4(ids, metric.id, `visual.content.metrics[${String(index)}].id`, issues)
  }
  return ids
}

function validateNodeLinkV4(value: RecordValue, issues: string[]): Set<string> {
  const focusIds = new Set<string>()
  onlyKeys(value, ['kind', 'layout', 'groups', 'nodes', 'edges'], 'visual.content', issues)
  if (!['layered', 'hierarchy', 'radial'].includes(value.layout as string)) {
    issues.push('visual.content.layout must be layered, hierarchy, or radial')
  }
  let groups: RecordValue[] = []
  if (value.groups !== undefined) {
    if (!Array.isArray(value.groups) || value.groups.length < 1 || value.groups.length > 12) {
      issues.push('visual.content.groups must contain 1 to 12 groups')
    } else {
      groups = value.groups.filter(record)
      if (groups.length !== value.groups.length) issues.push('visual.content.groups entries must be objects')
      uniqueIds(groups, 'visual.content.groups', issues)
      for (const [index, group] of groups.entries()) {
        const path = `visual.content.groups[${String(index)}]`
        onlyKeys(group, ['id', 'label'], path, issues)
        if (id(group.id, `${path}.id`, issues)) registerVisualIdV4(focusIds, group.id, `${path}.id`, issues)
        text(group.label, `${path}.label`, issues, 120)
      }
    }
  }
  const groupIds = new Set(groups.flatMap(group => typeof group.id === 'string' ? [group.id] : []))
  let nodes: RecordValue[] = []
  if (!Array.isArray(value.nodes) || value.nodes.length < 2 || value.nodes.length > 48) {
    issues.push('visual.content.nodes must contain 2 to 48 nodes')
  } else {
    nodes = value.nodes.filter(record)
    if (nodes.length !== value.nodes.length) issues.push('visual.content.nodes entries must be objects')
    uniqueIds(nodes, 'visual.content.nodes', issues)
    for (const [index, node] of nodes.entries()) {
      const path = `visual.content.nodes[${String(index)}]`
      onlyKeys(node, ['id', 'label', 'detail', 'group', 'tone'], path, issues)
      if (id(node.id, `${path}.id`, issues)) registerVisualIdV4(focusIds, node.id, `${path}.id`, issues)
      text(node.label, `${path}.label`, issues, 120)
      if (node.detail !== undefined) text(node.detail, `${path}.detail`, issues, 1_000)
      if (node.group !== undefined && (typeof node.group !== 'string' || !groupIds.has(node.group))) {
        issues.push(`${path}.group must reference a declared group`)
      }
      validateVisualToneV4(node.tone, `${path}.tone`, issues)
    }
  }
  if (value.layout === 'layered' && (groups.length === 0 || nodes.some(node => typeof node.group !== 'string'))) {
    issues.push('visual.content layered layouts require groups and a group on every node')
  }
  const nodeIds = new Set(nodes.flatMap(node => typeof node.id === 'string' ? [node.id] : []))
  if (!Array.isArray(value.edges) || value.edges.length < 1 || value.edges.length > 160) {
    issues.push('visual.content.edges must contain 1 to 160 edges')
  } else {
    const edges = value.edges.filter(record)
    if (edges.length !== value.edges.length) issues.push('visual.content.edges entries must be objects')
    uniqueIds(edges, 'visual.content.edges', issues)
    for (const [index, edge] of edges.entries()) {
      const path = `visual.content.edges[${String(index)}]`
      onlyKeys(edge, ['id', 'from', 'to', 'label', 'detail', 'tone', 'stroke', 'directed'], path, issues)
      if (id(edge.id, `${path}.id`, issues)) registerVisualIdV4(focusIds, edge.id, `${path}.id`, issues)
      if (typeof edge.from !== 'string' || !nodeIds.has(edge.from)) issues.push(`${path}.from must reference a declared node`)
      if (typeof edge.to !== 'string' || !nodeIds.has(edge.to)) issues.push(`${path}.to must reference a declared node`)
      if (edge.label !== undefined) text(edge.label, `${path}.label`, issues, 120)
      if (edge.detail !== undefined) text(edge.detail, `${path}.detail`, issues, 1_000)
      validateVisualToneV4(edge.tone, `${path}.tone`, issues)
      validateVisualStrokeV4(edge.stroke, `${path}.stroke`, issues)
      if (edge.directed !== undefined && typeof edge.directed !== 'boolean') issues.push(`${path}.directed must be a boolean`)
    }
  }
  return focusIds
}

function validateSceneElementBaseV4(
  element: RecordValue,
  path: string,
  allowed: readonly string[],
  issues: string[],
): void {
  onlyKeys(element, ['type', 'id', 'label', 'detail', 'tone', ...allowed], path, issues)
  id(element.id, `${path}.id`, issues)
  if (element.label !== undefined) text(element.label, `${path}.label`, issues, 120)
  if (element.detail !== undefined) text(element.detail, `${path}.detail`, issues, 1_000)
  validateVisualToneV4(element.tone, `${path}.tone`, issues)
}

function validateScene2DV4(value: RecordValue, issues: string[]): Set<string> {
  const focusIds = new Set<string>()
  onlyKeys(value, ['kind', 'xAxis', 'yAxis', 'grid', 'elements'], 'visual.content', issues)
  validateVisualAxisV3(value.xAxis, 'visual.content.xAxis', issues, false)
  validateVisualAxisV3(value.yAxis, 'visual.content.yAxis', issues, false)
  if (value.grid !== undefined && typeof value.grid !== 'boolean') {
    issues.push('visual.content.grid must be a boolean')
  }
  if (!Array.isArray(value.elements) || value.elements.length < 1 || value.elements.length > 64) {
    issues.push('visual.content.elements must contain 1 to 64 elements')
    return focusIds
  }
  const elements = value.elements.filter(record)
  if (elements.length !== value.elements.length) issues.push('visual.content.elements entries must be objects')
  uniqueIds(elements, 'visual.content.elements', issues)
  for (const [index, element] of elements.entries()) {
    const path = `visual.content.elements[${String(index)}]`
    registerVisualIdV4(focusIds, element.id, `${path}.id`, issues)
    if (element.type === 'point') {
      validateSceneElementBaseV4(element, path, ['x', 'y', 'size'], issues)
      finite(element.x, `${path}.x`, issues)
      finite(element.y, `${path}.y`, issues)
      if (element.size !== undefined
        && (finite(element.size, `${path}.size`, issues) && ((element.size as number) <= 0 || (element.size as number) > 64))) {
        issues.push(`${path}.size must be greater than 0 and at most 64`)
      }
    } else if (element.type === 'segment' || element.type === 'arrow') {
      validateSceneElementBaseV4(element, path, ['x1', 'y1', 'x2', 'y2', 'stroke'], issues)
      finite(element.x1, `${path}.x1`, issues)
      finite(element.y1, `${path}.y1`, issues)
      finite(element.x2, `${path}.x2`, issues)
      finite(element.y2, `${path}.y2`, issues)
      validateVisualStrokeV4(element.stroke, `${path}.stroke`, issues)
    } else if (element.type === 'circle') {
      validateSceneElementBaseV4(element, path, ['cx', 'cy', 'r'], issues)
      finite(element.cx, `${path}.cx`, issues)
      finite(element.cy, `${path}.cy`, issues)
      if (finite(element.r, `${path}.r`, issues) && (element.r as number) <= 0) issues.push(`${path}.r must be positive`)
    } else if (element.type === 'rect') {
      validateSceneElementBaseV4(element, path, ['x', 'y', 'width', 'height'], issues)
      finite(element.x, `${path}.x`, issues)
      finite(element.y, `${path}.y`, issues)
      if (finite(element.width, `${path}.width`, issues) && (element.width as number) <= 0) issues.push(`${path}.width must be positive`)
      if (finite(element.height, `${path}.height`, issues) && (element.height as number) <= 0) issues.push(`${path}.height must be positive`)
    } else if (element.type === 'polygon') {
      validateSceneElementBaseV4(element, path, ['points'], issues)
      if (!Array.isArray(element.points) || element.points.length < 3 || element.points.length > 24) {
        issues.push(`${path}.points must contain 3 to 24 points`)
      } else {
        for (const [pointIndex, point] of element.points.entries()) {
          const pointPath = `${path}.points[${String(pointIndex)}]`
          if (!record(point)) {
            issues.push(`${pointPath} must be an object`)
            continue
          }
          onlyKeys(point, ['x', 'y'], pointPath, issues)
          finite(point.x, `${pointPath}.x`, issues)
          finite(point.y, `${pointPath}.y`, issues)
        }
      }
    } else if (element.type === 'label') {
      validateSceneElementBaseV4(element, path, ['x', 'y', 'text'], issues)
      finite(element.x, `${path}.x`, issues)
      finite(element.y, `${path}.y`, issues)
      text(element.text, `${path}.text`, issues, 240)
    } else {
      issues.push(`${path}.type must be point, segment, arrow, circle, rect, polygon, or label`)
    }
  }
  return focusIds
}

function validateRelationSubjectsV4(value: unknown, path: string, issues: string[]): RecordValue[] {
  if (!Array.isArray(value) || value.length < 2 || value.length > 4) {
    issues.push(`${path} must contain 2 to 4 subjects`)
    return []
  }
  const subjects = value.filter(record)
  if (subjects.length !== value.length) issues.push(`${path} entries must be objects`)
  uniqueIds(subjects, path, issues)
  for (const [index, subject] of subjects.entries()) {
    const itemPath = `${path}[${String(index)}]`
    onlyKeys(subject, ['id', 'label', 'detail', 'tone'], itemPath, issues)
    id(subject.id, `${itemPath}.id`, issues)
    text(subject.label, `${itemPath}.label`, issues, 120)
    if (subject.detail !== undefined) text(subject.detail, `${itemPath}.detail`, issues, 1_000)
    validateVisualToneV4(subject.tone, `${itemPath}.tone`, issues)
  }
  return subjects
}

function validateRelationAxisV4(value: unknown, path: string, issues: string[]): RecordValue[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 10) {
    issues.push(`${path} must contain 1 to 10 items`)
    return []
  }
  const items = value.filter(record)
  if (items.length !== value.length) issues.push(`${path} entries must be objects`)
  uniqueIds(items, path, issues)
  for (const [index, item] of items.entries()) {
    const itemPath = `${path}[${String(index)}]`
    onlyKeys(item, ['id', 'label'], itemPath, issues)
    id(item.id, `${itemPath}.id`, issues)
    text(item.label, `${itemPath}.label`, issues, 120)
  }
  return items
}

function validateRelationV4(value: RecordValue, issues: string[]): Set<string> {
  const focusIds = new Set<string>()
  if (value.variant === 'comparison') {
    onlyKeys(value, ['kind', 'variant', 'subjects', 'rows'], 'visual.content', issues)
    const subjects = validateRelationSubjectsV4(value.subjects, 'visual.content.subjects', issues)
    const subjectIds = new Set(subjects.flatMap(subject => typeof subject.id === 'string' ? [subject.id] : []))
    for (const subjectId of subjectIds) registerVisualIdV4(focusIds, subjectId, 'visual.content.subjects', issues)
    if (!Array.isArray(value.rows) || value.rows.length < 1 || value.rows.length > 16) {
      issues.push('visual.content.rows must contain 1 to 16 comparison rows')
      return focusIds
    }
    const rows = value.rows.filter(record)
    if (rows.length !== value.rows.length) issues.push('visual.content.rows entries must be objects')
    uniqueIds(rows, 'visual.content.rows', issues)
    for (const [index, row] of rows.entries()) {
      const path = `visual.content.rows[${String(index)}]`
      onlyKeys(row, ['id', 'label', 'cells', 'detail'], path, issues)
      if (id(row.id, `${path}.id`, issues)) registerVisualIdV4(focusIds, row.id, `${path}.id`, issues)
      text(row.label, `${path}.label`, issues, 120)
      if (row.detail !== undefined) text(row.detail, `${path}.detail`, issues, 1_000)
      if (!Array.isArray(row.cells) || row.cells.length < 1 || row.cells.length > 4) {
        issues.push(`${path}.cells must contain 1 to 4 cells`)
        continue
      }
      const seenSubjects = new Set<string>()
      for (const [cellIndex, cell] of row.cells.entries()) {
        const cellPath = `${path}.cells[${String(cellIndex)}]`
        if (!record(cell)) {
          issues.push(`${cellPath} must be an object`)
          continue
        }
        onlyKeys(cell, ['subjectId', 'value', 'tone'], cellPath, issues)
        if (typeof cell.subjectId !== 'string' || !subjectIds.has(cell.subjectId)) {
          issues.push(`${cellPath}.subjectId must reference a declared subject`)
        } else if (seenSubjects.has(cell.subjectId)) {
          issues.push(`${cellPath}.subjectId duplicates ${cell.subjectId}`)
        } else seenSubjects.add(cell.subjectId)
        text(cell.value, `${cellPath}.value`, issues, 500)
        validateVisualToneV4(cell.tone, `${cellPath}.tone`, issues)
      }
    }
  } else if (value.variant === 'matrix') {
    onlyKeys(value, ['kind', 'variant', 'rows', 'columns', 'cells'], 'visual.content', issues)
    const rows = validateRelationAxisV4(value.rows, 'visual.content.rows', issues)
    const columns = validateRelationAxisV4(value.columns, 'visual.content.columns', issues)
    const rowIds = new Set(rows.flatMap(row => typeof row.id === 'string' ? [row.id] : []))
    const columnIds = new Set(columns.flatMap(column => typeof column.id === 'string' ? [column.id] : []))
    for (const rowId of rowIds) registerVisualIdV4(focusIds, rowId, 'visual.content.rows', issues)
    for (const columnId of columnIds) registerVisualIdV4(focusIds, columnId, 'visual.content.columns', issues)
    if (!Array.isArray(value.cells) || value.cells.length < 1 || value.cells.length > 64) {
      issues.push('visual.content.cells must contain 1 to 64 matrix cells')
      return focusIds
    }
    const cells = value.cells.filter(record)
    if (cells.length !== value.cells.length) issues.push('visual.content.cells entries must be objects')
    uniqueIds(cells, 'visual.content.cells', issues)
    const coordinates = new Set<string>()
    for (const [index, cell] of cells.entries()) {
      const path = `visual.content.cells[${String(index)}]`
      onlyKeys(cell, ['id', 'rowId', 'columnId', 'label', 'detail', 'tone'], path, issues)
      if (id(cell.id, `${path}.id`, issues)) registerVisualIdV4(focusIds, cell.id, `${path}.id`, issues)
      if (typeof cell.rowId !== 'string' || !rowIds.has(cell.rowId)) issues.push(`${path}.rowId must reference a declared row`)
      if (typeof cell.columnId !== 'string' || !columnIds.has(cell.columnId)) issues.push(`${path}.columnId must reference a declared column`)
      if (typeof cell.rowId === 'string' && typeof cell.columnId === 'string') {
        const coordinate = `${cell.rowId}\u0000${cell.columnId}`
        if (coordinates.has(coordinate)) issues.push(`${path} duplicates a matrix coordinate`)
        coordinates.add(coordinate)
      }
      text(cell.label, `${path}.label`, issues, 240)
      if (cell.detail !== undefined) text(cell.detail, `${path}.detail`, issues, 1_000)
      validateVisualToneV4(cell.tone, `${path}.tone`, issues)
    }
  } else if (value.variant === 'sets') {
    onlyKeys(value, ['kind', 'variant', 'sets', 'items'], 'visual.content', issues)
    const sets = validateRelationSubjectsV4(value.sets, 'visual.content.sets', issues)
    if (sets.length > 3) issues.push('visual.content.sets must contain at most 3 sets')
    const setIds = new Set(sets.flatMap(item => typeof item.id === 'string' ? [item.id] : []))
    for (const setId of setIds) registerVisualIdV4(focusIds, setId, 'visual.content.sets', issues)
    if (!Array.isArray(value.items) || value.items.length < 1 || value.items.length > 24) {
      issues.push('visual.content.items must contain 1 to 24 set items')
      return focusIds
    }
    const items = value.items.filter(record)
    if (items.length !== value.items.length) issues.push('visual.content.items entries must be objects')
    uniqueIds(items, 'visual.content.items', issues)
    for (const [index, item] of items.entries()) {
      const path = `visual.content.items[${String(index)}]`
      onlyKeys(item, ['id', 'label', 'setIds', 'detail'], path, issues)
      if (id(item.id, `${path}.id`, issues)) registerVisualIdV4(focusIds, item.id, `${path}.id`, issues)
      text(item.label, `${path}.label`, issues, 120)
      if (item.detail !== undefined) text(item.detail, `${path}.detail`, issues, 1_000)
      if (!Array.isArray(item.setIds) || item.setIds.length < 1 || item.setIds.length > 3) {
        issues.push(`${path}.setIds must contain 1 to 3 set ids`)
      } else {
        const memberships = new Set<string>()
        for (const setId of item.setIds) {
          if (typeof setId !== 'string' || !setIds.has(setId)) issues.push(`${path}.setIds must reference declared sets`)
          else if (memberships.has(setId)) issues.push(`${path}.setIds duplicates ${setId}`)
          else memberships.add(setId)
        }
      }
    }
  } else {
    issues.push('visual.content.variant must be comparison, matrix, or sets')
  }
  return focusIds
}

function validateTimelineV4(value: RecordValue, issues: string[]): Set<string> {
  const focusIds = new Set<string>()
  onlyKeys(value, ['kind', 'orientation', 'events', 'eras'], 'visual.content', issues)
  if (value.orientation !== undefined && value.orientation !== 'horizontal' && value.orientation !== 'vertical') {
    issues.push('visual.content.orientation must be horizontal or vertical')
  }
  let events: RecordValue[] = []
  if (!Array.isArray(value.events) || value.events.length < 2 || value.events.length > 32) {
    issues.push('visual.content.events must contain 2 to 32 events')
  } else {
    events = value.events.filter(record)
    if (events.length !== value.events.length) issues.push('visual.content.events entries must be objects')
    uniqueIds(events, 'visual.content.events', issues)
    const hasPositions = events.filter(event => event.position !== undefined).length
    if (hasPositions !== 0 && hasPositions !== events.length) {
      issues.push('visual.content.events.position must be provided for every event or omitted for every event')
    }
    let previousPosition = -1
    for (const [index, event] of events.entries()) {
      const path = `visual.content.events[${String(index)}]`
      onlyKeys(event, ['id', 'time', 'label', 'detail', 'position', 'tone'], path, issues)
      if (id(event.id, `${path}.id`, issues)) registerVisualIdV4(focusIds, event.id, `${path}.id`, issues)
      text(event.time, `${path}.time`, issues, 80)
      text(event.label, `${path}.label`, issues, 160)
      if (event.detail !== undefined) text(event.detail, `${path}.detail`, issues, 1_500)
      if (event.position !== undefined && finite(event.position, `${path}.position`, issues)) {
        const position = event.position as number
        if (position < 0 || position > 1) issues.push(`${path}.position must be from 0 to 1`)
        if (position <= previousPosition) issues.push(`${path}.position must be greater than the preceding event position`)
        previousPosition = position
      }
      validateVisualToneV4(event.tone, `${path}.tone`, issues)
    }
  }
  const eventIds = new Set(events.flatMap(event => typeof event.id === 'string' ? [event.id] : []))
  const eventIndexes = new Map(events.flatMap((event, index) => typeof event.id === 'string' ? [[event.id, index] as const] : []))
  if (value.eras !== undefined) {
    if (!Array.isArray(value.eras) || value.eras.length < 1 || value.eras.length > 8) {
      issues.push('visual.content.eras must contain 1 to 8 eras')
    } else {
      const eras = value.eras.filter(record)
      if (eras.length !== value.eras.length) issues.push('visual.content.eras entries must be objects')
      uniqueIds(eras, 'visual.content.eras', issues)
      for (const [index, era] of eras.entries()) {
        const path = `visual.content.eras[${String(index)}]`
        onlyKeys(era, ['id', 'label', 'startEventId', 'endEventId', 'detail', 'tone'], path, issues)
        if (id(era.id, `${path}.id`, issues)) registerVisualIdV4(focusIds, era.id, `${path}.id`, issues)
        text(era.label, `${path}.label`, issues, 120)
        if (typeof era.startEventId !== 'string' || !eventIds.has(era.startEventId)) {
          issues.push(`${path}.startEventId must reference a declared event`)
        }
        if (typeof era.endEventId !== 'string' || !eventIds.has(era.endEventId)) {
          issues.push(`${path}.endEventId must reference a declared event`)
        }
        if (typeof era.startEventId === 'string' && typeof era.endEventId === 'string') {
          const startIndex = eventIndexes.get(era.startEventId)
          const endIndex = eventIndexes.get(era.endEventId)
          if (startIndex !== undefined && endIndex !== undefined && startIndex > endIndex) {
            issues.push(`${path}.startEventId must not occur after endEventId`)
          }
        }
        if (era.detail !== undefined) text(era.detail, `${path}.detail`, issues, 1_000)
        validateVisualToneV4(era.tone, `${path}.tone`, issues)
      }
    }
  }
  return focusIds
}

function validateFormulaStepsV4(value: RecordValue, issues: string[]): Set<string> {
  const focusIds = new Set<string>()
  onlyKeys(value, ['kind', 'notation', 'steps', 'conclusion'], 'visual.content', issues)
  if (value.notation !== undefined) text(value.notation, 'visual.content.notation', issues, 300)
  if (value.conclusion !== undefined) text(value.conclusion, 'visual.content.conclusion', issues, 1_000)
  if (!Array.isArray(value.steps) || value.steps.length < 2 || value.steps.length > 16) {
    issues.push('visual.content.steps must contain 2 to 16 formula steps')
    return focusIds
  }
  const steps = value.steps.filter(record)
  if (steps.length !== value.steps.length) issues.push('visual.content.steps entries must be objects')
  uniqueIds(steps, 'visual.content.steps', issues)
  for (const [index, step] of steps.entries()) {
    const path = `visual.content.steps[${String(index)}]`
    onlyKeys(step, ['id', 'expression', 'label', 'rule', 'detail', 'tone'], path, issues)
    if (id(step.id, `${path}.id`, issues)) registerVisualIdV4(focusIds, step.id, `${path}.id`, issues)
    text(step.expression, `${path}.expression`, issues, 500)
    if (step.label !== undefined) text(step.label, `${path}.label`, issues, 120)
    if (step.rule !== undefined) text(step.rule, `${path}.rule`, issues, 240)
    if (step.detail !== undefined) text(step.detail, `${path}.detail`, issues, 1_500)
    validateVisualToneV4(step.tone, `${path}.tone`, issues)
  }
  return focusIds
}

function validateStudyMapV4(value: RecordValue, issues: string[]): Set<string> {
  const focusIds = new Set<string>()
  onlyKeys(value, ['kind', 'sourceLabel', 'goal', 'sections', 'concepts'], 'visual.content', issues)
  text(value.sourceLabel, 'visual.content.sourceLabel', issues, 240)
  if (value.goal !== undefined) text(value.goal, 'visual.content.goal', issues, 600)
  let sections: RecordValue[] = []
  if (!Array.isArray(value.sections) || value.sections.length < 1 || value.sections.length > 16) {
    issues.push('visual.content.sections must contain 1 to 16 sections')
  } else {
    sections = value.sections.filter(record)
    if (sections.length !== value.sections.length) issues.push('visual.content.sections entries must be objects')
    uniqueIds(sections, 'visual.content.sections', issues)
    for (const [index, section] of sections.entries()) {
      const path = `visual.content.sections[${String(index)}]`
      onlyKeys(section, ['id', 'label', 'anchor', 'summary'], path, issues)
      if (id(section.id, `${path}.id`, issues)) registerVisualIdV4(focusIds, section.id, `${path}.id`, issues)
      text(section.label, `${path}.label`, issues, 160)
      if (section.anchor !== undefined) text(section.anchor, `${path}.anchor`, issues, 160)
      if (section.summary !== undefined) text(section.summary, `${path}.summary`, issues, 1_000)
    }
  }
  const sectionIds = new Set(sections.flatMap(section => typeof section.id === 'string' ? [section.id] : []))
  let concepts: RecordValue[] = []
  if (!Array.isArray(value.concepts) || value.concepts.length < 1 || value.concepts.length > 48) {
    issues.push('visual.content.concepts must contain 1 to 48 concepts')
  } else {
    concepts = value.concepts.filter(record)
    if (concepts.length !== value.concepts.length) issues.push('visual.content.concepts entries must be objects')
    uniqueIds(concepts, 'visual.content.concepts', issues)
    for (const [index, concept] of concepts.entries()) {
      const path = `visual.content.concepts[${String(index)}]`
      onlyKeys(concept, ['id', 'label', 'sectionId', 'detail', 'prerequisiteIds', 'role', 'tone'], path, issues)
      if (id(concept.id, `${path}.id`, issues)) registerVisualIdV4(focusIds, concept.id, `${path}.id`, issues)
      text(concept.label, `${path}.label`, issues, 160)
      if (typeof concept.sectionId !== 'string' || !sectionIds.has(concept.sectionId)) {
        issues.push(`${path}.sectionId must reference a declared section`)
      }
      if (concept.detail !== undefined) text(concept.detail, `${path}.detail`, issues, 1_500)
      if (concept.role !== undefined && !['foundation', 'core', 'extension', 'practice'].includes(concept.role as string)) {
        issues.push(`${path}.role must be foundation, core, extension, or practice`)
      }
      validateVisualToneV4(concept.tone, `${path}.tone`, issues)
    }
  }
  const conceptIds = new Set(concepts.flatMap(concept => typeof concept.id === 'string' ? [concept.id] : []))
  const prerequisiteGraph = new Map<string, string[]>()
  for (const [index, concept] of concepts.entries()) {
    if (concept.prerequisiteIds === undefined) continue
    const path = `visual.content.concepts[${String(index)}].prerequisiteIds`
    if (!Array.isArray(concept.prerequisiteIds) || concept.prerequisiteIds.length > 8) {
      issues.push(`${path} must contain at most 8 concept ids`)
      continue
    }
    const seen = new Set<string>()
    for (const prerequisiteId of concept.prerequisiteIds) {
      if (typeof prerequisiteId !== 'string' || !conceptIds.has(prerequisiteId)) {
        issues.push(`${path} must reference declared concepts`)
      } else if (prerequisiteId === concept.id) {
        issues.push(`${path} must not reference its own concept`)
      } else if (seen.has(prerequisiteId)) {
        issues.push(`${path} duplicates ${prerequisiteId}`)
      } else seen.add(prerequisiteId)
    }
    if (typeof concept.id === 'string') prerequisiteGraph.set(concept.id, [...seen])
  }
  const visited = new Set<string>()
  const visiting = new Set<string>()
  const visit = (conceptId: string): boolean => {
    if (visiting.has(conceptId)) return true
    if (visited.has(conceptId)) return false
    visiting.add(conceptId)
    const cyclic = (prerequisiteGraph.get(conceptId) ?? []).some(visit)
    visiting.delete(conceptId)
    visited.add(conceptId)
    return cyclic
  }
  if ([...conceptIds].some(visit)) {
    issues.push('visual.content.concepts prerequisiteIds must not contain a cycle')
  }
  return focusIds
}

function validateRecallDeckV4(value: RecordValue, issues: string[]): Set<string> {
  const focusIds = new Set<string>()
  onlyKeys(value, ['kind', 'instructions', 'cards'], 'visual.content', issues)
  if (value.instructions !== undefined) text(value.instructions, 'visual.content.instructions', issues, 600)
  if (!Array.isArray(value.cards) || value.cards.length < 2 || value.cards.length > 32) {
    issues.push('visual.content.cards must contain 2 to 32 cards')
    return focusIds
  }
  const cards = value.cards.filter(record)
  if (cards.length !== value.cards.length) issues.push('visual.content.cards entries must be objects')
  uniqueIds(cards, 'visual.content.cards', issues)
  for (const [index, card] of cards.entries()) {
    const path = `visual.content.cards[${String(index)}]`
    onlyKeys(card, ['id', 'prompt', 'answer', 'hint', 'tags'], path, issues)
    if (id(card.id, `${path}.id`, issues)) registerVisualIdV4(focusIds, card.id, `${path}.id`, issues)
    text(card.prompt, `${path}.prompt`, issues, 1_000)
    text(card.answer, `${path}.answer`, issues, 2_000)
    if (card.hint !== undefined) text(card.hint, `${path}.hint`, issues, 800)
    if (card.tags !== undefined) {
      if (!Array.isArray(card.tags) || card.tags.length > 6) {
        issues.push(`${path}.tags must contain at most 6 labels`)
      } else {
        const seen = new Set<string>()
        for (const [tagIndex, tag] of card.tags.entries()) {
          const tagPath = `${path}.tags[${String(tagIndex)}]`
          if (text(tag, tagPath, issues, 80) && typeof tag === 'string') {
            if (seen.has(tag)) issues.push(`${path}.tags duplicates ${tag}`)
            else seen.add(tag)
          }
        }
      }
    }
  }
  return focusIds
}

function validateVisualSequenceV4(value: unknown, focusIds: ReadonlySet<string>, issues: string[]): void {
  if (value === undefined) return
  if (!record(value)) {
    issues.push('visual.sequence must be an object')
    return
  }
  onlyKeys(value, ['initialFrameId', 'frames'], 'visual.sequence', issues)
  if (!Array.isArray(value.frames) || value.frames.length < 2 || value.frames.length > 12) {
    issues.push('visual.sequence.frames must contain 2 to 12 frames')
    return
  }
  const frames = value.frames.filter(record)
  if (frames.length !== value.frames.length) issues.push('visual.sequence.frames entries must be objects')
  uniqueIds(frames, 'visual.sequence.frames', issues)
  const frameIds = new Set<string>()
  for (const [index, frame] of frames.entries()) {
    const path = `visual.sequence.frames[${String(index)}]`
    onlyKeys(frame, ['id', 'label', 'description', 'focusIds'], path, issues)
    if (id(frame.id, `${path}.id`, issues)) frameIds.add(frame.id)
    text(frame.label, `${path}.label`, issues, 120)
    if (frame.description !== undefined) text(frame.description, `${path}.description`, issues, 1_000)
    if (!Array.isArray(frame.focusIds) || frame.focusIds.length > 64) {
      issues.push(`${path}.focusIds must contain at most 64 ids`)
      continue
    }
    const seen = new Set<string>()
    for (const [focusIndex, focusId] of frame.focusIds.entries()) {
      if (typeof focusId !== 'string' || !focusIds.has(focusId)) {
        issues.push(`${path}.focusIds[${String(focusIndex)}] must reference visual content`)
      } else if (seen.has(focusId)) {
        issues.push(`${path}.focusIds duplicates ${focusId}`)
      } else seen.add(focusId)
    }
  }
  if (value.initialFrameId !== undefined
    && (typeof value.initialFrameId !== 'string' || !frameIds.has(value.initialFrameId))) {
    issues.push('visual.sequence.initialFrameId must reference a declared frame')
  }
}

/** Validate the semantic, model-facing visual protocol while retaining V3 replay separately. */
export function parseLearningVisualV4(value: unknown): LearningVisualV4 {
  const issues: string[] = []
  const bytes = jsonBytes(value)
  if (bytes === undefined) issues.push('visual must be serializable JSON')
  else if (bytes > MAX_ACTIVITY_BYTES) issues.push(`visual exceeds ${String(MAX_ACTIVITY_BYTES)} bytes`)
  if (!record(value)) throw new LearningProtocolError([...issues, 'visual must be an object'])
  onlyKeys(value, ['protocol', 'title', 'description', 'content', 'sequence', 'fallbackMarkdown'], 'visual', issues)
  if (value.protocol !== VISUAL_PROTOCOL_V4) issues.push(`visual.protocol must be ${VISUAL_PROTOCOL_V4}`)
  text(value.title, 'visual.title', issues, 200)
  if (value.description !== undefined) text(value.description, 'visual.description', issues, 1_000)
  if (value.fallbackMarkdown !== undefined) text(value.fallbackMarkdown, 'visual.fallbackMarkdown', issues, 8_000)
  let focusIds = new Set<string>()
  if (!record(value.content)) {
    issues.push('visual.content must be an object')
  } else if (value.content.kind === 'plot') {
    focusIds = validatePlotV4(value.content, issues)
  } else if (value.content.kind === 'node_link') {
    focusIds = validateNodeLinkV4(value.content, issues)
  } else if (value.content.kind === 'scene_2d') {
    focusIds = validateScene2DV4(value.content, issues)
  } else if (value.content.kind === 'relation') {
    focusIds = validateRelationV4(value.content, issues)
  } else if (value.content.kind === 'timeline') {
    focusIds = validateTimelineV4(value.content, issues)
  } else if (value.content.kind === 'formula_steps') {
    focusIds = validateFormulaStepsV4(value.content, issues)
  } else if (value.content.kind === 'study_map') {
    focusIds = validateStudyMapV4(value.content, issues)
  } else if (value.content.kind === 'recall_deck') {
    focusIds = validateRecallDeckV4(value.content, issues)
  } else {
    issues.push(`visual.content.kind must be one of ${LEARNING_VISUAL_KINDS_V4.join(', ')}`)
  }
  validateVisualSequenceV4(value.sequence, focusIds, issues)
  if (issues.length > 0) throw new LearningProtocolError(issues)
  return value as unknown as LearningVisualV4
}

export function parseLearningVisualResultV4(value: unknown): LearningVisualResultV4 {
  const issues: string[] = []
  if (!record(value)) throw new LearningProtocolError(['visual result must be an object'])
  onlyKeys(value, ['protocol', 'status'], 'visualResult', issues)
  if (value.protocol !== VISUAL_RESULT_PROTOCOL_V4) {
    issues.push(`visualResult.protocol must be ${VISUAL_RESULT_PROTOCOL_V4}`)
  }
  if (value.status !== 'ready') issues.push('visualResult.status must be ready')
  if (issues.length > 0) throw new LearningProtocolError(issues)
  return value as unknown as LearningVisualResultV4
}

export function parseLearningVisualResultV3(value: unknown): LearningVisualResultV3 {
  const issues: string[] = []
  if (!record(value)) throw new LearningProtocolError(['visual result must be an object'])
  onlyKeys(value, ['protocol', 'status'], 'visualResult', issues)
  if (value.protocol !== VISUAL_RESULT_PROTOCOL_V3) {
    issues.push(`visualResult.protocol must be ${VISUAL_RESULT_PROTOCOL_V3}`)
  }
  if (value.status !== 'ready') issues.push('visualResult.status must be ready')
  if (issues.length > 0) throw new LearningProtocolError(issues)
  return value as unknown as LearningVisualResultV3
}
