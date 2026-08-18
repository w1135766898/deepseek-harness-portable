import {
  ACTIVITY_PROTOCOL,
  ACTIVITY_PROTOCOL_V2,
  type LearningActivityV1,
  type LearningQuestionV2,
  type LearningRevealV2,
} from '../src/protocol.ts'

export function parameterActivity(): LearningActivityV1 {
  return {
    protocol: ACTIVITY_PROTOCOL,
    kind: 'parameter_explorer',
    title: 'Explore slope',
    objective: 'Connect slope sign with line direction.',
    prompt: 'Predict what changes when the slope crosses zero.',
    payload: {
      parameters: [{ id: 'slope', label: 'Slope', min: -3, max: 3, step: 0.25, initial: 1 }],
      xAxis: { label: 'x', min: -5, max: 5, samples: 64 },
      curves: [{
        id: 'line',
        label: 'y = slope × x',
        expression: {
          op: 'mul',
          left: { op: 'variable', name: 'slope' },
          right: { op: 'variable', name: 'x' },
        },
      }],
      question: 'What changes, and what stays fixed?',
    },
    fallbackMarkdown: 'Compare `y = -x`, `y = 0`, and `y = x`. What changes as the coefficient crosses zero?',
  }
}

export function questionRound(): LearningQuestionV2 {
  return {
    protocol: ACTIVITY_PROTOCOL_V2, phase: 'question', seq: 0,
    focus: { title: 'Queue head', progress: { current: 1, total: 2 } },
    prompt: 'Which item leaves first?',
    input: { kind: 'single_choice', options: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }] },
    visual: { kind: 'process', frame: { id: 'queue', title: 'A → B → C' } },
    fallbackMarkdown: 'A queue currently contains A, B, C. Which item leaves first?',
  }
}

export function revealRound(): LearningRevealV2 {
  return {
    protocol: ACTIVITY_PROTOCOL_V2, phase: 'reveal', lessonToken: 'lesson-1', roundToken: 'round-1', seq: 0,
    focus: { title: 'Queue head', progress: { current: 1, total: 2 } },
    feedback: { verdict: 'correct', learnerEcho: 'You chose A.', explanation: 'FIFO removes the earliest arrival.', answer: 'A' },
    visual: { kind: 'process', before: { id: 'before', title: 'A → B → C' }, after: { id: 'after', title: 'B → C', content: 'A has left.' } },
    animation: { kind: 'step_complete', preferredDurationMs: 700, reducedMotion: 'commit-final-state' },
    advance: { mode: 'user-after-animation', label: 'Continue learning' },
    fallbackMarkdown: 'A leaves first; the queue is now B, C.',
  }
}

export function processActivity(): LearningActivityV1 {
  return {
    protocol: ACTIVITY_PROTOCOL,
    kind: 'process_stepper',
    title: 'Trace a queue',
    objective: 'Predict FIFO state transitions.',
    prompt: 'Predict the removed item before each reveal.',
    payload: {
      steps: [
        { id: 'start', title: 'Initial state', content: 'The queue contains A, B, C.' },
        {
          id: 'remove',
          title: 'Remove one',
          content: 'A leaves because it arrived first.',
          checkpoint: { question: 'Which item leaves?', options: ['A', 'B', 'C'] },
        },
      ],
    },
    fallbackMarkdown: 'A queue contains A, B, C. Which item leaves first under FIFO, and why?',
  }
}

export function compareActivity(): LearningActivityV1 {
  return {
    protocol: ACTIVITY_PROTOCOL,
    kind: 'structure_compare',
    title: 'Compare collections',
    objective: 'Relate structure to lookup cost.',
    prompt: 'Select the design-relevant differences.',
    payload: {
      left: { title: 'Array', items: [{ id: 'lookup', label: 'Indexed lookup' }] },
      right: { title: 'Linked list', items: [{ id: 'lookup', label: 'Sequential lookup' }] },
      alignments: [{ id: 'lookup_cost', leftId: 'lookup', rightId: 'lookup', prompt: 'Access cost differs.' }],
    },
    fallbackMarkdown: 'Contrast indexed and sequential lookup. Which structure reaches item 50 directly?',
  }
}
