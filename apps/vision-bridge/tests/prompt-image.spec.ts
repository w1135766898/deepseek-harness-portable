import { afterEach, describe, expect, it, vi } from 'vitest'
import { createPromptImageTextHandler } from '../src/prompt-image.ts'
import type { VisionConfig } from '../src/types.ts'

const CONFIG: Required<VisionConfig> = {
  enabled: true,
  provider: 'compatible',
  model: 'vision-mini',
  baseURL: 'https://vision.example/v1',
  apiKey: 'test-key',
  maxImageBytes: 1024,
  timeoutMs: 5000,
  prompt: '',
}

const REQUEST = {
  data: Uint8Array.of(1, 2, 3),
  mediaType: 'image/png' as const,
  name: 'dialog&error.png',
  prompt: 'Read the error code',
  provider: 'deepseek-official',
  model: 'deepseek-chat',
}

afterEach(() => { vi.restoreAllMocks() })

describe('pasted prompt image routing', () => {
  it('returns a clear configuration rejection without calling the provider', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const handler = createPromptImageTextHandler(() => ({ ...CONFIG, apiKey: '' }))
    await expect(handler(REQUEST)).resolves.toEqual({
      kind: 'reject',
      message: expect.stringContaining('no API key configured'),
      reason: 'VISION_BRIDGE_NOT_CONFIGURED',
    })
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('returns logged analysis text for the receiving text-only model', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ choices: [{ message: { content: 'Error code E42 is visible.' } }] }),
    } as never)
    const handler = createPromptImageTextHandler(() => CONFIG)

    await expect(handler(REQUEST)).resolves.toEqual({
      kind: 'accept',
      text: '<image_analysis source="vision-bridge" model="vision-mini" name="dialog&amp;error.png">\nError code E42 is visible.\n</image_analysis>',
    })
    const body = JSON.parse(fetchSpy.mock.calls[0]![1]!.body as string)
    expect(body.messages[1].content[0].text).toBe('Read the error code')
    expect(body.messages[1].content[1].image_url.url).toBe('data:image/png;base64,AQID')
  })

  it('surfaces provider failures as a stable attachment rejection', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 503,
      text: () => Promise.resolve('temporarily unavailable'),
    } as never)
    const handler = createPromptImageTextHandler(() => CONFIG)
    await expect(handler(REQUEST)).resolves.toEqual({
      kind: 'reject',
      message: expect.stringContaining('HTTP 503'),
      reason: 'VISION_ANALYSIS_FAILED',
    })
  })
})
