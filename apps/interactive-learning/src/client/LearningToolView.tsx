import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { useEffect, useMemo } from 'react'
import { MarkdownText } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ToolCallViewProps } from '@deepseek-ai/dsh-client-ui-tool/client'
import type { PendingInteraction, ToolCallBlock } from '@deepseek-ai/dsh-client-runtime/client'
import {
  parseLearningCheckpointV1,
  parseLearningCheckpointResultV1,
  isLearningCheckpointDisplayTextSafe,
  parseLearningActivity,
  parseLearningActivityV2,
  parseLearningVisualV3,
  parseLearningVisualResultV3,
  parseLearningVisualV4,
  parseLearningVisualResultV4,
  parseLearningResponse,
  parseLearningResponseV2,
  LearningProtocolError,
  CHECKPOINT_PROTOCOL,
  CHECKPOINT_RESULT_PROTOCOL,
  ACTIVITY_PROTOCOL_V2,
  RESPONSE_PROTOCOL,
  RESPONSE_PROTOCOL_V2,
  VISUAL_PROTOCOL_V3,
  VISUAL_PROTOCOL_V4,
  VISUAL_RESULT_PROTOCOL_V3,
  VISUAL_RESULT_PROTOCOL_V4,
  type LearningCheckpointV1,
  type LearningCheckpointResultV1,
  type LearningActivityV1,
  type LearningActivityV2,
  type LearningResponseV1,
  type LearningResponseV2,
  type LearningVisualV3,
  type LearningVisualResultV3,
  type LearningVisualV4 as LearningVisualV4Definition,
  type LearningVisualResultV4,
} from '../protocol.ts'
import { envelopeOf, LearningInteraction, type LearningQuestionWait } from './LearningComposer.tsx'
import css from './LearningActivity.module.css'
import { learningScope } from './tokens.ts'
import { emitLearningCallLifecycle } from './lifecycle.ts'
import { LearningVisual } from './LearningVisual.tsx'
import { LearningVisualV4, type LearningVisualV4Labels } from './visuals/index.tsx'
import type { LearningLocaleKey } from './locales.ts'

type LearningToolViewProps = ToolCallViewProps & PropsLocale<'interactive-learning'>

/** Every payload shape this view can render, live or from durable replay. */
type LearningCallDefinition =
  | LearningActivityV1
  | LearningActivityV2
  | LearningCheckpointV1
  | LearningVisualV3
  | LearningVisualV4Definition

type LearningCallResult =
  | LearningResponseV1
  | LearningResponseV2
  | LearningCheckpointResultV1

/** Text the surface can still show when a payload fails its closed schema. */
interface LearningTextFallback {
  markdown?: string
  text?: string
  protocol: string
}

/**
 * One parse of one `argsRaw` string.
 *
 * The identity of `definition` is stable for a stable `argsRaw`, which is what
 * keeps learner-owned view state (the chosen sequence frame, a revealed recall
 * card, probed plot values) alive across the unrelated re-renders this view
 * receives while the session streams.
 */
interface ParsedLearningCall {
  definition?: LearningCallDefinition
  /** Closed-schema violations, kept so the surface can say what was wrong. */
  issues?: readonly string[]
  fallback?: LearningTextFallback
  /** Title recovered from still-incomplete arguments, for the running state. */
  streamingTitle?: string
}

const MAX_PARSEABLE_ARGS_BYTES = 64 * 1024
const MAX_FALLBACK_MARKDOWN_LENGTH = 8_000
const VISUAL_LABEL_KEYS = {
  eyebrow: 'visualEyebrow',
  errorTitle: 'visualErrorTitle',
  errorContinue: 'visualErrorContinue',
  sequenceLabel: 'visualSequenceLabel',
  previousStep: 'visualPreviousStep',
  nextStep: 'visualNextStep',
  reset: 'visualReset',
  chartProbeHint: 'visualChartProbeHint',
  metricsLabel: 'visualMetricsLabel',
  legendLabel: 'visualLegendLabel',
  plotInteractionHint: 'visualPlotInteractionHint',
  noValuesInRange: 'visualNoValuesInRange',
  seriesOutOfRange: 'visualSeriesOutOfRange',
  nodeLinkSummary: 'visualNodeLinkSummary',
  connection: 'visualConnection',
  layerLabel: 'visualLayerLabel',
  edgeLabel: 'visualEdgeLabel',
  nodeLinkInteractionHint: 'visualNodeLinkInteractionHint',
  nodeKind: 'visualNodeKind',
  edgeKind: 'visualEdgeKind',
  noDetail: 'visualNoDetail',
  closeDetail: 'visualCloseDetail',
  elementFallback: 'visualElementFallback',
  sceneSummary: 'visualSceneSummary',
  sceneInteractionHint: 'visualSceneInteractionHint',
  elementKind: 'visualElementKind',
  comparisonCaption: 'visualComparisonCaption',
  comparisonDimension: 'visualComparisonDimension',
  comparisonSubject: 'visualComparisonSubject',
  comparisonInteractionHint: 'visualComparisonInteractionHint',
  matrixCaption: 'visualMatrixCaption',
  matrixAxes: 'visualMatrixAxes',
  noRelation: 'visualNoRelation',
  matrixInteractionHint: 'visualMatrixInteractionHint',
  setsLabel: 'visualSetsLabel',
  noExclusiveItems: 'visualNoExclusiveItems',
  intersections: 'visualIntersections',
  uncategorized: 'visualUncategorized',
  setsInteractionHint: 'visualSetsInteractionHint',
  timelineLabel: 'visualTimelineLabel',
  timelineEventKind: 'visualTimelineEventKind',
  timelineEraKind: 'visualTimelineEraKind',
  timelineInteractionHint: 'visualTimelineInteractionHint',
  formulaLabel: 'visualFormulaLabel',
  formulaProgress: 'visualFormulaProgress',
  formulaRule: 'visualFormulaRule',
  formulaConclusion: 'visualFormulaConclusion',
  revealNextFormulaStep: 'visualRevealNextFormulaStep',
  formulaComplete: 'visualFormulaComplete',
  formulaInteractionHint: 'visualFormulaInteractionHint',
  studySource: 'visualStudySource',
  studyGoal: 'visualStudyGoal',
  studySections: 'visualStudySections',
  studyConcepts: 'visualStudyConcepts',
  studyAnchor: 'visualStudyAnchor',
  studySummary: 'visualStudySummary',
  prerequisite: 'visualPrerequisite',
  noPrerequisite: 'visualNoPrerequisite',
  roleFoundation: 'visualRoleFoundation',
  roleCore: 'visualRoleCore',
  roleExtension: 'visualRoleExtension',
  rolePractice: 'visualRolePractice',
  studyInteractionHint: 'visualStudyInteractionHint',
  recallDeckLabel: 'visualRecallDeckLabel',
  recallProgress: 'visualRecallProgress',
  recallPrompt: 'visualRecallPrompt',
  recallHint: 'visualRecallHint',
  recallAnswer: 'visualRecallAnswer',
  showHint: 'visualShowHint',
  showAnswer: 'visualShowAnswer',
  previousCard: 'visualPreviousCard',
  nextCard: 'visualNextCard',
  resetDeck: 'visualResetDeck',
  mastered: 'visualMastered',
  reviewAgain: 'visualReviewAgain',
  unrated: 'visualUnrated',
  recallStatus: 'visualRecallStatus',
  recallInteractionHint: 'visualRecallInteractionHint',
  stepOfTotal: 'visualStepOfTotal',
  emptyVisual: 'visualEmpty',
  graphLegendLabel: 'visualGraphLegendLabel',
  stateCurrent: 'visualStateCurrent',
  stateRelated: 'visualStateRelated',
  stateContext: 'visualStateContext',
  stateVisited: 'visualStateVisited',
} as const satisfies Record<keyof LearningVisualV4Labels, LearningLocaleKey>

function visualLabelsOf(t: LearningToolViewProps['t']): LearningVisualV4Labels {
  return Object.fromEntries(Object.entries(VISUAL_LABEL_KEYS).map(([label, key]) => [label, t(key)])) as unknown as LearningVisualV4Labels
}

/** Read the model-authored arguments, whichever block shape carries them. */
function argsRawOf(block: ToolCallBlock): string | undefined {
  return 'kind' in block ? block.call?.argsRaw : block.argsRaw
}

/** Concatenate the tool result text, whichever block shape carries it. */
function resultTextOf(block: ToolCallBlock): string {
  if (!('kind' in block)) return ''
  return block.content.filter(item => item.type === 'text').map(item => item.text).join('')
}

function issuesOf(cause: unknown): readonly string[] {
  if (cause instanceof LearningProtocolError) return cause.issues
  return [cause instanceof Error ? cause.message : String(cause)]
}

function boundedText(value: unknown, limit: number): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed === '' || value.length > limit ? undefined : trimmed
}

/**
 * Salvage the model's own text equivalent from arguments that failed the
 * closed schema, so a rejected payload still teaches instead of vanishing.
 */
function textFallbackOf(parsed: Record<string, unknown>): LearningTextFallback | undefined {
  const protocol = parsed.protocol
  if (protocol === CHECKPOINT_PROTOCOL) {
    const markdown = parsed.fallbackMarkdown
    if (typeof markdown !== 'string'
      || markdown.trim() === ''
      || markdown.length > MAX_FALLBACK_MARKDOWN_LENGTH
      || !isLearningCheckpointDisplayTextSafe(markdown)) return undefined
    return { markdown, protocol: CHECKPOINT_PROTOCOL }
  }
  if (protocol !== VISUAL_PROTOCOL_V4 && protocol !== VISUAL_PROTOCOL_V3) return undefined
  const title = boundedText(parsed.title, 200)
  const description = boundedText(parsed.description, 1_000)
  const markdown = typeof parsed.fallbackMarkdown === 'string'
    && parsed.fallbackMarkdown.trim() !== ''
    && parsed.fallbackMarkdown.length <= MAX_FALLBACK_MARKDOWN_LENGTH
    ? parsed.fallbackMarkdown
    : undefined
  if (markdown === undefined && description === undefined && title === undefined) return undefined
  return {
    ...(markdown === undefined ? {} : { markdown }),
    text: description ?? title ?? '',
    protocol,
  }
}

/**
 * Parse one complete `argsRaw` string exactly once.
 *
 * While arguments still stream this returns an empty result with no issues,
 * which the surface renders as the neutral running state; a genuinely invalid
 * payload returns the concrete schema violations instead.
 */
/**
 * Recover the visual's title from arguments that are still streaming.
 *
 * `title` is the only top-level title in the visual@4 schema and the model
 * emits it early, so the first match names the figure being built. Showing it
 * turns a generic wait into a specific one; the value is rendered as plain
 * text, never as Markdown or HTML.
 */
const PARTIAL_TITLE = /"title"\s*:\s*"((?:[^"\\]|\\.){0,240})"/

function streamingTitleOf(raw: string): string | undefined {
  if (!raw.includes(VISUAL_PROTOCOL_V4)) return undefined
  const encoded = PARTIAL_TITLE.exec(raw)?.[1]
  if (encoded === undefined) return undefined
  try {
    const title = JSON.parse(`"${encoded}"`) as unknown
    if (typeof title !== 'string') return undefined
    const trimmed = title.trim()
    return trimmed === '' || trimmed.length > 200 ? undefined : trimmed
  } catch {
    return undefined
  }
}

function parseLearningCall(raw: string | undefined): ParsedLearningCall {
  if (raw === undefined || raw === '') return {}
  if (raw.length > MAX_PARSEABLE_ARGS_BYTES) {
    return { issues: [`arguments exceed ${String(MAX_PARSEABLE_ARGS_BYTES)} bytes`] }
  }
  let parsed: Record<string, unknown>
  try {
    const value = JSON.parse(raw) as unknown
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      return { issues: ['arguments must be a JSON object'] }
    }
    parsed = value as Record<string, unknown>
  } catch {
    // Incomplete JSON is the normal streaming state, not a protocol failure.
    const streamingTitle = streamingTitleOf(raw)
    return streamingTitle === undefined ? {} : { streamingTitle }
  }
  try {
    const protocol = parsed.protocol
    const definition = protocol === CHECKPOINT_PROTOCOL ? parseLearningCheckpointV1(parsed)
      : protocol === VISUAL_PROTOCOL_V4 ? parseLearningVisualV4(parsed)
        : protocol === VISUAL_PROTOCOL_V3 ? parseLearningVisualV3(parsed)
          : protocol === ACTIVITY_PROTOCOL_V2 ? parseLearningActivityV2(parsed)
            : parseLearningActivity(parsed)
    return { definition }
  } catch (cause) {
    const fallback = textFallbackOf(parsed)
    return { issues: issuesOf(cause), ...(fallback === undefined ? {} : { fallback }) }
  }
}

/** Parse one complete tool result exactly once, in the definition's context. */
function parseLearningResult(
  text: string,
  definition: LearningCallDefinition | undefined,
): LearningCallResult | undefined {
  if (text === '') return undefined
  try {
    const parsed = JSON.parse(text) as { protocol?: unknown }
    if (parsed.protocol === CHECKPOINT_RESULT_PROTOCOL) {
      return parseLearningCheckpointResultV1(
        parsed,
        definition?.protocol === CHECKPOINT_PROTOCOL ? { checkpoint: definition } : {},
      )
    }
    return parsed.protocol === RESPONSE_PROTOCOL_V2
      ? parseLearningResponseV2(parsed)
      : parseLearningResponse(parsed)
  } catch {
    return undefined
  }
}

/** Parse one complete visual result exactly once. */
function parseVisualResult(text: string): LearningVisualResultV3 | LearningVisualResultV4 | undefined {
  if (text === '') return undefined
  try {
    const parsed = JSON.parse(text) as { protocol?: unknown }
    return parsed.protocol === VISUAL_RESULT_PROTOCOL_V4
      ? parseLearningVisualResultV4(parsed)
      : parseLearningVisualResultV3(parsed)
  } catch { return undefined }
}
function pendingActivity(
  interactions: readonly PendingInteraction[],
  sessionId: string,
  activity: LearningCallDefinition | undefined,
  callId: string | undefined,
): LearningQuestionWait | undefined {
  if (activity === undefined) return undefined
  if (activity.protocol === VISUAL_PROTOCOL_V3 || activity.protocol === VISUAL_PROTOCOL_V4) return undefined
  if (activity.protocol === CHECKPOINT_PROTOCOL) {
    return interactions.find((interaction): interaction is LearningQuestionWait => {
      if (interaction.kind !== 'question' || String(interaction.sessionId) !== sessionId) return false
      const envelope = envelopeOf(interaction)
      return envelope !== undefined
        && 'checkpoint' in envelope
        && envelope.sessionId === sessionId
        && envelope.callId === callId
    })
  }
  if (activity.protocol === ACTIVITY_PROTOCOL_V2) {
    return interactions.find((interaction): interaction is LearningQuestionWait => {
      if (interaction.kind !== 'question' || String(interaction.sessionId) !== sessionId) return false
      const envelope = envelopeOf(interaction)
      if (envelope === undefined || !('phase' in envelope)) return false
      if (envelope.callId !== undefined && envelope.callId !== callId) return false
      return envelope.phase === activity.phase
        && envelope.seq === activity.seq
        && envelope.activityId !== ''
        && envelope.waitId !== ''
    })
  }
  const canonical = JSON.stringify(activity)
  return interactions.find((interaction): interaction is LearningQuestionWait => {
    if (interaction.kind !== 'question' || String(interaction.sessionId) !== sessionId) return false
    const envelope = envelopeOf(interaction)
    return envelope !== undefined && 'activity' in envelope && JSON.stringify(envelope.activity) === canonical
  })
}

function explanationOf(response: LearningResponseV1 | undefined): string | undefined {
  if (response?.action !== 'submit' || typeof response.answer !== 'object'
    || response.answer === null || Array.isArray(response.answer)) return undefined
  const explanation = response.answer.explanation
  return typeof explanation === 'string' && explanation.trim() !== '' ? explanation.trim() : undefined
}

function compactAnswer(answer: import('../protocol.ts').LearningJson | undefined): string | undefined {
  if (answer === undefined || answer === null) return undefined
  if (typeof answer === 'string' || typeof answer === 'number' || typeof answer === 'boolean') return String(answer)
  if (!Array.isArray(answer)) {
    for (const key of ['text', 'explanation', 'answer']) {
      const candidate = answer[key]
      if (typeof candidate === 'string' || typeof candidate === 'number') return String(candidate)
    }
  }
  try { return JSON.stringify(answer) } catch { return undefined }
}

function answerRecord(response: LearningResponseV1 | undefined): Record<string, unknown> | undefined {
  if (response?.action !== 'submit' || typeof response.answer !== 'object'
    || response.answer === null || Array.isArray(response.answer)) return undefined
  return response.answer
}

function evidenceOf(
  activity: LearningActivityV1,
  response: LearningResponseV1 | undefined,
  t: LearningToolViewProps['t'],
): string | undefined {
  const answer = answerRecord(response)
  if (answer === undefined) return undefined
  if (activity.kind === 'parameter_explorer') {
    const parameters = answer.parameters
    if (typeof parameters !== 'object' || parameters === null || Array.isArray(parameters)) return undefined
    const values = activity.payload.parameters.flatMap(parameter => {
      const value = (parameters as Record<string, unknown>)[parameter.id]
      return typeof value === 'number'
        ? [t('rangeValue', { label: parameter.label, value })]
        : []
    })
    return values.length === 0 ? undefined : values.join(' · ')
  }
  if (activity.kind === 'process_stepper') {
    const checkpoints = answer.checkpoints
    return Array.isArray(checkpoints) && checkpoints.length > 0
      ? t('processEvidence', { count: checkpoints.length })
      : undefined
  }
  const selected = answer.selectedDifferences
  return Array.isArray(selected)
    ? t('structureEvidence', { count: selected.length })
    : undefined
}

function checkpointAnswerOf(activity: LearningCheckpointV1, result: LearningCheckpointResultV1): string | undefined {
  if (result.status !== 'submitted') return undefined
  const response = result.response
  if ('optionId' in response) {
    return activity.options?.find(option => option.id === response.optionId)?.label ?? response.optionId
  }
  if ('number' in response) return String(response.number)
  const text = response.text.trim()
  return text.length <= 500 ? text : `${text.slice(0, 499)}…`
}


/** The single running state, shared by every protocol branch. */
function LearningRunning({ title, t }: { title?: string; t: LearningToolViewProps['t'] }) {
  return (
    <p
      className={css.inlineStatus}
      {...learningScope}
      data-state="running"
      role="status"
      aria-live="polite"
    >
      <span className={css.runningDot} aria-hidden="true" />
      <span>{title === undefined ? t('waiting') : t('preparing', { title })}</span>
      <span className={css.skeletonLine} aria-hidden="true" />
    </p>
  )
}

/**
 * The single failure surface, shared by every protocol branch.
 *
 * It always states what went wrong, and always keeps whatever text equivalent
 * survived, so a rejected payload degrades to reading rather than to nothing.
 */
function LearningFallback({
  headline,
  issues,
  fallback,
  markdown,
  text,
  state,
  protocol,
  t,
}: {
  headline: string
  issues?: readonly string[]
  fallback?: LearningTextFallback
  markdown?: string
  text?: string
  state: 'invalid' | 'error' | 'unknown'
  protocol?: string
  t: LearningToolViewProps['t']
}) {
  const body = markdown ?? fallback?.markdown
  const plain = text ?? fallback?.text
  // Surfacing the concrete schema violations is what turns "it did not render"
  // into something the learner can report and the author can fix.
  const reason = issues === undefined || issues.length === 0
    ? undefined
    : t('invalidReason', { reason: issues.join('; ') })
  return (
    <div
      className={css.inlineFallback}
      {...learningScope}
      data-learning-result={state}
      {...(protocol === undefined ? {} : { 'data-learning-fallback': protocol })}
    >
      <p className={css.inlineResult} role="alert">
        <span className={css.errorMark} aria-hidden="true">!</span>
        <span>{headline}</span>
      </p>
      {reason === undefined ? null : <p className={css.fallbackReason}>{reason}</p>}
      {body === undefined
        ? (plain === undefined || plain === '' ? null : <p className={css.visualTextFallback}>{plain}</p>)
        : <div className={css.fallbackText}><MarkdownText text={body} /></div>}
    </div>
  )
}

/** The single completed-receipt line, shared by checkpoint and legacy replay. */
function LearningReceipt({
  status,
  state,
  evidence,
  answer,
}: {
  status: string
  state: string
  evidence?: string
  answer?: string
}) {
  return (
    <p className={css.inlineResult} {...learningScope} data-learning-result={state}>
      <span className={css.resultMark} aria-hidden="true">✓</span>
      <span>{status}</span>
      {evidence === undefined ? null : <span className={css.resultEvidence}>{evidence}</span>}
      {answer === undefined ? null : <span className={css.resultAnswer}>“{answer}”</span>}
    </p>
  )
}

export function LearningToolView({ block, inspect, t, useSession, sessionId }: LearningToolViewProps) {
  void inspect
  const done = 'kind' in block
  const raw = argsRawOf(block)
  const resultText = resultTextOf(block)
  const isError = 'kind' in block && block.isError === true
  const callId = block.callId

  // Parse the closed payloads exactly once per distinct wire string. This view
  // re-renders on every session snapshot, and re-parsing would mint a new
  // definition identity each time — resetting the learner's sequence frame,
  // revealed recall card and probed values on every unrelated update.
  const { definition, issues, fallback, streamingTitle } = useMemo(() => parseLearningCall(raw), [raw])
  const result = useMemo(() => parseLearningResult(resultText, definition), [resultText, definition])
  const visualResult = useMemo(() => parseVisualResult(resultText), [resultText])
  const labels = useMemo(() => visualLabelsOf(t), [t])

  const interactions = useSession(snapshot => snapshot.pending)
  const matched = pendingActivity(interactions, String(sessionId), definition, callId)

  useEffect(() => {
    if (done || raw === undefined || raw === '') return
    if (definition === undefined) emitLearningCallLifecycle('learning.call.stream_started', { callId })
    else emitLearningCallLifecycle('learning.call.args_completed', {
      callId,
      phase: definition.protocol === ACTIVITY_PROTOCOL_V2 ? definition.phase : undefined,
      seq: definition.protocol === ACTIVITY_PROTOCOL_V2 ? definition.seq : undefined,
    })
  }, [definition, callId, done, raw])

  if (definition === undefined) {
    // Arguments that are merely incomplete keep streaming; only a payload that
    // actually failed its schema becomes a visible, explained failure.
    if (!done && issues === undefined) return <LearningRunning title={streamingTitle} t={t} />
    return (
      <LearningFallback
        headline={t('invalidActivity')}
        issues={issues}
        fallback={fallback}
        state="invalid"
        protocol={fallback?.protocol}
        t={t}
      />
    )
  }

  if (definition.protocol === CHECKPOINT_PROTOCOL) {
    if (!done) {
      return matched === undefined ? <LearningRunning t={t} /> : <LearningInteraction matched={matched} t={t} />
    }
    const checkpointResult = result?.protocol === CHECKPOINT_RESULT_PROTOCOL ? result : undefined
    if (isError || checkpointResult === undefined) {
      return (
        <LearningFallback
          headline={t('invalidResult')}
          markdown={definition.fallbackMarkdown}
          state="error"
          protocol={CHECKPOINT_PROTOCOL}
          t={t}
        />
      )
    }
    return (
      <LearningReceipt
        state={checkpointResult.status}
        status={checkpointResult.status === 'submitted' ? t('completed')
          : checkpointResult.status === 'skipped' ? t('skipped') : t('cancelled')}
        answer={checkpointAnswerOf(definition, checkpointResult)}
      />
    )
  }

  if (definition.protocol === VISUAL_PROTOCOL_V4) {
    if (done && (isError || visualResult?.protocol !== VISUAL_RESULT_PROTOCOL_V4)) {
      return (
        <LearningFallback
          headline={t('visualFailed')}
          markdown={definition.fallbackMarkdown}
          text={definition.description ?? definition.title}
          state="error"
          protocol="visual-v4"
          t={t}
        />
      )
    }
    return (
      <LearningVisualV4
        visual={definition}
        storageKey={`${String(sessionId)}:${callId ?? 'visual'}`}
        labels={labels}
      />
    )
  }

  if (definition.protocol === VISUAL_PROTOCOL_V3) {
    if (done && (isError || visualResult?.protocol !== VISUAL_RESULT_PROTOCOL_V3)) {
      return (
        <LearningFallback
          headline={t('visualFailed')}
          text={definition.description ?? definition.title}
          state="error"
          protocol="visual-v3"
          t={t}
        />
      )
    }
    return (
      <LearningVisual
        visual={definition}
        storageKey={`${String(sessionId)}:${callId ?? 'visual'}`}
      />
    )
  }

  if (definition.protocol === ACTIVITY_PROTOCOL_V2) {
    if (!done) {
      return matched === undefined ? <LearningRunning t={t} /> : <LearningInteraction matched={matched} t={t} />
    }
    const v2Response = result?.protocol === RESPONSE_PROTOCOL_V2 ? result : undefined
    if (v2Response === undefined) {
      return (
        <LearningFallback
          headline={t('invalidResult')}
          markdown={definition.fallbackMarkdown}
          state="error"
          protocol={ACTIVITY_PROTOCOL_V2}
          t={t}
        />
      )
    }
    if (definition.phase === 'question') {
      return (
        <LearningReceipt
          state={v2Response.action}
          status={v2Response.action === 'submit' ? t('completed')
            : v2Response.action === 'skip' ? t('skipped') : t('cancelled')}
          answer={v2Response.phase === 'question' ? compactAnswer(v2Response.answer) : undefined}
        />
      )
    }
    return (
      <div className={css.legacyReveal} {...learningScope} data-learning-result={v2Response.action}>
        <MarkdownText text={definition.feedback.explanation} />
        {definition.feedback.answer === undefined ? null : <strong>{definition.feedback.answer}</strong>}
      </div>
    )
  }

  if (!done) {
    return matched === undefined ? <LearningRunning t={t} /> : <LearningInteraction matched={matched} t={t} />
  }
  if (result === undefined) {
    return (
      <LearningFallback
        headline={t('invalidResult')}
        markdown={definition.fallbackMarkdown}
        state="unknown"
        protocol={RESPONSE_PROTOCOL}
        t={t}
      />
    )
  }
  const legacyResponse = result.protocol === RESPONSE_PROTOCOL ? result : undefined
  return (
    <LearningReceipt
      state={legacyResponse?.action ?? 'unknown'}
      status={legacyResponse?.action === 'submit' ? t('completed')
        : legacyResponse?.action === 'skip' ? t('skipped')
          : legacyResponse?.action === 'cancel' ? t('cancelled') : t('invalidResult')}
      evidence={evidenceOf(definition, legacyResponse, t)}
      answer={explanationOf(legacyResponse)}
    />
  )
}
