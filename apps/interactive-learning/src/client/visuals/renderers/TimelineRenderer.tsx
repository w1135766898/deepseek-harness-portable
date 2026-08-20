/** `timeline`: chronologies, phases and eras, horizontal or vertical. */
import { useMemo, useState, type CSSProperties } from 'react'
import { useVisualLabels } from '../core/labels.ts'
import { SelectionSurface } from '../core/shell-parts.tsx'
import { toneAt } from '../core/format.ts'
import type { RendererProps, TimelineContent } from '../core/types.ts'
import { elementState } from '../state/visual-state.ts'
import { useContainerWidth } from '../state/hooks.ts'
import shell from '../styles/shell.module.css'
import css from '../styles/timeline.module.css'

type Selection = { label: string; detail?: string; kind: string }

/** Vertical distance from the axis to the top of an upper-row event card. */
const CARD_OFFSET = 72

function timelinePosition(event: TimelineContent['events'][number], index: number, count: number): number {
  if (event.position !== undefined) return Math.max(0, Math.min(1, event.position))
  return count <= 1 ? 0.5 : index / (count - 1)
}

export function TimelineRenderer({ content, focus }: RendererProps<TimelineContent>) {
  const labels = useVisualLabels()
  const [viewportRef, containerWidth] = useContainerWidth()
  const [selected, setSelected] = useState<Selection | undefined>()
  const eras = content.eras ?? []
  const eventIndex = useMemo(() => new Map(content.events.map((event, index) => [event.id, index])), [content.events])
  const selectEvent = (event: TimelineContent['events'][number]): void => setSelected({ label: `${event.time} · ${event.label}`, detail: event.detail, kind: labels.timelineEventKind })
  const selectEra = (era: NonNullable<TimelineContent['eras']>[number]): void => setSelected({ label: era.label, detail: era.detail, kind: labels.timelineEraKind })

  // A narrow container gets the vertical form: a horizontal axis at that width
  // is a scroll gesture per event, which is not a timeline any more.
  const vertical = (content.orientation ?? 'horizontal') === 'vertical' || containerWidth < 420

  if (vertical) {
    return (
      <div className={shell.rendererStack} role="group" aria-label={labels.timelineLabel}>
        {eras.length === 0 ? null : (
          <div className={css.timelineEraChips} role="group" aria-label={labels.timelineEraKind}>
            {eras.map((era, index) => (
              <button key={era.id} type="button" className={`${shell.control} ${css.eraChip}`} data-tone={toneAt(era.tone, index)} data-visual-state={elementState(era.id, focus)} data-visual-id={era.id} onClick={() => selectEra(era)}>
                <strong>{era.label}</strong>
                <span>{content.events[eventIndex.get(era.startEventId) ?? 0]?.time} – {content.events[eventIndex.get(era.endEventId) ?? 0]?.time}</span>
              </button>
            ))}
          </div>
        )}
        <ol className={css.timelineVertical}>
          {content.events.map((event, index) => (
            <li key={event.id} data-tone={toneAt(event.tone, index)} data-visual-state={elementState(event.id, focus)} data-visual-id={event.id}>
              <button type="button" className={`${shell.control} ${css.verticalEvent}`} onClick={() => selectEvent(event)}>
                <span>{event.time}</span><strong>{event.label}</strong>
                {event.detail === undefined ? null : <small>{event.detail}</small>}
              </button>
            </li>
          ))}
        </ol>
        <SelectionSurface hint={labels.timelineInteractionHint} selected={selected} onClose={() => setSelected(undefined)} />
      </div>
    )
  }

  const eventCount = content.events.length
  const minimumWidth = 120 + Math.max(0, eventCount - 1) * 136
  const width = Math.max(minimumWidth, Math.floor(containerWidth) - 2)
  // The era lane is laid out first, then the axis is pushed far enough down
  // that the upper row of event cards clears it. Deriving the axis from a
  // constant instead put a two-row era lane underneath the first event card.
  const eraRows = Math.min(4, eras.length)
  const eraLaneBottom = eras.length === 0 ? 0 : 14 + (eraRows - 1) * 28 + 26
  const axisY = Math.max(90, eraLaneBottom + 8 + CARD_OFFSET)
  const height = axisY + 130
  const inset = 66
  const eventX = (event: TimelineContent['events'][number], index: number): number => inset + timelinePosition(event, index, content.events.length) * (width - inset * 2)
  return (
    <div className={shell.rendererStack} role="group" aria-label={labels.timelineLabel}>
      <div className={shell.viewport} ref={viewportRef}>
        <div className={css.timelineCanvas} style={{ width, height }}>
          {eras.map((era, index) => {
            const startIndex = eventIndex.get(era.startEventId) ?? 0
            const endIndex = eventIndex.get(era.endEventId) ?? startIndex
            const start = eventX(content.events[startIndex] as TimelineContent['events'][number], startIndex)
            const end = eventX(content.events[endIndex] as TimelineContent['events'][number], endIndex)
            return (
              <button
                key={era.id}
                type="button"
                className={css.timelineEra}
                data-tone={toneAt(era.tone, index)}
                data-visual-state={elementState(era.id, focus)}
                data-visual-id={era.id}
                style={{ left: Math.min(start, end), top: 14 + index % 4 * 28, width: Math.max(48, Math.abs(end - start)) } as CSSProperties}
                onClick={() => selectEra(era)}
              >{era.label}</button>
            )
          })}
          <div className={css.timelineAxis} style={{ top: axisY }} aria-hidden="true" />
          {content.events.map((event, index) => (
            <button
              key={event.id}
              type="button"
              className={css.timelineEvent}
              data-tone={toneAt(event.tone, index)}
              data-side={index % 2 === 0 ? 'top' : 'bottom'}
              data-visual-state={elementState(event.id, focus)}
              data-visual-id={event.id}
              style={{ left: eventX(event, index), top: index % 2 === 0 ? axisY - CARD_OFFSET : axisY + 24 } as CSSProperties}
              onClick={() => selectEvent(event)}
            >
              <span>{event.time}</span><strong>{event.label}</strong>
            </button>
          ))}
        </div>
      </div>
      <SelectionSurface hint={labels.timelineInteractionHint} selected={selected} onClose={() => setSelected(undefined)} />
    </div>
  )
}
