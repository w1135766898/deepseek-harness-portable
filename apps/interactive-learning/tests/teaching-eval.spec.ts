import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  OFFLINE_REFERENCE_CANDIDATES,
  TEACHING_EVAL_CASES,
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
    for (const phrase of ['Do not use it for facts', 'Adapt to the learner', 'End the teaching segment explicitly']) {
      expect(agent).toContain(phrase)
    }
    for (const phrase of ['Choose one teaching move', 'Continue from evidence', 'Know when to stop']) {
      expect(skill).toContain(phrase)
    }
  })
})
