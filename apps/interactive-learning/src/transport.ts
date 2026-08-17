import {
  TRANSPORT_PROTOCOL,
  parseLearningActivity,
  type LearningActivityEnvelopeV1,
  type LearningActivityEnvelopeInputV1,
} from './protocol.ts'

const MARKER_PREFIX = '<!--dsh-learning/transport@1:'
const MARKER_SUFFIX = '-->'
const BASE64URL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'

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

/** Hide the structured activity envelope in a Markdown comment before the readable fallback. */
export function encodeLearningDetail(input: LearningActivityEnvelopeInputV1): string {
  const envelope: LearningActivityEnvelopeV1 = { transport: TRANSPORT_PROTOCOL, ...input }
  return `${MARKER_PREFIX}${encodeBase64Url(JSON.stringify(envelope))}${MARKER_SUFFIX}\n${envelope.activity.fallbackMarkdown}`
}

/** Decode and revalidate a package-owned question detail; ordinary questions return undefined. */
export function decodeLearningDetail(detail: unknown): LearningActivityEnvelopeV1 | undefined {
  if (typeof detail !== 'string' || !detail.startsWith(MARKER_PREFIX)) return undefined
  const end = detail.indexOf(MARKER_SUFFIX, MARKER_PREFIX.length)
  if (end < 0) return undefined
  const json = decodeBase64Url(detail.slice(MARKER_PREFIX.length, end))
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
