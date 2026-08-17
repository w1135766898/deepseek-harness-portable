import { useMemo, useState } from 'react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { ComposerChainProps } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { PendingWait } from '@deepseek-ai/dsh-client-runtime/client'
import {
  RESPONSE_PROTOCOL,
  type LearningActivityEnvelopeV1,
  type LearningResponseV1,
} from '../protocol.ts'
import { decodeLearningDetail } from '../transport.ts'
import { ActivityFrame } from './ActivityFrame.tsx'
import { ActivityRenderer } from './ActivityRenderer.tsx'
import type { ActivitySubmission } from './types.ts'

export type LearningQuestionWait = PendingWait<'question'>

function envelopeOf(wait: LearningQuestionWait): LearningActivityEnvelopeV1 | undefined {
  if (wait.payload.questions.length !== 1) return undefined
  const question = wait.payload.questions[0]
  const envelope = decodeLearningDetail(question?.detail)
  if (envelope === undefined || question?.id !== `learning:${envelope.activityId}`) return undefined
  return envelope
}

/** Pure composer-chain selector: only package-owned question envelopes are claimed. */
export function selectLearningActivity({ interactions, session }: ComposerChainProps): LearningQuestionWait | null {
  const currentSessionId = session?.id
  for (const interaction of interactions) {
    if (interaction.kind !== 'question') continue
    const wait = interaction as LearningQuestionWait
    // A pending wait belongs to one live session. This explicit lineage guard
    // prevents a fork from claiming an ancestor's unresolved interaction.
    if (currentSessionId === undefined || String(wait.sessionId) !== String(currentSessionId)) continue
    if (envelopeOf(wait) !== undefined) return wait
  }
  return null
}

type LearningComposerProps =
  { matched: LearningQuestionWait }
  & PropsLocale<'interactive-learning'>

export function LearningComposer({ matched, t }: LearningComposerProps) {
  const envelope = useMemo(() => envelopeOf(matched), [matched])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  if (envelope === undefined) return null

  const respond = (response: LearningResponseV1): void => {
    const question = matched.payload.questions[0]
    if (question === undefined) return
    setBusy(true)
    setError(null)
    void matched.respond({
      ok: true,
      value: {
        sessionId: matched.sessionId,
        answer: { answers: [{ id: question.id, selected: [], custom: JSON.stringify(response) }] },
      },
    }).then(receipt => {
      if (!receipt.accepted) throw new Error(receipt.reason)
    }).catch((cause: unknown) => {
      setBusy(false)
      setError(t('error', { message: cause instanceof Error ? cause.message : String(cause) }))
    })
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
