import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { MarkdownText } from '@deepseek-ai/dsh-client-ui-primitives';
import { useState } from 'react';
import css from './LearningActivity.module.css';
function Item({ item, side }) {
    if (item === undefined)
        return _jsx("span", { className: css.emptyCell, "data-side": side, children: "\u2014" });
    return (_jsxs("div", { className: css.compareItem, "data-side": side, children: [_jsx("strong", { children: item.label }), item.detail === undefined ? null : _jsx(MarkdownText, { text: item.detail })] }));
}
export function StructureCompare({ activity, busy, onSubmit, t }) {
    const payload = activity.payload;
    const [selected, setSelected] = useState(() => new Set());
    const [answer, setAnswer] = useState('');
    const left = new Map(payload.left.items.map(item => [item.id, item]));
    const right = new Map(payload.right.items.map(item => [item.id, item]));
    const toggle = (id) => setSelected(current => {
        const next = new Set(current);
        if (next.has(id))
            next.delete(id);
        else
            next.add(id);
        return next;
    });
    const submit = () => {
        const selectedDifferences = [...selected];
        onSubmit({
            answer: { selectedDifferences, explanation: answer.trim() },
            interactionState: { selectedDifferences },
        });
    };
    return (_jsxs("div", { className: css.activityContent, children: [_jsx("p", { className: css.prompt, children: payload.question ?? activity.prompt }), _jsxs("div", { className: css.compareHeader, "aria-hidden": "true", children: [_jsx("strong", { "data-side": "left", children: payload.left.title }), _jsx("span", { className: css.compareHeaderLink, children: "\u2194" }), _jsx("strong", { "data-side": "right", children: payload.right.title })] }), _jsx("div", { className: css.compareRows, role: "group", "aria-label": t('compareMap'), "data-structure-map": "true", children: payload.alignments.map(alignment => (_jsxs("label", { className: css.compareRow, "data-alignment-id": alignment.id, "data-selected": selected.has(alignment.id) || undefined, children: [_jsx(Item, { item: alignment.leftId === undefined ? undefined : left.get(alignment.leftId), side: "left" }), _jsx("span", { className: css.compareLine, "aria-hidden": "true" }), _jsx("span", { className: css.compareSelector, children: _jsx("input", { type: "checkbox", checked: selected.has(alignment.id), disabled: busy, "aria-label": alignment.prompt ?? alignment.id, onChange: () => toggle(alignment.id) }) }), _jsx("span", { className: css.compareLine, "aria-hidden": "true" }), _jsx(Item, { item: alignment.rightId === undefined ? undefined : right.get(alignment.rightId), side: "right" }), alignment.prompt === undefined ? null : _jsx("span", { className: css.rowPrompt, children: alignment.prompt })] }, alignment.id))) }), _jsxs("label", { className: css.answerField, children: [_jsx("span", { children: t('answer') }), _jsx("textarea", { value: answer, disabled: busy, placeholder: t('answerPlaceholder'), onChange: event => setAnswer(event.target.value) })] }), _jsx("div", { className: css.primaryRow, children: _jsx("button", { className: css.primaryButton, type: "button", disabled: busy || selected.size === 0 || answer.trim() === '', onClick: submit, children: busy ? t('submitting') : t('submit') }) })] }));
}
//# sourceMappingURL=StructureCompare.js.map