import { describe, expect, it } from 'vitest'
import {
  ACTIVITY_PROTOCOL,
  MAX_ACTIVITY_BYTES,
  RESPONSE_PROTOCOL,
  TRANSPORT_PROTOCOL,
  LearningProtocolError,
  parseLearningActivity,
  parseLearningResponse,
} from '../src/protocol.ts'
import {
  decodeLearningDetail,
  decodeLearningQuestionId,
  encodeLearningDetail,
  encodeLearningQuestionId,
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
