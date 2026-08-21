import { describe, expect, it } from 'vitest'
import { routeLearningRequest, routeLearningTurn } from '../src/teaching-route.ts'

describe('Learning first-turn routing', () => {
  it.each([
    ['Learn LLMs', 'calibrate'],
    ['Teach me LLMs', 'calibrate'],
    ['Galois theory', 'calibrate'],
    ['学习 LLM', 'calibrate'],
    ['教我机器学习', 'calibrate'],
    ['Walk me through monads', 'calibrate'],
    ['Take me through monads', 'calibrate'],
    ['什么是贝叶斯定理？', 'teach-minimum'],
  ] as const)('calibrates an underspecified request: %s', (request, route) => {
    expect(routeLearningRequest(request).route).toBe(route)
  })

  it.each([
    ['Teach me LLMs from zero', 'teach-minimum'],
    ['I am a beginner; explain LLMs', 'teach-minimum'],
    ['从零开始教我 LLM', 'teach-minimum'],
    ['学习 LLM 的下一 token 预测', 'teach-minimum'],
    ['Help me understand why attention works', 'teach-minimum'],
    ['I always confuse precision and recall.', 'teach-minimum'],
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

  it('does not confuse exclusions with a learning route', () => {
    expect(routeLearningRequest('Implement a queue in TypeScript.').intent.intent).toBe('not-learn')
    expect(routeLearningRequest('What is the latest news about queues?').intent.intent).toBe('not-learn')
    expect(routeLearningRequest('What is a queue?').intent.intent).toBe('learn')
  })

  it('keeps the explicit-learning fallback on calibration when the shape is unknown', () => {
    expect(routeLearningRequest('Could you walk me through monads in a useful way?')).toMatchObject({
      route: 'calibrate',
      reason: 'explicit-learning',
      intent: { trigger: 'explicit-learning' },
    })
  })

  it('inherits short answers, confusion, pressure, and what-if follow-ups', () => {
    const first = routeLearningTurn('Teach me queues.')
    expect(first).toMatchObject({ segment: 'active', inherited: false, route: 'calibrate' })

    for (const text of [
      'A.',
      'I still don\'t get it.',
      'Just tell me; I am running out of patience.',
      'What if C arrives next?',
    ]) {
      expect(routeLearningTurn(text, { active: true, decision: first })).toMatchObject({
        segment: 'active',
        inherited: true,
        route: 'continue',
        reason: 'active-segment',
      })
    }
  })

  it.each([
    'Translate this paragraph into Chinese.',
    'Implement a queue in TypeScript.',
  ])('closes an active segment for an explicit task switch: %s', text => {
    const first = routeLearningTurn('Teach me queues.')
    expect(routeLearningTurn(text, { active: true, decision: first })).toMatchObject({
      segment: 'closed',
      inherited: false,
      intent: { intent: 'not-learn' },
    })
  })

  it('lets a short acknowledgement close an active segment without reopening it', () => {
    const first = routeLearningTurn('Teach me queues.')
    const active = routeLearningTurn("That's enough.", { active: true, decision: first })
    const completed = routeLearningTurn('Got it.', { active: false })
    expect(active).toMatchObject({ segment: 'closed', inherited: false, route: 'direct' })
    expect(completed).toMatchObject({ segment: 'closed', inherited: false, route: 'direct' })
  })
})
