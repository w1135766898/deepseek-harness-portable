/** `relation`: comparison tables, pairwise matrices and set membership. */
import { useState } from 'react'
import { useVisualLabels } from '../core/labels.ts'
import { SelectionSurface } from '../core/shell-parts.tsx'
import { toneAt } from '../core/format.ts'
import type { RelationContent, RendererProps } from '../core/types.ts'
import { elementState } from '../state/visual-state.ts'
import shell from '../styles/shell.module.css'
import css from '../styles/relation.module.css'

type Selection = { label: string; detail?: string; kind: string }

export function RelationRenderer({ content, focus }: RendererProps<RelationContent>) {
  const labels = useVisualLabels()
  const [selected, setSelected] = useState<Selection | undefined>()
  const close = (): void => setSelected(undefined)

  if (content.variant === 'comparison') {
    return (
      <div className={shell.rendererStack}>
        <div className={`${shell.viewport} ${css.tableViewport}`}>
          <table className={css.relationTable}>
            <caption className={shell.srOnly}>{labels.comparisonCaption}</caption>
            <thead><tr><th scope="col">{labels.comparisonDimension}</th>{content.subjects.map(subject => (
              <th key={subject.id} scope="col" data-tone={toneAt(subject.tone)} data-visual-state={elementState(subject.id, focus)} data-visual-id={subject.id}>
                <button type="button" className={css.cellButton} onClick={() => setSelected({ label: subject.label, detail: subject.detail, kind: labels.comparisonSubject })}>{subject.label}</button>
              </th>
            ))}</tr></thead>
            <tbody>{content.rows.map(row => (
              <tr key={row.id} data-visual-state={elementState(row.id, focus)} data-visual-id={row.id}>
                <th scope="row"><button type="button" className={css.cellButton} onClick={() => setSelected({ label: row.label, detail: row.detail, kind: labels.comparisonDimension })}>{row.label}</button></th>
                {content.subjects.map(subject => {
                  const cell = row.cells.find(item => item.subjectId === subject.id)
                  return <td key={subject.id} data-tone={toneAt(cell?.tone)}>{cell?.value ?? '—'}</td>
                })}
              </tr>
            ))}</tbody>
          </table>
        </div>
        <SelectionSurface hint={labels.comparisonInteractionHint} selected={selected} onClose={close} />
      </div>
    )
  }

  if (content.variant === 'matrix') {
    return (
      <div className={shell.rendererStack}>
        <div className={`${shell.viewport} ${css.tableViewport}`}>
          <table className={`${css.relationTable} ${css.matrixTable}`}>
            <caption className={shell.srOnly}>{labels.matrixCaption}</caption>
            <thead><tr><th scope="col">{labels.matrixAxes}</th>{content.columns.map(column => <th key={column.id} scope="col" data-visual-state={elementState(column.id, focus)} data-visual-id={column.id}>{column.label}</th>)}</tr></thead>
            <tbody>{content.rows.map(row => (
              <tr key={row.id}>
                <th scope="row" data-visual-state={elementState(row.id, focus)} data-visual-id={row.id}>{row.label}</th>
                {content.columns.map(column => {
                  const cell = content.cells.find(item => item.rowId === row.id && item.columnId === column.id)
                  return <td key={column.id}>{cell === undefined ? <span className={css.emptyCell} aria-label={labels.noRelation}>·</span> : (
                    <button
                      type="button"
                      className={css.matrixCell}
                      data-tone={toneAt(cell.tone)}
                      data-visual-state={elementState(cell.id, focus)}
                      data-visual-id={cell.id}
                      onClick={() => setSelected({ label: cell.label, detail: cell.detail, kind: `${row.label} × ${column.label}` })}
                    >{cell.label}</button>
                  )}</td>
                })}
              </tr>
            ))}</tbody>
          </table>
        </div>
        <SelectionSurface hint={labels.matrixInteractionHint} selected={selected} onClose={close} />
      </div>
    )
  }

  const setById = new Map(content.sets.map(set => [set.id, set]))
  const exclusiveItems = (setId: string) => content.items.filter(item => item.setIds.length === 1 && item.setIds[0] === setId)
  const sharedItems = content.items.filter(item => item.setIds.length !== 1)
  return (
    <div className={shell.rendererStack}>
      <div className={css.setMap} role="group" aria-label={labels.setsLabel}>
        <div className={css.setZones}>
          {content.sets.map((set, setIndex) => (
            <section key={set.id} className={css.setZone} data-tone={toneAt(set.tone, setIndex)} data-visual-state={elementState(set.id, focus)} data-visual-id={set.id}>
              <h4><span aria-hidden="true" />{set.label}</h4>
              <div>{exclusiveItems(set.id).map(item => (
                <button key={item.id} type="button" className={`${shell.control} ${css.setItem}`} data-visual-state={elementState(item.id, focus)} data-visual-id={item.id} onClick={() => setSelected({ label: item.label, detail: item.detail, kind: set.label })}>{item.label}</button>
              ))}{exclusiveItems(set.id).length === 0 ? <span className={css.emptySet}>{labels.noExclusiveItems}</span> : null}</div>
            </section>
          ))}
        </div>
        {sharedItems.length === 0 ? null : (
          <section className={css.intersections}>
            <h4>{labels.intersections}</h4>
            <div>{sharedItems.map(item => (
              <button key={item.id} type="button" className={`${shell.control} ${css.intersectionItem}`} data-visual-state={elementState(item.id, focus)} data-visual-id={item.id} onClick={() => setSelected({ label: item.label, detail: item.detail, kind: item.setIds.map(setId => setById.get(setId)?.label ?? setId).join(' ∩ ') || labels.uncategorized })}>
                <strong>{item.label}</strong><span>{item.setIds.map(setId => setById.get(setId)?.label ?? setId).join(' ∩ ') || labels.uncategorized}</span>
              </button>
            ))}</div>
          </section>
        )}
      </div>
      <SelectionSurface hint={labels.setsInteractionHint} selected={selected} onClose={close} />
    </div>
  )
}
