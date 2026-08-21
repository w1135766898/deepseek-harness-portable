import { describe, expect, it } from 'vitest'
import {
  classifyLearnIntent,
  isLearnIntent,
} from '../src/learn-intent.ts'

describe('learn intent and trigger boundary', () => {
  it.each([
    ['What is a monad?', 'definition'],
    ['什么是贝叶斯定理？', 'definition'],
    ['This is a graded statistics assignment; help me understand how to choose between a t-test and a chi-square test.', 'explicit-learning'],
    ['logistic regression', 'bare-concept'],
    ['I always mix up precision and recall.', 'confusion-repair'],
    ['I never learned Fourier analysis and it will not stick.', 'confusion-repair'],
    ['What prerequisites should I learn before category theory?', 'learning-path'],
    ['Make me active-recall flashcards for queues.', 'resource-creation'],
    ['Explain the contested debate around open versus closed models.', 'current-topic'],
    ['Why does attention work?', 'conceptual-question'],
    ['What if C arrives next?', 'conceptual-question'],
    ['为什么负斜率会向下？', 'conceptual-question'],
  ] as const)('recognizes %s as %s', (request, trigger) => {
    expect(classifyLearnIntent(request)).toMatchObject({ intent: 'learn', trigger })
    expect(isLearnIntent(request)).toBe(true)
  })

  it.each([
    ['Implement a binary search function.', 'coding-task'],
    ['Debug this Python stack trace.', 'coding-task'],
    ['Explain this code and tell me why it fails.', 'coding-task'],
    ['Translate this paragraph into Chinese.', 'translation-task'],
    ['What is the latest news about the election?', 'news-request'],
    ['Recommend a good textbook for topology.', 'resource-recommendation'],
    ['Do you think monads are still relevant?', 'opinion-judgment'],
  ] as const)('keeps %s off the learn route as %s', (request, trigger) => {
    expect(classifyLearnIntent(request)).toMatchObject({ intent: 'not-learn', trigger })
    expect(isLearnIntent(request)).toBe(false)
  })
})
