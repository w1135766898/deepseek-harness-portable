import { useEffect, useId, useState, type FormEvent, type KeyboardEvent } from 'react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { LearningCheckpointResponseV1, LearningCheckpointV1 } from '../protocol.ts'
import css from './LearningActivity.module.css'

type LearningCheckpointProps = PropsLocale<'interactive-learning'> & {
  checkpoint: LearningCheckpointV1
  storageKey: string
  busy: boolean
  error: string | null
  onSubmit(response: LearningCheckpointResponseV1): Promise<void>
  onSkip(): Promise<void>
  onCancel(): Promise<void>
}

const STORAGE_PREFIX = 'dsh-learning/checkpoint@1:'

function readDraft(storageKey: string): string {
  try {
    return sessionStorage.getItem(`${STORAGE_PREFIX}${storageKey}`) ?? ''
  } catch {
    return ''
  }
}

function writeDraft(storageKey: string, draft: string): void {
  try {
    const key = `${STORAGE_PREFIX}${storageKey}`
    if (draft === '') sessionStorage.removeItem(key)
    else sessionStorage.setItem(key, draft)
  } catch {
    // Storage can be unavailable in privacy-restricted browser contexts. The
    // checkpoint remains fully usable for the lifetime of the mounted view.
  }
}

/** A compact, answer-free gate for one learner contribution. */
export function LearningCheckpoint({
  checkpoint,
  storageKey,
  busy,
  error,
  onSubmit,
  onSkip,
  onCancel,
  t,
}: LearningCheckpointProps) {
  const headingId = useId()
  const inputId = useId()
  const contextId = useId()
  const hintId = useId()
  const [draft, setDraft] = useState(() => readDraft(storageKey))

  useEffect(() => {
    setDraft(readDraft(storageKey))
  }, [storageKey])

  useEffect(() => {
    writeDraft(storageKey, draft)
  }, [draft, storageKey])

  const trimmed = draft.trim()
  const numeric = Number(trimmed)
  const selectedOption = checkpoint.options?.some(option => option.id === draft) ?? false
  const isTextCheckpoint = checkpoint.kind === 'free_text'
    || checkpoint.kind === 'prediction'
    || checkpoint.kind === 'code_slot'
  const canSubmit = checkpoint.kind === 'single_choice'
    ? selectedOption
    : checkpoint.kind === 'numeric'
      ? trimmed !== '' && Number.isFinite(numeric)
      : trimmed !== ''

  const finish = async (action: () => Promise<void>): Promise<void> => {
    try {
      await action()
      writeDraft(storageKey, '')
    } catch {
      // The parent owns the localized error state. Keep the draft for retry.
    }
  }

  const submit = async (): Promise<void> => {
    if (busy || !canSubmit) return
    const response: LearningCheckpointResponseV1 = checkpoint.kind === 'single_choice'
      ? { optionId: draft }
      : checkpoint.kind === 'numeric'
        ? { number: numeric }
        : { text: draft }
    await finish(() => onSubmit(response))
  }

  const onFormSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    void submit()
  }

  const onTextKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (event.key !== 'Enter' || (!event.ctrlKey && !event.metaKey)) return
    event.preventDefault()
    void submit()
  }

  const inputLabel = checkpoint.kind === 'free_text'
    ? t('checkpointFreeTextLabel')
    : checkpoint.kind === 'prediction'
      ? t('checkpointPredictionLabel')
      : checkpoint.kind === 'code_slot'
        ? t('checkpointCodeLabel')
        : checkpoint.kind === 'numeric'
          ? t('checkpointNumericLabel')
          : t('checkpointChoiceLabel')

  const describedBy = [checkpoint.context === undefined ? undefined : contextId, isTextCheckpoint ? hintId : undefined]
    .filter((value): value is string => value !== undefined)
    .join(' ')

  return (
    <section className={css.checkpoint} data-learning-checkpoint={checkpoint.kind} aria-labelledby={headingId}>
      <header className={css.checkpointHeader}>
        <span className={css.checkpointEyebrow}>{t('checkpointEyebrow')}</span>
        <h2 id={headingId}>{checkpoint.prompt}</h2>
        {checkpoint.context === undefined ? null : <p id={contextId}>{checkpoint.context}</p>}
      </header>
      <form className={css.checkpointForm} onSubmit={onFormSubmit}>
        {checkpoint.kind === 'single_choice' ? (
          <fieldset className={css.checkpointChoices} aria-describedby={describedBy} disabled={busy}>
            <legend>{inputLabel}</legend>
            {checkpoint.options?.map(option => (
              <label className={css.checkpointOption} key={option.id}>
                <input
                  type="radio"
                  name={`${inputId}-choice`}
                  value={option.id}
                  checked={draft === option.id}
                  onChange={() => setDraft(option.id)}
                />
                <span>{option.label}</span>
              </label>
            ))}
          </fieldset>
        ) : checkpoint.kind === 'numeric' ? (
          <label className={css.checkpointField} htmlFor={inputId}>
            <span>{inputLabel}</span>
            <input
              id={inputId}
              className={css.checkpointInput}
              type="number"
              step="any"
              value={draft}
              disabled={busy}
              aria-describedby={describedBy}
              onChange={event => setDraft(event.currentTarget.value)}
            />
          </label>
        ) : (
          <label className={css.checkpointField} htmlFor={inputId}>
            <span>{inputLabel}</span>
            <textarea
              id={inputId}
              className={`${css.checkpointInput} ${checkpoint.kind === 'code_slot' ? css.checkpointCode : ''}`}
              value={draft}
              disabled={busy}
              maxLength={checkpoint.kind === 'code_slot' ? 16_000 : 8_000}
              rows={checkpoint.kind === 'code_slot' ? 5 : 3}
              aria-describedby={describedBy}
              onChange={event => setDraft(event.currentTarget.value)}
              onKeyDown={onTextKeyDown}
            />
          </label>
        )}
        {isTextCheckpoint ? <p className={css.checkpointHint} id={hintId}>{t('checkpointKeyboardHint')}</p> : null}
        {error === null ? null : <p className={css.error} role="alert">{error}</p>}
        <div className={css.checkpointActions}>
          <button className={css.primaryButton} type="submit" disabled={busy || !canSubmit}>
            {busy ? t('submitting') : t('submit')}
          </button>
          <button className={css.ghostButton} type="button" disabled={busy} onClick={() => void finish(onSkip)}>
            {t('skip')}
          </button>
          <button className={css.textButton} type="button" disabled={busy} onClick={() => void finish(onCancel)}>
            {t('cancel')}
          </button>
        </div>
      </form>
    </section>
  )
}
