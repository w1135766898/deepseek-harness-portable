/**
 * The chrome shared by all eight renderers: the error boundary, the sequence
 * controller, the selection surface, the figure viewport and the state legend.
 *
 * Every renderer composes these rather than restating them, so the heading
 * hierarchy, control shapes, empty and error surfaces, keyboard behaviour and
 * responsive rules are the same wherever a learner meets them.
 */
import {
  Component,
  type ErrorInfo,
  type KeyboardEvent,
  type ReactNode,
  type Ref,
} from 'react'
import type { LearningVisualV4 as LearningVisualV4Definition } from '../../../protocol.ts'
import { labelTemplate, useVisualLabels, type LearningVisualV4Labels } from './labels.ts'
import type { SelectedItem, VisualTone } from './types.ts'
import type { VisualState } from '../state/visual-state.ts'
import css from '../styles/shell.module.css'

export class VisualErrorBoundary extends Component<{
  children: ReactNode
  fallbackMarkdown?: string
  labels: LearningVisualV4Labels
}, { error?: Error }> {
  state: { error?: Error } = {}

  static getDerivedStateFromError(error: Error): { error: Error } {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Learning visual renderer failed', error, info)
  }

  render(): ReactNode {
    if (this.state.error === undefined) return this.props.children
    return (
      <div className={css.errorFallback} role="alert">
        <strong>{this.props.labels.errorTitle}</strong>
        {this.props.fallbackMarkdown === undefined
          ? <span>{this.props.labels.errorContinue}</span>
          : <pre>{this.props.fallbackMarkdown}</pre>}
      </div>
    )
  }
}

export function SequenceController({
  sequence,
  frameIndex,
  onFrameChange,
}: {
  sequence: NonNullable<LearningVisualV4Definition['sequence']>
  frameIndex: number
  onFrameChange: (index: number) => void
}) {
  const labels = useVisualLabels()
  const frame = sequence.frames[frameIndex]
  const initialIndex = Math.max(0, sequence.frames.findIndex(item => item.id === sequence.initialFrameId))
  const move = (delta: number): void => {
    onFrameChange(Math.max(0, Math.min(sequence.frames.length - 1, frameIndex + delta)))
  }
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === 'ArrowLeft') { event.preventDefault(); move(-1) }
    else if (event.key === 'ArrowRight') { event.preventDefault(); move(1) }
    else if (event.key === 'Home') { event.preventDefault(); onFrameChange(0) }
    else if (event.key === 'End') { event.preventDefault(); onFrameChange(sequence.frames.length - 1) }
  }
  return (
    <div className={css.sequence} role="group" onKeyDown={onKeyDown} aria-label={labels.sequenceLabel}>
      <div className={css.sequenceText} aria-live="polite" aria-atomic="true">
        <span>{frameIndex + 1} / {sequence.frames.length}</span>
        <strong>{frame?.label}</strong>
        {frame?.description === undefined ? null : <p>{frame.description}</p>}
      </div>
      <div className={css.sequenceActions}>
        <button type="button" className={css.control} onClick={() => move(-1)} disabled={frameIndex === 0} aria-label={labels.previousStep}>
          <span aria-hidden="true">←</span><span>{labels.previousStep}</span>
        </button>
        <button type="button" className={css.control} onClick={() => move(1)} disabled={frameIndex >= sequence.frames.length - 1} aria-label={labels.nextStep}>
          <span>{labels.nextStep}</span><span aria-hidden="true">→</span>
        </button>
        <button type="button" className={css.control} onClick={() => onFrameChange(initialIndex)} disabled={frameIndex === initialIndex}>
          {labels.reset}
        </button>
      </div>
      <ol className={css.sequenceRail}>
        {sequence.frames.map((item, index) => (
          <li key={item.id}>
            <button
              type="button"
              data-visual-state={index === frameIndex ? 'current' : index < frameIndex ? 'visited' : 'context'}
              aria-current={index === frameIndex ? 'step' : undefined}
              aria-label={`${labelTemplate(labels.stepOfTotal, { current: index + 1, total: sequence.frames.length })}: ${item.label}`}
              onClick={() => onFrameChange(index)}
            />
          </li>
        ))}
      </ol>
    </div>
  )
}

/**
 * The hint and the selection detail share one slot.
 *
 * Selecting a mark used to swap a one-line hint for a three-line panel, which
 * moved the figure under the learner's pointer. The slot reserves the taller of
 * the two instead.
 */
export function SelectionSurface({
  hint,
  selected,
  kindLabel,
  onClose,
}: {
  hint: string
  selected?: Pick<SelectedItem, 'label' | 'detail' | 'tone'> & { kind: string }
  kindLabel?: string
  onClose: () => void
}) {
  const labels = useVisualLabels()
  if (selected === undefined) {
    return (
      <div className={css.selectionSlot}>
        <p className={css.interactionHint}>{hint}</p>
      </div>
    )
  }
  return (
    <div className={css.selectionSlot}>
      <aside className={css.detailPanel} data-tone={selected.tone} aria-live="polite">
        <span>{kindLabel ?? selected.kind}</span>
        <strong>{selected.label}</strong>
        <p>{selected.detail ?? labels.noDetail}</p>
        <button type="button" className={`${css.control} ${css.closeButton}`} onClick={onClose} aria-label={labels.closeDetail}>×</button>
      </aside>
    </div>
  )
}

/** The scrollable frame a measured SVG figure is drawn into. */
export function FigureViewport({
  viewportRef,
  children,
}: {
  viewportRef: Ref<HTMLDivElement>
  children: ReactNode
}) {
  return <div className={css.viewport} ref={viewportRef}>{children}</div>
}

/** Names the emphasis states a figure is currently using, in words. */
export function StateLegend({ states }: { states: readonly VisualState[] }) {
  const labels = useVisualLabels()
  const naming: Partial<Record<VisualState, string>> = {
    current: labels.stateCurrent,
    related: labels.stateRelated,
    visited: labels.stateVisited,
    context: labels.stateContext,
    inactive: labels.stateContext,
  }
  const shown = [...new Set(states)].filter(state => naming[state] !== undefined)
  if (shown.length < 2) return null
  return (
    <p className={css.stateLegend} aria-label={labels.graphLegendLabel}>
      {shown.map(state => (
        <span key={state} data-visual-state={state}>
          <i aria-hidden="true" />{naming[state]}
        </span>
      ))}
    </p>
  )
}

export function EmptyFigure({ message }: { message?: string }) {
  const labels = useVisualLabels()
  return <p className={css.emptyState} role="note">{message ?? labels.emptyVisual}</p>
}

export function toneOf(selected: SelectedItem | undefined): VisualTone | undefined {
  return selected?.tone
}

export { css as shellCss }
