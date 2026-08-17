import { MarkdownText } from '@deepseek-ai/dsh-client-ui-primitives'
import { useState } from 'react'
import type { LearningJson, StructureItemV1 } from '../protocol.ts'
import type { ActivityRendererProps } from './types.ts'
import css from './LearningActivity.module.css'

type CompareActivity = Extract<ActivityRendererProps['activity'], { kind: 'structure_compare' }>

function Item({ item }: { item?: StructureItemV1 }) {
  if (item === undefined) return <span className={css.emptyCell}>—</span>
  return (
    <div className={css.compareItem}>
      <strong>{item.label}</strong>
      {item.detail === undefined ? null : <MarkdownText text={item.detail} />}
    </div>
  )
}

export function StructureCompare({ activity, busy, onSubmit, t }: ActivityRendererProps<CompareActivity>) {
  const payload = activity.payload
  const [selected, setSelected] = useState<Set<string>>(() => new Set())
  const [answer, setAnswer] = useState('')
  const left = new Map(payload.left.items.map(item => [item.id, item]))
  const right = new Map(payload.right.items.map(item => [item.id, item]))
  const toggle = (id: string): void => setSelected(current => {
    const next = new Set(current)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })
  const submit = (): void => {
    const selectedDifferences = [...selected] as LearningJson
    onSubmit({
      answer: { selectedDifferences, explanation: answer.trim() },
      interactionState: { selectedDifferences },
    })
  }

  return (
    <div className={css.activityContent}>
      <p className={css.prompt}>{payload.question ?? activity.prompt}</p>
      <div className={css.compareHeader}>
        <span />
        <strong>{payload.left.title}</strong>
        <strong>{payload.right.title}</strong>
      </div>
      <div className={css.compareRows}>
        {payload.alignments.map(alignment => (
          <label className={css.compareRow} key={alignment.id}>
            <input
              type="checkbox"
              checked={selected.has(alignment.id)}
              disabled={busy}
              aria-label={alignment.prompt ?? alignment.id}
              onChange={() => toggle(alignment.id)}
            />
            <Item item={alignment.leftId === undefined ? undefined : left.get(alignment.leftId)} />
            <Item item={alignment.rightId === undefined ? undefined : right.get(alignment.rightId)} />
            {alignment.prompt === undefined ? null : <span className={css.rowPrompt}>{alignment.prompt}</span>}
          </label>
        ))}
      </div>
      <label className={css.answerField}>
        <span>{t('answer')}</span>
        <textarea
          value={answer}
          disabled={busy}
          placeholder={t('answerPlaceholder')}
          onChange={event => setAnswer(event.target.value)}
        />
      </label>
      <div className={css.primaryRow}>
        <button className={css.primaryButton} type="button" disabled={busy || selected.size === 0 || answer.trim() === ''} onClick={submit}>
          {busy ? t('submitting') : t('submit')}
        </button>
      </div>
    </div>
  )
}
