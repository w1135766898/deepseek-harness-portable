import { MarkdownText } from '@deepseek-ai/dsh-client-ui-primitives'
import { useState } from 'react'
import type { LearningJson, StructureItemV1 } from '../protocol.ts'
import type { ActivityRendererProps } from './types.ts'
import css from './LearningActivity.module.css'

type CompareActivity = Extract<ActivityRendererProps['activity'], { kind: 'structure_compare' }>

function Item({ item, side }: { item?: StructureItemV1; side: 'left' | 'right' }) {
  if (item === undefined) return <span className={css.emptyCell} data-side={side}>—</span>
  return (
    <div className={css.compareItem} data-side={side}>
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
      <div className={css.compareHeader} aria-hidden="true">
        <strong data-side="left">{payload.left.title}</strong>
        <span className={css.compareHeaderLink}>↔</span>
        <strong data-side="right">{payload.right.title}</strong>
      </div>
      <div className={css.compareRows} role="group" aria-label={t('compareMap')} data-structure-map="true">
        {payload.alignments.map(alignment => (
          <label
            className={css.compareRow}
            key={alignment.id}
            data-alignment-id={alignment.id}
            data-selected={selected.has(alignment.id) || undefined}
          >
            <Item item={alignment.leftId === undefined ? undefined : left.get(alignment.leftId)} side="left" />
            <span className={css.compareLine} aria-hidden="true" />
            <span className={css.compareSelector}>
              <input
                type="checkbox"
                checked={selected.has(alignment.id)}
                disabled={busy}
                aria-label={alignment.prompt ?? alignment.id}
                onChange={() => toggle(alignment.id)}
              />
            </span>
            <span className={css.compareLine} aria-hidden="true" />
            <Item item={alignment.rightId === undefined ? undefined : right.get(alignment.rightId)} side="right" />
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
