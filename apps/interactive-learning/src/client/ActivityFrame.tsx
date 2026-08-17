import { MarkdownText } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ReactNode } from 'react'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type { LearningActivityV1 } from '../protocol.ts'
import css from './LearningActivity.module.css'

export function ActivityFrame({
  activity, busy, error, children, onSkip, onCancel, t,
}: {
  activity: LearningActivityV1
  busy: boolean
  error: string | null
  children: ReactNode
  onSkip(): void
  onCancel(): void
  t: TranslateNS<'interactive-learning'>
}) {
  return (
    <section className={css.frame} aria-labelledby="learning-activity-title" data-learning-activity={activity.kind}>
      <header className={css.header}>
        <span className={css.eyebrow}>{t('activity')}</span>
        <h2 id="learning-activity-title" className={css.title}>{activity.title}</h2>
        <div className={css.objective}>
          <strong>{t('objective')}</strong>
          <span>{activity.objective}</span>
        </div>
        {activity.scaffold === undefined ? null : (
          <details className={css.scaffold}>
            <summary>{t('scaffold')}</summary>
            <MarkdownText text={activity.scaffold} />
          </details>
        )}
      </header>
      <div className={css.body}>{children}</div>
      <footer className={css.footer}>
        {error === null ? <span className={css.footerSpacer} /> : <p className={css.error} role="alert">{error}</p>}
        <button className={css.ghostButton} type="button" disabled={busy} onClick={onCancel}>{t('cancel')}</button>
        <button className={css.ghostButton} type="button" disabled={busy} onClick={onSkip}>{t('skip')}</button>
      </footer>
    </section>
  )
}
