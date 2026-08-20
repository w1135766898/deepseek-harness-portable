import { describe, expect, it } from 'vitest'
import { describeVisionRoute } from '../src/client/vision-route.ts'

describe('Vision Bridge selection summary', () => {
  it('reports automatic selection when nothing is pinned', () => {
    expect(describeVisionRoute(true, '')).toEqual({ kind: 'auto' })
  })

  it('reports a pinned model', () => {
    expect(describeVisionRoute(true, 'qwen-vl-max')).toEqual({ kind: 'pinned', model: 'qwen-vl-max' })
  })

  it('treats surrounding whitespace as an empty pin', () => {
    expect(describeVisionRoute(true, '  ')).toEqual({ kind: 'auto' })
  })

  it('reports disabled ahead of any selection detail', () => {
    expect(describeVisionRoute(false, 'qwen-vl-max')).toEqual({ kind: 'disabled' })
  })
})
