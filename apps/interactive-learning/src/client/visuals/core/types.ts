/**
 * Shared types for the visual@4 renderers.
 *
 * Extracted from the former single-file renderer so that layout, state and
 * each renderer can be read, tested and changed independently.
 */
import type { LearningVisualV4 as LearningVisualV4Definition } from '../../../protocol.ts'
import type { VisualFocus } from '../state/visual-state.ts'

export type VisualContent = LearningVisualV4Definition['content']
export type PlotContent = Extract<VisualContent, { kind: 'plot' }>
export type NodeLinkContent = Extract<VisualContent, { kind: 'node_link' }>
export type Scene2DContent = Extract<VisualContent, { kind: 'scene_2d' }>
export type RelationContent = Extract<VisualContent, { kind: 'relation' }>
export type TimelineContent = Extract<VisualContent, { kind: 'timeline' }>
export type FormulaStepsContent = Extract<VisualContent, { kind: 'formula_steps' }>
export type StudyMapContent = Extract<VisualContent, { kind: 'study_map' }>
export type RecallDeckContent = Extract<VisualContent, { kind: 'recall_deck' }>

export type VisualTone = 'blue' | 'green' | 'red' | 'orange' | 'purple' | 'gray'

export const DEFAULT_TONES: readonly VisualTone[] = ['blue', 'red', 'green', 'orange', 'purple', 'gray']

export interface RendererProps<T extends VisualContent = VisualContent> {
  content: T
  focus: VisualFocus
  storageKey?: string
}

export interface Point {
  x: number
  y: number
}

export interface SelectedItem {
  id: string
  label: string
  detail?: string
  kind: 'node' | 'edge' | 'element'
  tone?: VisualTone
}

export interface ChartGeometry {
  width: number
  height: number
  left: number
  right: number
  top: number
  bottom: number
  plotWidth: number
  plotHeight: number
}
