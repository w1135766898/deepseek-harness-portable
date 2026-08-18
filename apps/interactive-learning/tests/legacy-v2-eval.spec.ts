import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import * as currentEval from '../src/eval.ts'
import {
  gradeLegacyV2ReplayTranscript,
  type LegacyV2ReplayCandidate,
} from '../src/eval.ts'

function validLegacyReplay(): LegacyV2ReplayCandidate {
  return {
    answerMarkers: ['A leaves first'],
    futureMarkers: ['second replay question'],
    events: [
      {
        at: 1,
        type: 'learning-question-call',
        stepId: 'legacy-question-1',
        payload: { prompt: 'Which queued item leaves first?' },
      },
      { at: 2, type: 'learning-question-result', payload: { response: 'A' } },
      {
        at: 3,
        type: 'learning-reveal-call',
        stepId: 'legacy-reveal-1',
        payload: { explanation: 'A leaves first because it arrived first.' },
      },
      { at: 4, type: 'animation-finished' },
      { at: 5, type: 'continue-enabled' },
      { at: 6, type: 'continue-committed' },
      { at: 7, type: 'learning-reveal-result' },
      {
        at: 8,
        type: 'learning-question-call',
        stepId: 'legacy-question-2',
        payload: { prompt: 'second replay question' },
      },
    ],
  }
}

describe('explicit legacy V2 replay grader', () => {
  it('accepts a valid retired Question/Reveal replay only through its legacy name', () => {
    const verdict = gradeLegacyV2ReplayTranscript(validLegacyReplay())
    expect(verdict.caseId).toBe('legacy-v2-replay-transcript')
    expect(verdict.passed).toBe(true)
    expect(Object.hasOwn(currentEval, 'gradeLearningTranscript')).toBe(false)
  })

  it('rejects leaked or incomplete legacy sequences instead of treating them as current teaching', () => {
    const leaked = validLegacyReplay()
    leaked.events[0]!.payload = {
      prompt: 'Which queued item leaves first?',
      answer: 'A leaves first',
    }
    expect(gradeLegacyV2ReplayTranscript(leaked).passed).toBe(false)

    const ordinaryV4 = gradeLegacyV2ReplayTranscript({
      events: [{ at: 1, type: 'assistant-text', text: 'Ordinary non-blocking teaching reply.' }],
    })
    expect(ordinaryV4.passed).toBe(false)
  })

  it('is excluded from the default V4.1 eval CLI', () => {
    const cliSource = readFileSync(resolve(import.meta.dirname, '../src/eval-cli.ts'), 'utf8')
    expect(cliSource).not.toContain('gradeLegacyV2ReplayTranscript')
    expect(cliSource).not.toContain('gradeLearningTranscript')
  })
})
