import { describe, expect, it } from 'vitest'
import { createAssistantMessage, createUserMessage, type LlmModelInfo, type Message } from '@deepseek-ai/dsh-llm'
import {
  currentTurnHasImage,
  prepareHybridRequest,
  replaceImagesWithEvidence,
  selectHybridRoute,
} from '../src/hybrid-routing.ts'
import { formatVisualEvidenceForModel, parseVisualEvidence } from '../src/hybrid-evidence.ts'
import type { StructuredVisualEvidence } from '../src/types.ts'

const textModel: LlmModelInfo = {
  provider: 'deepseek',
  id: 'chat',
  name: 'Chat',
  inputModalities: ['text'],
}
const imageModel: LlmModelInfo = {
  provider: 'deepseek',
  id: 'vision',
  name: 'Vision',
  inputModalities: ['text', 'image'],
}
const config = { enabled: true, model: 'vision' }

function imageMessage(): Message {
  return createUserMessage({
    content: [{
      type: 'image',
      attachment: {
        attachmentId: 'att-1',
        mediaType: 'image/png',
        bytes: 10,
        width: 100,
        height: 50,
      },
    }],
    source: { kind: 'user' },
  })
}

function textMessage(text: string): Message {
  return createUserMessage({ content: [{ type: 'text', text }], source: { kind: 'user' } })
}

const evidence: StructuredVisualEvidence = {
  schemaVersion: 1,
  summary: 'A dialog',
  ocr: [{ text: 'Save', box: { x: 10, y: 20, width: 30, height: 12 } }],
  layout: [{ type: 'dialog', box: { x: 0, y: 0, width: 100, height: 50 } }],
  objects: [{ label: 'button', box: { x: 10, y: 20, width: 30, height: 12 } }],
  coordinates: [{ label: 'button', x: 25, y: 26 }],
  semantics: [{ subject: 'button', predicate: 'action', object: 'save' }],
}

describe('hybrid route selection', () => {
  it('passes ordinary text to the current model without consulting vision', () => {
    expect(selectHybridRoute({
      current: { provider: 'deepseek', model: 'chat' },
      catalog: [textModel, imageModel],
      vision: config,
      currentTurnMessages: [textMessage('hello')],
    })).toEqual({
      ok: true,
      kind: 'text',
      route: { provider: 'deepseek', model: 'chat' },
      hasImage: false,
    })
  })

  it('uses the current model natively when its catalog entry accepts images', () => {
    expect(selectHybridRoute({
      current: { provider: 'deepseek', model: 'vision' },
      catalog: [textModel, imageModel],
      vision: config,
      currentTurnMessages: [imageMessage()],
    })).toMatchObject({ ok: true, kind: 'native-image', hasImage: true })
  })

  it('selects the configured vision route only for an image round on text-only models', () => {
    const outcome = selectHybridRoute({
      current: { provider: 'deepseek', model: 'chat' },
      catalog: [textModel, imageModel],
      vision: config,
      currentTurnMessages: [imageMessage()],
    })
    expect(outcome).toEqual({
      ok: true,
      kind: 'vision-fallback',
      route: { provider: 'deepseek', model: 'chat' },
      visionRoute: { provider: 'deepseek', model: 'vision' },
      hasImage: true,
    })
  })

  it('does not keep a later pure-text turn on the vision route', () => {
    const history = [
      imageMessage(),
      createAssistantMessage({ content: [{ type: 'text', text: 'vision answer' }], source: { provider: 'deepseek', model: 'vision' } }),
      textMessage('follow up'),
    ]
    expect(currentTurnHasImage(history)).toBe(false)
    expect(selectHybridRoute({
      current: { provider: 'deepseek', model: 'chat' },
      catalog: [textModel, imageModel],
      vision: config,
      messages: history,
    })).toMatchObject({ ok: true, kind: 'text', hasImage: false })
  })
})

describe('structured visual evidence', () => {
  it('normalizes fenced provider JSON into all stable evidence fields', () => {
    const parsed = parseVisualEvidence('```json\n{"summary":"dialog","ocr":[{"text":"Save","bbox":[1,2,3,4]}],"layout":[{"kind":"button"}],"targets":["button"],"coordinates":[{"label":"save","x":2,"y":3}],"relations":[{"subject":"button","predicate":"action","object":"save"}]}\n```')
    expect(parsed).toEqual({
      schemaVersion: 1,
      summary: 'dialog',
      ocr: [{ text: 'Save', box: { x: 1, y: 2, width: 3, height: 4 } }],
      layout: [{ type: 'button' }],
      objects: [{ label: 'button' }],
      coordinates: [{ label: 'save', x: 2, y: 3 }],
      semantics: [{ subject: 'button', predicate: 'action', object: 'save' }],
    })
  })

  it('keeps prose responses useful and renders a deterministic wrapper', () => {
    const parsed = parseVisualEvidence('A red dialog with a Save button.')
    expect(parsed.summary).toBe('A red dialog with a Save button.')
    expect(formatVisualEvidenceForModel(parsed)).toContain('<visual_evidence schema_version="1">')
  })
})

describe('text-only evidence handoff', () => {
  it('rewrites transient request images while leaving original messages untouched', async () => {
    const original = imageMessage()
    const request = {
      provider: 'deepseek',
      model: 'chat',
      messages: [original],
    } as const
    const outcome = await prepareHybridRequest(request, {
      current: { provider: 'deepseek', model: 'chat' },
      catalog: [textModel, imageModel],
      vision: config,
      currentTurnMessages: [original],
      analyze: async () => evidence,
    })
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    expect(outcome.evidence).toEqual(evidence)
    expect(outcome.request.messages[0]?.content[0]).toMatchObject({ type: 'text' })
    expect(original.content[0]?.type).toBe('image')
  })

  it('reports a missing analyzer instead of silently forwarding images to text', async () => {
    const outcome = await prepareHybridRequest({
      provider: 'deepseek',
      model: 'chat',
      messages: [imageMessage()],
    }, {
      current: { provider: 'deepseek', model: 'chat' },
      catalog: [textModel, imageModel],
      vision: config,
    })
    expect(outcome).toMatchObject({ ok: false, reason: 'VISION_ANALYZER_UNAVAILABLE' })
  })

  it('can rewrite a full history without carrying old image blocks to a text adapter', () => {
    const old = imageMessage()
    const current = imageMessage()
    const rewritten = replaceImagesWithEvidence([old, textMessage('answer'), current], evidence, [current])
    expect(rewritten.flatMap(message => message.content).every(block => block.type !== 'image')).toBe(true)
  })
})
