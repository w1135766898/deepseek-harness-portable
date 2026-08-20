/**
 * A payload corpus spanning the whole declared visual@4 variant space.
 *
 * The catalog in `fixtures.ts` shows one representative per content kind. This
 * corpus instead walks the variants a model may legitimately choose — every
 * series type, every layout, every scene element, every relation variant, both
 * timeline orientations, and the optional blocks each kind allows — so that a
 * renderer that silently degrades one of them is caught rather than shipped.
 */
import { VISUAL_PROTOCOL_V4 } from '../src/protocol.ts'

type Content = Record<string, unknown>

function visual(title: string, content: Content, extra: Record<string, unknown> = {}) {
  return { protocol: VISUAL_PROTOCOL_V4, title, content, ...extra }
}

const axis = (label: string, min: number, max: number, samples?: number) => (
  samples === undefined ? { label, min, max } : { label, min, max, samples }
)

const linear = { op: 'variable', name: 'x' } as const

function points(count: number, scale = 1): Array<{ x: number; y: number }> {
  return Array.from({ length: count }, (_, index) => ({ x: index, y: index * scale }))
}

/** Every plot series type, alone and combined, with and without each optional block. */
const plots = {
  curveOnly: visual('Curve only', {
    kind: 'plot',
    xAxis: axis('x', -3, 3, 64),
    yAxis: axis('y', -3, 3),
    series: [{ type: 'curve', id: 'identity', label: 'y = x', expression: linear }],
  }),
  barsOnly: visual('Bars only', {
    kind: 'plot',
    xAxis: axis('bucket', 0, 5),
    yAxis: axis('count', 0, 10),
    series: [{ type: 'bars', id: 'counts', label: 'Counts', tone: 'green', points: points(6, 1.5) }],
  }),
  pointsOnly: visual('Scatter only', {
    kind: 'plot',
    xAxis: axis('x', 0, 6),
    yAxis: axis('y', 0, 6),
    series: [{ type: 'points', id: 'samples', label: 'Samples', tone: 'purple', points: points(6) }],
  }),
  lineOnly: visual('Line only', {
    kind: 'plot',
    xAxis: axis('t', 0, 5),
    yAxis: axis('v', 0, 10),
    series: [{ type: 'line', id: 'trend', label: 'Trend', stroke: 'dotted', points: points(6, 2) }],
  }),
  mixedSeries: visual('Every series type together', {
    kind: 'plot',
    parameters: [{ id: 'k', label: 'Slope k', min: 0.5, max: 3, step: 0.5, initial: 1.5 }],
    xAxis: axis('x', 0, 6, 48),
    yAxis: axis('y', 0, 12),
    series: [
      { type: 'curve', id: 'model', label: 'k · x', stroke: 'dashed', expression: { op: 'mul', left: { op: 'variable', name: 'k' }, right: linear } },
      { type: 'line', id: 'fit', label: 'Fit', points: points(5, 1.8) },
      { type: 'points', id: 'obs', label: 'Observed', points: points(5, 2.1) },
      { type: 'bars', id: 'residual', label: 'Residual', points: points(5, 0.4) },
    ],
    metrics: [{ id: 'slope', label: 'Slope', expression: { op: 'variable', name: 'k' }, digits: 2 }],
  }),
  negativeRange: visual('Axes that cross zero', {
    kind: 'plot',
    xAxis: axis('x', -4, 4, 40),
    yAxis: axis('y', -8, 8),
    series: [{ type: 'curve', id: 'cubic', label: 'x³', expression: { op: 'pow', left: linear, right: { op: 'constant', value: 3 } } }],
  }),
  singlePoint: visual('A one-point series', {
    kind: 'plot',
    xAxis: axis('x', 0, 2),
    yAxis: axis('y', 0, 2),
    series: [{ type: 'points', id: 'only', label: 'Only', points: [{ x: 1, y: 1 }] }],
  }),
  maximumParameters: visual('Three parameters and four metrics', {
    kind: 'plot',
    parameters: [
      { id: 'a', label: 'a', min: 0, max: 4, step: 0.5, initial: 1 },
      { id: 'b', label: 'b', min: 0, max: 4, step: 0.5, initial: 2 },
      { id: 'c', label: 'c', min: 0, max: 4, step: 0.5, initial: 3 },
    ],
    xAxis: axis('x', 0, 5, 32),
    yAxis: axis('y', 0, 40),
    series: [{
      type: 'curve',
      id: 'combined',
      label: 'a·x + b·c',
      expression: {
        op: 'add',
        left: { op: 'mul', left: { op: 'variable', name: 'a' }, right: linear },
        right: { op: 'mul', left: { op: 'variable', name: 'b' }, right: { op: 'variable', name: 'c' } },
      },
    }],
    metrics: [
      { id: 'm_a', label: 'a', expression: { op: 'variable', name: 'a' } },
      { id: 'm_b', label: 'b', expression: { op: 'variable', name: 'b' } },
      { id: 'm_c', label: 'c', expression: { op: 'variable', name: 'c' } },
      { id: 'm_sum', label: 'a + b', expression: { op: 'add', left: { op: 'variable', name: 'a' }, right: { op: 'variable', name: 'b' } } },
    ],
  }),
}

/**
 * The reported regression case: a small, ordinary decision tree whose first
 * sequence frame focuses only the root.
 *
 * The previous renderer drew this at a fixed 560×390 with 29px circles and
 * 10px labels, and faded everything the frame did not name to a tenth of full
 * strength — so the first frame showed one highlighted circle and almost
 * nothing else. It is exported because both the legibility suite and the
 * browser gallery need exactly this shape.
 */
export const DECISION_TREE_VISUAL = visual('一棵周末安排决策树', {
  kind: 'node_link',
  layout: 'layered',
  groups: [
    { id: 'root', label: '根节点' },
    { id: 'internal', label: '内部节点' },
    { id: 'leaf', label: '叶节点' },
  ],
  nodes: [
    { id: 'weather', label: '天气?', group: 'root', tone: 'blue', detail: '第一个判断条件。' },
    { id: 'temperature', label: '温度?', group: 'internal', tone: 'blue', detail: '晴天时继续判断温度。' },
    { id: 'swim', label: '去游泳', group: 'leaf', tone: 'green', detail: '晴且温度高时的结果。' },
    { id: 'hike', label: '去爬山', group: 'leaf', tone: 'green', detail: '晴但温度低时的结果。' },
    { id: 'read', label: '在家看书', group: 'leaf', tone: 'orange', detail: '下雨时不再判断温度。' },
  ],
  edges: [
    { id: 'sunny', from: 'weather', to: 'temperature', label: '晴', directed: true },
    { id: 'rainy', from: 'weather', to: 'read', label: '雨', directed: true },
    { id: 'hot', from: 'temperature', to: 'swim', label: '高', directed: true },
    { id: 'mild', from: 'temperature', to: 'hike', label: '低', directed: true },
  ],
}, {
  description: '从根节点出发，沿“晴 → 高”的路径走到叶节点“去游泳”。',
  sequence: {
    initialFrameId: 'start',
    frames: [
      { id: 'start', label: '从根开始', description: '先问第一个问题：天气？', focusIds: ['weather'] },
      { id: 'sunny', label: '天气是晴', description: '晴天时还要再判断温度。', focusIds: ['sunny', 'temperature'] },
      { id: 'hot', label: '温度高', description: '温度高就走到“去游泳”这个叶节点。', focusIds: ['hot', 'swim'] },
    ],
  },
  fallbackMarkdown: '天气? →(晴) 温度? →(高) 去游泳；温度? →(低) 去爬山；天气? →(雨) 在家看书。',
})

const graphNodes = [
  { id: 'a', label: 'A', group: 'left' },
  { id: 'b', label: 'B', group: 'left' },
  { id: 'c', label: 'C', group: 'right' },
  { id: 'd', label: 'D', group: 'right' },
]

/** Every declared layout, with and without groups, directed and cyclic. */
const graphs = {
  layeredGrouped: visual('Layered with groups', {
    kind: 'node_link',
    layout: 'layered',
    groups: [{ id: 'left', label: 'Inputs' }, { id: 'right', label: 'Outputs' }],
    nodes: graphNodes,
    edges: [
      { id: 'e1', from: 'a', to: 'c', directed: true, label: 'w1' },
      { id: 'e2', from: 'b', to: 'd', directed: true },
    ],
  }),
  hierarchyUngrouped: visual('Hierarchy without groups', {
    kind: 'node_link',
    layout: 'hierarchy',
    nodes: [
      { id: 'root', label: 'Root' },
      { id: 'left', label: 'Left' },
      { id: 'right', label: 'Right' },
    ],
    edges: [
      { id: 'r_l', from: 'root', to: 'left' },
      { id: 'r_r', from: 'root', to: 'right' },
    ],
  }),
  radial: visual('Radial layout', {
    kind: 'node_link',
    layout: 'radial',
    nodes: [
      { id: 'hub', label: 'Hub', tone: 'orange' },
      { id: 's1', label: 'S1' },
      { id: 's2', label: 'S2' },
      { id: 's3', label: 'S3' },
    ],
    edges: [
      { id: 'h1', from: 'hub', to: 's1' },
      { id: 'h2', from: 'hub', to: 's2' },
      { id: 'h3', from: 'hub', to: 's3' },
    ],
  }),
  cyclic: visual('A cycle with no topological order', {
    kind: 'node_link',
    layout: 'hierarchy',
    nodes: [
      { id: 'p', label: 'P' },
      { id: 'q', label: 'Q' },
      { id: 'r', label: 'R' },
    ],
    edges: [
      { id: 'pq', from: 'p', to: 'q', directed: true },
      { id: 'qr', from: 'q', to: 'r', directed: true },
      { id: 'rp', from: 'r', to: 'p', directed: true },
    ],
  }),
  decisionTree: DECISION_TREE_VISUAL,
  denseEdges: visual('Dense edge labels', {
    kind: 'node_link',
    layout: 'layered',
    groups: [{ id: 'src', label: 'Source' }, { id: 'dst', label: 'Destination' }],
    nodes: Array.from({ length: 8 }, (_, index) => ({
      id: `n${String(index)}`,
      label: `N${String(index)}`,
      group: index < 4 ? 'src' : 'dst',
    })),
    edges: Array.from({ length: 14 }, (_, index) => ({
      id: `d${String(index)}`,
      from: `n${String(index % 4)}`,
      to: `n${String(4 + (index % 4))}`,
      label: `w${String(index)}`,
    })),
  }),
}

/** Every scene element type, and the grid toggle. */
const scenes = {
  everyElement: visual('Every scene element type', {
    kind: 'scene_2d',
    xAxis: axis('x', -2, 6),
    yAxis: axis('y', -2, 6),
    grid: true,
    elements: [
      { type: 'point', id: 'p1', label: 'P', x: 0, y: 0, size: 6 },
      { type: 'segment', id: 'seg', label: 'Segment', x1: 0, y1: 0, x2: 3, y2: 1 },
      { type: 'arrow', id: 'arr', label: 'Arrow', stroke: 'dashed', x1: 0, y1: 0, x2: 1, y2: 3 },
      { type: 'circle', id: 'circ', label: 'Circle', cx: 3, cy: 3, r: 1.2 },
      { type: 'rect', id: 'rect', label: 'Rect', x: 4, y: 0, width: 1.5, height: 2 },
      { type: 'polygon', id: 'poly', label: 'Polygon', points: [{ x: 1, y: 4 }, { x: 3, y: 5 }, { x: 2, y: 6 }] },
      { type: 'label', id: 'lbl', text: 'Anchor', x: 5, y: 5 },
    ],
  }),
  noGrid: visual('Scene without a grid', {
    kind: 'scene_2d',
    xAxis: axis('x', 0, 4),
    yAxis: axis('y', 0, 4),
    elements: [{ type: 'point', id: 'solo', label: 'Solo', x: 2, y: 2 }],
  }),
}

/** All three relation variants, including the sparse and unassigned edges. */
const relations = {
  comparison: visual('Comparison table', {
    kind: 'relation',
    variant: 'comparison',
    subjects: [
      { id: 'left', label: 'Left', tone: 'blue' },
      { id: 'right', label: 'Right', tone: 'orange' },
    ],
    rows: [
      { id: 'speed', label: 'Speed', cells: [{ subjectId: 'left', value: 'O(1)' }, { subjectId: 'right', value: 'O(n)' }] },
      { id: 'partial', label: 'Only one side', detail: 'The other side has no entry.', cells: [{ subjectId: 'left', value: 'Yes' }] },
    ],
  }),
  matrixSparse: visual('Sparse relation matrix', {
    kind: 'relation',
    variant: 'matrix',
    rows: [{ id: 'r1', label: 'Row 1' }, { id: 'r2', label: 'Row 2' }],
    columns: [{ id: 'c1', label: 'Col 1' }, { id: 'c2', label: 'Col 2' }],
    cells: [{ id: 'x11', rowId: 'r1', columnId: 'c1', label: 'Yes', tone: 'green' }],
  }),
  setsOverlapping: visual('Sets with overlap and an unassigned item', {
    kind: 'relation',
    variant: 'sets',
    sets: [
      { id: 's_a', label: 'Set A', tone: 'blue' },
      { id: 's_b', label: 'Set B', tone: 'orange' },
    ],
    items: [
      { id: 'only_a', label: 'Only A', setIds: ['s_a'] },
      { id: 'both', label: 'In both', setIds: ['s_a', 's_b'] },
      { id: 'only_b', label: 'Only B', setIds: ['s_b'] },
    ],
  }),
  setsMinimal: visual('The smallest legal sets relation', {
    kind: 'relation',
    variant: 'sets',
    sets: [{ id: 'first', label: 'First' }, { id: 'second', label: 'Second' }],
    items: [{ id: 'member', label: 'Member', setIds: ['first'] }],
  }),
}

/** Both orientations, with and without eras and explicit positions. */
const timelines = {
  horizontalWithEras: visual('Horizontal with eras', {
    kind: 'timeline',
    orientation: 'horizontal',
    events: [
      { id: 't1', time: '1958', label: 'First' },
      { id: 't2', time: '1986', label: 'Second' },
      { id: 't3', time: '2012', label: 'Third' },
    ],
    eras: [{ id: 'era1', label: 'Early period', startEventId: 't1', endEventId: 't2', tone: 'blue' }],
  }),
  verticalWithEras: visual('Vertical with eras', {
    kind: 'timeline',
    orientation: 'vertical',
    events: [
      { id: 'v1', time: 'Step 1', label: 'Start', detail: 'Where it begins.' },
      { id: 'v2', time: 'Step 2', label: 'Middle' },
      { id: 'v3', time: 'Step 3', label: 'End' },
    ],
    eras: [{ id: 'v_era', label: 'Whole run', startEventId: 'v1', endEventId: 'v3' }],
  }),
  horizontalMinimal: visual('Two events, no eras', {
    kind: 'timeline',
    events: [
      { id: 'm1', time: 'A', label: 'Alpha' },
      { id: 'm2', time: 'B', label: 'Beta' },
    ],
  }),
  explicitPositions: visual('Explicit normalized positions', {
    kind: 'timeline',
    events: [
      { id: 'p1', time: '0%', label: 'Start', position: 0 },
      { id: 'p2', time: '80%', label: 'Late', position: 0.8 },
      { id: 'p3', time: '100%', label: 'End', position: 1 },
    ],
  }),
}

const formulas = {
  formulaFull: visual('Derivation with rules and a conclusion', {
    kind: 'formula_steps',
    notation: "f'(x)",
    steps: [
      { id: 'f1', expression: 'f(x) = x^{2}', label: 'Start' },
      { id: 'f2', expression: "f'(x) = 2x", rule: 'Power rule', detail: 'Bring the exponent down.' },
    ],
    conclusion: "f'(x) = 2x",
  }),
  formulaMinimal: visual('Two bare steps', {
    kind: 'formula_steps',
    steps: [
      { id: 'm1', expression: 'a + b' },
      { id: 'm2', expression: 'b + a' },
    ],
  }),
}

const studyMaps = {
  studyFull: visual('Study map with prerequisites and roles', {
    kind: 'study_map',
    sourceLabel: 'Course notes',
    goal: 'Reach the derivative rules.',
    sections: [
      { id: 'sec1', label: 'Limits', anchor: 'Chapter 1', summary: 'Approach behaviour.' },
      { id: 'sec2', label: 'Derivatives', anchor: 'Chapter 2' },
    ],
    concepts: [
      { id: 'limit', label: 'Limit', sectionId: 'sec1', role: 'foundation', detail: 'The core idea.' },
      { id: 'deriv', label: 'Derivative', sectionId: 'sec2', role: 'core', prerequisiteIds: ['limit'] },
      { id: 'chain', label: 'Chain rule', sectionId: 'sec2', role: 'extension', prerequisiteIds: ['deriv'], tone: 'purple' },
    ],
  }),
  studyMinimal: visual('One section, one concept', {
    kind: 'study_map',
    sourceLabel: 'Handout',
    sections: [{ id: 'only', label: 'Only section' }],
    concepts: [{ id: 'idea', label: 'The idea', sectionId: 'only' }],
  }),
}

const recallDecks = {
  recallFull: visual('Deck with hints and tags', {
    kind: 'recall_deck',
    instructions: 'Answer aloud before revealing.',
    cards: [
      { id: 'c1', prompt: 'What is the power rule?', answer: 'n·x^(n-1)', hint: 'Bring the exponent down.', tags: ['calculus'] },
      { id: 'c2', prompt: 'What is a limit?', answer: 'Approach behaviour near a point.' },
    ],
  }),
  recallMinimal: visual('The smallest legal deck', {
    kind: 'recall_deck',
    cards: [
      { id: 'one', prompt: 'First prompt?', answer: 'First answer.' },
      { id: 'two', prompt: 'Second prompt?', answer: 'Second answer.' },
    ],
  }),
}

/** A sequence over each kind that supports focusable ids. */
const sequenced = {
  plotSequence: visual('Plot with focus frames', {
    kind: 'plot',
    parameters: [{ id: 'n', label: 'n', min: 1, max: 3, step: 1, initial: 2 }],
    xAxis: axis('x', 0, 4, 32),
    yAxis: axis('y', 0, 16),
    series: [{ type: 'curve', id: 'power', label: 'xⁿ', expression: { op: 'pow', left: linear, right: { op: 'variable', name: 'n' } } }],
  }, {
    sequence: {
      initialFrameId: 'frame_param',
      frames: [
        { id: 'frame_param', label: '1. The exponent', focusIds: ['n'] },
        { id: 'frame_curve', label: '2. The curve', focusIds: ['power'] },
      ],
    },
  }),
  recallSequence: visual('Deck driven by frames', {
    kind: 'recall_deck',
    cards: [
      { id: 'first', prompt: 'First?', answer: 'One.' },
      { id: 'second', prompt: 'Second?', answer: 'Two.' },
    ],
  }, {
    sequence: {
      frames: [
        { id: 'f_one', label: 'Card one', focusIds: ['first'] },
        { id: 'f_two', label: 'Card two', focusIds: ['second'] },
      ],
    },
  }),
}

export const VISUAL_VARIANT_CORPUS: Readonly<Record<string, Record<string, unknown>>> = {
  ...plots,
  ...graphs,
  ...scenes,
  ...relations,
  ...timelines,
  ...formulas,
  ...studyMaps,
  ...recallDecks,
  ...sequenced,
}
