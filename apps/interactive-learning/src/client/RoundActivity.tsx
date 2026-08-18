import { MarkdownText } from '@deepseek-ai/dsh-client-ui-primitives'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import { useEffect, useReducer, useRef, useState } from 'react'
import type { LearningActivityV2, LearningJson } from '../protocol.ts'
import { initialRoundState, roundReducer } from './roundState.ts'
import { emitLearningUiLifecycle } from './lifecycle.ts'
import { ParameterRoundVisual } from './ParameterExplorer.tsx'
import css from './LearningActivity.module.css'

export interface RevealCompletion {
  completed: true
  reducedMotion?: boolean
}

export interface RoundActivityProps {
  activity: LearningActivityV2
  completed?: boolean
  initialAnswer?: LearningJson
  storageKey?: string
  t: TranslateNS<'interactive-learning'>
  onSubmitAnswer?(answer: LearningJson, interactionState: LearningJson): Promise<void>
  onContinue?(animation: RevealCompletion): Promise<void>
  onCancel?(): Promise<void>
}

interface StoredRoundUi {
  draft?: string
  animationComplete?: boolean
  completed?: boolean
}

function readStoredRound(storageKey: string | undefined): StoredRoundUi {
  if (storageKey === undefined || typeof sessionStorage === 'undefined') return {}
  try {
    return JSON.parse(sessionStorage.getItem(`dsh-learning/round@2:${storageKey}`) ?? '{}') as StoredRoundUi
  } catch {
    return {}
  }
}

function writeStoredRound(storageKey: string | undefined, update: StoredRoundUi): void {
  if (storageKey === undefined || typeof sessionStorage === 'undefined') return
  const key = `dsh-learning/round@2:${storageKey}`
  sessionStorage.setItem(key, JSON.stringify({ ...readStoredRound(storageKey), ...update }))
}

function ProcessVisual({ activity, final }: { activity: LearningActivityV2; final: boolean }) {
  if (activity.visual?.kind !== 'process') return null
  const frame = activity.phase === 'question'
    ? activity.visual.frame
    : final ? activity.visual.after : activity.visual.before
  return (
    <section className={css.roundProcess} data-final={final || undefined}>
      <span className={css.roundNode}>{activity.seq + 1}</span>
      <div>
        <h3>{frame.title}</h3>
        {frame.content === undefined ? null : <MarkdownText text={frame.content} />}
      </div>
    </section>
  )
}

function ParameterVisual({ activity, t }: { activity: LearningActivityV2; t: TranslateNS<'interactive-learning'> }) {
  if (activity.visual?.kind !== 'parameter') return null
  return <ParameterRoundVisual payload={activity.visual} disabled={activity.phase === 'reveal'} t={t} />
}

function StructureVisual({ activity }: { activity: LearningActivityV2 }) {
  if (activity.visual?.kind !== 'structure') return null
  const [selected, setSelected] = useState<Set<string>>(() => new Set())
  const left = new Map(activity.visual.left.items.map(item => [item.id, item]))
  const right = new Map(activity.visual.right.items.map(item => [item.id, item]))
  return (
    <section className={css.roundStructure} aria-label={`${activity.visual.left.title} / ${activity.visual.right.title}`}>
      <h3>{activity.visual.left.title}</h3>
      <h3>{activity.visual.right.title}</h3>
      {activity.visual.alignments.map(alignment => {
        const leftItem = alignment.leftId === undefined ? undefined : left.get(alignment.leftId)
        const rightItem = alignment.rightId === undefined ? undefined : right.get(alignment.rightId)
        const label = alignment.prompt ?? `${leftItem?.label ?? '—'} / ${rightItem?.label ?? '—'}`
        return (
          <label className={css.roundAlignment} key={alignment.id} data-selected={selected.has(alignment.id) || undefined}>
            <input
              type="checkbox"
              checked={selected.has(alignment.id)}
              disabled={activity.phase === 'reveal'}
              onChange={() => setSelected(current => {
                const next = new Set(current)
                if (next.has(alignment.id)) next.delete(alignment.id)
                else next.add(alignment.id)
                return next
              })}
            />
            <span>{leftItem?.label ?? '—'}</span>
            <span>{rightItem?.label ?? '—'}</span>
            {alignment.prompt === undefined ? null : <small>{label}</small>}
          </label>
        )
      })}
    </section>
  )
}

function CurrentVisual({ activity, final, t }: { activity: LearningActivityV2; final: boolean; t: TranslateNS<'interactive-learning'> }) {
  if (activity.visual === undefined) return null
  if (activity.visual.kind === 'process') return <ProcessVisual activity={activity} final={final} />
  if (activity.visual.kind === 'parameter') return <ParameterVisual activity={activity} t={t} />
  return <StructureVisual activity={activity} />
}

function QuestionInput({
  activity, disabled, answer, setAnswer,
}: {
  activity: Extract<LearningActivityV2, { phase: 'question' }>
  disabled: boolean
  answer: string
  setAnswer(value: string): void
}) {
  if (activity.input.kind === 'single_choice') {
    return (
      <fieldset className={css.prediction} disabled={disabled}>
        <legend>{activity.prompt}</legend>
        {activity.input.options.map(option => (
          <label className={css.option} key={option.id}>
            <input
              type="radio"
              name={`learning-round-${activity.seq}`}
              value={option.id}
              checked={answer === option.id}
              onChange={() => setAnswer(option.id)}
            />
            <span>{option.label}</span>
          </label>
        ))}
      </fieldset>
    )
  }
  if (activity.input.kind === 'number') {
    return (
      <label className={css.answerField}>
        <span>{activity.prompt}</span>
        <input
          type="number"
          value={answer}
          min={activity.input.min}
          max={activity.input.max}
          step={activity.input.step}
          disabled={disabled}
          onChange={event => setAnswer(event.target.value)}
        />
      </label>
    )
  }
  return (
    <label className={css.answerField}>
      <span>{activity.prompt}</span>
      <textarea
        value={answer}
        placeholder={activity.input.placeholder}
        maxLength={activity.input.maxLength}
        disabled={disabled}
        onChange={event => setAnswer(event.target.value)}
      />
    </label>
  )
}

export function RoundActivity({
  activity, completed = false, initialAnswer, storageKey, t, onSubmitAnswer, onContinue, onCancel,
}: RoundActivityProps) {
  const stored = useRef(readStoredRound(storageKey)).current
  const [state, dispatch] = useReducer(roundReducer, undefined, () => {
    if (completed || stored.completed === true) return initialRoundState(activity.phase, true)
    if (activity.phase === 'reveal' && stored.animationComplete === true) {
      return { status: 'ready_to_continue' as const, error: null }
    }
    return initialRoundState(activity.phase)
  })
  const [answer, setAnswer] = useState(() => stored.draft
    ?? (typeof initialAnswer === 'string' || typeof initialAnswer === 'number' ? String(initialAnswer) : ''))
  const ackStarted = useRef(false)
  const cancelStarted = useRef(false)
  const lifecycleStarted = useRef(false)
  const revealElement = useRef<HTMLDivElement>(null)
  const reducedMotion = typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches

  useEffect(() => {
    emitLearningUiLifecycle({ name: 'learning.ui.presented', phase: activity.phase, seq: activity.seq, storageKey })
  }, [activity.phase, activity.seq, storageKey])

  useEffect(() => {
    if (activity.phase === 'reveal' && state.status === 'animating' && !lifecycleStarted.current) {
      lifecycleStarted.current = true
      emitLearningUiLifecycle({ name: 'learning.animation.started', phase: activity.phase, seq: activity.seq, storageKey })
    }
  }, [activity.phase, activity.seq, state.status, storageKey])

  useEffect(() => {
    if (activity.phase === 'reveal' && state.status === 'animating' && reducedMotion) {
      emitLearningUiLifecycle({ name: 'learning.animation.finished', phase: activity.phase, seq: activity.seq, storageKey })
      writeStoredRound(storageKey, { animationComplete: true })
      dispatch({ type: 'ANIMATION_FINISHED' })
    }
  }, [activity.phase, activity.seq, reducedMotion, state.status, storageKey])

  useEffect(() => {
    if (activity.phase === 'question' && state.status === 'awaiting_input') writeStoredRound(storageKey, { draft: answer })
  }, [activity.phase, answer, state.status, storageKey])

  useEffect(() => {
    if (activity.phase === 'reveal' && state.status === 'ready_to_continue') {
      writeStoredRound(storageKey, { animationComplete: true })
    }
    if (state.status === 'completed') writeStoredRound(storageKey, { completed: true })
  }, [activity.phase, state.status, storageKey])

  const finishAnimation = (): void => {
    if (state.status === 'animating') {
      emitLearningUiLifecycle({ name: 'learning.animation.finished', phase: activity.phase, seq: activity.seq, storageKey })
      writeStoredRound(storageKey, { animationComplete: true })
      dispatch({ type: 'ANIMATION_FINISHED' })
    }
  }

  useEffect(() => {
    const element = revealElement.current
    if (element === null || activity.phase !== 'reveal' || state.status !== 'animating') return
    element.addEventListener('animationend', finishAnimation)
    return () => element.removeEventListener('animationend', finishAnimation)
  }, [activity.phase, state.status, storageKey])

  const submitAnswer = (): void => {
    if (activity.phase !== 'question' || onSubmitAnswer === undefined || answer.trim() === '') return
    dispatch({ type: 'SUBMIT_ANSWER' })
    const value: LearningJson = activity.input.kind === 'number' ? Number(answer) : answer
    void onSubmitAnswer(value, { answer: value }).then(() => {
      dispatch({ type: 'ANSWER_ACCEPTED' })
      dispatch({ type: 'WAIT_FOR_REVEAL' })
    }).catch((cause: unknown) => dispatch({
      type: 'SUBMISSION_FAILED',
      message: cause instanceof Error ? cause.message : String(cause),
    }))
  }

  const submitContinue = (): void => {
    if (activity.phase !== 'reveal' || onContinue === undefined
      || state.status !== 'ready_to_continue' || ackStarted.current) return
    ackStarted.current = true
    dispatch({ type: 'SUBMIT_CONTINUE' })
    void onContinue({ completed: true, reducedMotion: reducedMotion || undefined }).then(() => {
      dispatch({ type: 'ACK_ACCEPTED' })
      emitLearningUiLifecycle({ name: 'learning.continue.accepted', phase: activity.phase, seq: activity.seq, storageKey })
    }).catch((cause: unknown) => dispatch({
      type: 'SUBMISSION_FAILED',
      message: cause instanceof Error ? cause.message : String(cause),
    })).finally(() => { ackStarted.current = false })
  }

  const final = activity.phase === 'reveal' && state.status !== 'animating'
  return (
    <section className={css.round} data-round-state={state.status}>
      <header className={css.roundHeader}>
        {activity.focus.progress === undefined ? null : (
          <span>{t('roundProgress', {
            current: activity.focus.progress.current,
            total: activity.focus.progress.total ?? '?',
          })}</span>
        )}
        <h2>{activity.focus.title}</h2>
      </header>
      <div
        ref={revealElement}
        className={activity.phase === 'reveal' ? css.revealTransition : undefined}
        data-reveal-transition={activity.phase === 'reveal' || undefined}
      >
        <CurrentVisual activity={activity} final={final} t={t} />
      </div>
      {activity.phase === 'question' ? (
        <>
          <QuestionInput
            activity={activity}
            disabled={state.status !== 'awaiting_input'}
            answer={answer}
            setAnswer={setAnswer}
          />
          <button
            className={css.primaryButton}
            type="button"
            disabled={state.status !== 'awaiting_input' || answer.trim() === ''}
            onClick={submitAnswer}
          >
            {state.status === 'submitting_answer' ? t('submitting') : t('submitAnswer')}
          </button>
          {state.status === 'awaiting_model_reveal' ? <p role="status">{t('awaitingReveal')}</p> : null}
        </>
      ) : (
        <>
          <section className={css.roundFeedback} data-verdict={activity.feedback.verdict}>
            {activity.feedback.learnerEcho === undefined ? null : <p>{activity.feedback.learnerEcho}</p>}
            <MarkdownText text={activity.feedback.explanation} />
            {activity.feedback.answer === undefined ? null : <strong>{activity.feedback.answer}</strong>}
          </section>
          {state.status === 'completed' ? null : (
            <button
              className={css.primaryButton}
              type="button"
              disabled={state.status !== 'ready_to_continue'}
              onClick={submitContinue}
            >
              {activity.advance.label ?? t('continue')}
            </button>
          )}
        </>
      )}
      {state.error === null ? null : <p className={css.error} role="alert">{state.error}</p>}
      {state.status === 'completed' || onCancel === undefined ? null : (
        <button
          className={css.textButton}
          type="button"
          disabled={cancelStarted.current || state.status === 'submitting_answer' || state.status === 'ack_submitting'}
          onClick={() => {
            if (cancelStarted.current) return
            cancelStarted.current = true
            void onCancel().catch((cause: unknown) => dispatch({
              type: 'SUBMISSION_FAILED',
              message: cause instanceof Error ? cause.message : String(cause),
            })).finally(() => { cancelStarted.current = false })
          }}
        >
          {t('cancel')}
        </button>
      )}
    </section>
  )
}
