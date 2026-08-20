import { describe, expect, it } from 'vitest'
import type { LlmModelInfo } from '@deepseek-ai/dsh-llm'
import {
  declaresImageInput,
  deniesImageInput,
  imageCapableModels,
  selectVisionRoute,
} from '../src/model-selection.ts'

const textOnly: LlmModelInfo = {
  provider: 'deepseek',
  id: 'deepseek-chat',
  name: 'DeepSeek Chat',
  inputModalities: ['text'],
}
const vision: LlmModelInfo = {
  provider: 'dashscope',
  id: 'qwen-vl-max',
  name: 'Qwen VL Max',
  inputModalities: ['text', 'image'],
}
const unknownCapability: LlmModelInfo = {
  provider: 'custom',
  id: 'mystery-v1',
  name: 'Mystery',
}

const enabled = { enabled: true, model: '' }

describe('image capability reading', () => {
  it('separates a declared image input from a declared denial', () => {
    expect(declaresImageInput(vision)).toBe(true)
    expect(declaresImageInput(textOnly)).toBe(false)
    expect(deniesImageInput(textOnly)).toBe(true)
  })

  it('treats an absent modality list as unknown rather than denied', () => {
    expect(declaresImageInput(unknownCapability)).toBe(false)
    expect(deniesImageInput(unknownCapability)).toBe(false)
    expect(imageCapableModels([textOnly, vision, unknownCapability])).toEqual([vision, unknownCapability])
  })
})

describe('vision route selection', () => {
  it('refuses before looking at the catalog when disabled', () => {
    const outcome = selectVisionRoute({ ...enabled, enabled: false }, [vision])
    expect(outcome).toMatchObject({ ok: false, reason: 'VISION_BRIDGE_DISABLED' })
  })

  it('discovers the first model declaring image input', () => {
    expect(selectVisionRoute(enabled, [textOnly, vision])).toEqual({
      ok: true,
      route: { provider: 'dashscope', model: 'qwen-vl-max' },
    })
  })

  it('never auto-selects a model of unknown capability', () => {
    const outcome = selectVisionRoute(enabled, [textOnly, unknownCapability])
    expect(outcome).toMatchObject({ ok: false, reason: 'VISION_MODEL_UNAVAILABLE' })
  })

  it('honours a pinned model whose capability is merely unknown', () => {
    expect(selectVisionRoute({ ...enabled, model: 'mystery-v1' }, [unknownCapability])).toEqual({
      ok: true,
      route: { provider: 'custom', model: 'mystery-v1' },
    })
  })

  it('rejects a pinned model the catalog says cannot read images', () => {
    const outcome = selectVisionRoute({ ...enabled, model: 'deepseek-chat' }, [textOnly, vision])
    expect(outcome).toMatchObject({ ok: false, reason: 'VISION_MODEL_NOT_IMAGE_CAPABLE' })
  })

  it('requires a pinned model to belong to a configured provider', () => {
    expect(selectVisionRoute({ ...enabled, model: 'unlisted' }, [])).toMatchObject({
      ok: false,
      reason: 'VISION_MODEL_UNAVAILABLE',
    })
  })
})
