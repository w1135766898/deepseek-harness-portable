// @vitest-environment jsdom
/**
 * Structural tests prove content reached the DOM. They cannot prove a learner
 * can see it — the decision tree that prompted this suite rendered every node,
 * every edge and every layer heading, and still showed almost nothing, because
 * a 0.2 group opacity multiplied with a 0.48 stroke opacity and a 10px tertiary
 * label.
 *
 * These tests assert the properties that failure violated: the emphasis model
 * never draws meaning below a legible strength, a small graph gets a canvas
 * proportional to its content, node boxes fit their labels, and the token layer
 * survives a Host that declares only part of its alias set.
 */
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { LearningVisualV4 } from '../src/client/visuals/index.tsx'
import {
  CONTEXT_STATES,
  MINIMUM_LEGIBLE_STRENGTH,
  VISUAL_STATE_STRENGTH,
  stateStrength,
  visualFocus,
  type VisualState,
} from '../src/client/visuals/state/visual-state.ts'
import { graphEmphasis } from '../src/client/visuals/state/graph-state.ts'
import { graphLayout, nodeBox } from '../src/client/visuals/layout/graph-layout.ts'
import { measureText, wrapLabel } from '../src/client/visuals/layout/text-metrics.ts'
import { parseLearningVisualV4, type LearningVisualV4 as VisualDefinition } from '../src/protocol.ts'
import { DECISION_TREE_VISUAL, VISUAL_VARIANT_CORPUS } from './visual-corpus.ts'
import { visualV4Catalog } from './fixtures.ts'

afterEach(cleanup)

const clientRoot = resolve(import.meta.dirname, '../src/client')
/** Stylesheet source with comments removed: prose about a past defect must not
 *  itself trip the guards that exist to prevent it. */
const readCss = (path: string): string => (
  readFileSync(join(clientRoot, path), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
)
const VISUAL_STYLESHEETS = [
  'visuals/styles/shell.module.css',
  'visuals/styles/graph.module.css',
  'visuals/styles/plot.module.css',
  'visuals/styles/relation.module.css',
  'visuals/styles/timeline.module.css',
  'visuals/styles/formula.module.css',
  'visuals/styles/study.module.css',
  'visuals/styles/recall.module.css',
] as const

const DECISION_TREE = DECISION_TREE_VISUAL as unknown as VisualDefinition

describe('the emphasis model keeps every meaning-carrying state legible', () => {
  it('never draws a state that still carries meaning below the legible floor', () => {
    for (const state of CONTEXT_STATES) {
      expect(stateStrength(state), `${state} is drawn too weakly to read`)
        .toBeGreaterThanOrEqual(MINIMUM_LEGIBLE_STRENGTH)
    }
    // Only genuinely non-operable content may drop below it.
    expect(VISUAL_STATE_STRENGTH.disabled).toBeLessThan(MINIMUM_LEGIBLE_STRENGTH)
  })

  it('raises the current element without flattening the rest of the figure', () => {
    expect(VISUAL_STATE_STRENGTH.current).toBe(1)
    expect(VISUAL_STATE_STRENGTH.overview).toBe(1)
    // The gap between "this step" and "the rest" must be visible but not a cliff.
    const gap = VISUAL_STATE_STRENGTH.current - VISUAL_STATE_STRENGTH.context
    expect(gap).toBeGreaterThan(0.2)
    expect(gap).toBeLessThan(0.5)
  })
})

describe('a decision tree stays readable on its first frame', () => {
  const content = DECISION_TREE.content as Extract<VisualDefinition['content'], { kind: 'node_link' }>
  const frames = DECISION_TREE.sequence?.frames ?? []

  it('is accepted by the closed schema', () => {
    expect(() => parseLearningVisualV4(DECISION_TREE)).not.toThrow()
  })

  it.each(frames.map((frame, index) => [frame.label, index] as const))(
    'keeps every node and edge legible during "%s"',
    (_label, index) => {
      const frame = frames[index]
      const visited = frames.slice(0, index).flatMap(item => item.focusIds)
      const emphasis = graphEmphasis(content, visualFocus(frame?.focusIds ?? [], visited))
      for (const item of [...content.nodes, ...content.edges]) {
        const state = emphasis.state(item.id)
        expect(stateStrength(state), `${item.id} is drawn at ${String(stateStrength(state))} during frame ${String(index + 1)}`)
          .toBeGreaterThanOrEqual(MINIMUM_LEGIBLE_STRENGTH)
      }
    },
  )

  it('shows the branch a frame is about, not one isolated node', () => {
    const emphasis = graphEmphasis(content, visualFocus(['weather']))
    expect(emphasis.state('weather')).toBe('current')
    // The choices leaving the root, and where each one leads, are the point of
    // the question the frame is asking.
    expect(emphasis.state('sunny')).toBe('related')
    expect(emphasis.state('rainy')).toBe('related')
    expect(emphasis.state('temperature')).toBe('related')
    expect(emphasis.state('read')).toBe('related')
  })

  it('keeps the path back to the root visible when a leaf is the subject', () => {
    const emphasis = graphEmphasis(content, visualFocus(['hot', 'swim'], ['weather', 'sunny', 'temperature']))
    expect(emphasis.state('swim')).toBe('current')
    // Ancestors and the edges that reach them: without these the highlighted
    // leaf is a floating word.
    expect(emphasis.state('temperature')).toBe('related')
    expect(emphasis.state('sunny')).toBe('related')
    expect(emphasis.state('weather')).toBe('related')
  })

  it('never emits a de-emphasised state into the DOM below the floor', () => {
    const { container } = render(<LearningVisualV4 visual={parseLearningVisualV4(DECISION_TREE)} />)
    const marks = [...container.querySelectorAll<HTMLElement>('[data-visual-id][data-visual-state]')]
    expect(marks.length).toBeGreaterThanOrEqual(content.nodes.length + content.edges.length)
    for (const mark of marks) {
      const state = mark.getAttribute('data-visual-state') as VisualState
      expect(stateStrength(state), `${mark.getAttribute('data-visual-id') ?? '?'} rendered as ${state}`)
        .toBeGreaterThanOrEqual(MINIMUM_LEGIBLE_STRENGTH)
    }
  })
})

describe('graph geometry follows the content instead of a fixed canvas', () => {
  const content = DECISION_TREE.content as Extract<VisualDefinition['content'], { kind: 'node_link' }>

  it('gives a five-node tree a canvas proportional to what it draws', () => {
    const layout = graphLayout(content, 720)
    const boxes = [...layout.nodes.values()]
    const left = Math.min(...boxes.map(box => box.x - box.width / 2))
    const right = Math.max(...boxes.map(box => box.x + box.width / 2))
    const top = Math.min(...boxes.map(box => box.y - box.height / 2))
    const bottom = Math.max(...boxes.map(box => box.y + box.height / 2))

    // The old fixed 560×390 frame put five small circles in the middle of a
    // large empty rectangle. The drawn content must now reach the edges of the
    // canvas it asks for, in both directions.
    expect((right - left) / layout.width).toBeGreaterThan(0.9)
    expect((bottom - top) / layout.height).toBeGreaterThan(0.6)
    // Three layers of single-line boxes do not need a 390px-tall frame.
    expect(layout.height).toBeLessThanOrEqual(240)
  })

  it('uses the width it is given rather than overflowing or floating in it', () => {
    // A compact tree is centred rather than stretched edge to edge on a very
    // wide surface — stretching it would only lengthen the edges — but it must
    // still occupy the majority of the column instead of sitting in one corner.
    for (const containerWidth of [360, 520, 720, 980]) {
      const layout = graphLayout(content, containerWidth)
      expect(layout.renderWidth, `overflowed at ${String(containerWidth)}px`).toBeLessThanOrEqual(containerWidth + 1)
      expect(layout.renderWidth, `left dead space at ${String(containerWidth)}px`)
        .toBeGreaterThan(containerWidth * 0.5)
      // Fitting must never shrink the labels out of readability.
      expect(layout.scale).toBeGreaterThanOrEqual(0.82)
    }
  })

  it('sizes a node box around its label, including Chinese text', () => {
    for (const node of content.nodes) {
      const box = nodeBox(node)
      expect(box.width, `${node.label} does not fit its box`)
        .toBeGreaterThanOrEqual(measureText(node.label, 13) + 24)
      expect(box.lines.join('')).toBe(node.label)
    }
  })

  it('wraps a long label instead of overflowing or clipping it', () => {
    const wrapped = wrapLabel('周末天气晴朗且温度较高时的推荐活动', { fontSize: 13, maxWidth: 124 })
    expect(wrapped.lines.length).toBeGreaterThan(1)
    for (const line of wrapped.lines) expect(measureText(line, 13)).toBeLessThanOrEqual(124 + 13)
    const box = nodeBox({ id: 'long', label: '周末天气晴朗且温度较高时的推荐活动' } as never)
    expect(box.height).toBeGreaterThan(36)
  })

  it('scrolls a large graph rather than shrinking its text past reading size', () => {
    const columns = 6
    const perColumn = 5
    const wide = {
      kind: 'node_link',
      layout: 'layered',
      groups: Array.from({ length: columns }, (_, index) => ({ id: `g${String(index)}`, label: `阶段 ${String(index + 1)}` })),
      nodes: Array.from({ length: columns * perColumn }, (_, index) => ({
        id: `n${String(index)}`,
        label: `处理节点 ${String(index)}`,
        group: `g${String(Math.floor(index / perColumn))}`,
      })),
      edges: Array.from({ length: (columns - 1) * perColumn }, (_, index) => ({
        id: `e${String(index)}`,
        from: `n${String(index)}`,
        to: `n${String(index + perColumn)}`,
      })),
    } as unknown as typeof content
    const layout = graphLayout(wide, 640)
    // Fit-to-width stops at the readability floor and the viewport scrolls the
    // rest, rather than shrinking 13px labels into illegibility.
    expect(layout.scale).toBe(0.82)
    expect(layout.width).toBeGreaterThan(640)
    expect(layout.showHeaders).toBe(true)
  })
})

describe('every rendered visual keeps its emphasis above the floor', () => {
  const entries = Object.entries({ ...VISUAL_VARIANT_CORPUS, ...visualV4Catalog })

  it.each(entries)('%s draws no mark below the legible floor', (name, source) => {
    const { container } = render(<LearningVisualV4 visual={parseLearningVisualV4(source)} />)
    const marks = [...container.querySelectorAll<HTMLElement>('[data-visual-state]')]
    for (const mark of marks) {
      const state = mark.getAttribute('data-visual-state') as VisualState
      expect(VISUAL_STATE_STRENGTH[state], `${name} rendered an unknown state ${state}`).toBeDefined()
      expect(stateStrength(state), `${name} drew ${mark.getAttribute('data-visual-id') ?? '?'} as ${state}`)
        .toBeGreaterThanOrEqual(MINIMUM_LEGIBLE_STRENGTH)
    }
  })
})

describe('the token layer survives a partial Host theme', () => {
  const tokens = readCss('tokens.module.css')

  it('never reads a Host alias without a fallback inside color-mix()', () => {
    // A bare var(--dsw-alias-x) the Host has not declared is the
    // guaranteed-invalid value, which invalidates the whole color-mix() and
    // silently drops every property that reads the resulting token.
    for (const mix of tokens.match(/color-mix\([^;]*?\)/gs) ?? []) {
      const bareAliases = mix.match(/var\(\s*--dsw-[a-z0-9-]+\s*\)/g) ?? []
      expect(bareAliases, `color-mix without an alias fallback: ${mix}`).toEqual([])
    }
  })

  it('gives every Host alias a fallback wherever it is read', () => {
    for (const read of tokens.match(/var\(\s*--dsw-[a-z0-9-]+[^)]*\)/g) ?? []) {
      expect(read, `Host alias read without a fallback: ${read}`).toMatch(/,/)
    }
  })

  it('declares the emphasis strengths the renderers assert against', () => {
    for (const [state, strength] of Object.entries(VISUAL_STATE_STRENGTH)) {
      if (state === 'overview' || state === 'current' || state === 'selected') continue
      expect(tokens, `tokens do not declare a strength for ${state}`)
        .toMatch(new RegExp(`\\[data-visual-state="${state}"\\][^}]*--lx-vs-alpha:\\s*${String(strength)}`))
    }
  })
})

describe('the stylesheets cannot reintroduce the failure modes', () => {
  it('keeps every type step at or above the 11px reading floor', () => {
    const tokens = readCss('tokens.module.css')
    for (const [declaration, size] of [...tokens.matchAll(/--lx-text-[a-z0-9]+:\s*(\d+)px/g)]
      .map(match => [match[0], Number(match[1])] as const)) {
      expect(size, `${declaration} is below the reading floor`).toBeGreaterThanOrEqual(11)
    }
  })

  it('never fades a mark with both a group opacity and its own stroke opacity', () => {
    const graph = readCss('visuals/styles/graph.module.css')
    // The compounding that erased the unfocused branches: the group carried
    // `opacity` while the shape inside carried its own `stroke-opacity`.
    expect(graph).not.toMatch(/\.(edgeGroup|nodeGroup)\s*\{[^}]*\bopacity:/s)
    expect(graph).toMatch(/stroke-opacity:\s*var\(--lx-vs-alpha\)/)
    expect(graph).not.toMatch(/stroke-opacity:\s*0\.[0-4]/)
  })

  it('never styles a hover state as if it were disabled', () => {
    for (const path of ['tokens.module.css', ...VISUAL_STYLESHEETS]) {
      const source = readCss(path)
      for (const rule of source.split('}')) {
        if (!rule.includes(':hover')) continue
        expect(rule, `${path} dims a hover state`).not.toMatch(/--lx-control-disabled-opacity/)
        expect(rule, `${path} makes a hover state uninteractive`).not.toMatch(/cursor:\s*default/)
      }
    }
  })

  it('never dims a de-emphasised element below the floor with a literal opacity', () => {
    for (const path of VISUAL_STYLESHEETS) {
      const source = readCss(path)
      for (const [declaration, value] of [...source.matchAll(/opacity:\s*(0?\.\d+)/g)]
        .map(match => [match[0], Number(match[1])] as const)) {
        // Hidden-by-design marks (a dense graph's edge labels) use 0.
        if (value === 0) continue
        expect(value, `${path} declares ${declaration}`).toBeGreaterThanOrEqual(0.5)
      }
    }
  })
})
