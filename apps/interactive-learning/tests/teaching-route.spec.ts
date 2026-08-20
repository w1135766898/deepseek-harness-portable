import { describe, expect, it } from 'vitest'
import { routeLearningRequest } from '../src/teaching-route.ts'

describe('Learning first-turn routing', () => {
  it.each([
    ['Learn LLMs', 'calibrate'],
    ['Teach me LLMs', 'calibrate'],
    ['学习 LLM', 'calibrate'],
    ['教我机器学习', 'calibrate'],
  ] as const)('calibrates an underspecified request: %s', (request, route) => {
    expect(routeLearningRequest(request).route).toBe(route)
  })

  it.each([
    ['Teach me LLMs from zero', 'teach-minimum'],
    ['I am a beginner; explain LLMs', 'teach-minimum'],
    ['从零开始教我 LLM', 'teach-minimum'],
    ['学习 LLM 的下一 token 预测', 'teach-minimum'],
    ['Help me understand why attention works', 'teach-minimum'],
  ] as const)('starts the minimum lesson when the route is clear: %s', (request, route) => {
    expect(routeLearningRequest(request).route).toBe(route)
  })

  it.each([
    'Give me a complete overview of LLMs; do not ask questions first.',
    '直接讲 LLM 的全面概览，不要提问。',
    'Give me a current survey of the LLM market.',
    'Explain the contested debate around open versus closed models.',
    '给我最新的 LLM 行业综述。',
  ])('allows an overview only when explicitly requested or appropriate: %s', request => {
    expect(routeLearningRequest(request).route).toBe('overview')
  })
})
