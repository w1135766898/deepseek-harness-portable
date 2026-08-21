import { describe, expect, it } from 'vitest'
import { describeVisionRoute, planVisionTurn } from '../src/client/vision-route.ts'

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

describe('composer visual-turn preparation', () => {
  it('keeps ordinary text on the untouched text route', () => {
    expect(planVisionTurn([])).toEqual({ kind: 'text', imageCount: 0, restoreTextRoute: false })
    expect(planVisionTurn(undefined)).toEqual({ kind: 'text', imageCount: 0, restoreTextRoute: false })
  })

  it('marks an image turn and requests text-route restoration afterwards', () => {
    expect(planVisionTurn(['draft:image-1', 'draft:image-2'])).toEqual({
      kind: 'vision',
      imageCount: 2,
      restoreTextRoute: true,
    })
  })
})
