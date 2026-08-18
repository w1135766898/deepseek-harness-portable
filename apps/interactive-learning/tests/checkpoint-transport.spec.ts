import { Buffer } from 'node:buffer'
import { describe, expect, it } from 'vitest'
import {
  CHECKPOINT_PROTOCOL,
  CHECKPOINT_RESULT_PROTOCOL,
  CHECKPOINT_TRANSPORT_PROTOCOL,
  MAX_ACTIVITY_BYTES,
  MAX_RESPONSE_BYTES,
  LearningProtocolError,
  parseLearningCheckpointResultV1,
  parseLearningCheckpointV1,
  type LearningCheckpointKindV1,
  type LearningCheckpointResultV1,
  type LearningCheckpointV1,
} from '../src/protocol.ts'
import {
  decodeLearningCheckpointDetail,
  decodeLearningCheckpointQuestionId,
  encodeLearningCheckpointDetail,
  learningCheckpointQuestionId,
} from '../src/transport.ts'

function checkpoint(
  kind: LearningCheckpointKindV1 = 'free_text',
): LearningCheckpointV1 {
  return {
    protocol: CHECKPOINT_PROTOCOL,
    kind,
    prompt: 'Explain which invariant decides the next step.',
    context: 'The queue currently contains A, then B.',
    expectedEvidence: kind === 'prediction' ? 'prediction' : 'explanation',
    ...(kind === 'single_choice'
      ? { options: [{ id: 'a', label: 'A leaves first' }, { id: 'b', label: 'B leaves first' }] }
      : {}),
    fallbackMarkdown: '**Checkpoint:** explain which invariant decides the next step.',
  }
}

function submitted(
  checkpointId: string,
  response: { text: string } | { optionId: string } | { number: number },
): LearningCheckpointResultV1 {
  return {
    protocol: CHECKPOINT_RESULT_PROTOCOL,
    checkpointId,
    status: 'submitted',
    response,
    receiptId: 'receipt_wait_1',
  }
}

describe('Learning Checkpoint Protocol v1', () => {
  it('accepts every closed checkpoint kind', () => {
    const kinds: LearningCheckpointKindV1[] = [
      'free_text', 'single_choice', 'numeric', 'prediction', 'code_slot',
    ]
    expect(kinds.map(kind => parseLearningCheckpointV1(checkpoint(kind)).kind)).toEqual(kinds)
  })

  it('rejects answer, solution, future-round, executable, and unknown fields', () => {
    const base = checkpoint()
    for (const leaked of [
      { answer: 'FIFO' },
      { solution: 'FIFO removes A' },
      { explanation: 'The answer is A' },
      { nextQuestion: 'What happens next?' },
      { futureSteps: ['Reveal A'] },
      { html: '<button>Submit</button>' },
      { javascript: 'alert(1)' },
    ]) {
      expect(() => parseLearningCheckpointV1({ ...base, ...leaked })).toThrow(LearningProtocolError)
    }
  })

  it('keeps visible checkpoint copy bounded and free of raw HTML', () => {
    const base = checkpoint()
    const choice = checkpoint('single_choice')
    for (const invalid of [
      { ...base, prompt: '<script>alert(1)</script>' },
      { ...base, context: '<iframe src="https://example.test"></iframe>' },
      { ...base, fallbackMarkdown: '<button onclick="answer()">Answer</button>' },
      { ...base, prompt: 'The correct answer is A. Choose A.' },
      { ...base, prompt: 'Solution: FIFO removes A.' },
      { ...base, context: 'Scoring rubric: two points for mentioning FIFO.' },
      { ...base, context: 'The answer: FIFO.' },
      { ...base, fallbackMarkdown: 'Future step: reveal the solution.' },
      { ...base, fallbackMarkdown: 'Expected response: FIFO removes A.' },
      { ...base, prompt: '正确答案是 A，请选择 A。' },
      { ...base, context: '评分标准：提到 FIFO 得两分。' },
      { ...base, fallbackMarkdown: '下一步将揭示解法。' },
      {
        ...choice,
        options: [
          { id: 'a', label: '标准解：A。' },
          { id: 'b', label: '另一个选项' },
        ],
      },
      { ...base, fallbackMarkdown: 'x'.repeat(MAX_ACTIVITY_BYTES) },
    ]) {
      expect(() => parseLearningCheckpointV1(invalid)).toThrow(LearningProtocolError)
    }
  })

  it('enforces single-choice option conditions and closed option records', () => {
    const choice = checkpoint('single_choice')
    for (const invalid of [
      { ...choice, options: undefined },
      { ...choice, options: [{ id: 'a', label: 'Only one' }] },
      { ...choice, options: [{ id: 'a', label: 'First' }, { id: 'a', label: 'Duplicate' }] },
      { ...choice, options: [{ id: 'a', label: 'First', answer: true }, { id: 'b', label: 'Second' }] },
      { ...choice, options: [{ id: 'a', label: '<b>First</b>' }, { id: 'b', label: 'Second' }] },
      { ...checkpoint('numeric'), options: choice.options },
    ]) {
      expect(() => parseLearningCheckpointV1(invalid)).toThrow(LearningProtocolError)
    }
    expect(parseLearningCheckpointV1({
      ...choice,
      options: [{ id: 'a', label: 'Same visible label' }, { id: 'b', label: 'Same visible label' }],
    }).options?.map(option => option.id)).toEqual(['a', 'b'])
  })

  it('validates submitted response shape against checkpoint kind and declared options', () => {
    const checkpointId = 'checkpoint_1'
    const cases = [
      [checkpoint('free_text'), submitted(checkpointId, { text: 'FIFO preserves arrival order.' })],
      [checkpoint('prediction'), submitted(checkpointId, { text: 'A will leave first.' })],
      [checkpoint('code_slot'), submitted(checkpointId, { text: 'assert(queue.shift() === "A")' })],
      [checkpoint('single_choice'), submitted(checkpointId, { optionId: 'a' })],
      [checkpoint('numeric'), submitted(checkpointId, { number: 42 })],
    ] as const
    for (const [definition, result] of cases) {
      expect(parseLearningCheckpointResultV1(result, { checkpointId, checkpoint: definition }))
        .toEqual(result)
    }

    for (const [definition, result] of [
      [checkpoint('single_choice'), submitted(checkpointId, { optionId: 'missing' })],
      [checkpoint('single_choice'), submitted(checkpointId, { text: 'A' })],
      [checkpoint('numeric'), submitted(checkpointId, { text: '42' })],
      [checkpoint('free_text'), submitted(checkpointId, { number: 42 })],
    ] as const) {
      expect(() => parseLearningCheckpointResultV1(result, { checkpointId, checkpoint: definition }))
        .toThrow(LearningProtocolError)
    }
  })

  it('binds identity, status, response presence, receipt shape, and response size', () => {
    const definition = checkpoint()
    const checkpointId = 'checkpoint_1'
    expect(parseLearningCheckpointResultV1({
      protocol: CHECKPOINT_RESULT_PROTOCOL,
      checkpointId,
      status: 'skipped',
      receiptId: 'receipt_skip',
    }, { checkpointId, checkpoint: definition }).status).toBe('skipped')
    expect(parseLearningCheckpointResultV1({
      protocol: CHECKPOINT_RESULT_PROTOCOL,
      checkpointId,
      status: 'cancelled',
      receiptId: 'receipt_cancel',
    }, { checkpointId, checkpoint: definition }).status).toBe('cancelled')

    for (const invalid of [
      { ...submitted('wrong_checkpoint', { text: 'A' }) },
      { ...submitted(checkpointId, { text: 'A' }), answer: 'A' },
      {
        protocol: CHECKPOINT_RESULT_PROTOCOL,
        checkpointId,
        status: 'skipped',
        response: { text: 'must not be present' },
        receiptId: 'receipt_skip',
      },
      {
        protocol: CHECKPOINT_RESULT_PROTOCOL,
        checkpointId,
        status: 'submitted',
        response: { text: 'x'.repeat(MAX_RESPONSE_BYTES) },
        receiptId: 'receipt_large',
      },
      {
        protocol: CHECKPOINT_RESULT_PROTOCOL,
        checkpointId,
        status: 'submitted',
        response: { number: Number.NaN },
        receiptId: 'receipt_number',
      },
      {
        protocol: CHECKPOINT_RESULT_PROTOCOL,
        checkpointId,
        status: 'submitted',
        response: { text: 'A' },
        receiptId: 'not a token',
      },
    ]) {
      expect(() => parseLearningCheckpointResultV1(invalid, { checkpointId, checkpoint: definition }))
        .toThrow(LearningProtocolError)
    }
  })

  it('pins all checkpoint protocol literals', () => {
    expect(CHECKPOINT_PROTOCOL).toBe('dsh-learning/checkpoint@1')
    expect(CHECKPOINT_RESULT_PROTOCOL).toBe('dsh-learning/checkpoint-result@1')
    expect(CHECKPOINT_TRANSPORT_PROTOCOL).toBe('dsh-learning/checkpoint-wait@1')
  })
})

function waitInput() {
  return {
    sessionId: 'session:learning-1',
    callId: 'call:checkpoint-1',
    waitId: 'wait_1',
    checkpointId: 'checkpoint_1',
    checkpoint: checkpoint('single_choice'),
  }
}

function rawDetail(value: unknown): string {
  const encoded = Buffer.from(JSON.stringify(value), 'utf8').toString('base64url')
  return `<!--dsh-learning/checkpoint-wait@1:${encoded}-->\nFallback`
}

describe('Learning Checkpoint wait transport v1', () => {
  it('keeps the question id opaque and round-trips the safe pending projection', () => {
    const input = waitInput()
    const id = learningCheckpointQuestionId(input.waitId)
    const detail = encodeLearningCheckpointDetail(input)

    expect(id).toBe('dsh-learning/checkpoint-wait@1:wait_1')
    expect(id).not.toContain(input.checkpoint.prompt)
    expect(id).not.toContain(input.sessionId)
    expect(detail).not.toContain(input.checkpoint.prompt)
    expect(detail).toContain(input.checkpoint.fallbackMarkdown)
    expect(decodeLearningCheckpointQuestionId(id)).toBe(input.waitId)
    expect(decodeLearningCheckpointDetail(detail)).toEqual({
      transport: CHECKPOINT_TRANSPORT_PROTOCOL,
      ...input,
    })
  })

  it('rejects malformed ids and invalid encoder identities', () => {
    expect(decodeLearningCheckpointQuestionId('ordinary-question')).toBeUndefined()
    expect(decodeLearningCheckpointQuestionId('dsh-learning/wait@2:wait_1')).toBeUndefined()
    expect(decodeLearningCheckpointQuestionId('dsh-learning/checkpoint-wait@1:bad id')).toBeUndefined()
    expect(() => learningCheckpointQuestionId('bad id')).toThrow(/opaque token/)
    expect(() => encodeLearningCheckpointDetail({ ...waitInput(), sessionId: ' ' })).toThrow(/sessionId/)
    expect(() => encodeLearningCheckpointDetail({ ...waitInput(), callId: '' })).toThrow(/callId/)
    expect(() => encodeLearningCheckpointDetail({ ...waitInput(), checkpointId: 'bad id' })).toThrow(/checkpointId/)
    expect(() => encodeLearningCheckpointDetail({
      ...waitInput(),
      checkpoint: { ...checkpoint(), answer: 'A' } as LearningCheckpointV1,
    })).toThrow(LearningProtocolError)
  })

  it('fails closed on tampered transport metadata or leaked checkpoint content', () => {
    const input = waitInput()
    const envelope = { transport: CHECKPOINT_TRANSPORT_PROTOCOL, ...input }
    for (const invalid of [
      { ...envelope, transport: 'dsh-learning/checkpoint-wait@2' },
      { ...envelope, sessionId: '' },
      { ...envelope, callId: '' },
      { ...envelope, waitId: 'bad id' },
      { ...envelope, checkpointId: 'bad id' },
      { ...envelope, answer: 'A' },
      { ...envelope, checkpoint: { ...envelope.checkpoint, solution: 'A' } },
      { ...envelope, checkpoint: { ...envelope.checkpoint, prompt: '<script>A</script>' } },
    ]) {
      expect(decodeLearningCheckpointDetail(rawDetail(invalid))).toBeUndefined()
    }
    expect(decodeLearningCheckpointDetail('<!--dsh-learning/checkpoint-wait@1:not+base64-->'))
      .toBeUndefined()
  })
})
