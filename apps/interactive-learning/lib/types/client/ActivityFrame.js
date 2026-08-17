import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { MarkdownText } from '@deepseek-ai/dsh-client-ui-primitives';
import css from './LearningActivity.module.css';
export function ActivityFrame({ activityId, activity, busy, error, children, onSkip, onCancel, t, }) {
    return (_jsxs("section", { className: css.inlineActivity, "aria-label": activity.title, "data-learning-activity": activity.kind, "data-learning-activity-id": activityId, "data-learning-surface": "inline", children: [children, activity.scaffold === undefined ? null : (_jsxs("details", { className: css.scaffold, children: [_jsx("summary", { children: t('scaffold') }), _jsx(MarkdownText, { text: activity.scaffold })] })), error === null ? null : _jsx("p", { className: css.error, role: "alert", children: error }), _jsxs("div", { className: css.activityActions, children: [_jsx("button", { className: css.textButton, type: "button", disabled: busy, onClick: onSkip, children: t('skip') }), _jsx("button", { className: css.textButton, type: "button", disabled: busy, onClick: onCancel, children: t('cancel') })] })] }));
}
//# sourceMappingURL=ActivityFrame.js.map