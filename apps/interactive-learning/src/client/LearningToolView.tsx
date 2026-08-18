import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { useEffect } from 'react'
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
import { RoundActivity } from './RoundActivity.tsx'
import { emitLearningCallLifecycle } from './lifecycle.ts'
import { LearningVisual } from './LearningVisual.tsx'
import { LearningVisualV4, type LearningVisualV4Labels } from './LearningVisualV4.tsx'
import type { LearningLocaleKey } from './locales.ts'

type LearningToolViewProps = ToolCallViewProps & PropsLocale<'interactive-learning'>

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
} as const satisfies Record<keyof LearningVisualV4Labels, LearningLocaleKey>

function visualLabelsOf(t: LearningToolViewProps['t']): LearningVisualV4Labels {
  return Object.fromEntries(Object.entries(VISUAL_LABEL_KEYS).map(([label, key]) => [label, t(key)])) as unknown as LearningVisualV4Labels
}

function pendingActivity(
  interactions: readonly PendingInteraction[],
  sessionId: string,
  activity: LearningActivityV1 | LearningActivityV2 | LearningCheckpointV1 | LearningVisualV3 | LearningVisualV4Definition | undefined,
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

function activityOf(block: ToolCallBlock): LearningActivityV1 | LearningActivityV2 | LearningCheckpointV1 | LearningVisualV3 | LearningVisualV4Definition | undefined {
  const raw = 'kind' in block ? block.call?.argsRaw : block.argsRaw
  if (raw === undefined || raw === '') return undefined
  try {
    const parsed = JSON.parse(raw) as { protocol?: unknown }
    if (parsed.protocol === CHECKPOINT_PROTOCOL) return parseLearningCheckpointV1(parsed)
    if (parsed.protocol === VISUAL_PROTOCOL_V4) return parseLearningVisualV4(parsed)
    if (parsed.protocol === VISUAL_PROTOCOL_V3) return parseLearningVisualV3(parsed)
    return parsed.protocol === ACTIVITY_PROTOCOL_V2 ? parseLearningActivityV2(parsed) : parseLearningActivity(parsed)
  } catch {
    return undefined
  }
}

function checkpointTextFallbackOf(block: ToolCallBlock): { markdown: string; protocol: string } | undefined {
  const raw = 'kind' in block ? block.call?.argsRaw : block.argsRaw
  if (raw === undefined || raw === '' || raw.length > 64 * 1024) return undefined
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>
    if (parsed.protocol !== CHECKPOINT_PROTOCOL
      || typeof parsed.fallbackMarkdown !== 'string'
      || parsed.fallbackMarkdown.trim() === ''
      || parsed.fallbackMarkdown.length > 8_000
      || !isLearningCheckpointDisplayTextSafe(parsed.fallbackMarkdown)) return undefined
    return { markdown: parsed.fallbackMarkdown, protocol: CHECKPOINT_PROTOCOL }
  } catch {
    return undefined
  }
}

function visualTextFallbackOf(block: ToolCallBlock): { markdown?: string; text: string; protocol: string } | undefined {
  const raw = 'kind' in block ? block.call?.argsRaw : block.argsRaw
  if (raw === undefined || raw === '' || raw.length > 64 * 1024) return undefined
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>
    if (parsed.protocol !== VISUAL_PROTOCOL_V4 && parsed.protocol !== VISUAL_PROTOCOL_V3) return undefined
    const title = typeof parsed.title === 'string' && parsed.title.trim() !== '' && parsed.title.length <= 200
      ? parsed.title.trim()
      : undefined
    const description = typeof parsed.description === 'string' && parsed.description.trim() !== '' && parsed.description.length <= 1_000
      ? parsed.description.trim()
      : undefined
    const markdown = typeof parsed.fallbackMarkdown === 'string'
      && parsed.fallbackMarkdown.trim() !== ''
      && parsed.fallbackMarkdown.length <= 8_000
      ? parsed.fallbackMarkdown
      : undefined
    if (markdown === undefined && description === undefined && title === undefined) return undefined
    return {
      ...(markdown === undefined ? {} : { markdown }),
      text: description ?? title ?? '',
      protocol: parsed.protocol,
    }
  } catch {
    return undefined
  }
}

function responseOf(
  block: ToolCallBlock,
  activity: LearningActivityV1 | LearningActivityV2 | LearningCheckpointV1 | LearningVisualV3 | LearningVisualV4Definition | undefined,
): LearningResponseV1 | LearningResponseV2 | LearningCheckpointResultV1 | undefined {
  if (!('kind' in block)) return undefined
  const text = block.content.filter(item => item.type === 'text').map(item => item.text).join('')
  if (text === '') return undefined
  try {
    const parsed = JSON.parse(text) as { protocol?: unknown }
    if (parsed.protocol === CHECKPOINT_RESULT_PROTOCOL) {
      return parseLearningCheckpointResultV1(parsed, activity?.protocol === CHECKPOINT_PROTOCOL ? { checkpoint: activity } : {})
    }
    return parsed.protocol === RESPONSE_PROTOCOL_V2 ? parseLearningResponseV2(parsed) : parseLearningResponse(parsed)
  } catch {
    return undefined
  }
}

function visualResultOf(block: ToolCallBlock): LearningVisualResultV3 | LearningVisualResultV4 | undefined {
  if (!('kind' in block)) return undefined
  const content = block.content.filter(item => item.type === 'text').map(item => item.text).join('')
  if (content === '') return undefined
  try {
    const parsed = JSON.parse(content) as { protocol?: unknown }
    return parsed.protocol === VISUAL_RESULT_PROTOCOL_V4
      ? parseLearningVisualResultV4(parsed)
      : parseLearningVisualResultV3(parsed)
  } catch { return undefined }
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

export function LearningToolView({ block, inspect, t, useSession, sessionId }: LearningToolViewProps) {
  void inspect
  const activity = activityOf(block)
  const done = 'kind' in block
  const response = responseOf(block, activity)
  const interactions = useSession(snapshot => snapshot.pending)
  const callId = 'kind' in block ? block.callId : block.callId
  const raw = 'kind' in block ? block.call?.argsRaw : block.argsRaw
  const invalidVisualFallback = activity === undefined && done ? visualTextFallbackOf(block) : undefined
  const invalidCheckpointFallback = activity === undefined && done ? checkpointTextFallbackOf(block) : undefined
  useEffect(() => {
    if (done || raw === undefined || raw === '') return
    if (activity === undefined) emitLearningCallLifecycle('learning.call.stream_started', { callId })
    else emitLearningCallLifecycle('learning.call.args_completed', {
      callId,
      phase: activity.protocol === ACTIVITY_PROTOCOL_V2 ? activity.phase : undefined,
      seq: activity.protocol === ACTIVITY_PROTOCOL_V2 ? activity.seq : undefined,
    })
  }, [activity, callId, done, raw])
  const matched = pendingActivity(interactions, String(sessionId), activity, callId)
  if (activity === undefined) {
    if (!done) {
      return (
        <p className={css.inlineStatus} data-state="running" role="status" aria-live="polite">
          <span className={css.runningDot} aria-hidden="true" />
          <span>{t('waiting')}</span>
          <span className={css.skeletonLine} aria-hidden="true" />
        </p>
      )
    }
    const invalidFallback = invalidCheckpointFallback ?? invalidVisualFallback
    if (invalidFallback !== undefined) {
      return (
        <div className={css.inlineFallback} data-learning-result="invalid" data-learning-fallback={invalidFallback.protocol}>
          <p className={css.inlineResult} role="alert">
            <span className={css.errorMark} aria-hidden="true">!</span>
            <span>{t('invalidActivity')}</span>
          </p>
          {'text' in invalidFallback && invalidFallback.markdown === undefined
            ? <p className={css.visualTextFallback}>{invalidFallback.text}</p>
            : <div className={css.fallbackText}><MarkdownText text={invalidFallback.markdown ?? ''} /></div>}
        </div>
      )
    }
    return <p className={css.inlineStatus} data-state={done ? 'done' : 'running'}>{t('invalidActivity')}</p>
  }
  if (activity.protocol === CHECKPOINT_PROTOCOL) {
    if (!done) {
      if (matched !== undefined) return <LearningInteraction matched={matched} t={t} />
      return (
        <p className={css.inlineStatus} data-state="running" role="status" aria-live="polite">
          <span className={css.runningDot} aria-hidden="true" />
          <span>{t('waiting')}</span>
          <span className={css.skeletonLine} aria-hidden="true" />
        </p>
      )
    }
    const checkpointResult = response?.protocol === CHECKPOINT_RESULT_PROTOCOL ? response : undefined
    if (('kind' in block && block.isError) || checkpointResult === undefined) {
      return (
        <div className={css.inlineFallback} data-learning-result="error" data-learning-fallback={CHECKPOINT_PROTOCOL}>
          <p className={css.inlineResult} role="alert">
            <span className={css.errorMark} aria-hidden="true">!</span>
            <span>{t('invalidResult')}</span>
          </p>
          <div className={css.fallbackText}><MarkdownText text={activity.fallbackMarkdown} /></div>
        </div>
      )
    }
    const answer = checkpointAnswerOf(activity, checkpointResult)
    return (
      <p className={css.inlineResult} data-learning-result={checkpointResult.status}>
        <span className={css.resultMark} aria-hidden="true">✓</span>
        <span>{checkpointResult.status === 'submitted' ? t('completed') : checkpointResult.status === 'skipped' ? t('skipped') : t('cancelled')}</span>
        {answer === undefined ? null : <span className={css.resultAnswer}>“{answer}”</span>}
      </p>
    )
  }
  if (activity.protocol === VISUAL_PROTOCOL_V4) {
    const result = done ? visualResultOf(block) : undefined
    if (done && (('kind' in block && block.isError) || result?.protocol !== VISUAL_RESULT_PROTOCOL_V4)) {
      return (
        <div className={css.inlineFallback} data-learning-result="error" data-learning-fallback="visual-v4">
          <p className={css.inlineResult} role="alert">
            <span className={css.errorMark} aria-hidden="true">!</span>
            <span>{t('visualFailed')}</span>
          </p>
          {activity.fallbackMarkdown === undefined ? (
            <p className={css.visualTextFallback}>{activity.description ?? activity.title}</p>
          ) : (
            <div className={css.fallbackText}><MarkdownText text={activity.fallbackMarkdown} /></div>
          )}
        </div>
      )
    }
    return (
      <LearningVisualV4
        visual={activity}
        storageKey={`${String(sessionId)}:${callId ?? 'visual'}`}
        labels={visualLabelsOf(t)}
      />
    )
  }
  if (activity.protocol === VISUAL_PROTOCOL_V3) {
    const result = done ? visualResultOf(block) : undefined
    if (done && (('kind' in block && block.isError) || result?.protocol !== VISUAL_RESULT_PROTOCOL_V3)) {
      return (
        <div className={css.inlineFallback} data-learning-result="error">
          <p className={css.inlineResult} role="alert">
            <span className={css.errorMark} aria-hidden="true">!</span>
            <span>{t('visualFailed')}</span>
          </p>
          <p className={css.visualTextFallback}>{activity.description ?? activity.title}</p>
        </div>
      )
    }
    return (
      <LearningVisual
        visual={activity}
        storageKey={`${String(sessionId)}:${callId ?? 'visual'}`}
      />
    )
  }
  if (activity.protocol === ACTIVITY_PROTOCOL_V2) {
    if (!done) {
      if (matched !== undefined) return <LearningInteraction matched={matched} t={t} />
      return (
        <p className={css.inlineStatus} data-state="running" role="status" aria-live="polite">
          <span className={css.runningDot} aria-hidden="true" />
          <span>{t('waiting')}</span>
          <span className={css.skeletonLine} aria-hidden="true" />
        </p>
      )
    }
    const v2Response = response?.protocol === RESPONSE_PROTOCOL_V2 ? response : undefined
    if (v2Response === undefined) {
      return (
        <div className={css.inlineFallback} data-learning-result="error">
          <p className={css.inlineResult} role="alert">
            <span className={css.errorMark} aria-hidden="true">!</span>
            <span>{t('invalidResult')}</span>
          </p>
          <div className={css.fallbackText}><MarkdownText text={activity.fallbackMarkdown} /></div>
        </div>
      )
    }
    if (activity.phase === 'question') {
      const answer = v2Response.phase === 'question' ? compactAnswer(v2Response.answer) : undefined
      return (
        <p className={css.inlineResult} data-learning-result={v2Response.action}>
          <span className={css.resultMark} aria-hidden="true">✓</span>
          <span>{v2Response.action === 'submit' ? t('completed') : v2Response.action === 'skip' ? t('skipped') : t('cancelled')}</span>
          {answer === undefined ? null : <span className={css.resultAnswer}>“{answer}”</span>}
        </p>
      )
    }
    return (
      <div className={css.legacyReveal} data-learning-result={v2Response.action}>
        <MarkdownText text={activity.feedback.explanation} />
        {activity.feedback.answer === undefined ? null : <strong>{activity.feedback.answer}</strong>}
      </div>
    )
  }
  if (!done) {
    if (matched !== undefined) return <LearningInteraction matched={matched} t={t} />
    return (
      <p className={css.inlineStatus} data-state="running" role="status" aria-live="polite">
        <span className={css.runningDot} aria-hidden="true" />
        <span>{t('waiting')}</span>
        <span className={css.skeletonLine} aria-hidden="true" />
      </p>
    )
  }
  if (response === undefined) {
    return (
      <div className={css.inlineFallback} data-learning-result="unknown">
        <p className={css.inlineResult}>
          <span className={css.resultMark} aria-hidden="true">!</span>
          <span>{t('invalidResult')}</span>
        </p>
        <div className={css.fallbackText}><MarkdownText text={activity.fallbackMarkdown} /></div>
      </div>
    )
  }
  const legacyResponse = response.protocol === RESPONSE_PROTOCOL ? response : undefined
  const status = legacyResponse?.action === 'submit' ? t('completed')
    : legacyResponse?.action === 'skip' ? t('skipped')
      : legacyResponse?.action === 'cancel' ? t('cancelled') : t('invalidResult')
  const evidence = evidenceOf(activity, legacyResponse, t)
  const explanation = explanationOf(legacyResponse)
  return (
    <p className={css.inlineResult} data-learning-result={legacyResponse?.action ?? 'unknown'}>
      <span className={css.resultMark} aria-hidden="true">✓</span>
      <span>{status}</span>
      {evidence === undefined ? null : <span className={css.resultEvidence}>{evidence}</span>}
      {explanation === undefined ? null : <span className={css.resultAnswer}>“{explanation}”</span>}
    </p>
  )
}
