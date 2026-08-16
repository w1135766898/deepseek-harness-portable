import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { writeFile, unlink, mkdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { executeViewImage, mimeTypeForPath, renderViewImageContent } from '../src/view-image.ts'
import type { VisionConfig } from '../src/types.ts'

describe('view-image', () => {
  let testDir: string
  let samplePng: string
  let sampleTxt: string

  const baseConfig: Required<VisionConfig> = {
    enabled: true,
    provider: 'compatible',
    model: 'gpt-4o-mini',
    baseURL: 'https://api.openai.com/v1',
    apiKey: 'test-sk-1234567890',
    maxImageBytes: 1024 * 1024,
    timeoutMs: 5000,
    prompt: 'Default test prompt',
  }

  const stubExec = {
    signal: new AbortController().signal,
    agent: {
      workspace: process.cwd(),
    },
  } as never

  beforeEach(async () => {
    testDir = join(tmpdir(), `vision-test-${Date.now()}-${Math.random().toString(36).slice(2)}`)
    await mkdir(testDir, { recursive: true })
    samplePng = join(testDir, 'test.png')
    sampleTxt = join(testDir, 'test.txt')
    await writeFile(samplePng, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) // png magic
    await writeFile(sampleTxt, 'hello text file')
  })

  afterEach(async () => {
    vi.restoreAllMocks()
    await rm(testDir, { recursive: true, force: true })
  })

  it('detects supported image MIME types correctly', () => {
    expect(mimeTypeForPath('foo.png')).toBe('image/png')
    expect(mimeTypeForPath('bar.jpg')).toBe('image/jpeg')
    expect(mimeTypeForPath('baz.jpeg')).toBe('image/jpeg')
    expect(mimeTypeForPath('pic.webp')).toBe('image/webp')
    expect(mimeTypeForPath('anim.gif')).toBe('image/gif')
    expect(mimeTypeForPath('doc.pdf')).toBeUndefined()
    expect(mimeTypeForPath('code.ts')).toBeUndefined()
  })

  it('returns clean error if plugin is disabled', async () => {
    const res = await executeViewImage(
      { path: samplePng },
      stubExec,
      () => ({ ...baseConfig, enabled: false }),
    )
    expect(res.isError).toBe(true)
    expect(res.text).toContain('Vision Bridge is currently disabled')
  })

  it('returns clean error if API key is missing for non-ollama provider', async () => {
    const res = await executeViewImage(
      { path: samplePng },
      stubExec,
      () => ({ ...baseConfig, apiKey: '' }),
    )
    expect(res.isError).toBe(true)
    expect(res.text).toContain('no API key configured')
  })

  it('refuses unsupported file extensions', async () => {
    const res = await executeViewImage(
      { path: sampleTxt },
      stubExec,
      () => baseConfig,
    )
    expect(res.isError).toBe(true)
    expect(res.text).toContain('only supports PNG, JPEG, WebP, and GIF')
  })

  it('handles missing file gracefully', async () => {
    const res = await executeViewImage(
      { path: join(testDir, 'non-existent.png') },
      stubExec,
      () => baseConfig,
    )
    expect(res.isError).toBe(true)
    expect(res.text).toContain('Image file not found')
  })

  it('handles file size limit exceeding', async () => {
    const res = await executeViewImage(
      { path: samplePng },
      stubExec,
      () => ({ ...baseConfig, maxImageBytes: 4 }),
    )
    expect(res.isError).toBe(true)
    expect(res.text).toContain('exceeds configured limit')
  })

  it('successfully calls vision API and parses description', async () => {
    const mockResponse = {
      choices: [
        {
          message: {
            content: 'This is a valid test image with a red square.',
          },
        },
      ],
    }

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockResponse,
    } as never)

    const res = await executeViewImage(
      { path: samplePng, prompt: 'What is in this image?' },
      stubExec,
      () => baseConfig,
    )

    expect(fetchSpy).toHaveBeenCalledOnce()
    const callArgs = fetchSpy.mock.calls[0]
    expect(callArgs[0]).toBe('https://api.openai.com/v1/chat/completions')

    const body = JSON.parse(callArgs[1]?.body as string)
    expect(body.model).toBe('gpt-4o-mini')
    expect(body.messages[1].content[0].text).toBe('What is in this image?')
    expect(body.messages[1].content[1].image_url.url).toContain('data:image/png;base64,')

    expect(res.isError).toBeUndefined()
    expect(res.text).toBe('This is a valid test image with a red square.')
    expect(res.model).toBe('gpt-4o-mini')
  })

  it('handles HTTP error responses without leaking credentials', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => 'Unauthorized: Invalid authentication key provided.',
    } as never)

    const res = await executeViewImage(
      { path: samplePng },
      stubExec,
      () => baseConfig,
    )

    expect(res.isError).toBe(true)
    expect(res.text).toContain('HTTP 401')
    expect(res.text).not.toContain('test-sk-1234567890')
  })

  it('renders content format correctly for model context', () => {
    const successBlocks = renderViewImageContent({
      text: 'Visual analysis details',
      model: 'qwen-vl',
      path: '/path/to/img.png',
      bytes: 1024,
    })
    expect(successBlocks).toHaveLength(1)
    expect(successBlocks[0].type).toBe('text')
    expect(successBlocks[0].text).toContain('<image_analysis path="/path/to/img.png" model="qwen-vl">')

    const errorBlocks = renderViewImageContent({
      text: 'Error: file not found',
      model: 'qwen-vl',
      path: '/path/to/img.png',
      bytes: 0,
      isError: true,
    })
    expect(errorBlocks[0].text).toBe('Error: file not found')
  })
})
