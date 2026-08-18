export type RoundStatus = 'awaiting_input' | 'submitting_answer' | 'answer_accepted' | 'awaiting_model_reveal' | 'animating' | 'ready_to_continue' | 'ack_submitting' | 'completed';
export interface RoundState {
    status: RoundStatus;
    error: string | null;
}
export type RoundEvent = {
    type: 'SUBMIT_ANSWER';
} | {
    type: 'ANSWER_ACCEPTED';
} | {
    type: 'WAIT_FOR_REVEAL';
} | {
    type: 'START_REVEAL';
} | {
    type: 'ANIMATION_FINISHED';
} | {
    type: 'SUBMIT_CONTINUE';
} | {
    type: 'ACK_ACCEPTED';
} | {
    type: 'SUBMISSION_FAILED';
    message: string;
};
export declare function initialRoundState(phase: 'question' | 'reveal', completed?: boolean): RoundState;
/**
 * The round lifecycle is deliberately explicit. UI animation events may move a
 * reveal to `ready_to_continue`, but only the Host response acknowledgement can
 * mark it completed.
 */
export declare function roundReducer(state: RoundState, event: RoundEvent): RoundState;
//# sourceMappingURL=roundState.d.ts.map