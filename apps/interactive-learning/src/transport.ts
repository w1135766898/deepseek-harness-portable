import {
  CHECKPOINT_TRANSPORT_PROTOCOL,
  MAX_ACTIVITY_BYTES,
  TRANSPORT_PROTOCOL_V2,
  TRANSPORT_PROTOCOL,
  parseLearningActivity,
  parseLearningActivityV2,
  parseLearningCheckpointV1,
  type LearningActivityEnvelopeV1,
  type LearningActivityEnvelopeInputV1,
  type LearningCheckpointWaitEnvelopeInputV1,
  type LearningCheckpointWaitEnvelopeV1,
  type LearningWaitEnvelopeInputV2,
  type LearningWaitEnvelopeV2,
} from './protocol.ts'

const MARKER_PREFIX = '<!--dsh-learning/transport@1:'
const MARKER_SUFFIX = '-->'
const QUESTION_ID_PREFIX = 'dsh-learning/transport@1:'
const WAIT_MARKER_PREFIX = '<!--dsh-learning/wait@2:'
const WAIT_QUESTION_ID_PREFIX = 'dsh-learning/wait@2:'
const CHECKPOINT_WAIT_MARKER_PREFIX = '<!--dsh-learning/checkpoint-wait@1:'
const CHECKPOINT_WAIT_QUESTION_ID_PREFIX = 'dsh-learning/checkpoint-wait@1:'
const BASE64URL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'
const MAX_CHECKPOINT_ENVELOPE_BASE64_CHARS = Math.ceil((MAX_ACTIVITY_BYTES + 8_192) * 4 / 3)

function encodeBase64Url(value: string): string {
  const bytes = new TextEncoder().encode(value)
  let result = ''
  for (let index = 0; index < bytes.length; index += 3) {
    const a = bytes[index] as number
    const b = bytes[index + 1]
    const c = bytes[index + 2]
    const triple = (a << 16) | ((b ?? 0) << 8) | (c ?? 0)
    result += BASE64URL[(triple >> 18) & 63]
    result += BASE64URL[(triple >> 12) & 63]
    if (b !== undefined) result += BASE64URL[(triple >> 6) & 63]
    if (c !== undefined) result += BASE64URL[triple & 63]
  }
  return result
}

function decodeBase64Url(value: string): string | undefined {
  if (!/^[A-Za-z0-9_-]+$/.test(value) || value.length % 4 === 1) return undefined
  const bytes: number[] = []
  for (let index = 0; index < value.length; index += 4) {
    const a = BASE64URL.indexOf(value[index] as string)
    const b = BASE64URL.indexOf(value[index + 1] as string)
    const c = value[index + 2] === undefined ? 0 : BASE64URL.indexOf(value[index + 2] as string)
    const d = value[index + 3] === undefined ? 0 : BASE64URL.indexOf(value[index + 3] as string)
    if (a < 0 || b < 0 || c < 0 || d < 0) return undefined
    const triple = (a << 18) | (b << 12) | (c << 6) | d
    bytes.push((triple >> 16) & 255)
    if (value[index + 2] !== undefined) bytes.push((triple >> 8) & 255)
    if (value[index + 3] !== undefined) bytes.push(triple & 255)
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(new Uint8Array(bytes))
  } catch {
    return undefined
  }
}

function decodeEnvelope(value: string): LearningActivityEnvelopeV1 | undefined {
  const json = decodeBase64Url(value)
  if (json === undefined) return undefined
  try {
    const parsed = JSON.parse(json) as { transport?: unknown; activityId?: unknown; activity?: unknown }
    if (parsed.transport !== TRANSPORT_PROTOCOL
      || typeof parsed.activityId !== 'string' || parsed.activityId === '') return undefined
    return {
      transport: TRANSPORT_PROTOCOL,
      activityId: parsed.activityId,
      activity: parseLearningActivity(parsed.activity),
    }
  } catch {
    return undefined
  }
}

/**
 * Encode the package-owned envelope in the question id. Generic question
 * clients do not render ids, so an incompatible Client sees only the readable
 * prompt and Markdown fallback instead of a Base64 transport marker.
 */
export function encodeLearningQuestionId(input: LearningActivityEnvelopeInputV1): string {
  const envelope: LearningActivityEnvelopeV1 = { transport: TRANSPORT_PROTOCOL, ...input }
  return `${QUESTION_ID_PREFIX}${encodeBase64Url(JSON.stringify(envelope))}`
}

/** Decode and revalidate a package-owned question id. */
export function decodeLearningQuestionId(value: unknown): LearningActivityEnvelopeV1 | undefined {
  if (typeof value !== 'string' || !value.startsWith(QUESTION_ID_PREFIX)) return undefined
  return decodeEnvelope(value.slice(QUESTION_ID_PREFIX.length))
}

/**
 * Legacy transport retained for pending waits created by older package
 * versions. New requests use encodeLearningQuestionId so generic renderers do
 * not expose the machine envelope.
 */
export function encodeLearningDetail(input: LearningActivityEnvelopeInputV1): string {
  const envelope: LearningActivityEnvelopeV1 = { transport: TRANSPORT_PROTOCOL, ...input }
  return `${MARKER_PREFIX}${encodeBase64Url(JSON.stringify(envelope))}${MARKER_SUFFIX}\n${envelope.activity.fallbackMarkdown}`
}

/** Decode and revalidate a package-owned question detail; ordinary questions return undefined. */
export function decodeLearningDetail(detail: unknown): LearningActivityEnvelopeV1 | undefined {
  if (typeof detail !== 'string' || !detail.startsWith(MARKER_PREFIX)) return undefined
  const end = detail.indexOf(MARKER_SUFFIX, MARKER_PREFIX.length)
  if (end < 0) return undefined
  return decodeEnvelope(detail.slice(MARKER_PREFIX.length, end))
}

/** V2 ids contain only an opaque reference, never the phase payload. */
export function learningWaitQuestionId(waitId: string): string {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(waitId)) throw new Error('waitId must be a URL-safe opaque token')
  return `${WAIT_QUESTION_ID_PREFIX}${waitId}`
}

export function decodeLearningWaitQuestionId(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value.startsWith(WAIT_QUESTION_ID_PREFIX)) return undefined
  const waitId = value.slice(WAIT_QUESTION_ID_PREFIX.length)
  return /^[A-Za-z0-9_-]{1,128}$/.test(waitId) ? waitId : undefined
}

/** Detail persists one safe current-phase projection for refresh recovery. */
export function encodeLearningWaitDetail(input: LearningWaitEnvelopeInputV2): string {
  const envelope: LearningWaitEnvelopeV2 = { transport: TRANSPORT_PROTOCOL_V2, ...input }
  const activity = parseLearningActivityV2(envelope.activity)
  if (activity.phase !== envelope.phase || activity.seq !== envelope.seq) throw new Error('wait projection phase/seq mismatch')
  if (activity.phase === 'reveal'
    && (activity.lessonToken !== envelope.lessonToken || activity.roundToken !== envelope.roundToken)) {
    throw new Error('wait projection token mismatch')
  }
  if (activity.phase === 'question' && activity.lessonToken !== undefined
    && activity.lessonToken !== envelope.lessonToken) throw new Error('wait projection token mismatch')
  return `${WAIT_MARKER_PREFIX}${encodeBase64Url(JSON.stringify({ ...envelope, activity }))}${MARKER_SUFFIX}\n${activity.fallbackMarkdown}`
}

export function decodeLearningWaitDetail(detail: unknown): LearningWaitEnvelopeV2 | undefined {
  if (typeof detail !== 'string' || !detail.startsWith(WAIT_MARKER_PREFIX)) return undefined
  const end = detail.indexOf(MARKER_SUFFIX, WAIT_MARKER_PREFIX.length)
  if (end < 0) return undefined
  const json = decodeBase64Url(detail.slice(WAIT_MARKER_PREFIX.length, end))
  if (json === undefined) return undefined
  try {
    const parsed = JSON.parse(json) as Record<string, unknown>
    if (parsed.transport !== TRANSPORT_PROTOCOL_V2
      || typeof parsed.waitId !== 'string' || decodeLearningWaitQuestionId(learningWaitQuestionId(parsed.waitId)) === undefined
      || typeof parsed.activityId !== 'string' || parsed.activityId === ''
      || (parsed.callId !== undefined && (typeof parsed.callId !== 'string' || parsed.callId === ''))
      || typeof parsed.lessonToken !== 'string' || parsed.lessonToken === ''
      || typeof parsed.roundToken !== 'string' || parsed.roundToken === ''
      || typeof parsed.seq !== 'number' || !Number.isInteger(parsed.seq) || parsed.seq < 0
      || (parsed.phase !== 'question' && parsed.phase !== 'reveal')) return undefined
    const activity = parseLearningActivityV2(parsed.activity)
    if (activity.phase !== parsed.phase || activity.seq !== parsed.seq) return undefined
    if (activity.phase === 'reveal'
      && (activity.lessonToken !== parsed.lessonToken || activity.roundToken !== parsed.roundToken)) return undefined
    if (activity.phase === 'question' && activity.lessonToken !== undefined
      && activity.lessonToken !== parsed.lessonToken) return undefined
    return {
      transport: TRANSPORT_PROTOCOL_V2, waitId: parsed.waitId, activityId: parsed.activityId,
      ...(parsed.callId === undefined ? {} : { callId: parsed.callId }),
      lessonToken: parsed.lessonToken, roundToken: parsed.roundToken,
      seq: parsed.seq, phase: parsed.phase, activity,
    }
  } catch {
    return undefined
  }
}

function opaqueToken(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value)
}

function boundedTransportIdentity(value: unknown): value is string {
  return typeof value === 'string'
    && value.length >= 1
    && value.length <= 512
    && value.trim() === value
    && !/[\u0000-\u001F\u007F]/.test(value)
}

function onlyEnvelopeKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  return Object.keys(value).every(key => allowed.includes(key))
}

function assertCheckpointEnvelopeInput(input: LearningCheckpointWaitEnvelopeInputV1): void {
  if (!boundedTransportIdentity(input.sessionId)) {
    throw new Error('sessionId must be a non-empty bounded transport identity')
  }
  if (!boundedTransportIdentity(input.callId)) {
    throw new Error('callId must be a non-empty bounded transport identity')
  }
  if (!opaqueToken(input.waitId)) throw new Error('waitId must be a URL-safe opaque token')
  if (!opaqueToken(input.checkpointId)) throw new Error('checkpointId must be a URL-safe opaque token')
  parseLearningCheckpointV1(input.checkpoint)
}

/** A checkpoint question id contains one opaque lookup token and no teaching payload. */
export function learningCheckpointQuestionId(waitId: string): string {
  if (!opaqueToken(waitId)) throw new Error('waitId must be a URL-safe opaque token')
  return `${CHECKPOINT_WAIT_QUESTION_ID_PREFIX}${waitId}`
}

export function decodeLearningCheckpointQuestionId(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value.startsWith(CHECKPOINT_WAIT_QUESTION_ID_PREFIX)) return undefined
  const waitId = value.slice(CHECKPOINT_WAIT_QUESTION_ID_PREFIX.length)
  return opaqueToken(waitId) ? waitId : undefined
}

/** Persist one answer-free checkpoint projection so a pending wait survives refresh. */
export function encodeLearningCheckpointDetail(input: LearningCheckpointWaitEnvelopeInputV1): string {
  assertCheckpointEnvelopeInput(input)
  const envelope: LearningCheckpointWaitEnvelopeV1 = {
    transport: CHECKPOINT_TRANSPORT_PROTOCOL,
    ...input,
  }
  return `${CHECKPOINT_WAIT_MARKER_PREFIX}${encodeBase64Url(JSON.stringify(envelope))}${MARKER_SUFFIX}\n${input.checkpoint.fallbackMarkdown}`
}

/** Decode and fully revalidate a package-owned checkpoint wait projection. */
export function decodeLearningCheckpointDetail(detail: unknown): LearningCheckpointWaitEnvelopeV1 | undefined {
  if (typeof detail !== 'string' || !detail.startsWith(CHECKPOINT_WAIT_MARKER_PREFIX)) return undefined
  const end = detail.indexOf(MARKER_SUFFIX, CHECKPOINT_WAIT_MARKER_PREFIX.length)
  if (end < 0) return undefined
  const encoded = detail.slice(CHECKPOINT_WAIT_MARKER_PREFIX.length, end)
  if (encoded.length < 1 || encoded.length > MAX_CHECKPOINT_ENVELOPE_BASE64_CHARS) return undefined
  const json = decodeBase64Url(encoded)
  if (json === undefined) return undefined
  try {
    const parsed = JSON.parse(json) as unknown
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return undefined
    const envelope = parsed as Record<string, unknown>
    if (!onlyEnvelopeKeys(
      envelope,
      ['transport', 'sessionId', 'callId', 'waitId', 'checkpointId', 'checkpoint'],
    )) return undefined
    if (envelope.transport !== CHECKPOINT_TRANSPORT_PROTOCOL
      || !boundedTransportIdentity(envelope.sessionId)
      || !boundedTransportIdentity(envelope.callId)
      || !opaqueToken(envelope.waitId)
      || !opaqueToken(envelope.checkpointId)) return undefined
    const checkpoint = parseLearningCheckpointV1(envelope.checkpoint)
    return {
      transport: CHECKPOINT_TRANSPORT_PROTOCOL,
      sessionId: envelope.sessionId,
      callId: envelope.callId,
      waitId: envelope.waitId,
      checkpointId: envelope.checkpointId,
      checkpoint,
    }
  } catch {
    return undefined
  }
}
