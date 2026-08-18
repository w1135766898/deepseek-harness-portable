import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { useEffect } from 'react'
import { MarkdownText } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ToolCallViewProps } from '@deepseek-ai/dsh-client-ui-tool/client'
import type { PendingInteraction, ToolCallBlock } from '@deepseek-ai/dsh-client-runtime/client'
import {
  parseLearningActivity,
  parseLearningActivityV2,
  parseLearningResponse,
  parseLearningResponseV2,
  ACTIVITY_PROTOCOL_V2,
  RESPONSE_PROTOCOL_V2,
  type LearningActivityV1,
  type LearningActivityV2,
  type LearningResponseV1,
  type LearningResponseV2,
} from '../protocol.ts'
import { envelopeOf, LearningInteraction, type LearningQuestionWait } from './LearningComposer.tsx'
import css from './LearningActivity.module.css'
import { RoundActivity } from './RoundActivity.tsx'
import { emitLearningCallLifecycle } from './lifecycle.ts'

type LearningToolViewProps = ToolCallViewProps & PropsLocale<'interactive-learning'>

function pendingActivity(
  interactions: readonly PendingInteraction[],
  sessionId: string,
  activity: LearningActivityV1 | LearningActivityV2 | undefined,
  callId: string | undefined,
): LearningQuestionWait | undefined {
  if (activity === undefined) return undefined
  if (activity.protocol === ACTIVITY_PROTOCOL_V2) {
    return interactions.find((interaction): interaction is LearningQuestionWait => {
      if (interaction.kind !== 'question' || String(interaction.sessionId) !== sessionId) return false
      const envelope = envelopeOf(interaction)
      if (envelope === undefined || !('waitId' in envelope)) return false
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
    return envelope !== undefined && JSON.stringify(envelope.activity) === canonical
  })
}

function activityOf(block: ToolCallBlock): LearningActivityV1 | LearningActivityV2 | undefined {
  const raw = 'kind' in block ? block.call?.argsRaw : block.argsRaw
  if (raw === undefined || raw === '') return undefined
  try {
    const parsed = JSON.parse(raw) as { protocol?: unknown }
    return parsed.protocol === ACTIVITY_PROTOCOL_V2 ? parseLearningActivityV2(parsed) : parseLearningActivity(parsed)
  } catch {
    return undefined
  }
}

function responseOf(block: ToolCallBlock): LearningResponseV1 | LearningResponseV2 | undefined {
  if (!('kind' in block)) return undefined
  const text = block.content.filter(item => item.type === 'text').map(item => item.text).join('')
  if (text === '') return undefined
  try {
    const parsed = JSON.parse(text) as { protocol?: unknown }
    return parsed.protocol === RESPONSE_PROTOCOL_V2 ? parseLearningResponseV2(parsed) : parseLearningResponse(parsed)
  } catch {
    return undefined
  }
}

function explanationOf(response: LearningResponseV1 | undefined): string | undefined {
  if (response?.action !== 'submit' || typeof response.answer !== 'object'
    || response.answer === null || Array.isArray(response.answer)) return undefined
  const explanation = response.answer.explanation
  return typeof explanation === 'string' && explanation.trim() !== '' ? explanation.trim() : undefined
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

export function LearningToolView({ block, inspect, t, useSession, sessionId }: LearningToolViewProps) {
  void inspect
  const activity = activityOf(block)
  const done = 'kind' in block
  const response = responseOf(block)
  const interactions = useSession(snapshot => snapshot.pending)
  const callId = 'kind' in block ? block.callId : block.callId
  const raw = 'kind' in block ? block.call?.argsRaw : block.argsRaw
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
    return <p className={css.inlineStatus} data-state={done ? 'done' : 'running'}>{t('invalidActivity')}</p>
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
    return (
      <div className={css.completedRound} data-learning-result={v2Response?.action ?? 'unknown'}>
        <RoundActivity
          activity={activity}
          completed
          initialAnswer={v2Response?.phase === 'question' ? v2Response.answer : undefined}
          t={t}
        />
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
  const legacyResponse = response.protocol === RESPONSE_PROTOCOL_V2 ? undefined : response
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
