import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { assertLearningGateAvailable, LearningGateError } from '../src/agent.ts'
import {
  OFFLINE_REFERENCE_CANDIDATES,
  TEACHING_EVAL_CASES,
  gradeLearningTranscript,
  gradeTeachingSuite,
} from '../src/eval.ts'

describe('teaching behavior evaluation gate', () => {
  it('covers visual restraint, all three kinds, response adaptation, and stopping after transfer', () => {
    expect(TEACHING_EVAL_CASES.map(scenario => scenario.id)).toEqual([
      'simple-fact-no-visual',
      'parameter-relationship',
      'process-state',
      'structure-difference',
      'adaptive-response',
      'transfer-stop',
    ])
    expect(gradeTeachingSuite(OFFLINE_REFERENCE_CANDIDATES).every(verdict => verdict.passed)).toBe(true)
  })

  it('fails visual overuse, ignored evidence, and mechanical questioning after mastery', () => {
    const bad = OFFLINE_REFERENCE_CANDIDATES.map(candidate => ({ ...candidate }))
    bad[0] = { ...bad[0]!, activityKind: 'parameter_explorer' }
    bad[4] = { ...bad[4]!, continuation: 'Here is the same slope explanation again.' }
    bad[5] = { ...bad[5]!, continuation: 'Try one more question?', endedSegment: false }
    const verdicts = gradeTeachingSuite(bad)
    expect(verdicts.find(item => item.caseId === 'simple-fact-no-visual')?.passed).toBe(false)
    expect(verdicts.find(item => item.caseId === 'adaptive-response')?.passed).toBe(false)
    expect(verdicts.find(item => item.caseId === 'transfer-stop')?.passed).toBe(false)
  })

  it('keeps the standing policy and detailed Skill aligned with the rubric', () => {
    const root = resolve(import.meta.dirname, '..')
    const agent = readFileSync(join(root, 'src/agent.ts'), 'utf8')
    const skill = readFileSync(join(root, 'preset/learning/skills/interactive-teaching/SKILL.md'), 'utf8')
    for (const phrase of ['learning_question', 'learning_reveal', 'one hard gate per model step', 'end explicitly', 'ask_user_question', 'user-owned choice', 'two or three broad']) {
      expect(agent).toContain(phrase)
    }
    for (const phrase of ['Choose one teaching move', 'Route choices and evidence', 'Continue from evidence', 'Know when to stop', 'Minimal positive examples', 'distinct line pattern']) {
      expect(skill).toContain(phrase)
    }
  })
})

describe('interactive learning transcript invariants', () => {
  const validEvents = [
    { at: 1, type: 'learning-question-call', stepId: 'step-q0', payload: { prompt: 'What is the perimeter?', focus: { title: 'Triangle' } } },
    { at: 2, type: 'learning-question-result', payload: { answer: '3' } },
    { at: 3, type: 'learning-reveal-call', stepId: 'step-r0', payload: { feedback: { answer: '3', explanation: 'Three unit edges.' } } },
    { at: 4, type: 'animation-finished' },
    { at: 4, type: 'continue-enabled' },
    { at: 5, type: 'continue-committed' },
    { at: 6, type: 'learning-reveal-result' },
    { at: 7, type: 'learning-question-call', stepId: 'step-q1', payload: { prompt: 'How many segments replace one edge?', focus: { title: 'First transform' } } },
  ] as const

  it('accepts the Question -> Reveal -> animation/continue -> next Question order', () => {
    expect(gradeLearningTranscript({
      events: validEvents,
      answerMarkers: ['Three unit edges.'],
      futureMarkers: ['First transform'],
    }).passed).toBe(true)
  })

  it('rejects multiple gates in one model step and phase-crossing payload fields', () => {
    const events = validEvents.map(event => ({ ...event }))
    events[2] = { ...events[2]!, stepId: 'step-q0', payload: { ...events[2]!.payload, nextQuestion: 'Already here?' } }
    events[0] = { ...events[0]!, payload: { ...events[0]!.payload, steps: [{ title: 'Future' }] } }
    const verdict = gradeLearningTranscript({ events })
    expect(verdict.passed).toBe(false)
    expect(verdict.checks.filter(check => !check.passed).map(check => check.name)).toEqual(expect.arrayContaining([
      'one-learning-gate-per-model-step',
      'question-shape-does-not-leak',
      'reveal-shape-does-not-advance',
    ]))
  })

  it('rejects content leakage and a next Question before Reveal acknowledgement', () => {
    const events = validEvents.map(event => ({ ...event }))
    events.splice(1, 0, { at: 1.5, type: 'assistant-text', text: 'Three unit edges; next comes First transform.' })
    const next = events.findIndex(event => event.type === 'learning-question-call' && event.stepId === 'step-q1')
    const [nextQuestion] = events.splice(next, 1)
    events.splice(events.findIndex(event => event.type === 'learning-reveal-result'), 0, nextQuestion!)
    const verdict = gradeLearningTranscript({
      events,
      answerMarkers: ['Three unit edges'],
      futureMarkers: ['First transform'],
    })
    expect(verdict.passed).toBe(false)
    expect(verdict.checks.filter(check => !check.passed).map(check => check.name)).toEqual(expect.arrayContaining([
      'no-answer-before-question-result',
      'no-future-round-before-reveal-result',
      'question-reveal-next temporal gate',
    ]))
  })
})

describe('runtime one-gate guard', () => {
  it('rejects a second Learning gate in one open step and admits the next step', () => {
    const events: Array<{ type: 'step/start' | 'step/end'; data: { turn: number; step: number } }> = [
      { type: 'step/start', data: { turn: 1, step: 1 } },
    ]
    const agent = { session: { events } } as unknown as Agent
    assertLearningGateAvailable(agent)
    expect(() => assertLearningGateAvailable(agent)).toThrowError(LearningGateError)
    events.push(
      { type: 'step/end', data: { turn: 1, step: 1 } },
      { type: 'step/start', data: { turn: 1, step: 2 } },
    )
    expect(() => assertLearningGateAvailable(agent)).not.toThrow()
  })
})
