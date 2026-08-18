import { useMemo, useRef, useState } from 'react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { ComposerChainProps } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { PendingWait } from '@deepseek-ai/dsh-client-runtime/client'
import {
  CHECKPOINT_RESULT_PROTOCOL,
  RESPONSE_PROTOCOL,
  RESPONSE_PROTOCOL_V2,
  type LearningActivityEnvelopeV1,
  type LearningCheckpointResponseV1,
  type LearningCheckpointResultV1,
  type LearningCheckpointWaitEnvelopeV1,
  type LearningWaitEnvelopeV2,
  type LearningResponseV2,
  type LearningResponseV1,
} from '../protocol.ts'
import {
  decodeLearningCheckpointDetail,
  decodeLearningCheckpointQuestionId,
  decodeLearningDetail,
  decodeLearningQuestionId,
  decodeLearningWaitDetail,
  decodeLearningWaitQuestionId,
} from '../transport.ts'
import { ActivityFrame } from './ActivityFrame.tsx'
import { ActivityRenderer } from './ActivityRenderer.tsx'
import type { ActivitySubmission } from './types.ts'
import { RoundActivity } from './RoundActivity.tsx'
import { LearningCheckpoint } from './LearningCheckpoint.tsx'

export type LearningQuestionWait = PendingWait<'question'>

export function envelopeOf(wait: LearningQuestionWait): LearningActivityEnvelopeV1 | LearningWaitEnvelopeV2 | LearningCheckpointWaitEnvelopeV1 | undefined {
  if (wait.payload.questions.length !== 1) return undefined
  const question = wait.payload.questions[0]
  if (question === undefined) return undefined
  const checkpoint = decodeLearningCheckpointDetail(question.detail)
  if (checkpoint !== undefined && decodeLearningCheckpointQuestionId(question.id) === checkpoint.waitId) {
    return checkpoint
  }
  const v2 = decodeLearningWaitDetail(question.detail)
  if (v2 !== undefined && decodeLearningWaitQuestionId(question.id) === v2.waitId) return v2
  return decodeLearningQuestionId(question.id) ?? decodeLearningDetail(question.detail)
}

/** Pure composer-chain selector: only package-owned question envelopes are claimed. */
export function selectLearningActivity({ interactions, session }: ComposerChainProps): LearningQuestionWait | null {
  const currentSessionId = session?.sessionId
  for (const interaction of interactions) {
    if (interaction.kind !== 'question') continue
    const wait = interaction as LearningQuestionWait
    // A pending wait belongs to one live session. This explicit lineage guard
    // prevents a fork from claiming an ancestor's unresolved interaction.
    if (currentSessionId === undefined || String(wait.sessionId) !== String(currentSessionId)) continue
    const envelope = envelopeOf(wait)
    if (envelope === undefined) continue
    if ('checkpoint' in envelope && envelope.sessionId !== String(currentSessionId)) continue
    return wait
  }
  return null
}

type LearningComposerProps =
  { matched: LearningQuestionWait }
  & PropsLocale<'interactive-learning'>

export function LearningComposer({ matched, t }: LearningComposerProps) {
  // Claim the package-owned question so the generic question composer does
  // not duplicate it. The actual interaction lives in the tool call's place
  // in the assistant turn; a pending activity intentionally has no bottom UI.
  void matched
  void t
  return null
}

export function LearningInteraction({ matched, t }: LearningComposerProps) {
  const envelope = useMemo(() => envelopeOf(matched), [matched])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const responseInFlight = useRef<Promise<void> | null>(null)
  if (envelope === undefined) return null

  const send = (response: LearningResponseV1 | LearningResponseV2 | LearningCheckpointResultV1): Promise<void> => {
    // React state does not become visible until after the current event batch.
    // Share the exact promise so a double click, repeated keyboard event, or
    // StrictMode replay cannot submit two terminal receipts for one wait.
    if (responseInFlight.current !== null) return responseInFlight.current
    const question = matched.payload.questions[0]
    if (question === undefined) return Promise.resolve()
    const pending = Promise.resolve().then(async (): Promise<void> => {
      setBusy(true)
      setError(null)
      const accepted = await matched.respond({
        ok: true,
        value: {
          sessionId: matched.sessionId,
          answer: { answers: [{ id: question.id, selected: [], custom: JSON.stringify(response) }] },
        },
      })
      if (!accepted.accepted) throw new Error(accepted.reason)
    }).catch((cause: unknown) => {
        responseInFlight.current = null
        setBusy(false)
        setError(t('error', { message: cause instanceof Error ? cause.message : String(cause) }))
        throw cause
      })
    responseInFlight.current = pending
    return pending
  }

  if ('checkpoint' in envelope) {
    if (envelope.sessionId !== String(matched.sessionId)) return null
    const common = {
      protocol: CHECKPOINT_RESULT_PROTOCOL,
      checkpointId: envelope.checkpointId,
      receiptId: `receipt_${envelope.waitId}`,
    } as const
    const submit = async (response: LearningCheckpointResponseV1): Promise<void> => {
      await send({ ...common, status: 'submitted', response })
    }
    const skip = async (): Promise<void> => {
      await send({ ...common, status: 'skipped' })
    }
    const cancel = async (): Promise<void> => {
      await send({ ...common, status: 'cancelled' })
    }
    return (
      <LearningCheckpoint
        checkpoint={envelope.checkpoint}
        storageKey={envelope.waitId}
        busy={busy}
        error={error}
        onSubmit={submit}
        onSkip={skip}
        onCancel={cancel}
        t={t}
      />
    )
  }

  if ('waitId' in envelope) {
    // One durable wait owns one durable receipt. A refresh or transport retry
    // therefore replays the same idempotency key instead of minting a new ACK.
    const stableReceiptId = `receipt_${envelope.waitId}`
    const common = {
      protocol: RESPONSE_PROTOCOL_V2,
      activityId: envelope.activityId,
      lessonToken: envelope.lessonToken,
      roundToken: envelope.roundToken,
      seq: envelope.seq,
    } as const
    const storageKey = `${envelope.waitId}:${envelope.activityId}:${envelope.phase}:${envelope.seq}`
    const submitAnswer = async (answer: import('../protocol.ts').LearningJson, interactionState: import('../protocol.ts').LearningJson) => {
      await send({ ...common, phase: 'question', action: 'submit', answer, interactionState, receiptId: stableReceiptId })
    }
    const continueReveal = async (animation: { completed: true; reducedMotion?: boolean }) => {
      await send({ ...common, phase: 'reveal', action: 'continue', animation, receiptId: stableReceiptId })
    }
    const cancelRound = async () => {
      await send(envelope.phase === 'question'
        ? { ...common, phase: 'question', action: 'cancel', receiptId: stableReceiptId }
        : { ...common, phase: 'reveal', action: 'cancel', animation: { completed: false }, receiptId: stableReceiptId })
    }
    return (
      <RoundActivity
        activity={envelope.activity}
        storageKey={storageKey}
        onSubmitAnswer={envelope.phase === 'question' ? submitAnswer : undefined}
        onContinue={envelope.phase === 'reveal' ? continueReveal : undefined}
        onCancel={cancelRound}
        t={t}
      />
    )
  }

  const respond = (response: LearningResponseV1): void => {
    const question = matched.payload.questions[0]
    if (question === undefined) return
    setBusy(true)
    setError(null)
    void send(response).catch(() => {})
  }

  const submit = ({ answer, interactionState }: ActivitySubmission): void => respond({
    protocol: RESPONSE_PROTOCOL,
    activityId: envelope.activityId,
    action: 'submit',
    answer,
    interactionState,
  })

  const skip = (): void => respond({
    protocol: RESPONSE_PROTOCOL,
    activityId: envelope.activityId,
    action: 'skip',
  })

  const cancel = (): void => {
    setBusy(true)
    setError(null)
    void matched.respond({
      ok: false,
      error: { code: 'cancelled', message: 'the learner cancelled this activity', details: {} },
    }).then(receipt => {
      if (!receipt.accepted) throw new Error(receipt.reason)
    }).catch((cause: unknown) => {
      setBusy(false)
      setError(t('error', { message: cause instanceof Error ? cause.message : String(cause) }))
    })
  }

  return (
    <ActivityFrame
      key={matched.key}
      activityId={envelope.activityId}
      activity={envelope.activity}
      busy={busy}
      error={error}
      onSkip={skip}
      onCancel={cancel}
      t={t}
    >
      <ActivityRenderer activity={envelope.activity} busy={busy} onSubmit={submit} t={t} />
    </ActivityFrame>
  )
}
