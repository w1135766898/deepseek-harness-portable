/**
 * node_link layout.
 *
 * The former layout was fixed: a 560×390 minimum canvas, 29px circles and 10px
 * labels whatever the graph contained. A five-node decision tree therefore
 * occupied a near-empty 560×390 frame while a four-character Chinese label
 * filled its circle edge to edge.
 *
 * Geometry is derived from the content here instead — measured labels size the
 * boxes, the boxes size the columns, and the columns size the canvas — so a
 * small tree is compact and a large graph stays readable by scrolling or by a
 * bounded fit-to-width rather than by shrinking its text.
 *
 * The canvas also has to hold what runs *between* the columns. A column gap is
 * opened to fit the widest edge label crossing it, a sibling gap to fit the
 * labels of the edges inside a column, and an edge that runs backwards — the
 * feedback arrow of a loop — is given a lane below the diagram instead of being
 * drawn straight back across it.
 */
import type { NodeLinkContent, Point } from '../core/types.ts'
import { edgeLabelBox } from './edge-labels.ts'
import { wrapLabel } from './text-metrics.ts'

type GraphNode = NodeLinkContent['nodes'][number]

export const NODE_FONT_SIZE = 13
export const LAYER_HEADER_FONT_SIZE = 12

const NODE_MAX_TEXT_WIDTH = 124
const NODE_PADDING_X = 15
const NODE_PADDING_Y = 10
const NODE_MIN_WIDTH = 66
const NODE_MIN_HEIGHT = 36
const NODE_LINE_HEIGHT = 17
const CANVAS_PADDING = 14
const HEADER_HEIGHT = 28
const SIBLING_GAP = 22
const MAIN_GAP_MIN = 58
const MAIN_GAP_BASE = 78
const MAIN_GAP_MAX = 196
/** Space kept between a label chip and whatever the gap holding it separates. */
const LABEL_CLEARANCE = 11
/** Distance from the content to the first return lane, and between lanes. */
const LANE_GAP = 34
const LANE_STEP = 30
/** Text below this scale stops being comfortably readable, so we scroll instead. */
const MINIMUM_FIT_SCALE = 0.82

export interface GraphNodeBox {
  id: string
  /** Centre of the box. */
  x: number
  y: number
  width: number
  height: number
  cornerRadius: number
  lines: string[]
  truncated: boolean
}

export interface GraphLayerBand {
  id: string
  label?: string
  nodes: readonly GraphNode[]
  /** Anchor for the layer heading. */
  headerX: number
  headerY: number
  headerAnchor: 'middle' | 'start'
  band: { x: number; y: number; width: number; height: number }
}

export interface GraphLayout {
  /** Intrinsic canvas size, before any fit-to-width scale. */
  width: number
  height: number
  /** Rendered size: `width * scale`, never below the legible floor. */
  renderWidth: number
  renderHeight: number
  scale: number
  nodes: Map<string, GraphNodeBox>
  layers: GraphLayerBand[]
  orientation: 'horizontal' | 'vertical' | 'radial'
  showHeaders: boolean
  /** Which band each node sits in, so an edge knows whether it runs forward. */
  layerIndex: Map<string, number>
  /**
   * Cross-axis centreline of the return lane for each backwards edge: below the
   * diagram when it flows left to right, beside it when it flows top to bottom.
   */
  feedbackLanes: Map<string, number>
}

/** Group nodes into the bands the layout draws: declared groups, else levels. */
export function graphLayers(content: NodeLinkContent): Array<{ id: string; label?: string; nodes: GraphNode[] }> {
  if (content.groups !== undefined && content.groups.length > 0) {
    const grouped: Array<{ id: string; label?: string; nodes: GraphNode[] }> = content.groups.map(group => ({
      id: group.id,
      label: group.label,
      nodes: content.nodes.filter(node => node.group === group.id),
    })).filter(layer => layer.nodes.length > 0)
    const knownGroups = new Set(content.groups.map(group => group.id))
    const ungrouped = content.nodes.filter(node => node.group === undefined || !knownGroups.has(node.group))
    if (ungrouped.length > 0) grouped.push({ id: 'ungrouped', label: undefined, nodes: ungrouped })
    return grouped
  }

  const incoming = new Map(content.nodes.map(node => [node.id, 0]))
  const outgoing = new Map(content.nodes.map(node => [node.id, [] as string[]]))
  const parents = new Map(content.nodes.map(node => [node.id, [] as string[]]))
  for (const edge of content.edges) {
    incoming.set(edge.to, (incoming.get(edge.to) ?? 0) + 1)
    outgoing.get(edge.from)?.push(edge.to)
    parents.get(edge.to)?.push(edge.from)
  }
  const levels = new Map(content.nodes.map(node => [node.id, 0]))
  const queue = content.nodes.filter(node => (incoming.get(node.id) ?? 0) === 0).map(node => node.id)
  const visited = new Set<string>()
  while (queue.length > 0) {
    const current = queue.shift()
    if (current === undefined) break
    visited.add(current)
    for (const target of outgoing.get(current) ?? []) {
      levels.set(target, Math.max(levels.get(target) ?? 0, (levels.get(current) ?? 0) + 1))
      incoming.set(target, (incoming.get(target) ?? 1) - 1)
      if (incoming.get(target) === 0) queue.push(target)
    }
  }
  // A cycle has no node of in-degree zero, so the topological pass never
  // reaches it. Dropping every unreached node into one row turned a three-state
  // cycle into three boxes side by side with an edge drawn straight through the
  // middle one. Each unreached component is walked from its first declared node
  // instead, so the chain reads in order and only the edge that closes the
  // cycle runs backwards — which the router draws as a return arc.
  for (const node of content.nodes) {
    if (visited.has(node.id)) continue
    const settled = (parents.get(node.id) ?? []).filter(parent => visited.has(parent))
    visited.add(node.id)
    levels.set(node.id, Math.max(0, ...settled.map(parent => (levels.get(parent) ?? 0) + 1)))
    const walk = [node.id]
    while (walk.length > 0) {
      const current = walk.shift()
      if (current === undefined) break
      for (const target of outgoing.get(current) ?? []) {
        if (visited.has(target)) continue
        visited.add(target)
        levels.set(target, (levels.get(current) ?? 0) + 1)
        walk.push(target)
      }
    }
  }
  const levelCount = Math.max(0, ...levels.values()) + 1
  return Array.from({ length: levelCount }, (_, index) => ({
    id: `layer-${String(index)}`,
    label: undefined as string | undefined,
    nodes: content.nodes.filter(node => levels.get(node.id) === index),
  })).filter(layer => layer.nodes.length > 0)
}

/** Size one node box around its wrapped label. */
export function nodeBox(node: GraphNode): Omit<GraphNodeBox, 'x' | 'y'> {
  const wrapped = wrapLabel(node.label, { fontSize: NODE_FONT_SIZE, maxWidth: NODE_MAX_TEXT_WIDTH })
  const width = Math.max(NODE_MIN_WIDTH, Math.round(wrapped.width + NODE_PADDING_X * 2))
  const height = Math.max(NODE_MIN_HEIGHT, wrapped.lines.length * NODE_LINE_HEIGHT + NODE_PADDING_Y * 2)
  return {
    id: node.id,
    width,
    height,
    // A single-line box reads as a capsule; a wrapped one as a rounded card.
    cornerRadius: wrapped.lines.length === 1 ? height / 2 : 12,
    lines: wrapped.lines,
    truncated: wrapped.truncated,
  }
}

function fitScale(width: number, containerWidth: number): number {
  if (containerWidth <= 0 || width <= containerWidth) return 1
  return Math.max(MINIMUM_FIT_SCALE, containerWidth / width)
}

function finish(
  layout: Omit<GraphLayout, 'renderWidth' | 'renderHeight' | 'scale'>,
  containerWidth: number,
): GraphLayout {
  const scale = fitScale(layout.width, containerWidth)
  return {
    ...layout,
    scale,
    renderWidth: Math.round(layout.width * scale),
    renderHeight: Math.round(layout.height * scale),
  }
}

function radialLayout(content: NodeLinkContent, containerWidth: number, boxes: Map<string, Omit<GraphNodeBox, 'x' | 'y'>>): GraphLayout {
  const sizes = [...boxes.values()]
  const widest = Math.max(...sizes.map(box => box.width))
  const tallest = Math.max(...sizes.map(box => box.height))
  const count = Math.max(1, content.nodes.length)
  // Enough circumference that neighbouring boxes never overlap.
  const radius = Math.max(96, (count * (widest + SIBLING_GAP)) / (2 * Math.PI))
  const width = Math.round(radius * 2 + widest + CANVAS_PADDING * 2)
  const height = Math.round(radius * 2 + tallest + CANVAS_PADDING * 2)
  const centerX = width / 2
  const centerY = height / 2
  const positioned = new Map<string, GraphNodeBox>()
  content.nodes.forEach((node, index) => {
    const angle = -Math.PI / 2 + (index / count) * Math.PI * 2
    const box = boxes.get(node.id)
    if (box === undefined) return
    positioned.set(node.id, {
      ...box,
      x: centerX + Math.cos(angle) * radius,
      y: centerY + Math.sin(angle) * radius,
    })
  })
  return finish({
    width,
    height,
    nodes: positioned,
    layers: [],
    orientation: 'radial',
    showHeaders: false,
    layerIndex: new Map(),
    feedbackLanes: new Map(),
  }, containerWidth)
}

interface GapPlan {
  /** Room each column gap needs for the labels that cross it. */
  mainGaps: number[]
  /** Room each layer needs between its own nodes. */
  siblingGaps: number[]
  /** Backwards edges, in the order their lanes are assigned. */
  feedback: string[]
  /** Cross-axis depth the return lanes add to the canvas. */
  laneSpace: number
}

/**
 * Reserve the space the edges need before the nodes are placed.
 *
 * Without this pass the gaps are constants and the labels are laid on top of
 * whatever those constants happened to leave over — which is how a five-edge
 * diagram ended up with every chip across a node box or another chip.
 */
function planGaps(
  content: NodeLinkContent,
  layerIndex: Map<string, number>,
  layerCount: number,
  vertical: boolean,
): GapPlan {
  const mainGaps = Array.from({ length: Math.max(0, layerCount - 1) }, () => 0)
  const siblingGaps = Array.from({ length: layerCount }, () => SIBLING_GAP)
  const feedback: string[] = []
  let laneLabel = 0
  for (const edge of content.edges) {
    const from = layerIndex.get(edge.from)
    const to = layerIndex.get(edge.to)
    if (from === undefined || to === undefined) continue
    const box = edge.label === undefined ? undefined : edgeLabelBox(edge.label)
    if (to < from) {
      feedback.push(edge.id)
      if (box !== undefined) laneLabel = Math.max(laneLabel, vertical ? box.width : box.height)
      continue
    }
    if (box === undefined) continue
    if (to === from) {
      // The label of an edge inside one column lives between two siblings.
      siblingGaps[from] = Math.max(siblingGaps[from] ?? SIBLING_GAP, (vertical ? box.width : box.height) + LABEL_CLEARANCE * 2)
      continue
    }
    // A label on an edge that spans several columns is placed in the first gap
    // it crosses; nothing else can reserve room for it.
    const gap = Math.min(from, mainGaps.length - 1)
    if (gap >= 0) mainGaps[gap] = Math.max(mainGaps[gap] ?? 0, (vertical ? box.height : box.width) + LABEL_CLEARANCE * 2)
  }
  const laneSpace = feedback.length === 0
    ? 0
    : LANE_GAP + (Math.min(feedback.length, 3) - 1) * LANE_STEP + laneLabel / 2 + 10
  return { mainGaps, siblingGaps, feedback, laneSpace }
}

export function graphLayout(content: NodeLinkContent, containerWidth: number): GraphLayout {
  const boxes = new Map(content.nodes.map(node => [node.id, nodeBox(node)]))
  if (content.layout === 'radial') return radialLayout(content, containerWidth, boxes)

  const layers = graphLayers(content)
  const showHeaders = layers.length > 1
    && content.groups !== undefined
    && content.groups.length > 0
  const headerSpace = showHeaders ? HEADER_HEIGHT : 0
  const vertical = content.layout === 'hierarchy'
  const positioned = new Map<string, GraphNodeBox>()
  const layerIndex = new Map<string, number>()
  layers.forEach((layer, index) => {
    for (const node of layer.nodes) layerIndex.set(node.id, index)
  })
  const plan = planGaps(content, layerIndex, layers.length, vertical)

  // The main axis runs across layers; the cross axis runs within one layer.
  const mainExtent = layers.map(layer => Math.max(
    ...layer.nodes.map(node => (vertical ? boxes.get(node.id)?.height : boxes.get(node.id)?.width) ?? 0),
  ))
  const crossExtent = layers.map((layer, index) => layer.nodes.reduce((total, node, position) => {
    const box = boxes.get(node.id)
    const size = (vertical ? box?.width : box?.height) ?? 0
    return total + size + (position === 0 ? 0 : plan.siblingGaps[index] ?? SIBLING_GAP)
  }, 0))
  const crossContent = Math.max(...crossExtent)
  const mainContent = mainExtent.reduce((total, size) => total + size, 0)
  const gapCount = Math.max(0, layers.length - 1)
  const verticalGap = Math.max(MAIN_GAP_MIN, Math.round(MAIN_GAP_BASE * 0.72))

  // One gap for the whole diagram: columns that drift apart by the length of
  // whichever label happens to cross them stop reading as a rhythm.
  let mainGap = Math.min(MAIN_GAP_MAX, Math.max(vertical ? verticalGap : MAIN_GAP_BASE, ...plan.mainGaps))
  const mainSpan = (gap: number): number => CANVAS_PADDING * 2 + mainContent + gapCount * gap
  let width = vertical ? CANVAS_PADDING * 2 + crossContent + plan.laneSpace : mainSpan(mainGap)
  if (!vertical && gapCount > 0 && width < containerWidth) {
    // Spread the columns into the space that exists rather than leaving a
    // narrow diagram floating inside a wide, empty frame.
    mainGap = Math.min(MAIN_GAP_MAX, mainGap + (containerWidth - width) / gapCount)
    width = mainSpan(mainGap)
  }
  if (vertical && width < containerWidth) width = Math.min(containerWidth, width + CANVAS_PADDING * 2)
  const height = vertical
    ? CANVAS_PADDING * 2 + headerSpace + mainContent + gapCount * mainGap
    : CANVAS_PADDING * 2 + headerSpace + crossContent + plan.laneSpace

  // Headings sit at the head of the cross axis, so they lengthen the canvas
  // across the flow, never along it. Adding them to the main cursor as well
  // pushed a left-to-right diagram 28px right, off the end of its own canvas.
  const mainStart = CANVAS_PADDING + (vertical ? headerSpace : 0)
  const crossStart = CANVAS_PADDING + (vertical ? 0 : headerSpace)
  const crossTrack = (vertical ? width : height) - crossStart - CANVAS_PADDING - plan.laneSpace

  const bands: GraphLayerBand[] = []
  let mainCursor = mainStart
  layers.forEach((layer, index) => {
    const mainSize = mainExtent[index] ?? 0
    const crossSize = crossExtent[index] ?? 0
    const siblingGap = plan.siblingGaps[index] ?? SIBLING_GAP
    let crossCursor = crossStart + Math.max(0, (crossTrack - crossSize) / 2)
    for (const node of layer.nodes) {
      const box = boxes.get(node.id)
      if (box === undefined) continue
      const crossOwn = vertical ? box.width : box.height
      positioned.set(node.id, {
        ...box,
        x: vertical ? crossCursor + crossOwn / 2 : mainCursor + mainSize / 2,
        y: vertical ? mainCursor + mainSize / 2 : crossCursor + crossOwn / 2,
      })
      crossCursor += crossOwn + siblingGap
    }
    bands.push({
      id: layer.id,
      label: layer.label,
      nodes: layer.nodes,
      headerX: vertical ? CANVAS_PADDING : mainCursor + mainSize / 2,
      headerY: vertical ? mainCursor - 12 : CANVAS_PADDING + 13,
      headerAnchor: vertical ? 'start' : 'middle',
      band: vertical
        ? { x: CANVAS_PADDING / 2, y: mainCursor - 9, width: Math.max(0, width - CANVAS_PADDING), height: mainSize + 18 }
        : { x: mainCursor - 11, y: crossStart - 9, width: mainSize + 22, height: Math.max(0, crossTrack + 18) },
    })
    mainCursor += mainSize + mainGap
  })

  const contentEnd = crossStart + crossTrack
  const feedbackLanes = new Map(plan.feedback.map((edgeId, index) => [
    edgeId,
    contentEnd + LANE_GAP + Math.min(index, 2) * LANE_STEP,
  ]))

  return finish({
    width: Math.round(width),
    height: Math.round(height),
    nodes: positioned,
    layers: bands,
    orientation: vertical ? 'vertical' : 'horizontal',
    showHeaders,
    layerIndex,
    feedbackLanes,
  }, containerWidth)
}

/** Where a straight line towards `towards` leaves the border of `box`. */
export function boxAnchor(box: GraphNodeBox, towards: Point, inset = 0): Point {
  const dx = towards.x - box.x
  const dy = towards.y - box.y
  if (dx === 0 && dy === 0) return { x: box.x, y: box.y }
  const halfWidth = box.width / 2 + inset
  const halfHeight = box.height / 2 + inset
  const scale = Math.min(
    dx === 0 ? Number.POSITIVE_INFINITY : halfWidth / Math.abs(dx),
    dy === 0 ? Number.POSITIVE_INFINITY : halfHeight / Math.abs(dy),
  )
  return { x: box.x + dx * scale, y: box.y + dy * scale }
}
