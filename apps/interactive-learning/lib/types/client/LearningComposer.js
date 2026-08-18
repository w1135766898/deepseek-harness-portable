import { jsx as _jsx } from "react/jsx-runtime";
import { useMemo, useState } from 'react';
import { RESPONSE_PROTOCOL, RESPONSE_PROTOCOL_V2, } from "../protocol.js";
import { decodeLearningDetail, decodeLearningQuestionId, decodeLearningWaitDetail, decodeLearningWaitQuestionId, } from "../transport.js";
import { ActivityFrame } from "./ActivityFrame.js";
import { ActivityRenderer } from "./ActivityRenderer.js";
import { RoundActivity } from "./RoundActivity.js";
export function envelopeOf(wait) {
    if (wait.payload.questions.length !== 1)
        return undefined;
    const question = wait.payload.questions[0];
    if (question === undefined)
        return undefined;
    const v2 = decodeLearningWaitDetail(question.detail);
    if (v2 !== undefined && decodeLearningWaitQuestionId(question.id) === v2.waitId)
        return v2;
    return decodeLearningQuestionId(question.id) ?? decodeLearningDetail(question.detail);
}
/** Pure composer-chain selector: only package-owned question envelopes are claimed. */
export function selectLearningActivity({ interactions, session }) {
    const currentSessionId = session?.sessionId;
    for (const interaction of interactions) {
        if (interaction.kind !== 'question')
            continue;
        const wait = interaction;
        // A pending wait belongs to one live session. This explicit lineage guard
        // prevents a fork from claiming an ancestor's unresolved interaction.
        if (currentSessionId === undefined || String(wait.sessionId) !== String(currentSessionId))
            continue;
        if (envelopeOf(wait) !== undefined)
            return wait;
    }
    return null;
}
export function LearningComposer({ matched, t }) {
    // Claim the package-owned question so the generic question composer does
    // not duplicate it. The actual interaction lives in the tool call's place
    // in the assistant turn; a pending activity intentionally has no bottom UI.
    void matched;
    void t;
    return null;
}
export function LearningInteraction({ matched, t }) {
    const envelope = useMemo(() => envelopeOf(matched), [matched]);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    if (envelope === undefined)
        return null;
    const send = async (response) => {
        const question = matched.payload.questions[0];
        if (question === undefined)
            return;
        setBusy(true);
        setError(null);
        try {
            const accepted = await matched.respond({
                ok: true,
                value: {
                    sessionId: matched.sessionId,
                    answer: { answers: [{ id: question.id, selected: [], custom: JSON.stringify(response) }] },
                },
            });
            if (!accepted.accepted)
                throw new Error(accepted.reason);
        }
        catch (cause) {
            setBusy(false);
            setError(t('error', { message: cause instanceof Error ? cause.message : String(cause) }));
            throw cause;
        }
    };
    if ('waitId' in envelope) {
        // One durable wait owns one durable receipt. A refresh or transport retry
        // therefore replays the same idempotency key instead of minting a new ACK.
        const stableReceiptId = `receipt_${envelope.waitId}`;
        const common = {
            protocol: RESPONSE_PROTOCOL_V2,
            activityId: envelope.activityId,
            lessonToken: envelope.lessonToken,
            roundToken: envelope.roundToken,
            seq: envelope.seq,
        };
        const storageKey = `${envelope.waitId}:${envelope.activityId}:${envelope.phase}:${envelope.seq}`;
        const submitAnswer = async (answer, interactionState) => {
            await send({ ...common, phase: 'question', action: 'submit', answer, interactionState, receiptId: stableReceiptId });
        };
        const continueReveal = async (animation) => {
            await send({ ...common, phase: 'reveal', action: 'continue', animation, receiptId: stableReceiptId });
        };
        const cancelRound = async () => {
            await send(envelope.phase === 'question'
                ? { ...common, phase: 'question', action: 'cancel', receiptId: stableReceiptId }
                : { ...common, phase: 'reveal', action: 'cancel', animation: { completed: false }, receiptId: stableReceiptId });
        };
        return (_jsx(RoundActivity, { activity: envelope.activity, storageKey: storageKey, onSubmitAnswer: envelope.phase === 'question' ? submitAnswer : undefined, onContinue: envelope.phase === 'reveal' ? continueReveal : undefined, onCancel: cancelRound, t: t }));
    }
    const respond = (response) => {
        const question = matched.payload.questions[0];
        if (question === undefined)
            return;
        setBusy(true);
        setError(null);
        void send(response).catch(() => { });
    };
    const submit = ({ answer, interactionState }) => respond({
        protocol: RESPONSE_PROTOCOL,
        activityId: envelope.activityId,
        action: 'submit',
        answer,
        interactionState,
    });
    const skip = () => respond({
        protocol: RESPONSE_PROTOCOL,
        activityId: envelope.activityId,
        action: 'skip',
    });
    const cancel = () => {
        setBusy(true);
        setError(null);
        void matched.respond({
            ok: false,
            error: { code: 'cancelled', message: 'the learner cancelled this activity', details: {} },
        }).then(receipt => {
            if (!receipt.accepted)
                throw new Error(receipt.reason);
        }).catch((cause) => {
            setBusy(false);
            setError(t('error', { message: cause instanceof Error ? cause.message : String(cause) }));
        });
    };
    return (_jsx(ActivityFrame, { activityId: envelope.activityId, activity: envelope.activity, busy: busy, error: error, onSkip: skip, onCancel: cancel, t: t, children: _jsx(ActivityRenderer, { activity: envelope.activity, busy: busy, onSubmit: submit, t: t }) }, matched.key));
}
//# sourceMappingURL=LearningComposer.js.map