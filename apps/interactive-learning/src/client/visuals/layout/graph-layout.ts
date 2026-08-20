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
 */
import type { NodeLinkContent, Point } from '../core/types.ts'
import { measureText, wrapLabel } from './text-metrics.ts'

type GraphNode = NodeLinkContent['nodes'][number]

export const NODE_FONT_SIZE = 13
export const EDGE_LABEL_FONT_SIZE = 12
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
const MAIN_GAP_MAX = 180
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
  for (const edge of content.edges) {
    incoming.set(edge.to, (incoming.get(edge.to) ?? 0) + 1)
    outgoing.get(edge.from)?.push(edge.to)
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
  const fallbackLevel = Math.max(0, ...levels.values())
  for (const node of content.nodes) if (!visited.has(node.id)) levels.set(node.id, fallbackLevel)
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
  }, containerWidth)
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

  // The main axis runs across layers; the cross axis runs within one layer.
  const mainExtent = layers.map(layer => Math.max(
    ...layer.nodes.map(node => (vertical ? boxes.get(node.id)?.height : boxes.get(node.id)?.width) ?? 0),
  ))
  const crossExtent = layers.map(layer => layer.nodes.reduce((total, node, index) => {
    const box = boxes.get(node.id)
    const size = (vertical ? box?.width : box?.height) ?? 0
    return total + size + (index === 0 ? 0 : SIBLING_GAP)
  }, 0))
  const crossContent = Math.max(...crossExtent)
  const mainContent = mainExtent.reduce((total, size) => total + size, 0)
  const gapCount = Math.max(0, layers.length - 1)
  const verticalGap = Math.max(MAIN_GAP_MIN, Math.round(MAIN_GAP_BASE * 0.72))

  let mainGap = vertical ? verticalGap : MAIN_GAP_BASE
  let width = vertical
    ? CANVAS_PADDING * 2 + crossContent
    : CANVAS_PADDING * 2 + mainContent + gapCount * mainGap
  if (!vertical && gapCount > 0 && width < containerWidth) {
    // Spread the columns into the space that exists rather than leaving a
    // narrow diagram floating inside a wide, empty frame.
    mainGap = Math.min(MAIN_GAP_MAX, mainGap + (containerWidth - width) / gapCount)
    width = CANVAS_PADDING * 2 + mainContent + gapCount * mainGap
  }
  if (vertical && width < containerWidth) width = Math.min(containerWidth, width + CANVAS_PADDING * 2)
  const height = vertical
    ? CANVAS_PADDING * 2 + headerSpace + mainContent + gapCount * mainGap
    : CANVAS_PADDING * 2 + headerSpace + crossContent

  const bands: GraphLayerBand[] = []
  let mainCursor = CANVAS_PADDING + headerSpace
  layers.forEach((layer, layerIndex) => {
    const mainSize = mainExtent[layerIndex] ?? 0
    const crossSize = crossExtent[layerIndex] ?? 0
    const crossTrack = vertical ? width : height - headerSpace
    const crossOrigin = vertical ? 0 : CANVAS_PADDING + headerSpace
    let crossCursor = crossOrigin + Math.max(CANVAS_PADDING - crossOrigin, (crossTrack - crossSize) / 2)
    for (const node of layer.nodes) {
      const box = boxes.get(node.id)
      if (box === undefined) continue
      const crossOwn = vertical ? box.width : box.height
      positioned.set(node.id, {
        ...box,
        x: vertical ? crossCursor + crossOwn / 2 : mainCursor + mainSize / 2,
        y: vertical ? mainCursor + mainSize / 2 : crossCursor + crossOwn / 2,
      })
      crossCursor += crossOwn + SIBLING_GAP
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
        : { x: mainCursor - 11, y: CANVAS_PADDING + headerSpace - 9, width: mainSize + 22, height: Math.max(0, height - CANVAS_PADDING * 2 - headerSpace + 18) },
    })
    mainCursor += mainSize + mainGap
  })

  return finish({
    width: Math.round(width),
    height: Math.round(height),
    nodes: positioned,
    layers: bands,
    orientation: vertical ? 'vertical' : 'horizontal',
    showHeaders,
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

export interface EdgeGeometry {
  path: string
  label: Point
  end: Point
}

/** Route one edge between two boxes, curving along the layout's main axis. */
export function edgeGeometry(
  from: GraphNodeBox,
  to: GraphNodeBox,
  orientation: GraphLayout['orientation'],
): EdgeGeometry {
  const start = boxAnchor(from, { x: to.x, y: to.y }, 1)
  const end = boxAnchor(to, { x: from.x, y: from.y }, 6)
  const fixed = (value: number): string => value.toFixed(1)
  if (orientation === 'horizontal') {
    const middle = (start.x + end.x) / 2
    return {
      path: `M${fixed(start.x)},${fixed(start.y)} C${fixed(middle)},${fixed(start.y)} ${fixed(middle)},${fixed(end.y)} ${fixed(end.x)},${fixed(end.y)}`,
      label: { x: middle, y: (start.y + end.y) / 2 },
      end,
    }
  }
  if (orientation === 'vertical') {
    const middle = (start.y + end.y) / 2
    return {
      path: `M${fixed(start.x)},${fixed(start.y)} C${fixed(start.x)},${fixed(middle)} ${fixed(end.x)},${fixed(middle)} ${fixed(end.x)},${fixed(end.y)}`,
      label: { x: (start.x + end.x) / 2, y: middle },
      end,
    }
  }
  return {
    path: `M${fixed(start.x)},${fixed(start.y)} L${fixed(end.x)},${fixed(end.y)}`,
    label: { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 },
    end,
  }
}

/** Width of the chip drawn behind an edge label so it stays readable over a line. */
export function edgeLabelWidth(label: string): number {
  return Math.round(measureText(label, EDGE_LABEL_FONT_SIZE)) + 14
}
