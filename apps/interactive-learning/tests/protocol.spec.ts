import { describe, expect, it } from 'vitest'
import {
  ACTIVITY_PROTOCOL,
  ACTIVITY_PROTOCOL_V2,
  MAX_ACTIVITY_BYTES,
  RESPONSE_PROTOCOL,
  RESPONSE_PROTOCOL_V2,
  TRANSPORT_PROTOCOL_V2,
  TRANSPORT_PROTOCOL,
  LearningProtocolError,
  parseLearningActivity,
  parseLearningActivityV2,
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
import { compareActivity, parameterActivity, processActivity } from './fixtures.ts'

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

describe('Learning Activity Protocol v2', () => {
  it('accepts one closed Question or Reveal gate and rejects cross-phase/future fields', () => {
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

  it('requires phase identity, receipt identity, and a completed animation before continue', () => {
    const response = {
      protocol: RESPONSE_PROTOCOL_V2, phase: 'reveal', activityId: 'activity_1', lessonToken: 'lesson_1',
      roundToken: 'round_1', seq: 0, action: 'continue', animation: { completed: true }, receiptId: 'receipt_1',
    } as const
    expect(parseLearningResponseV2(response, { activityId: 'activity_1', phase: 'reveal' })).toEqual(response)
    expect(() => parseLearningResponseV2({ ...response, animation: { completed: false } })).toThrow(/before continue/)
    expect(() => parseLearningResponseV2({ ...response, roundToken: 'stale' }, { roundToken: 'round_1' })).toThrow(/does not match/)
  })

  it('keeps the question id opaque while recovering only the current gate from detail', () => {
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
