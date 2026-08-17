import { jsxs as _jsxs, jsx as _jsx } from "react/jsx-runtime";
import { MarkdownText } from '@deepseek-ai/dsh-client-ui-primitives';
import { parseLearningActivity, parseLearningResponse, } from "../protocol.js";
import css from './LearningActivity.module.css';
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
function ActivityOutline({ activity }) {
    switch (activity.kind) {
        case 'parameter_explorer':
            return (_jsxs("div", { className: css.replayOutline, children: [_jsx("ul", { children: activity.payload.parameters.map(item => _jsxs("li", { children: [item.label, ": ", item.min, "\u2013", item.max] }, item.id)) }), _jsx("ul", { children: activity.payload.curves.map(item => _jsx("li", { children: item.label }, item.id)) })] }));
        case 'process_stepper':
            return (_jsx("ol", { className: css.replaySteps, children: activity.payload.steps.map(step => (_jsxs("li", { children: [_jsx("strong", { children: step.title }), _jsx(MarkdownText, { text: step.content })] }, step.id))) }));
        case 'structure_compare':
            return (_jsx("div", { className: css.replayCompare, children: [activity.payload.left, activity.payload.right].map(side => (_jsxs("section", { children: [_jsx("strong", { children: side.title }), _jsx("ul", { children: side.items.map(item => _jsx("li", { children: item.label }, item.id)) })] }, side.title))) }));
    }
}
export function LearningToolView({ block, inspect, t }) {
    const activity = activityOf(block);
    const done = 'kind' in block;
    const response = responseOf(block);
    if (activity === undefined) {
        return _jsx("div", { className: css.toolRow, "data-state": done ? 'done' : 'running', children: t('invalidActivity') });
    }
    if (!done) {
        return (_jsxs("button", { className: css.toolRow, "data-state": "running", type: "button", onClick: inspect, children: [_jsxs("span", { children: [_jsx("strong", { children: activity.title }), _jsx("small", { children: t('waiting') })] }), _jsx("span", { className: css.runningDot, "aria-hidden": "true" })] }));
    }
    const status = response?.action === 'submit' ? t('completed')
        : response?.action === 'skip' ? t('skipped')
            : response?.action === 'cancel' ? t('cancelled') : t('noResponse');
    return (_jsxs("details", { className: css.replay, children: [_jsx("summary", { children: _jsxs("span", { children: [_jsx("strong", { children: activity.title }), _jsx("small", { children: status })] }) }), _jsxs("div", { className: css.replayBody, children: [_jsx("p", { children: activity.objective }), _jsx(ActivityOutline, { activity: activity }), _jsxs("details", { children: [_jsx("summary", { children: t('fallback') }), _jsx(MarkdownText, { text: activity.fallbackMarkdown })] }), _jsxs("section", { className: css.response, children: [_jsx("strong", { children: t('response') }), response === undefined ? _jsx("p", { children: t('noResponse') }) : _jsx("pre", { children: JSON.stringify(response, null, 2) })] })] })] }));
}
//# sourceMappingURL=LearningToolView.js.map