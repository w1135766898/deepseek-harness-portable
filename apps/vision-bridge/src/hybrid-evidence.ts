/** Parse and render the provider-neutral evidence used by hybrid routing. */

import type {
  StructuredVisualEvidence,
  VisionBoundingBox,
  VisionCoordinateEvidence,
  VisionLayoutEvidence,
  VisionObjectEvidence,
  VisionOcrEvidence,
  VisionSemanticEvidence,
} from './types.ts'

/** Current wire/schema version for visual evidence. */
export const VISUAL_EVIDENCE_SCHEMA_VERSION = 1 as const

type JsonRecord = Record<string, unknown>

function record(value: unknown): JsonRecord | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as JsonRecord
    : undefined
}

function textValue(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const text = value.trim()
  return text === '' ? undefined : text
}

function firstText(input: JsonRecord, keys: readonly string[]): string | undefined {
  for (const key of keys) {
    const text = textValue(input[key])
    if (text !== undefined) return text
  }
  return undefined
}

function numberValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function firstNumber(input: JsonRecord, keys: readonly string[]): number | undefined {
  for (const key of keys) {
    const number = numberValue(input[key])
    if (number !== undefined) return number
  }
  return undefined
}

function optionalConfidence(input: JsonRecord): number | undefined {
  return firstNumber(input, ['confidence', 'score', 'probability'])
}

/** Normalize the common x/y/width/height and left/top/right/bottom variants. */
function normalizeBox(value: unknown): VisionBoundingBox | undefined {
  if (Array.isArray(value) && value.length >= 4) {
    const [x, y, width, height] = value
    const values = [numberValue(x), numberValue(y), numberValue(width), numberValue(height)]
    if (values.every(item => item !== undefined)) {
      return { x: values[0]!, y: values[1]!, width: values[2]!, height: values[3]! }
    }
    return undefined
  }
  const input = record(value)
  if (input === undefined) return undefined
  const x = firstNumber(input, ['x', 'left', 'x1'])
  const y = firstNumber(input, ['y', 'top', 'y1'])
  const right = firstNumber(input, ['right', 'x2'])
  const bottom = firstNumber(input, ['bottom', 'y2'])
  const width = firstNumber(input, ['width', 'w']) ?? (x === undefined || right === undefined ? undefined : right - x)
  const height = firstNumber(input, ['height', 'h']) ?? (y === undefined || bottom === undefined ? undefined : bottom - y)
  if (x === undefined || y === undefined || width === undefined || height === undefined) return undefined
  const normalized = input.normalized === true
    || input.coordinateSpace === 'normalized'
    || input.units === 'normalized'
  return { x, y, width, height, ...normalized ? { normalized: true } : {} }
}

function boxFrom(input: JsonRecord): VisionBoundingBox | undefined {
  return normalizeBox(input.box) ?? normalizeBox(input.bbox) ?? normalizeBox(input.boundingBox)
}

function normalizeOcr(value: unknown): VisionOcrEvidence[] {
  const values = Array.isArray(value) ? value : value === undefined ? [] : [value]
  return values.flatMap((item) => {
    if (typeof item === 'string') {
      const text = textValue(item)
      return text === undefined ? [] : [{ text }]
    }
    const input = record(item)
    if (input === undefined) return []
    const text = firstText(input, ['text', 'value', 'content', 'transcription'])
    if (text === undefined) return []
    const box = boxFrom(input)
    const language = firstText(input, ['language', 'lang'])
    return [{
      text,
      ...optionalConfidence(input) === undefined ? {} : { confidence: optionalConfidence(input) },
      ...box === undefined ? {} : { box },
      ...language === undefined ? {} : { language },
    }]
  })
}

function normalizeLayout(value: unknown): VisionLayoutEvidence[] {
  const values = Array.isArray(value) ? value : value === undefined ? [] : [value]
  return values.flatMap((item) => {
    if (typeof item === 'string') {
      const text = textValue(item)
      return text === undefined ? [] : [{ type: 'region', label: text }]
    }
    const input = record(item)
    if (input === undefined) return []
    const type = firstText(input, ['type', 'kind', 'category', 'role']) ?? 'region'
    const label = firstText(input, ['label', 'name', 'title'])
    const text = firstText(input, ['text', 'content', 'value'])
    const order = firstNumber(input, ['order', 'readingOrder', 'index'])
    const box = boxFrom(input)
    return [{
      type,
      ...label === undefined ? {} : { label },
      ...text === undefined ? {} : { text },
      ...box === undefined ? {} : { box },
      ...order === undefined ? {} : { order },
    }]
  })
}

function normalizeAttributes(value: unknown): Record<string, string> | undefined {
  const input = record(value)
  if (input === undefined) return undefined
  const attributes: Record<string, string> = {}
  for (const [key, item] of Object.entries(input)) {
    if (typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean') {
      attributes[key] = String(item)
    }
  }
  return Object.keys(attributes).length === 0 ? undefined : attributes
}

function normalizeObjects(value: unknown): VisionObjectEvidence[] {
  const values = Array.isArray(value) ? value : value === undefined ? [] : [value]
  return values.flatMap((item) => {
    if (typeof item === 'string') {
      const label = textValue(item)
      return label === undefined ? [] : [{ label }]
    }
    const input = record(item)
    if (input === undefined) return []
    const label = firstText(input, ['label', 'name', 'object', 'target', 'type', 'category'])
    if (label === undefined) return []
    const confidence = optionalConfidence(input)
    const box = boxFrom(input)
    const attributes = normalizeAttributes(input.attributes ?? input.properties)
    return [{
      label,
      ...confidence === undefined ? {} : { confidence },
      ...box === undefined ? {} : { box },
      ...attributes === undefined ? {} : { attributes },
    }]
  })
}

function normalizeCoordinates(value: unknown): VisionCoordinateEvidence[] {
  const values: unknown[] = Array.isArray(value)
    ? value
    : value === undefined
      ? []
      : [value]
  return values.flatMap((item) => {
    if (Array.isArray(item) && item.length >= 2) {
      const x = numberValue(item[0])
      const y = numberValue(item[1])
      return x === undefined || y === undefined ? [] : [{ label: 'point', x, y }]
    }
    const input = record(item)
    if (input === undefined) return []
    const x = firstNumber(input, ['x', 'left', 'longitude'])
    const y = firstNumber(input, ['y', 'top', 'latitude'])
    if (x === undefined || y === undefined) return []
    const label = firstText(input, ['label', 'name', 'target', 'object']) ?? 'point'
    const normalized = input.normalized === true
      || input.coordinateSpace === 'normalized'
      || input.units === 'normalized'
    return [{ label, x, y, ...normalized ? { normalized: true } : {} }]
  })
}

function normalizeSemantics(value: unknown): VisionSemanticEvidence[] {
  const values = Array.isArray(value) ? value : value === undefined ? [] : [value]
  return values.flatMap((item) => {
    if (typeof item === 'string') {
      const object = textValue(item)
      return object === undefined ? [] : [{ subject: 'image', predicate: 'description', object }]
    }
    const input = record(item)
    if (input === undefined) return []
    const subject = firstText(input, ['subject', 'from', 'source'])
    const predicate = firstText(input, ['predicate', 'relation', 'relationship', 'kind'])
    const object = firstText(input, ['object', 'to', 'target', 'value', 'description'])
    if (subject === undefined || predicate === undefined || object === undefined) return []
    const confidence = optionalConfidence(input)
    return [{ subject, predicate, object, ...confidence === undefined ? {} : { confidence } }]
  })
}

/**
 * Extract the first balanced JSON object/array from a provider response.
 * Providers commonly wrap JSON in a markdown fence or a short preamble.
 */
function jsonCandidate(text: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text)
  const source = (fenced?.[1] ?? text).trim()
  try {
    return JSON.parse(source) as unknown
  } catch {
    // Continue with a balanced scan below.
  }

  for (let start = 0; start < source.length; start += 1) {
    if (source[start] !== '{' && source[start] !== '[') continue
    const stack: string[] = []
    let quoted = false
    let escaped = false
    for (let index = start; index < source.length; index += 1) {
      const character = source[index]
      if (quoted) {
        if (escaped) escaped = false
        else if (character === '\\') escaped = true
        else if (character === '"') quoted = false
        continue
      }
      if (character === '"') {
        quoted = true
        continue
      }
      if (character === '{' || character === '[') stack.push(character)
      else if (character === '}' || character === ']') {
        const expected = character === '}' ? '{' : '['
        if (stack.pop() !== expected) break
        if (stack.length === 0) {
          try {
            return JSON.parse(source.slice(start, index + 1)) as unknown
          } catch {
            break
          }
        }
      }
    }
  }
  return undefined
}

/**
 * Parse arbitrary vision output into the stable evidence shape.
 *
 * Parsing is intentionally loss-tolerant: a provider that returns prose still
 * gives the text model a useful `summary`, while structured fields remain
 * deterministic empty arrays instead of changing shape between providers.
 */
export function parseVisualEvidence(input: unknown): StructuredVisualEvidence {
  const sourceText = typeof input === 'string' ? input.trim() : ''
  const candidate = typeof input === 'string' ? jsonCandidate(input) : input
  const object = record(candidate)
  const summary = object === undefined
    ? sourceText
    : firstText(object, ['summary', 'description', 'caption', 'overview']) ?? ''
  const coordinates = object?.coordinates ?? object?.points ?? object?.landmarks
  const semantics = object?.semantics ?? object?.relations ?? object?.relationships
  return {
    schemaVersion: VISUAL_EVIDENCE_SCHEMA_VERSION,
    summary,
    ocr: normalizeOcr(object?.ocr ?? object?.textRegions ?? object?.text),
    layout: normalizeLayout(object?.layout ?? object?.regions ?? object?.structure),
    objects: normalizeObjects(object?.objects ?? object?.targets ?? object?.detections),
    coordinates: normalizeCoordinates(coordinates),
    semantics: normalizeSemantics(semantics),
  }
}

/** Alias that reads naturally at a response boundary. */
export const parseVisualEvidenceResponse = parseVisualEvidence

/** Serialize only the canonical evidence keys in a stable order. */
export function serializeVisualEvidence(input: StructuredVisualEvidence | unknown): string {
  return JSON.stringify(parseVisualEvidence(input))
}

/** Render evidence as a clearly delimited model-facing text block. */
export function formatVisualEvidenceForModel(input: StructuredVisualEvidence | unknown): string {
  const evidence = parseVisualEvidence(input)
  return `<visual_evidence schema_version="${String(evidence.schemaVersion)}">\n${JSON.stringify(evidence, null, 2)}\n</visual_evidence>`
}

/** Short alias for callers that already use the evidence vocabulary. */
export const renderVisualEvidence = formatVisualEvidenceForModel
