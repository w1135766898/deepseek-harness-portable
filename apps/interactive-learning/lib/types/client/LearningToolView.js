import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect } from 'react';
import { MarkdownText } from '@deepseek-ai/dsh-client-ui-primitives';
import { parseLearningActivity, parseLearningActivityV2, parseLearningResponse, parseLearningResponseV2, ACTIVITY_PROTOCOL_V2, RESPONSE_PROTOCOL_V2, } from "../protocol.js";
import { envelopeOf, LearningInteraction } from "./LearningComposer.js";
import css from './LearningActivity.module.css';
import { RoundActivity } from "./RoundActivity.js";
import { emitLearningCallLifecycle } from "./lifecycle.js";
function pendingActivity(interactions, sessionId, activity, callId) {
    if (activity === undefined)
        return undefined;
    if (activity.protocol === ACTIVITY_PROTOCOL_V2) {
        return interactions.find((interaction) => {
            if (interaction.kind !== 'question' || String(interaction.sessionId) !== sessionId)
                return false;
            const envelope = envelopeOf(interaction);
            if (envelope === undefined || !('waitId' in envelope))
                return false;
            if (envelope.callId !== undefined && envelope.callId !== callId)
                return false;
            return envelope.phase === activity.phase
                && envelope.seq === activity.seq
                && envelope.activityId !== ''
                && envelope.waitId !== '';
        });
    }
    const canonical = JSON.stringify(activity);
    return interactions.find((interaction) => {
        if (interaction.kind !== 'question' || String(interaction.sessionId) !== sessionId)
            return false;
        const envelope = envelopeOf(interaction);
        return envelope !== undefined && JSON.stringify(envelope.activity) === canonical;
    });
}
function activityOf(block) {
    const raw = 'kind' in block ? block.call?.argsRaw : block.argsRaw;
    if (raw === undefined || raw === '')
        return undefined;
    try {
        const parsed = JSON.parse(raw);
        return parsed.protocol === ACTIVITY_PROTOCOL_V2 ? parseLearningActivityV2(parsed) : parseLearningActivity(parsed);
    }
    catch {
        return undefined;
    }
}
function responseOf(block) {
    if (!('kind' in block))
        return undefined;
    const text = block.content.filter(item => item.type === 'text').map(item => item.text).join('');
    if (text === '')
        return undefined;
    try {
        const parsed = JSON.parse(text);
        return parsed.protocol === RESPONSE_PROTOCOL_V2 ? parseLearningResponseV2(parsed) : parseLearningResponse(parsed);
    }
    catch {
        return undefined;
    }
}
function explanationOf(response) {
    if (response?.action !== 'submit' || typeof response.answer !== 'object'
        || response.answer === null || Array.isArray(response.answer))
        return undefined;
    const explanation = response.answer.explanation;
    return typeof explanation === 'string' && explanation.trim() !== '' ? explanation.trim() : undefined;
}
function answerRecord(response) {
    if (response?.action !== 'submit' || typeof response.answer !== 'object'
        || response.answer === null || Array.isArray(response.answer))
        return undefined;
    return response.answer;
}
function evidenceOf(activity, response, t) {
    const answer = answerRecord(response);
    if (answer === undefined)
        return undefined;
    if (activity.kind === 'parameter_explorer') {
        const parameters = answer.parameters;
        if (typeof parameters !== 'object' || parameters === null || Array.isArray(parameters))
            return undefined;
        const values = activity.payload.parameters.flatMap(parameter => {
            const value = parameters[parameter.id];
            return typeof value === 'number'
                ? [t('rangeValue', { label: parameter.label, value })]
                : [];
        });
        return values.length === 0 ? undefined : values.join(' · ');
    }
    if (activity.kind === 'process_stepper') {
        const checkpoints = answer.checkpoints;
        return Array.isArray(checkpoints) && checkpoints.length > 0
            ? t('processEvidence', { count: checkpoints.length })
            : undefined;
    }
    const selected = answer.selectedDifferences;
    return Array.isArray(selected)
        ? t('structureEvidence', { count: selected.length })
        : undefined;
}
export function LearningToolView({ block, inspect, t, useSession, sessionId }) {
    void inspect;
    const activity = activityOf(block);
    const done = 'kind' in block;
    const response = responseOf(block);
    const interactions = useSession(snapshot => snapshot.pending);
    const callId = 'kind' in block ? block.callId : block.callId;
    const raw = 'kind' in block ? block.call?.argsRaw : block.argsRaw;
    useEffect(() => {
        if (done || raw === undefined || raw === '')
            return;
        if (activity === undefined)
            emitLearningCallLifecycle('learning.call.stream_started', { callId });
        else
            emitLearningCallLifecycle('learning.call.args_completed', {
                callId,
                phase: activity.protocol === ACTIVITY_PROTOCOL_V2 ? activity.phase : undefined,
                seq: activity.protocol === ACTIVITY_PROTOCOL_V2 ? activity.seq : undefined,
            });
    }, [activity, callId, done, raw]);
    const matched = pendingActivity(interactions, String(sessionId), activity, callId);
    if (activity === undefined) {
        if (!done) {
            return (_jsxs("p", { className: css.inlineStatus, "data-state": "running", role: "status", "aria-live": "polite", children: [_jsx("span", { className: css.runningDot, "aria-hidden": "true" }), _jsx("span", { children: t('waiting') }), _jsx("span", { className: css.skeletonLine, "aria-hidden": "true" })] }));
        }
        return _jsx("p", { className: css.inlineStatus, "data-state": done ? 'done' : 'running', children: t('invalidActivity') });
    }
    if (activity.protocol === ACTIVITY_PROTOCOL_V2) {
        if (!done) {
            if (matched !== undefined)
                return _jsx(LearningInteraction, { matched: matched, t: t });
            return (_jsxs("p", { className: css.inlineStatus, "data-state": "running", role: "status", "aria-live": "polite", children: [_jsx("span", { className: css.runningDot, "aria-hidden": "true" }), _jsx("span", { children: t('waiting') }), _jsx("span", { className: css.skeletonLine, "aria-hidden": "true" })] }));
        }
        const v2Response = response?.protocol === RESPONSE_PROTOCOL_V2 ? response : undefined;
        return (_jsx("div", { className: css.completedRound, "data-learning-result": v2Response?.action ?? 'unknown', children: _jsx(RoundActivity, { activity: activity, completed: true, initialAnswer: v2Response?.phase === 'question' ? v2Response.answer : undefined, t: t }) }));
    }
    if (!done) {
        if (matched !== undefined)
            return _jsx(LearningInteraction, { matched: matched, t: t });
        return (_jsxs("p", { className: css.inlineStatus, "data-state": "running", role: "status", "aria-live": "polite", children: [_jsx("span", { className: css.runningDot, "aria-hidden": "true" }), _jsx("span", { children: t('waiting') }), _jsx("span", { className: css.skeletonLine, "aria-hidden": "true" })] }));
    }
    if (response === undefined) {
        return (_jsxs("div", { className: css.inlineFallback, "data-learning-result": "unknown", children: [_jsxs("p", { className: css.inlineResult, children: [_jsx("span", { className: css.resultMark, "aria-hidden": "true", children: "!" }), _jsx("span", { children: t('invalidResult') })] }), _jsx("div", { className: css.fallbackText, children: _jsx(MarkdownText, { text: activity.fallbackMarkdown }) })] }));
    }
    const legacyResponse = response.protocol === RESPONSE_PROTOCOL_V2 ? undefined : response;
    const status = legacyResponse?.action === 'submit' ? t('completed')
        : legacyResponse?.action === 'skip' ? t('skipped')
            : legacyResponse?.action === 'cancel' ? t('cancelled') : t('invalidResult');
    const evidence = evidenceOf(activity, legacyResponse, t);
    const explanation = explanationOf(legacyResponse);
    return (_jsxs("p", { className: css.inlineResult, "data-learning-result": legacyResponse?.action ?? 'unknown', children: [_jsx("span", { className: css.resultMark, "aria-hidden": "true", children: "\u2713" }), _jsx("span", { children: status }), evidence === undefined ? null : _jsx("span", { className: css.resultEvidence, children: evidence }), explanation === undefined ? null : _jsxs("span", { className: css.resultAnswer, children: ["\u201C", explanation, "\u201D"] })] }));
}
//# sourceMappingURL=LearningToolView.js.map