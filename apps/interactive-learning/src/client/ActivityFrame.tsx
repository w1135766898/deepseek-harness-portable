import { MarkdownText } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ReactNode } from 'react'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type { LearningActivityV1 } from '../protocol.ts'
import css from './LearningActivity.module.css'

export function ActivityFrame({
  activityId, activity, busy, error, children, onSkip, onCancel, t,
}: {
  activityId: string
  activity: LearningActivityV1
  busy: boolean
  error: string | null
  children: ReactNode
  onSkip(): void
  onCancel(): void
  t: TranslateNS<'interactive-learning'>
}) {
  return (
    <section
      className={css.inlineActivity}
      aria-label={activity.title}
      data-learning-activity={activity.kind}
      data-learning-activity-id={activityId}
      data-learning-surface="inline"
    >
      {children}
      {activity.scaffold === undefined ? null : (
        <details className={css.scaffold}>
          <summary>{t('scaffold')}</summary>
          <MarkdownText text={activity.scaffold} />
        </details>
      )}
      {error === null ? null : <p className={css.error} role="alert">{error}</p>}
      <div className={css.activityActions}>
        <button className={css.textButton} type="button" disabled={busy} onClick={onSkip}>{t('skip')}</button>
        <button className={css.textButton} type="button" disabled={busy} onClick={onCancel}>{t('cancel')}</button>
      </div>
    </section>
  )
}
