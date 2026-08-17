import { MarkdownText } from '@deepseek-ai/dsh-client-ui-primitives'
import { useState } from 'react'
import type { LearningJson } from '../protocol.ts'
import type { ActivityRendererProps } from './types.ts'
import css from './LearningActivity.module.css'

type ProcessActivity = Extract<ActivityRendererProps['activity'], { kind: 'process_stepper' }>

export function ProcessStepper({ activity, busy, onSubmit, t }: ActivityRendererProps<ProcessActivity>) {
  const { steps } = activity.payload
  const [index, setIndex] = useState(0)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [revealed, setRevealed] = useState<Set<string>>(() => new Set(
    steps.filter(step => step.checkpoint === undefined).map(step => step.id),
  ))
  const step = steps[index] as typeof steps[number]
  const isRevealed = revealed.has(step.id)
  const prediction = answers[step.id] ?? ''
  const canReveal = step.checkpoint === undefined || prediction.trim() !== ''
  const reveal = (): void => setRevealed(current => new Set([...current, step.id]))
  const restart = (): void => {
    setIndex(0)
    setAnswers({})
    setRevealed(new Set(steps.filter(item => item.checkpoint === undefined).map(item => item.id)))
  }
  const submit = (): void => {
    const checkpoints = steps
      .filter(item => item.checkpoint !== undefined)
      .map(item => ({ stepId: item.id, answer: answers[item.id] ?? '' })) as LearningJson
    onSubmit({
      answer: { checkpoints },
      interactionState: { currentStep: index, revealed: [...revealed] },
    })
  }

  return (
    <div className={css.activityContent}>
      <div className={css.stepMeta}>
        <span>{t('step', { current: index + 1, total: steps.length })}</span>
        <button className={css.textButton} type="button" disabled={busy} onClick={restart}>{t('restart')}</button>
      </div>
      <ol className={css.progress} aria-label={t('step', { current: index + 1, total: steps.length })}>
        {steps.map((item, itemIndex) => <li key={item.id} data-active={itemIndex === index || undefined} data-done={itemIndex < index || undefined} />)}
      </ol>
      <section className={css.stepCard}>
        <h3>{step.title}</h3>
        {step.checkpoint === undefined ? null : (
          <fieldset className={css.prediction} disabled={busy || isRevealed}>
            <legend>{t('predict')}</legend>
            <p>{step.checkpoint.question}</p>
            {step.checkpoint.options === undefined ? (
              <textarea value={prediction} onChange={event => setAnswers(current => ({ ...current, [step.id]: event.target.value }))} />
            ) : step.checkpoint.options.map(option => (
              <label className={css.option} key={option}>
                <input
                  type="radio"
                  name={`prediction-${step.id}`}
                  value={option}
                  checked={prediction === option}
                  onChange={() => setAnswers(current => ({ ...current, [step.id]: option }))}
                />
                <span>{option}</span>
              </label>
            ))}
          </fieldset>
        )}
        {!isRevealed ? (
          <button className={css.revealButton} type="button" disabled={busy || !canReveal} onClick={reveal}>{t('reveal')}</button>
        ) : (
          <div className={css.revealed}><MarkdownText text={step.content} /></div>
        )}
      </section>
      <div className={css.navigation}>
        <button className={css.ghostButton} type="button" disabled={busy || index === 0} onClick={() => setIndex(current => current - 1)}>{t('previous')}</button>
        {index < steps.length - 1 ? (
          <button className={css.primaryButton} type="button" disabled={busy || !isRevealed} onClick={() => setIndex(current => current + 1)}>{t('next')}</button>
        ) : (
          <button className={css.primaryButton} type="button" disabled={busy || !isRevealed} onClick={submit}>{busy ? t('submitting') : t('submit')}</button>
        )}
      </div>
    </div>
  )
}
