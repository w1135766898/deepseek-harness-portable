import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect } from 'react';
import { MarkdownText } from '@deepseek-ai/dsh-client-ui-primitives';
import { parseLearningActivity, parseLearningActivityV2, parseLearningVisualV3, parseLearningVisualResultV3, parseLearningVisualV4, parseLearningVisualResultV4, parseLearningResponse, parseLearningResponseV2, ACTIVITY_PROTOCOL_V2, RESPONSE_PROTOCOL_V2, VISUAL_PROTOCOL_V3, VISUAL_PROTOCOL_V4, VISUAL_RESULT_PROTOCOL_V3, VISUAL_RESULT_PROTOCOL_V4, } from "../protocol.js";
import { envelopeOf, LearningInteraction } from "./LearningComposer.js";
import css from './LearningActivity.module.css';
import { emitLearningCallLifecycle } from "./lifecycle.js";
import { LearningVisual } from "./LearningVisual.js";
import { LearningVisualV4 } from "./LearningVisualV4.js";
const VISUAL_LABEL_KEYS = {
    eyebrow: 'visualEyebrow',
    errorTitle: 'visualErrorTitle',
    errorContinue: 'visualErrorContinue',
    sequenceLabel: 'visualSequenceLabel',
    previousStep: 'visualPreviousStep',
    nextStep: 'visualNextStep',
    reset: 'visualReset',
    chartProbeHint: 'visualChartProbeHint',
    metricsLabel: 'visualMetricsLabel',
    legendLabel: 'visualLegendLabel',
    plotInteractionHint: 'visualPlotInteractionHint',
    nodeLinkSummary: 'visualNodeLinkSummary',
    connection: 'visualConnection',
    layerLabel: 'visualLayerLabel',
    edgeLabel: 'visualEdgeLabel',
    nodeLinkInteractionHint: 'visualNodeLinkInteractionHint',
    nodeKind: 'visualNodeKind',
    edgeKind: 'visualEdgeKind',
    noDetail: 'visualNoDetail',
    closeDetail: 'visualCloseDetail',
    elementFallback: 'visualElementFallback',
    sceneSummary: 'visualSceneSummary',
    sceneInteractionHint: 'visualSceneInteractionHint',
    elementKind: 'visualElementKind',
    comparisonCaption: 'visualComparisonCaption',
    comparisonDimension: 'visualComparisonDimension',
    comparisonSubject: 'visualComparisonSubject',
    comparisonInteractionHint: 'visualComparisonInteractionHint',
    matrixCaption: 'visualMatrixCaption',
    matrixAxes: 'visualMatrixAxes',
    noRelation: 'visualNoRelation',
    matrixInteractionHint: 'visualMatrixInteractionHint',
    setsLabel: 'visualSetsLabel',
    noExclusiveItems: 'visualNoExclusiveItems',
    intersections: 'visualIntersections',
    uncategorized: 'visualUncategorized',
    setsInteractionHint: 'visualSetsInteractionHint',
    timelineLabel: 'visualTimelineLabel',
    timelineEventKind: 'visualTimelineEventKind',
    timelineEraKind: 'visualTimelineEraKind',
    timelineInteractionHint: 'visualTimelineInteractionHint',
    formulaLabel: 'visualFormulaLabel',
    formulaProgress: 'visualFormulaProgress',
    formulaRule: 'visualFormulaRule',
    formulaConclusion: 'visualFormulaConclusion',
    revealNextFormulaStep: 'visualRevealNextFormulaStep',
    formulaComplete: 'visualFormulaComplete',
    formulaInteractionHint: 'visualFormulaInteractionHint',
    studySource: 'visualStudySource',
    studyGoal: 'visualStudyGoal',
    studySections: 'visualStudySections',
    studyConcepts: 'visualStudyConcepts',
    studyAnchor: 'visualStudyAnchor',
    studySummary: 'visualStudySummary',
    prerequisite: 'visualPrerequisite',
    noPrerequisite: 'visualNoPrerequisite',
    roleFoundation: 'visualRoleFoundation',
    roleCore: 'visualRoleCore',
    roleExtension: 'visualRoleExtension',
    rolePractice: 'visualRolePractice',
    studyInteractionHint: 'visualStudyInteractionHint',
    recallDeckLabel: 'visualRecallDeckLabel',
    recallProgress: 'visualRecallProgress',
    recallPrompt: 'visualRecallPrompt',
    recallHint: 'visualRecallHint',
    recallAnswer: 'visualRecallAnswer',
    showHint: 'visualShowHint',
    showAnswer: 'visualShowAnswer',
    previousCard: 'visualPreviousCard',
    nextCard: 'visualNextCard',
    resetDeck: 'visualResetDeck',
    mastered: 'visualMastered',
    reviewAgain: 'visualReviewAgain',
    unrated: 'visualUnrated',
    recallStatus: 'visualRecallStatus',
    recallInteractionHint: 'visualRecallInteractionHint',
};
function visualLabelsOf(t) {
    return Object.fromEntries(Object.entries(VISUAL_LABEL_KEYS).map(([label, key]) => [label, t(key)]));
}
function pendingActivity(interactions, sessionId, activity, callId) {
    if (activity === undefined)
        return undefined;
    if (activity.protocol === VISUAL_PROTOCOL_V3 || activity.protocol === VISUAL_PROTOCOL_V4)
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
        if (parsed.protocol === VISUAL_PROTOCOL_V4)
            return parseLearningVisualV4(parsed);
        if (parsed.protocol === VISUAL_PROTOCOL_V3)
            return parseLearningVisualV3(parsed);
        return parsed.protocol === ACTIVITY_PROTOCOL_V2 ? parseLearningActivityV2(parsed) : parseLearningActivity(parsed);
    }
    catch {
        return undefined;
    }
}
function visualTextFallbackOf(block) {
    const raw = 'kind' in block ? block.call?.argsRaw : block.argsRaw;
    if (raw === undefined || raw === '' || raw.length > 64 * 1024)
        return undefined;
    try {
        const parsed = JSON.parse(raw);
        if (parsed.protocol !== VISUAL_PROTOCOL_V4 && parsed.protocol !== VISUAL_PROTOCOL_V3)
            return undefined;
        const title = typeof parsed.title === 'string' && parsed.title.trim() !== '' && parsed.title.length <= 200
            ? parsed.title.trim()
            : undefined;
        const description = typeof parsed.description === 'string' && parsed.description.trim() !== '' && parsed.description.length <= 1_000
            ? parsed.description.trim()
            : undefined;
        const markdown = typeof parsed.fallbackMarkdown === 'string'
            && parsed.fallbackMarkdown.trim() !== ''
            && parsed.fallbackMarkdown.length <= 8_000
            ? parsed.fallbackMarkdown
            : undefined;
        if (markdown === undefined && description === undefined && title === undefined)
            return undefined;
        return {
            ...(markdown === undefined ? {} : { markdown }),
            text: description ?? title ?? '',
            protocol: parsed.protocol,
        };
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
function visualResultOf(block) {
    if (!('kind' in block))
        return undefined;
    const content = block.content.filter(item => item.type === 'text').map(item => item.text).join('');
    if (content === '')
        return undefined;
    try {
        const parsed = JSON.parse(content);
        return parsed.protocol === VISUAL_RESULT_PROTOCOL_V4
            ? parseLearningVisualResultV4(parsed)
            : parseLearningVisualResultV3(parsed);
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
function compactAnswer(answer) {
    if (answer === undefined || answer === null)
        return undefined;
    if (typeof answer === 'string' || typeof answer === 'number' || typeof answer === 'boolean')
        return String(answer);
    if (!Array.isArray(answer)) {
        for (const key of ['text', 'explanation', 'answer']) {
            const candidate = answer[key];
            if (typeof candidate === 'string' || typeof candidate === 'number')
                return String(candidate);
        }
    }
    try {
        return JSON.stringify(answer);
    }
    catch {
        return undefined;
    }
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
    const invalidVisualFallback = activity === undefined && done ? visualTextFallbackOf(block) : undefined;
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
        if (invalidVisualFallback !== undefined) {
            return (_jsxs("div", { className: css.inlineFallback, "data-learning-result": "invalid", "data-learning-fallback": invalidVisualFallback.protocol, children: [_jsxs("p", { className: css.inlineResult, role: "alert", children: [_jsx("span", { className: css.errorMark, "aria-hidden": "true", children: "!" }), _jsx("span", { children: t('invalidActivity') })] }), invalidVisualFallback.markdown === undefined
                        ? _jsx("p", { className: css.visualTextFallback, children: invalidVisualFallback.text })
                        : _jsx("div", { className: css.fallbackText, children: _jsx(MarkdownText, { text: invalidVisualFallback.markdown }) })] }));
        }
        return _jsx("p", { className: css.inlineStatus, "data-state": done ? 'done' : 'running', children: t('invalidActivity') });
    }
    if (activity.protocol === VISUAL_PROTOCOL_V4) {
        const result = done ? visualResultOf(block) : undefined;
        if (done && (('kind' in block && block.isError) || result?.protocol !== VISUAL_RESULT_PROTOCOL_V4)) {
            return (_jsxs("div", { className: css.inlineFallback, "data-learning-result": "error", "data-learning-fallback": "visual-v4", children: [_jsxs("p", { className: css.inlineResult, role: "alert", children: [_jsx("span", { className: css.errorMark, "aria-hidden": "true", children: "!" }), _jsx("span", { children: t('visualFailed') })] }), activity.fallbackMarkdown === undefined ? (_jsx("p", { className: css.visualTextFallback, children: activity.description ?? activity.title })) : (_jsx("div", { className: css.fallbackText, children: _jsx(MarkdownText, { text: activity.fallbackMarkdown }) }))] }));
        }
        return (_jsx(LearningVisualV4, { visual: activity, storageKey: `${String(sessionId)}:${callId ?? 'visual'}`, labels: visualLabelsOf(t) }));
    }
    if (activity.protocol === VISUAL_PROTOCOL_V3) {
        const result = done ? visualResultOf(block) : undefined;
        if (done && (('kind' in block && block.isError) || result?.protocol !== VISUAL_RESULT_PROTOCOL_V3)) {
            return (_jsxs("div", { className: css.inlineFallback, "data-learning-result": "error", children: [_jsxs("p", { className: css.inlineResult, role: "alert", children: [_jsx("span", { className: css.errorMark, "aria-hidden": "true", children: "!" }), _jsx("span", { children: t('visualFailed') })] }), _jsx("p", { className: css.visualTextFallback, children: activity.description ?? activity.title })] }));
        }
        return (_jsx(LearningVisual, { visual: activity, storageKey: `${String(sessionId)}:${callId ?? 'visual'}` }));
    }
    if (activity.protocol === ACTIVITY_PROTOCOL_V2) {
        if (!done) {
            if (matched !== undefined)
                return _jsx(LearningInteraction, { matched: matched, t: t });
            return (_jsxs("p", { className: css.inlineStatus, "data-state": "running", role: "status", "aria-live": "polite", children: [_jsx("span", { className: css.runningDot, "aria-hidden": "true" }), _jsx("span", { children: t('waiting') }), _jsx("span", { className: css.skeletonLine, "aria-hidden": "true" })] }));
        }
        const v2Response = response?.protocol === RESPONSE_PROTOCOL_V2 ? response : undefined;
        if (v2Response === undefined) {
            return (_jsxs("div", { className: css.inlineFallback, "data-learning-result": "error", children: [_jsxs("p", { className: css.inlineResult, role: "alert", children: [_jsx("span", { className: css.errorMark, "aria-hidden": "true", children: "!" }), _jsx("span", { children: t('invalidResult') })] }), _jsx("div", { className: css.fallbackText, children: _jsx(MarkdownText, { text: activity.fallbackMarkdown }) })] }));
        }
        if (activity.phase === 'question') {
            const answer = v2Response.phase === 'question' ? compactAnswer(v2Response.answer) : undefined;
            return (_jsxs("p", { className: css.inlineResult, "data-learning-result": v2Response.action, children: [_jsx("span", { className: css.resultMark, "aria-hidden": "true", children: "\u2713" }), _jsx("span", { children: v2Response.action === 'submit' ? t('completed') : v2Response.action === 'skip' ? t('skipped') : t('cancelled') }), answer === undefined ? null : _jsxs("span", { className: css.resultAnswer, children: ["\u201C", answer, "\u201D"] })] }));
        }
        return (_jsxs("div", { className: css.legacyReveal, "data-learning-result": v2Response.action, children: [_jsx(MarkdownText, { text: activity.feedback.explanation }), activity.feedback.answer === undefined ? null : _jsx("strong", { children: activity.feedback.answer })] }));
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