/**
 * The visual@4 shell: one card, one heading, one optional sequence controller,
 * one error boundary, and whichever of the eight renderers the payload names.
 *
 * The shell owns everything that is not renderer-specific, including the
 * emphasis a sequence frame produces. Frames earlier than the current one
 * contribute a `visited` tier, so the controller and the figure agree about
 * what has already been covered without each renderer re-deriving it.
 */
import { useEffect, useId, useMemo, useState, type ComponentType } from 'react'
import type { LearningVisualV4 as LearningVisualV4Definition } from '../../protocol.ts'
import { learningScope } from '../tokens.ts'
import {
  DEFAULT_LABELS,
  VisualLabelsProvider,
  type LearningVisualV4Labels,
} from './core/labels.ts'
import { SequenceController, VisualErrorBoundary } from './core/shell-parts.tsx'
import type { RendererProps, VisualContent } from './core/types.ts'
import { visualFocus, type VisualFocus } from './state/visual-state.ts'
import { PlotRenderer } from './renderers/PlotRenderer.tsx'
import { NodeLinkRenderer } from './renderers/NodeLinkRenderer.tsx'
import { Scene2DRenderer } from './renderers/Scene2DRenderer.tsx'
import { RelationRenderer } from './renderers/RelationRenderer.tsx'
import { TimelineRenderer } from './renderers/TimelineRenderer.tsx'
import { FormulaStepsRenderer } from './renderers/FormulaStepsRenderer.tsx'
import { StudyMapRenderer } from './renderers/StudyMapRenderer.tsx'
import { RecallDeckRenderer } from './renderers/RecallDeckRenderer.tsx'
import css from './styles/shell.module.css'

type RendererRegistry = {
  [Kind in VisualContent['kind']]: ComponentType<RendererProps<Extract<VisualContent, { kind: Kind }>>>
}

const VISUAL_RENDERER_REGISTRY: RendererRegistry = {
  plot: PlotRenderer,
  node_link: NodeLinkRenderer,
  scene_2d: Scene2DRenderer,
  relation: RelationRenderer,
  timeline: TimelineRenderer,
  formula_steps: FormulaStepsRenderer,
  study_map: StudyMapRenderer,
  recall_deck: RecallDeckRenderer,
}

function RegisteredVisual({ content, focus, storageKey }: RendererProps) {
  const Renderer = VISUAL_RENDERER_REGISTRY[content.kind] as ComponentType<RendererProps>
  return <Renderer content={content} focus={focus} storageKey={storageKey} />
}

export function LearningVisualV4({
  visual,
  storageKey,
  labels: suppliedLabels,
}: {
  visual: LearningVisualV4Definition
  storageKey?: string
  labels?: Partial<LearningVisualV4Labels>
}) {
  const titleId = useId()
  const descriptionId = useId()
  const initialFrameIndex = visual.sequence === undefined
    ? 0
    : Math.max(0, visual.sequence.frames.findIndex(frame => frame.id === visual.sequence?.initialFrameId))
  const [frameIndex, setFrameIndex] = useState(initialFrameIndex)
  const labels = useMemo(() => ({ ...DEFAULT_LABELS, ...suppliedLabels }), [suppliedLabels])

  const focus: VisualFocus = useMemo(() => {
    const frames = visual.sequence?.frames
    if (frames === undefined) return visualFocus([])
    const current = frames[frameIndex]?.focusIds ?? []
    const visited = frames.slice(0, frameIndex).flatMap(frame => frame.focusIds)
    return visualFocus(current, visited)
  }, [frameIndex, visual.sequence])

  // Keyed on the sequence, not the whole visual: a re-render that produces an
  // equivalent definition must not rewind the step the learner chose.
  useEffect(() => setFrameIndex(initialFrameIndex), [initialFrameIndex, visual.sequence])

  return (
    <VisualLabelsProvider value={labels}>
      <section
        className={css.visualShell}
        {...learningScope}
        data-learning-visual={visual.content.kind}
        data-render-state="ready"
        aria-labelledby={titleId}
        aria-describedby={visual.description === undefined ? undefined : descriptionId}
      >
        <header className={css.visualHeader}>
          <span className={css.visualEyebrow} aria-hidden="true">{labels.eyebrow}</span>
          <h3 id={titleId}>{visual.title}</h3>
          {visual.description === undefined ? null : <p id={descriptionId}>{visual.description}</p>}
        </header>
        {visual.sequence === undefined || visual.sequence.frames.length === 0 ? null : (
          <SequenceController sequence={visual.sequence} frameIndex={frameIndex} onFrameChange={setFrameIndex} />
        )}
        <VisualErrorBoundary key={`${visual.protocol}:${visual.title}:${visual.content.kind}`} fallbackMarkdown={visual.fallbackMarkdown} labels={labels}>
          <RegisteredVisual content={visual.content} focus={focus} storageKey={storageKey} />
        </VisualErrorBoundary>
      </section>
    </VisualLabelsProvider>
  )
}

export { DEFAULT_LABELS, type LearningVisualV4Labels } from './core/labels.ts'
export { VISUAL_STATE_STRENGTH, MINIMUM_LEGIBLE_STRENGTH, elementState, visualFocus, type VisualState } from './state/visual-state.ts'
export { graphEmphasis } from './state/graph-state.ts'
export { graphLayout, graphLayers, nodeBox } from './layout/graph-layout.ts'
export { edgeRoutes } from './layout/graph-edges.ts'
export { edgeLabelBox } from './layout/edge-labels.ts'
export { measureText, wrapLabel } from './layout/text-metrics.ts'
