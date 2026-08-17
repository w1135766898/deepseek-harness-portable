import { jsx as _jsx } from "react/jsx-runtime";
import { useMemo, useState } from 'react';
import { RESPONSE_PROTOCOL, } from "../protocol.js";
import { decodeLearningDetail } from "../transport.js";
import { ActivityFrame } from "./ActivityFrame.js";
import { ActivityRenderer } from "./ActivityRenderer.js";
function envelopeOf(wait) {
    if (wait.payload.questions.length !== 1)
        return undefined;
    const question = wait.payload.questions[0];
    const envelope = decodeLearningDetail(question?.detail);
    if (envelope === undefined || question?.id !== `learning:${envelope.activityId}`)
        return undefined;
    return envelope;
}
/** Pure composer-chain selector: only package-owned question envelopes are claimed. */
export function selectLearningActivity({ interactions, session }) {
    const currentSessionId = session?.id;
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
    const envelope = useMemo(() => envelopeOf(matched), [matched]);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    if (envelope === undefined)
        return null;
    const respond = (response) => {
        const question = matched.payload.questions[0];
        if (question === undefined)
            return;
        setBusy(true);
        setError(null);
        void matched.respond({
            ok: true,
            value: {
                sessionId: matched.sessionId,
                answer: { answers: [{ id: question.id, selected: [], custom: JSON.stringify(response) }] },
            },
        }).then(receipt => {
            if (!receipt.accepted)
                throw new Error(receipt.reason);
        }).catch((cause) => {
            setBusy(false);
            setError(t('error', { message: cause instanceof Error ? cause.message : String(cause) }));
        });
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
    return (_jsx(ActivityFrame, { activity: envelope.activity, busy: busy, error: error, onSkip: skip, onCancel: cancel, t: t, children: _jsx(ActivityRenderer, { activity: envelope.activity, busy: busy, onSubmit: submit, t: t }) }, matched.key));
}
//# sourceMappingURL=LearningComposer.js.map