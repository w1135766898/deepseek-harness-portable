/**
 * Edge routing and label placement for node_link.
 *
 * Every edge used to be the same curve — start anchor, end anchor, control
 * points on the main axis — with its label pinned to the midpoint of that
 * curve. Three shapes break under that rule, and one five-node generation loop
 * hit all three of them at once.
 *
 * 1. An edge that runs *backwards* (the feedback arrow of a loop) was drawn
 *    straight back across the diagram, through every column between its ends,
 *    and dropped its label in the middle of them. It is routed through a return
 *    lane below the diagram here, where the label has the lane to itself.
 * 2. An edge *inside* one column collapsed to a vertical line whose midpoint
 *    sat inside one of the two boxes it joins, because the end anchor is inset
 *    to leave room for the arrowhead. Labels are centred on the free part of
 *    the curve instead.
 * 3. Two labels in neighbouring gaps, or one label longer than its gap, simply
 *    overlapped. Placement is now a search: slide the label along its own curve
 *    first, then off it, and take the first position that clears the node boxes
 *    and the labels already placed.
 *
 * A label that no candidate position can clear is marked `crowded` rather than
 * drawn into the pile: the renderer keeps it for hover, focus and selection,
 * where it is the only label on screen.
 */
import type { NodeLinkContent, Point } from '../core/types.ts'
import { edgeLabelBox, type EdgeLabelBox } from './edge-labels.ts'
import { boxAnchor, type GraphLayout, type GraphNodeBox } from './graph-layout.ts'

export interface EdgeLabelPlacement extends EdgeLabelBox {
  /** Centre of the chip. */
  x: number
  y: number
  /** No position cleared everything, so the label is hover-only. */
  crowded: boolean
}

export interface EdgeRoute {
  path: string
  end: Point
  label?: EdgeLabelPlacement
}

interface Curve { p0: Point; p1: Point; p2: Point; p3: Point }
interface Rect { x1: number; y1: number; x2: number; y2: number }

/** Positions along the curve to try, nearest the middle first. */
const SLIDE = [0.5, 0.42, 0.58, 0.34, 0.66]
/** Then the same positions lifted off the curve, alternating sides. */
const LIFT = [0, -16, 16, -30, 30]
const NODE_CLEARANCE = 5
const LABEL_CLEARANCE = 4
/** Distance the arrowhead needs between the curve's end and the target box. */
const ARROW_INSET = 6

const fixed = (value: number): string => value.toFixed(1)

function pointOnCurve({ p0, p1, p2, p3 }: Curve, t: number): Point {
  const u = 1 - t
  const a = u * u * u
  const b = 3 * u * u * t
  const c = 3 * u * t * t
  const d = t * t * t
  return {
    x: a * p0.x + b * p1.x + c * p2.x + d * p3.x,
    y: a * p0.y + b * p1.y + c * p2.y + d * p3.y,
  }
}

/** Unit normal of the curve at `t`, used to lift a label clear of its own line. */
function normalOnCurve({ p0, p1, p2, p3 }: Curve, t: number): Point {
  const u = 1 - t
  const x = 3 * u * u * (p1.x - p0.x) + 6 * u * t * (p2.x - p1.x) + 3 * t * t * (p3.x - p2.x)
  const y = 3 * u * u * (p1.y - p0.y) + 6 * u * t * (p2.y - p1.y) + 3 * t * t * (p3.y - p2.y)
  const length = Math.hypot(x, y)
  if (length === 0) return { x: 0, y: -1 }
  return { x: -y / length, y: x / length }
}

function curvePath(curve: Curve): string {
  const { p0, p1, p2, p3 } = curve
  return `M${fixed(p0.x)},${fixed(p0.y)} C${fixed(p1.x)},${fixed(p1.y)} ${fixed(p2.x)},${fixed(p2.y)} ${fixed(p3.x)},${fixed(p3.y)}`
}

/**
 * Control coordinate whose curve reaches `lane` at its midpoint.
 *
 * A cubic with both controls at L passes through `(a + b) / 8 + 0.75 · L`, so
 * putting the controls on the lane would leave the arc well short of it.
 */
function laneControl(a: number, b: number, lane: number): number {
  return (lane - (a + b) / 8) / 0.75
}

function feedbackCurve(from: GraphNodeBox, to: GraphNodeBox, lane: number, vertical: boolean): Curve {
  if (vertical) {
    const p0 = { x: from.x + from.width / 2, y: from.y }
    const p3 = { x: to.x + to.width / 2 + ARROW_INSET, y: to.y }
    const control = laneControl(p0.x, p3.x, lane)
    return { p0, p1: { x: control, y: p0.y }, p2: { x: control, y: p3.y }, p3 }
  }
  const p0 = { x: from.x, y: from.y + from.height / 2 }
  const p3 = { x: to.x, y: to.y + to.height / 2 + ARROW_INSET }
  const control = laneControl(p0.y, p3.y, lane)
  return { p0, p1: { x: p0.x, y: control }, p2: { x: p3.x, y: control }, p3 }
}

function flowCurve(from: GraphNodeBox, to: GraphNodeBox, orientation: GraphLayout['orientation']): Curve {
  const p0 = boxAnchor(from, { x: to.x, y: to.y }, 1)
  const p3 = boxAnchor(to, { x: from.x, y: from.y }, ARROW_INSET)
  if (orientation === 'horizontal') {
    const middle = (p0.x + p3.x) / 2
    return { p0, p1: { x: middle, y: p0.y }, p2: { x: middle, y: p3.y }, p3 }
  }
  if (orientation === 'vertical') {
    const middle = (p0.y + p3.y) / 2
    return { p0, p1: { x: p0.x, y: middle }, p2: { x: p3.x, y: middle }, p3 }
  }
  // Radial edges are straight: controls on the line keep the path a chord.
  return {
    p0,
    p1: { x: p0.x + (p3.x - p0.x) / 3, y: p0.y + (p3.y - p0.y) / 3 },
    p2: { x: p0.x + (p3.x - p0.x) * 2 / 3, y: p0.y + (p3.y - p0.y) * 2 / 3 },
    p3,
  }
}

const boxRect = (box: GraphNodeBox): Rect => ({
  x1: box.x - box.width / 2,
  y1: box.y - box.height / 2,
  x2: box.x + box.width / 2,
  y2: box.y + box.height / 2,
})

const chipRect = (center: Point, box: EdgeLabelBox): Rect => ({
  x1: center.x - box.width / 2,
  y1: center.y - box.height / 2,
  x2: center.x + box.width / 2,
  y2: center.y + box.height / 2,
})

function overlapArea(a: Rect, b: Rect, margin: number): number {
  const x = Math.min(a.x2 + margin, b.x2) - Math.max(a.x1 - margin, b.x1)
  const y = Math.min(a.y2 + margin, b.y2) - Math.max(a.y1 - margin, b.y1)
  return x <= 0 || y <= 0 ? 0 : x * y
}

/** How far a chip at this position sticks out of the canvas. */
function outsideCanvas(rect: Rect, layout: GraphLayout): number {
  return Math.max(0, -rect.x1)
    + Math.max(0, rect.x2 - layout.width)
    + Math.max(0, -rect.y1)
    + Math.max(0, rect.y2 - layout.height)
}

function placeLabel(
  curve: Curve,
  box: EdgeLabelBox,
  layout: GraphLayout,
  nodes: readonly Rect[],
  placed: readonly Rect[],
): EdgeLabelPlacement {
  let fallback: { point: Point; cost: number } | undefined
  for (const lift of LIFT) {
    for (const slide of SLIDE) {
      const base = pointOnCurve(curve, slide)
      const normal = lift === 0 ? { x: 0, y: 0 } : normalOnCurve(curve, slide)
      const point = { x: base.x + normal.x * lift, y: base.y + normal.y * lift }
      const rect = chipRect(point, box)
      let cost = outsideCanvas(rect, layout) * 4
      for (const node of nodes) cost += overlapArea(rect, node, NODE_CLEARANCE)
      for (const other of placed) cost += overlapArea(rect, other, LABEL_CLEARANCE)
      if (cost === 0) return { ...box, x: point.x, y: point.y, crowded: false }
      // Prefer the least-bad position, so a crowded label still appears
      // somewhere sensible when hovering reveals it.
      if (fallback === undefined || cost < fallback.cost) fallback = { point, cost }
    }
  }
  const point = fallback?.point ?? pointOnCurve(curve, 0.5)
  return { ...box, x: point.x, y: point.y, crowded: true }
}

/**
 * Route every edge and place every label, in one pass so that each label knows
 * about the ones already placed.
 */
export function edgeRoutes(content: NodeLinkContent, layout: GraphLayout): Map<string, EdgeRoute> {
  const routes = new Map<string, EdgeRoute>()
  const nodes = [...layout.nodes.values()].map(boxRect)
  const placed: Rect[] = []
  const vertical = layout.orientation === 'vertical'
  for (const edge of content.edges) {
    const from = layout.nodes.get(edge.from)
    const to = layout.nodes.get(edge.to)
    if (from === undefined || to === undefined) continue
    const lane = layout.feedbackLanes.get(edge.id)
    const curve = lane === undefined
      ? flowCurve(from, to, layout.orientation)
      : feedbackCurve(from, to, lane, vertical)
    const route: EdgeRoute = { path: curvePath(curve), end: curve.p3 }
    if (edge.label !== undefined) {
      const label = placeLabel(curve, edgeLabelBox(edge.label), layout, nodes, placed)
      route.label = label
      // A crowded label is hover-only, so it reserves nothing from the labels
      // placed after it.
      if (!label.crowded) placed.push(chipRect({ x: label.x, y: label.y }, label))
    }
    routes.set(edge.id, route)
  }
  return routes
}
