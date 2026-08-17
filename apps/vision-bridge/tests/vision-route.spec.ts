import { describe, expect, it } from 'vitest'
import { describeVisionRoute } from '../src/client/vision-route.ts'

describe('Vision Bridge data-route summary', () => {
  it('keeps loopback endpoints visibly local', () => {
    expect(describeVisionRoute(true, 'http://127.0.0.1:11434/v1')).toEqual({
      kind: 'local',
      endpoint: '127.0.0.1:11434',
    })
    expect(describeVisionRoute(true, 'http://localhost:8080/v1')).toEqual({
      kind: 'local',
      endpoint: 'localhost:8080',
    })
  })

  it('labels external endpoints without making a readiness claim', () => {
    expect(describeVisionRoute(true, 'https://api.openai.com/v1')).toEqual({
      kind: 'remote',
      endpoint: 'api.openai.com',
    })
  })

  it('distinguishes disabled and malformed configurations', () => {
    expect(describeVisionRoute(false, 'https://api.openai.com/v1')).toEqual({ kind: 'disabled' })
    expect(describeVisionRoute(true, 'api.openai.com/v1')).toEqual({ kind: 'invalid' })
    expect(describeVisionRoute(true, 'file:///tmp/image')).toEqual({ kind: 'invalid' })
  })
})
