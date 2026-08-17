import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { MarkdownText } from '@deepseek-ai/dsh-client-ui-primitives';
import { parseLearningActivity, parseLearningResponse, } from "../protocol.js";
import { envelopeOf, LearningInteraction } from "./LearningComposer.js";
import css from './LearningActivity.module.css';
function pendingActivity(interactions, sessionId, activity) {
    if (activity === undefined)
        return undefined;
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
        return parseLearningActivity(JSON.parse(raw));
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
        return parseLearningResponse(JSON.parse(text));
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
    const matched = pendingActivity(interactions, String(sessionId), activity);
    if (activity === undefined) {
        return _jsx("p", { className: css.inlineStatus, "data-state": done ? 'done' : 'running', children: t('invalidActivity') });
    }
    if (!done) {
        if (matched !== undefined)
            return _jsx(LearningInteraction, { matched: matched, t: t });
        return (_jsxs("p", { className: css.inlineStatus, "data-state": "running", role: "status", "aria-live": "polite", children: [_jsx("span", { className: css.runningDot, "aria-hidden": "true" }), _jsx("span", { children: t('waiting') }), _jsx("span", { className: css.skeletonLine, "aria-hidden": "true" })] }));
    }
    if (response === undefined) {
        return (_jsxs("div", { className: css.inlineFallback, "data-learning-result": "unknown", children: [_jsxs("p", { className: css.inlineResult, children: [_jsx("span", { className: css.resultMark, "aria-hidden": "true", children: "!" }), _jsx("span", { children: t('invalidResult') })] }), _jsx("div", { className: css.fallbackText, children: _jsx(MarkdownText, { text: activity.fallbackMarkdown }) })] }));
    }
    const status = response?.action === 'submit' ? t('completed')
        : response?.action === 'skip' ? t('skipped')
            : response?.action === 'cancel' ? t('cancelled') : t('invalidResult');
    const evidence = evidenceOf(activity, response, t);
    const explanation = explanationOf(response);
    return (_jsxs("p", { className: css.inlineResult, "data-learning-result": response?.action ?? 'unknown', children: [_jsx("span", { className: css.resultMark, "aria-hidden": "true", children: "\u2713" }), _jsx("span", { children: status }), evidence === undefined ? null : _jsx("span", { className: css.resultEvidence, children: evidence }), explanation === undefined ? null : _jsxs("span", { className: css.resultAnswer, children: ["\u201C", explanation, "\u201D"] })] }));
}
//# sourceMappingURL=LearningToolView.js.map