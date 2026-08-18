export type RoundStatus =
  | 'awaiting_input'
  | 'submitting_answer'
  | 'answer_accepted'
  | 'awaiting_model_reveal'
  | 'animating'
  | 'ready_to_continue'
  | 'ack_submitting'
  | 'completed'

export interface RoundState {
  status: RoundStatus
  error: string | null
}

export type RoundEvent =
  | { type: 'SUBMIT_ANSWER' }
  | { type: 'ANSWER_ACCEPTED' }
  | { type: 'WAIT_FOR_REVEAL' }
  | { type: 'START_REVEAL' }
  | { type: 'ANIMATION_FINISHED' }
  | { type: 'SUBMIT_CONTINUE' }
  | { type: 'ACK_ACCEPTED' }
  | { type: 'SUBMISSION_FAILED'; message: string }

export function initialRoundState(phase: 'question' | 'reveal', completed = false): RoundState {
  if (completed) return { status: 'completed', error: null }
  return { status: phase === 'question' ? 'awaiting_input' : 'animating', error: null }
}

/**
 * The round lifecycle is deliberately explicit. UI animation events may move a
 * reveal to `ready_to_continue`, but only the Host response acknowledgement can
 * mark it completed.
 */
export function roundReducer(state: RoundState, event: RoundEvent): RoundState {
  switch (event.type) {
    case 'SUBMIT_ANSWER':
      return state.status === 'awaiting_input'
        ? { status: 'submitting_answer', error: null }
        : state
    case 'ANSWER_ACCEPTED':
      return state.status === 'submitting_answer'
        ? { status: 'answer_accepted', error: null }
        : state
    case 'WAIT_FOR_REVEAL':
      return state.status === 'answer_accepted'
        ? { status: 'awaiting_model_reveal', error: null }
        : state
    case 'START_REVEAL':
      return state.status === 'awaiting_model_reveal'
        ? { status: 'animating', error: null }
        : state
    case 'ANIMATION_FINISHED':
      return state.status === 'animating'
        ? { status: 'ready_to_continue', error: null }
        : state
    case 'SUBMIT_CONTINUE':
      return state.status === 'ready_to_continue'
        ? { status: 'ack_submitting', error: null }
        : state
    case 'ACK_ACCEPTED':
      return state.status === 'ack_submitting'
        ? { status: 'completed', error: null }
        : state
    case 'SUBMISSION_FAILED':
      if (state.status === 'submitting_answer') return { status: 'awaiting_input', error: event.message }
      if (state.status === 'ack_submitting') return { status: 'ready_to_continue', error: event.message }
      return state
  }
}
