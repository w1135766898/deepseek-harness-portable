import { describe, expect, it } from 'vitest'
import {
  ACTIVITY_PROTOCOL,
  ACTIVITY_PROTOCOL_V2,
  LEARNING_VISUAL_KINDS_V4,
  MAX_ACTIVITY_BYTES,
  RESPONSE_PROTOCOL,
  RESPONSE_PROTOCOL_V2,
  TRANSPORT_PROTOCOL_V2,
  TRANSPORT_PROTOCOL,
  VISUAL_PROTOCOL_V3,
  VISUAL_PROTOCOL_V4,
  VISUAL_RESULT_PROTOCOL_V3,
  VISUAL_RESULT_PROTOCOL_V4,
  LearningProtocolError,
  parseLearningActivity,
  parseLearningActivityV2,
  parseLearningVisualV3,
  parseLearningVisualV4,
  parseLearningResponse,
  parseLearningResponseV2,
  type LearningQuestionV2,
  type LearningRevealV2,
} from '../src/protocol.ts'
import {
  decodeLearningDetail,
  decodeLearningQuestionId,
  decodeLearningWaitDetail,
  decodeLearningWaitQuestionId,
  encodeLearningDetail,
  encodeLearningQuestionId,
  encodeLearningWaitDetail,
  learningWaitQuestionId,
} from '../src/transport.ts'
import {
  compareActivity,
  logisticVisual,
  parameterActivity,
  processActivity,
  visualV4Catalog,
} from './fixtures.ts'

describe('Learning Activity Protocol v1', () => {
  it('accepts all three closed activity kinds', () => {
    expect(parseLearningActivity(parameterActivity()).kind).toBe('parameter_explorer')
    expect(parseLearningActivity(processActivity()).kind).toBe('process_stepper')
    expect(parseLearningActivity(compareActivity()).kind).toBe('structure_compare')
  })

  it('rejects unknown versions, kinds, root keys, and oversized payloads', () => {
    const base = parameterActivity()
    for (const invalid of [
      { ...base, protocol: 'dsh-learning/activity@2' },
      { ...base, kind: 'arbitrary_html' },
      { ...base, javascript: 'alert(1)' },
      { ...base, fallbackMarkdown: 'x'.repeat(MAX_ACTIVITY_BYTES) },
    ]) {
      expect(() => parseLearningActivity(invalid)).toThrow(LearningProtocolError)
    }
  })

  it('rejects unknown variables and ASTs beyond the depth limit', () => {
    const unknown = parameterActivity()
    if (unknown.kind !== 'parameter_explorer') throw new Error('fixture mismatch')
    unknown.payload.curves[0] = {
      id: 'bad', label: 'bad', expression: { op: 'variable', name: 'undeclared' },
    }
    expect(() => parseLearningActivity(unknown)).toThrow(/declared parameter/)

    let expression: unknown = { op: 'constant', value: 1 }
    for (let index = 0; index < 12; index += 1) expression = { op: 'neg', value: expression }
    const deep = parameterActivity()
    if (deep.kind !== 'parameter_explorer') throw new Error('fixture mismatch')
    deep.payload.curves[0] = { id: 'deep', label: 'deep', expression: expression as never }
    expect(() => parseLearningActivity(deep)).toThrow(/AST depth/)
  })

  it('validates response identity and lossless JSON', () => {
    expect(parseLearningResponse({
      protocol: RESPONSE_PROTOCOL,
      activityId: 'a1',
      action: 'submit',
      answer: { parameters: { slope: -1 }, explanation: 'It flips.' },
    }, 'a1')).toMatchObject({ action: 'submit' })
    expect(() => parseLearningResponse({
      protocol: RESPONSE_PROTOCOL,
      activityId: 'wrong',
      action: 'submit',
    }, 'a1')).toThrow(/does not match/)
  })

  it('round-trips the hidden question id without putting transport bytes in visible detail', () => {
    const activity = parameterActivity()
    const questionId = encodeLearningQuestionId({ activityId: 'host-id', activity })
    expect(questionId).not.toContain('"curves"')
    expect(questionId).toMatch(/^dsh-learning\/transport@1:/)
    expect(decodeLearningQuestionId(questionId)).toEqual({
      transport: TRANSPORT_PROTOCOL, activityId: 'host-id', activity,
    })
    expect(decodeLearningQuestionId('ordinary-question')).toBeUndefined()
  })

  it('decodes legacy detail markers for already-pending activities', () => {
    const activity = parameterActivity()
    const detail = encodeLearningDetail({ activityId: 'host-id', activity })
    expect(detail).toContain(activity.fallbackMarkdown)
    expect(detail).toContain('<!--dsh-learning/transport@1:')
    expect(decodeLearningDetail(detail)).toEqual({
      transport: TRANSPORT_PROTOCOL, activityId: 'host-id', activity,
    })
    expect(decodeLearningDetail('ordinary supporting detail')).toBeUndefined()
  })

  it('pins protocol literals', () => {
    expect(ACTIVITY_PROTOCOL).toBe('dsh-learning/activity@1')
    expect(RESPONSE_PROTOCOL).toBe('dsh-learning/response@1')
    expect(TRANSPORT_PROTOCOL).toBe('dsh-learning/transport@1')
  })
})

function questionV2(): LearningQuestionV2 {
  return {
    protocol: ACTIVITY_PROTOCOL_V2, phase: 'question', seq: 0,
    focus: { title: 'Queue head', progress: { current: 1, total: 2 } },
    prompt: 'Which item leaves first?', input: { kind: 'single_choice', options: [
      { id: 'a', label: 'A' }, { id: 'b', label: 'B' },
    ] },
    visual: { kind: 'process', frame: { id: 'queue', title: 'Current queue', content: 'A, B' } },
    fallbackMarkdown: 'A queue contains A, B. Which item leaves first?',
  }
}

function revealV2(): LearningRevealV2 {
  return {
    protocol: ACTIVITY_PROTOCOL_V2, phase: 'reveal', lessonToken: 'lesson_1', roundToken: 'round_1', seq: 0,
    focus: { title: 'Queue head' }, feedback: { verdict: 'correct', explanation: 'FIFO removes A.', answer: 'A' },
    visual: { kind: 'process', before: { id: 'before', title: 'Before', content: 'A, B' }, after: { id: 'after', title: 'After', content: 'B' } },
    animation: { kind: 'step_complete', reducedMotion: 'commit-final-state' },
    advance: { mode: 'user-after-animation' }, fallbackMarkdown: 'A leaves first under FIFO.',
  }
}

describe('retired Learning Activity Protocol v2 compatibility', () => {
  it('still validates historical Question and Reveal records without widening their shape', () => {
    expect(parseLearningActivityV2(questionV2()).phase).toBe('question')
    expect(parseLearningActivityV2(revealV2()).phase).toBe('reveal')
    for (const invalid of [
      { ...questionV2(), steps: [] },
      { ...questionV2(), answer: 'A' },
      { ...questionV2(), explanation: 'FIFO' },
      { ...questionV2(), reveal: revealV2() },
      { ...revealV2(), nextQuestion: 'What next?' },
      { ...revealV2(), input: { kind: 'short_text' } },
    ]) expect(() => parseLearningActivityV2(invalid)).toThrow(LearningProtocolError)
  })

  it('keeps historical question ids opaque while recovering an already-pending record', () => {
    const activity = questionV2()
    const input = {
      waitId: 'wait_1', activityId: 'activity_1', callId: 'call_1', lessonToken: 'lesson_1',
      roundToken: 'round_1', seq: 0, phase: 'question' as const, activity,
    }
    const id = learningWaitQuestionId(input.waitId)
    const detail = encodeLearningWaitDetail(input)
    expect(id).toBe('dsh-learning/wait@2:wait_1')
    expect(id).not.toContain(activity.prompt)
    expect(decodeLearningWaitQuestionId(id)).toBe('wait_1')
    expect(decodeLearningWaitDetail(detail)).toEqual({ transport: TRANSPORT_PROTOCOL_V2, ...input })
    expect(() => encodeLearningWaitDetail({
      ...input, phase: 'reveal', activity: revealV2(), lessonToken: 'other_lesson',
    })).toThrow(/token mismatch/)
  })
})

describe('non-blocking Learning Visual Protocol v3', () => {
  it('accepts a sigmoid curve, static point series, and parameter-only metrics', () => {
    const parsed = parseLearningVisualV3(logisticVisual())
    expect(parsed.protocol).toBe(VISUAL_PROTOCOL_V3)
    expect(parsed.series.map(series => series.type)).toEqual(['points', 'curve'])
    expect(parsed.series[1]).toMatchObject({
      type: 'curve',
      expression: { op: 'sigmoid' },
    })
    expect(parsed.metrics).toEqual([expect.objectContaining({
      id: 'boundary',
      digits: 1,
      suffix: ' h',
    })])
  })

  it('requires a closed, uniquely keyed series collection with at least one curve', () => {
    const visual = logisticVisual()
    expect(() => parseLearningVisualV3({
      ...visual,
      series: [visual.series[0]],
    })).toThrow(/at least one curve/)

    expect(() => parseLearningVisualV3({
      ...visual,
      series: [visual.series[1], { ...visual.series[1] }],
    })).toThrow(/duplicates probability/)

    expect(() => parseLearningVisualV3({
      ...visual,
      series: [{ ...visual.series[1], type: 'html', markup: '<script />' }],
    })).toThrow(LearningProtocolError)
  })

  it('rejects undeclared variables in curves and the x variable in metrics', () => {
    const visual = logisticVisual()
    expect(() => parseLearningVisualV3({
      ...visual,
      parameters: [{ ...visual.parameters[0], id: 'x' }, ...visual.parameters.slice(1)],
    })).toThrow(/reserved x-axis variable/)

    expect(() => parseLearningVisualV3({
      ...visual,
      series: [{
        ...visual.series[1],
        expression: { op: 'variable', name: 'undeclared' },
      }],
    })).toThrow(/x or a declared parameter id/)

    expect(() => parseLearningVisualV3({
      ...visual,
      metrics: [{
        id: 'illegal_x',
        label: 'Illegal x metric',
        expression: { op: 'variable', name: 'x' },
      }],
    })).toThrow(/declared parameter id/)
  })

  it('bounds metric count and formatting precision', () => {
    const visual = logisticVisual()
    const metric = visual.metrics?.[0]
    if (metric === undefined) throw new Error('fixture mismatch')
    expect(() => parseLearningVisualV3({
      ...visual,
      metrics: [{ ...metric, digits: 7 }],
    })).toThrow(/0 to 6/)
    expect(() => parseLearningVisualV3({
      ...visual,
      metrics: Array.from({ length: 5 }, (_, index) => ({
        ...metric,
        id: `metric_${String(index)}`,
      })),
    })).toThrow(/at most 4 metrics/)
  })

  it('pins the visual and immediate result protocol literals', () => {
    expect(VISUAL_PROTOCOL_V3).toBe('dsh-learning/visual@3')
    expect(VISUAL_RESULT_PROTOCOL_V3).toBe('dsh-learning/visual-result@3')
  })
})

describe('semantic Learning Visual Protocol v4', () => {
  it('accepts every native content kind and all three relation variants', () => {
    const parsed = Object.values(visualV4Catalog).map(visual => parseLearningVisualV4(visual))
    expect(parsed.map(visual => visual.content.kind)).toEqual([
      'plot',
      'node_link',
      'scene_2d',
      'relation',
      'relation',
      'relation',
      'timeline',
      'formula_steps',
      'study_map',
      'recall_deck',
    ])
    expect([...new Set(parsed.map(visual => visual.content.kind))]).toEqual(LEARNING_VISUAL_KINDS_V4)
    expect(parsed.flatMap(visual => visual.content.kind === 'relation'
      ? [visual.content.variant]
      : [])).toEqual(['comparison', 'matrix', 'sets'])

    const network = parseLearningVisualV4(visualV4Catalog.fullyConnectedNetwork)
    expect(network.content.kind).toBe('node_link')
    if (network.content.kind !== 'node_link') throw new Error('fixture mismatch')
    expect(network.content.nodes).toHaveLength(9)
    expect(network.content.edges).toHaveLength(20)
  })

  it('rejects references that do not resolve inside graphs, relations, timelines, and study maps', () => {
    const badEdge = structuredClone(visualV4Catalog.fullyConnectedNetwork)
    if (badEdge.content.kind !== 'node_link') throw new Error('fixture mismatch')
    badEdge.content.edges[0]!.from = 'missing_node'

    const badComparison = structuredClone(visualV4Catalog.comparisonRelation)
    if (badComparison.content.kind !== 'relation' || badComparison.content.variant !== 'comparison') {
      throw new Error('fixture mismatch')
    }
    badComparison.content.rows[0]!.cells[0]!.subjectId = 'missing_subject'

    const badMatrix = structuredClone(visualV4Catalog.matrixRelation)
    if (badMatrix.content.kind !== 'relation' || badMatrix.content.variant !== 'matrix') {
      throw new Error('fixture mismatch')
    }
    badMatrix.content.cells[0]!.rowId = 'missing_row'

    const badSets = structuredClone(visualV4Catalog.setsRelation)
    if (badSets.content.kind !== 'relation' || badSets.content.variant !== 'sets') {
      throw new Error('fixture mismatch')
    }
    badSets.content.items[0]!.setIds = ['missing_set']

    const badTimeline = structuredClone(visualV4Catalog.neuralNetworkTimeline)
    if (badTimeline.content.kind !== 'timeline' || badTimeline.content.eras === undefined) {
      throw new Error('fixture mismatch')
    }
    badTimeline.content.eras[0]!.startEventId = 'missing_event'

    const badStudySection = structuredClone(visualV4Catalog.calculusStudyMap)
    if (badStudySection.content.kind !== 'study_map') throw new Error('fixture mismatch')
    badStudySection.content.concepts[0]!.sectionId = 'missing_section'

    const badPrerequisite = structuredClone(visualV4Catalog.calculusStudyMap)
    if (badPrerequisite.content.kind !== 'study_map') throw new Error('fixture mismatch')
    badPrerequisite.content.concepts[1]!.prerequisiteIds = ['missing_concept']

    for (const invalid of [
      badEdge,
      badComparison,
      badMatrix,
      badSets,
      badTimeline,
      badStudySection,
      badPrerequisite,
    ]) {
      expect(() => parseLearningVisualV4(invalid)).toThrow(/reference|declared/)
    }
  })

  it('rejects prerequisite cycles in study maps', () => {
    const visual = structuredClone(visualV4Catalog.calculusStudyMap)
    if (visual.content.kind !== 'study_map') throw new Error('fixture mismatch')

    const functionChange = visual.content.concepts.find(concept => concept.id === 'function_change')
    if (functionChange === undefined) throw new Error('fixture mismatch')
    functionChange.prerequisiteIds = ['derivative_definition']

    expect(() => parseLearningVisualV4(visual)).toThrow(/prerequisiteIds must not contain a cycle/)
  })

  it('rejects extra fields and arbitrary HTML render payloads', () => {
    const plot = visualV4Catalog.derivativePlot
    for (const invalid of [
      { ...plot, javascript: 'alert(1)' },
      { ...plot, content: { ...plot.content, markup: '<svg onload="alert(1)" />' } },
      {
        protocol: VISUAL_PROTOCOL_V4,
        title: 'Unsafe arbitrary renderer',
        content: { kind: 'html', markup: '<script>alert(1)</script>' },
      },
    ]) {
      expect(() => parseLearningVisualV4(invalid)).toThrow(LearningProtocolError)
    }
  })

  it('rejects bounded collections that exceed their declared maximum', () => {
    const visual = structuredClone(visualV4Catalog.fullyConnectedNetwork)
    if (visual.content.kind !== 'node_link') throw new Error('fixture mismatch')
    const first = visual.content.edges[0]!
    visual.content.edges = Array.from({ length: 161 }, (_, index) => ({
      ...first,
      id: `edge_${String(index)}`,
    }))
    expect(() => parseLearningVisualV4(visual)).toThrow(/1 to 160 edges/)

    const formula = structuredClone(visualV4Catalog.powerRuleDerivation)
    if (formula.content.kind !== 'formula_steps') throw new Error('fixture mismatch')
    formula.content.steps = Array.from({ length: 17 }, (_, index) => ({
      id: `step_${String(index)}`,
      expression: `x + ${String(index)}`,
    }))
    expect(() => parseLearningVisualV4(formula)).toThrow(/2 to 16 formula steps/)

    const deck = structuredClone(visualV4Catalog.derivativeRecallDeck)
    if (deck.content.kind !== 'recall_deck') throw new Error('fixture mismatch')
    deck.content.cards = Array.from({ length: 33 }, (_, index) => ({
      id: `card_${String(index)}`,
      prompt: `Prompt ${String(index)}`,
      answer: `Answer ${String(index)}`,
    }))
    expect(() => parseLearningVisualV4(deck)).toThrow(/2 to 32 cards/)
  })

  it('rejects sequence focus and initial-frame ids outside the declared visual', () => {
    const missingFocus = structuredClone(visualV4Catalog.vectorScene)
    if (missingFocus.sequence === undefined) throw new Error('fixture mismatch')
    missingFocus.sequence.frames[0]!.focusIds = ['not_in_scene']
    expect(() => parseLearningVisualV4(missingFocus)).toThrow(/must reference visual content/)

    const missingInitialFrame = structuredClone(visualV4Catalog.fullyConnectedNetwork)
    if (missingInitialFrame.sequence === undefined) throw new Error('fixture mismatch')
    missingInitialFrame.sequence.initialFrameId = 'not_a_frame'
    expect(() => parseLearningVisualV4(missingInitialFrame)).toThrow(/must reference a declared frame/)
  })

  it('pins the V4 visual and immediate-ready result protocol literals', () => {
    expect(VISUAL_PROTOCOL_V4).toBe('dsh-learning/visual@4')
    expect(VISUAL_RESULT_PROTOCOL_V4).toBe('dsh-learning/visual-result@4')
  })
})
