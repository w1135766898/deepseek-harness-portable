import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { LEARNING_TEACHING_POLICY } from '../src/teaching-policy.ts'

const root = resolve(import.meta.dirname, '..')
const agentSource = readFileSync(join(root, 'src/agent.ts'), 'utf8')
const skillSource = readFileSync(
  join(root, 'preset/learning/skills/interactive-teaching/SKILL.md'),
  'utf8',
)

function expectPolicyToCover(...phrases: string[]): void {
  for (const phrase of phrases) expect(LEARNING_TEACHING_POLICY).toContain(phrase)
}

describe('authoritative compact Learning teaching policy', () => {
  it('is the single standing-prompt source while the Skill remains a reference router', () => {
    expect(agentSource).toContain("import { LEARNING_TEACHING_POLICY } from './teaching-policy.ts'")
    expect(agentSource).toContain('text: LEARNING_TEACHING_POLICY')
    expect(agentSource).not.toContain('Optimize for durable learner capability')
    expect(agentSource).not.toContain('Never repeat the same hint in new words')

    expect(skillSource).toContain('single authoritative source')
    expect(skillSource).toContain('only routes to detailed construction references')
    expect(skillSource).toContain('must not restate, weaken, or override the standing policy')
    expect(skillSource).not.toContain('Choose the smallest useful move')
    expect(skillSource).not.toContain('Continue from evidence')
    expect(skillSource).not.toContain('Know when to stop')
  })

  it('puts the ambiguity route above overview dumping', () => {
    expectPolicyToCover(
      'short “learn X”, “teach me X”, or “understand X” request with unknown level and goal as calibration',
      'ask one question whose answer changes the teaching route',
      'from zero”, “beginner”, or “concept intro”, teach one minimum concept immediately',
      'complete/full overview',
      'current or contested-topic survey',
      'do not open with a questionnaire',
    )
  })

  it('pins the one-step evidence loop and repair behavior', () => {
    expectPolicyToCover(
      'Each response makes one cognitive move',
      'minimum explanation plus one concrete example',
      'Ask at most one focused learner question',
      'Use observable evidence only',
      'preserve the correct part and raise difficulty slightly',
      'isolate the precise error, add new information, and offer a nearby retry',
      'concept gap needs the concept',
      'procedure gap needs a distinct parallel example',
    )
  })

  it('makes non-repetition and transfer explicit stateful requirements', () => {
    expectPolicyToCover(
      'Never repeat a hint, analogy, question, or explanation fingerprint',
      'shrink the concept or change representation and add new information',
      'require an explanation, prediction, or application in a fresh situation',
      'Stop after independent fresh transfer',
      'do not force, a next step',
      'A plan is tentative and never a completion checklist',
      'phase, last explanation/question, learner-response assessment, current misconception, next move, and move fingerprint',
    )
  })

  it('keeps rich interactions optional and detailed protocols out of standing context', () => {
    expectPolicyToCover(
      'Ordinary conversation is the default',
      'Use a visual only when one relationship is materially clearer',
      'use a checkpoint only when the learner\'s response will change the next move',
      'Both are optional and non-blocking',
      'Load the interactive-teaching Skill only for detailed visual or supplied-source construction',
      'Never invent facts, citations, source anchors, learner evidence, or confidence',
      '`learning_state_update`',
    )
    expect(LEARNING_TEACHING_POLICY).not.toContain('2 to 48 nodes')
    expect(LEARNING_TEACHING_POLICY).not.toContain('Mermaid')
    expect(LEARNING_TEACHING_POLICY).not.toContain('formula_steps')
  })

  it('keeps the standing policy within the compact prompt budget', () => {
    // This is a conservative proxy, not a model-specific tokenizer claim.
    expect(LEARNING_TEACHING_POLICY.length).toBeLessThan(5000)
    expect(Math.ceil(LEARNING_TEACHING_POLICY.length / 4)).toBeGreaterThanOrEqual(800)
    expect(Math.ceil(LEARNING_TEACHING_POLICY.length / 4)).toBeLessThan(1250)
  })
})
