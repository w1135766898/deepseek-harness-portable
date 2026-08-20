import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { ImageAttachmentLimits, ImageAttachmentRef, SaveImageAttachment } from '@deepseek-ai/dsh-attachment'
import type { GenerateOptions, LlmModelInfo, StreamChunk } from '@deepseek-ai/dsh-llm'
import {
  collectAnalysis,
  executeViewImage,
  mediaTypeForPath,
  renderViewImageContent,
  visionModelCatalog,
  type VisionRuntime,
} from '../src/view-image.ts'
import type { VisionConfig } from '../src/types.ts'

const LIMITS: ImageAttachmentLimits = {
  maxImageBytes: 1024 * 1024,
  maxImagesPerMessage: 4,
  maxMessageImageBytes: 4 * 1024 * 1024,
  maxImagePixels: 4096 * 4096,
  maxImageDimension: 4096,
  mediaTypes: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'],
}

const VISION_MODEL: LlmModelInfo = {
  provider: 'dashscope',
  id: 'qwen-vl-max',
  name: 'Qwen VL Max',
  inputModalities: ['text', 'image'],
}

function ref(bytes: number): ImageAttachmentRef {
  return {
    attachmentId: 'att-1' as ImageAttachmentRef['attachmentId'],
    mediaType: 'image/png',
    bytes,
    width: 64,
    height: 48,
  }
}

async function* chunks(...items: StreamChunk[]): AsyncIterable<StreamChunk> {
  for (const item of items) yield item
}

interface RuntimeOptions {
  saveImages?: (inputs: readonly SaveImageAttachment[]) => Promise<readonly ImageAttachmentRef[]>
  stream?: (options: GenerateOptions) => AsyncIterable<StreamChunk>
  models?: LlmModelInfo[]
  limits?: ImageAttachmentLimits
}

/** Record of what the fake runtime was asked to do. */
interface RuntimeProbe {
  runtime: VisionRuntime
  calls: GenerateOptions[]
  saved: SaveImageAttachment[]
}

function fakeRuntime(options: RuntimeOptions = {}): RuntimeProbe {
  const calls: GenerateOptions[] = []
  const saved: SaveImageAttachment[] = []
  const models = options.models ?? [VISION_MODEL]
  const runtime: VisionRuntime = {
    attachments: {
      imageLimits: options.limits ?? LIMITS,
      saveImages: async (inputs) => {
        saved.push(...inputs)
        return options.saveImages === undefined
          ? [ref(inputs[0]?.data.byteLength ?? 0)]
          : options.saveImages(inputs)
      },
    },
    llm: {
      listProviders: () => [...new Set(models.map(model => model.provider))].map(id => ({ id, name: id })),
      listModels: async (provider: string) => models.filter(model => model.provider === provider),
      stream: (generate: GenerateOptions) => {
        calls.push(generate)
        return options.stream === undefined
          ? chunks({ type: 'text-delta', index: 0, text: 'a red dialog' }, { type: 'finish', reason: { kind: 'stop' } })
          : options.stream(generate)
      },
    },
  } as VisionRuntime
  return { runtime, calls, saved }
}

const baseConfig: Required<VisionConfig> = {
  enabled: true,
  model: '',
}

describe('view-image', () => {
  let testDir: string
  let samplePng: string
  let sampleTxt: string
  let stubExec: never

  beforeEach(async () => {
    testDir = join(tmpdir(), `vision-test-${String(Date.now())}-${Math.random().toString(36).slice(2)}`)
    await mkdir(testDir, { recursive: true })
    samplePng = join(testDir, 'test.png')
    sampleTxt = join(testDir, 'test.txt')
    await writeFile(samplePng, Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]))
    await writeFile(sampleTxt, 'hello text file')
    stubExec = {
      signal: new AbortController().signal,
      agent: { session: { header: { cwd: testDir } } },
    } as never
  })

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true })
  })

  it('maps supported extensions onto attachment media types', () => {
    expect(mediaTypeForPath('foo.png')).toBe('image/png')
    expect(mediaTypeForPath('bar.JPG')).toBe('image/jpeg')
    expect(mediaTypeForPath('pic.webp')).toBe('image/webp')
    expect(mediaTypeForPath('anim.gif')).toBe('image/gif')
    expect(mediaTypeForPath('doc.pdf')).toBeUndefined()
  })

  it('reports a disabled bridge without touching the disk', async () => {
    const probe = fakeRuntime()
    const result = await executeViewImage(
      { path: 'missing.png' },
      stubExec,
      () => ({ ...baseConfig, enabled: false }),
      probe.runtime,
    )
    expect(result).toMatchObject({ isError: true, reason: 'VISION_BRIDGE_DISABLED' })
    expect(probe.saved).toHaveLength(0)
  })

  it('rejects an unsupported extension before reading the file', async () => {
    const probe = fakeRuntime()
    const result = await executeViewImage({ path: sampleTxt }, stubExec, () => baseConfig, probe.runtime)
    expect(result).toMatchObject({ isError: true, reason: 'VISION_UNSUPPORTED_MEDIA_TYPE' })
    expect(probe.saved).toHaveLength(0)
  })

  it('resolves a relative path against the session workspace', async () => {
    const probe = fakeRuntime()
    const result = await executeViewImage({ path: 'test.png' }, stubExec, () => baseConfig, probe.runtime)
    expect(result.isError).toBeUndefined()
    expect(result.path).toBe(samplePng)
  })

  it('reports an unreadable path as a result rather than a throw', async () => {
    const probe = fakeRuntime()
    const result = await executeViewImage({ path: 'nope.png' }, stubExec, () => baseConfig, probe.runtime)
    expect(result).toMatchObject({ isError: true, reason: 'VISION_IMAGE_UNREADABLE' })
  })

  it('enforces the attachment store limit before loading the bytes', async () => {
    const probe = fakeRuntime({ limits: { ...LIMITS, maxImageBytes: 4 } })
    const result = await executeViewImage({ path: samplePng }, stubExec, () => baseConfig, probe.runtime)
    expect(result).toMatchObject({ isError: true, reason: 'VISION_IMAGE_TOO_LARGE', bytes: 8 })
    expect(probe.saved).toHaveLength(0)
  })

  it('surfaces an attachment admission failure', async () => {
    const probe = fakeRuntime({
      saveImages: () => Promise.reject(new Error('image exceeds the pixel bound')),
    })
    const result = await executeViewImage({ path: samplePng }, stubExec, () => baseConfig, probe.runtime)
    expect(result).toMatchObject({ isError: true, reason: 'VISION_IMAGE_REJECTED' })
    expect(result.text).toContain('pixel bound')
  })

  it('sends the committed reference as an image block on the discovered route', async () => {
    const probe = fakeRuntime()
    const result = await executeViewImage(
      { path: samplePng, prompt: 'Read the error code' },
      stubExec,
      () => baseConfig,
      probe.runtime,
    )
    expect(result).toMatchObject({
      provider: 'dashscope',
      model: 'qwen-vl-max',
      text: 'a red dialog',
      bytes: 8,
      width: 64,
      height: 48,
    })
    expect(probe.saved[0]).toMatchObject({ mediaType: 'image/png', name: 'test.png' })
    const call = probe.calls[0]
    expect(call?.messages[0]?.content).toEqual([
      { type: 'text', text: 'Read the error code' },
      { type: 'image', attachment: ref(8) },
    ])
  })

  it('reports a route failure without calling the model', async () => {
    const probe = fakeRuntime({
      models: [{ provider: 'deepseek', id: 'deepseek-chat', name: 'Chat', inputModalities: ['text'] }],
    })
    const result = await executeViewImage({ path: samplePng }, stubExec, () => baseConfig, probe.runtime)
    expect(result).toMatchObject({ isError: true, reason: 'VISION_MODEL_UNAVAILABLE' })
    expect(probe.calls).toHaveLength(0)
  })

  it('turns a terminal stream failure into an error result that keeps the route', async () => {
    const probe = fakeRuntime({
      stream: () => chunks({
        type: 'finish',
        reason: { kind: 'error', failure: { message: 'provider is down', code: 'PROVIDER_ERROR' } },
      }),
    })
    const result = await executeViewImage({ path: samplePng }, stubExec, () => baseConfig, probe.runtime)
    expect(result).toMatchObject({ isError: true, reason: 'PROVIDER_ERROR', model: 'qwen-vl-max' })
    expect(result.text).toContain('provider is down')
  })

  it('rejects an empty path argument as a caller error', async () => {
    const probe = fakeRuntime()
    await expect(executeViewImage({ path: '  ' }, stubExec, () => baseConfig, probe.runtime))
      .rejects.toThrow(/non-empty string/)
  })
})

describe('stream draining', () => {
  it('assembles interleaved text deltas', async () => {
    const outcome = await collectAnalysis(chunks(
      { type: 'block-start', index: 0, blockType: 'text' },
      { type: 'text-delta', index: 0, text: 'hello ' },
      { type: 'text-delta', index: 0, text: 'world' },
      { type: 'finish', reason: { kind: 'stop' } },
    ))
    expect(outcome).toEqual({ ok: true, text: 'hello world' })
  })

  it('treats an abort as a failure carrying the provider code', async () => {
    const outcome = await collectAnalysis(chunks(
      { type: 'text-delta', index: 0, text: 'partial' },
      { type: 'finish', reason: { kind: 'aborted', failure: { message: 'timed out', code: 'ABORTED' } } },
    ))
    expect(outcome).toMatchObject({ ok: false, reason: 'ABORTED' })
  })

  it('reports an empty response rather than returning blank analysis', async () => {
    const outcome = await collectAnalysis(chunks({ type: 'finish', reason: { kind: 'stop' } }))
    expect(outcome).toMatchObject({ ok: false, reason: 'VISION_ANALYSIS_EMPTY' })
  })
})

describe('catalog assembly', () => {
  it('skips a provider that cannot list its models', async () => {
    const catalog = await visionModelCatalog({
      listProviders: () => [{ id: 'broken', name: 'Broken' }, { id: 'dashscope', name: 'DashScope' }],
      listModels: async (provider: string) => {
        if (provider === 'broken') throw new Error('unauthorized')
        return [VISION_MODEL]
      },
      stream: () => chunks(),
    } as unknown as VisionRuntime['llm'])
    expect(catalog).toEqual([VISION_MODEL])
  })
})

describe('model-facing rendering', () => {
  it('wraps a successful analysis with its path and model', () => {
    expect(renderViewImageContent({
      text: 'a chart',
      provider: 'dashscope',
      model: 'qwen-vl-max',
      path: '/tmp/a.png',
      bytes: 8,
    })).toEqual([{ type: 'text', text: '<image_analysis path="/tmp/a.png" model="qwen-vl-max">\na chart\n</image_analysis>' }])
  })

  it('passes a failure through unwrapped', () => {
    expect(renderViewImageContent({
      text: 'Error: nope',
      provider: '',
      model: '',
      path: '/tmp/a.png',
      bytes: 0,
      isError: true,
    })).toEqual([{ type: 'text', text: 'Error: nope' }])
  })
})
