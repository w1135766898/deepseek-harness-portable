/**
 * A node_link figure can be legible mark by mark and still be unreadable,
 * because legibility is a property of one element and crowding is a property of
 * the pairs.
 *
 * The generation loop in `visual-corpus.ts` is the payload that proved it: five
 * nodes, five labelled edges, every strength above the floor, and ten
 * collisions on screen — a chip across the node it pointed at, two chips across
 * each other, a feedback arrow drawn straight back through the middle of the
 * diagram with its label on top of a box, and the last column pushed off the
 * end of its own canvas by the space reserved for the column headings.
 *
 * These tests assert the pairwise properties that failure violated: boxes and
 * label chips that are drawn stay inside the canvas, off each other, and a
 * label that cannot be placed is withheld rather than piled on.
 */
import { describe, expect, it } from 'vitest'
import { graphLayout } from '../src/client/visuals/layout/graph-layout.ts'
import { edgeRoutes } from '../src/client/visuals/layout/graph-edges.ts'
import { edgeLabelBox } from '../src/client/visuals/layout/edge-labels.ts'
import { measureText, wrapLabel } from '../src/client/visuals/layout/text-metrics.ts'
import { parseLearningVisualV4, type LearningVisualV4 } from '../src/protocol.ts'
import { GENERATION_LOOP_VISUAL, VISUAL_VARIANT_CORPUS } from './visual-corpus.ts'
import { visualV4Catalog } from './fixtures.ts'

type NodeLink = Extract<LearningVisualV4['content'], { kind: 'node_link' }>

interface Rect { id: string; kind: string; x1: number; y1: number; x2: number; y2: number }

const CONTAINER_WIDTHS = [360, 520, 740, 980] as const

const graphs = Object.entries({ ...VISUAL_VARIANT_CORPUS, ...visualV4Catalog })
  .map(([name, source]) => [name, parseLearningVisualV4(source).content] as const)
  .filter((entry): entry is readonly [string, NodeLink] => entry[1].kind === 'node_link')

/** Boxes and the chips that are actually drawn, in one comparable list. */
function drawnRects(content: NodeLink, containerWidth: number): { rects: Rect[]; width: number; height: number } {
  const layout = graphLayout(content, containerWidth)
  const routes = edgeRoutes(content, layout)
  const rects: Rect[] = [...layout.nodes.values()].map(box => ({
    id: box.id,
    kind: 'node',
    x1: box.x - box.width / 2,
    y1: box.y - box.height / 2,
    x2: box.x + box.width / 2,
    y2: box.y + box.height / 2,
  }))
  for (const [id, route] of routes) {
    const label = route.label
    // A crowded label is hidden until it is hovered, focused or selected, when
    // it is the only label on screen; it is not part of the resting figure.
    if (label === undefined || label.crowded) continue
    rects.push({
      id,
      kind: 'label',
      x1: label.x - label.width / 2,
      y1: label.y - label.height / 2,
      x2: label.x + label.width / 2,
      y2: label.y + label.height / 2,
    })
  }
  return { rects, width: layout.width, height: layout.height }
}

const overlapArea = (a: Rect, b: Rect): number => (
  Math.max(0, Math.min(a.x2, b.x2) - Math.max(a.x1, b.x1))
  * Math.max(0, Math.min(a.y2, b.y2) - Math.max(a.y1, b.y1))
)

describe('every node_link payload draws its marks clear of each other', () => {
  it.each(graphs.flatMap(([name, content]) => CONTAINER_WIDTHS.map(width => [name, width, content] as const)))(
    '%s keeps boxes and visible labels apart at %ipx',
    (_name, _width, content) => {
      const { rects } = drawnRects(content, _width)
      for (let index = 0; index < rects.length; index += 1) {
        for (let other = index + 1; other < rects.length; other += 1) {
          const a = rects[index]
          const b = rects[other]
          if (a === undefined || b === undefined) continue
          expect(overlapArea(a, b), `${a.kind} ${a.id} overlaps ${b.kind} ${b.id}`).toBe(0)
        }
      }
    },
  )

  it.each(graphs.flatMap(([name, content]) => CONTAINER_WIDTHS.map(width => [name, width, content] as const)))(
    '%s draws nothing outside the canvas it asks for at %ipx',
    (_name, _width, content) => {
      const { rects, width, height } = drawnRects(content, _width)
      for (const rect of rects) {
        expect(rect.x1, `${rect.kind} ${rect.id} is off the left edge`).toBeGreaterThanOrEqual(-0.5)
        expect(rect.y1, `${rect.kind} ${rect.id} is off the top edge`).toBeGreaterThanOrEqual(-0.5)
        expect(rect.x2, `${rect.kind} ${rect.id} is off the right edge`).toBeLessThanOrEqual(width + 0.5)
        expect(rect.y2, `${rect.kind} ${rect.id} is off the bottom edge`).toBeLessThanOrEqual(height + 0.5)
      }
    },
  )

  it.each(graphs)('%s centres a left-to-right diagram in its own canvas', (_name, content) => {
    if (content.layout !== 'layered') return
    const { rects, width } = drawnRects(content, 740)
    const boxes = rects.filter(rect => rect.kind === 'node')
    const left = Math.min(...boxes.map(rect => rect.x1))
    const right = width - Math.max(...boxes.map(rect => rect.x2))
    // Reserving the heading strip on the main axis as well as the cross axis
    // shifted the whole diagram right by the height of a heading.
    expect(Math.abs(left - right), 'the columns are not centred between the canvas edges').toBeLessThanOrEqual(1)
  })
})

describe('the generation loop reads as a loop', () => {
  const content = parseLearningVisualV4(GENERATION_LOOP_VISUAL).content as NodeLink

  it('places all five labels rather than withholding any of them', () => {
    const routes = edgeRoutes(content, graphLayout(content, 740))
    for (const [id, route] of routes) {
      expect(route.label, `${id} lost its label`).toBeDefined()
      expect(route.label?.crowded, `${id} had nowhere to put its label`).toBe(false)
    }
  })

  it('sends the feedback arrow round the diagram instead of through it', () => {
    const layout = graphLayout(content, 740)
    const routes = edgeRoutes(content, layout)
    const lane = routes.get('loop')?.label
    const lowestBox = Math.max(...[...layout.nodes.values()].map(box => box.y + box.height / 2))
    expect(layout.feedbackLanes.has('loop'), 'the backwards edge was not given a return lane').toBe(true)
    expect(lane?.y ?? 0, 'the feedback label still sits among the boxes').toBeGreaterThan(lowestBox)
  })

  it('fits a conversation column without scrolling', () => {
    const layout = graphLayout(content, 740)
    expect(layout.renderWidth).toBeLessThanOrEqual(740)
    expect(layout.scale).toBeGreaterThanOrEqual(0.82)
  })
})

describe('a wrapped label is split evenly rather than filled to the limit', () => {
  it('balances a Chinese edge label over its lines', () => {
    const wrapped = wrapLabel('算出每个候选词的概率', { fontSize: 12, maxWidth: 118, maxLines: 2 })
    expect(wrapped.lines).toHaveLength(2)
    const [first, second] = wrapped.lines
    // “算出每个候选词的概” over “率” is what filling the first line produces.
    expect(Math.abs((first ?? '').length - (second ?? '').length)).toBeLessThanOrEqual(1)
    expect(wrapped.lines.join('')).toBe('算出每个候选词的概率')
  })

  it('keeps a balanced chip far narrower than the limit it was allowed', () => {
    const box = edgeLabelBox('算出每个候选词的概率')
    expect(box.width).toBeLessThan(measureText('算出每个候选词的概率', 12) * 0.7)
  })

  it('leaves a label that already fits on one line alone', () => {
    const wrapped = wrapLabel('喂入模型', { fontSize: 12, maxWidth: 118, maxLines: 2 })
    expect(wrapped.lines).toEqual(['喂入模型'])
  })
})
