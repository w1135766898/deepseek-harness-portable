import { describe, expect, it, vi } from 'vitest'
import { createUserMessage, type LlmModelInfo, type Message, type StreamChunk } from '@deepseek-ai/dsh-llm'
import { installHybridVisionRouting } from '../src/hybrid-host.ts'

const textModel: LlmModelInfo = { provider: 'p', id: 'chat', name: 'Chat', inputModalities: ['text'] }
const visionModel: LlmModelInfo = { provider: 'p', id: 'vision', name: 'Vision', inputModalities: ['text', 'image'] }

function imageMessage(): Message {
  return createUserMessage({
    content: [{
      type: 'image',
      attachment: { attachmentId: 'a1', mediaType: 'image/png', bytes: 1, width: 10, height: 10 },
    }],
    source: { kind: 'user' },
  })
}

describe('hybrid host installer', () => {
  it('captures the assembled route, replaces image steps durably, and bridges admission', async () => {
    const listeners = new Map<string, (...args: any[]) => unknown>()
    const ctx = {
      on(event: string, listener: (...args: any[]) => unknown) {
        listeners.set(event, listener)
        return () => listeners.delete(event)
      },
    }
    let seq = 0
    const append = vi.fn((_type: string, _message: Message, options: unknown) => ({ seq: seq++, options }))
    const stream = vi.fn(async function * (): AsyncGenerator<StreamChunk> {
      yield { type: 'text-delta', index: 0, text: '{"summary":"screen","objects":["button"]}' }
      yield { type: 'finish', reason: { kind: 'stop' } }
    })
    const runtime = {
      listProviders: () => [{ id: 'p' }],
      listModels: async () => [textModel, visionModel],
      stream,
      resolveModelInfo: async () => textModel,
    }
    const installation = installHybridVisionRouting(ctx, () => ({ enabled: true, model: 'vision' }), runtime)
    const agent = { options: { provider: 'p', model: 'chat' }, session: { append } }
    const assembled = listeners.get('system-prompt/assemble')!
    await assembled(
      { variables: {} },
      { agent },
      async () => ({ variables: { provider: 'p', model: 'chat' } }),
    )
    const preStep = listeners.get('agent/pre-step')!
    const decision = await preStep(
      { agent, messages: [imageMessage()], signal: new AbortController().signal },
      async () => ({ kind: 'enter', messages: [imageMessage()] }),
    ) as { kind: string; messages: Message[] }

    expect(decision.messages).toHaveLength(1)
    expect(decision.messages[0]?.content).toEqual([{
      type: 'text',
      text: 'Answer the user\'s request using the structured visual evidence already added above.',
    }])
    expect(append).toHaveBeenCalledTimes(2)
    expect(append.mock.calls[1]?.[2]).toMatchObject({
      surfaceOp: { op: 'replace', start: 0, end: 0 },
      sourceEventSeqs: [0],
    })
    expect(stream).toHaveBeenCalledWith(expect.objectContaining({ provider: 'p', model: 'vision' }))
    await expect(installation.resolveModelInfo('p', 'chat')).resolves.toMatchObject({
      inputModalities: ['text', 'image'],
    })
    installation.dispose()
  })

  it('fails the image step when a text route loses its fallback', async () => {
    const listeners = new Map<string, (...args: any[]) => unknown>()
    const ctx = {
      on(event: string, listener: (...args: any[]) => unknown) {
        listeners.set(event, listener)
        return () => listeners.delete(event)
      },
    }
    const append = vi.fn(() => ({ seq: 0 }))
    const stream = vi.fn(async function * (): AsyncGenerator<StreamChunk> {
      yield { type: 'finish', reason: { kind: 'stop' } }
    })
    const runtime = {
      listProviders: () => [{ id: 'p' }],
      listModels: async () => [textModel],
      stream,
      resolveModelInfo: async () => textModel,
    }
    const installation = installHybridVisionRouting(ctx, () => ({ enabled: true, model: '' }), runtime)
    const agent = { options: { provider: 'p', model: 'chat' }, session: { append } }
    const preStep = listeners.get('agent/pre-step')!

    await expect(preStep(
      { agent, messages: [imageMessage()], signal: new AbortController().signal },
      async () => ({ kind: 'enter', messages: [imageMessage()] }),
    )).rejects.toThrow('No configured provider reports an image-capable model')
    expect(append).not.toHaveBeenCalled()
    expect(stream).not.toHaveBeenCalled()
    installation.dispose()
  })
})
