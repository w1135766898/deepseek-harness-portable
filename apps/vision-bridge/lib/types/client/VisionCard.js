import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * Visual settings card registered into `settings.plugin.item`.
 * @module @dsh-portable/vision-bridge/client/VisionCard
 */
import { useState } from 'react';
import css from './VisionCard.module.css';
/** Locale key triplet describing one selection state. */
const ROUTE_COPY = {
    auto: { badge: 'routeAuto', title: 'routeAutoTitle', hint: 'routeAutoHint' },
    pinned: { badge: 'routePinned', title: 'routePinnedTitle', hint: 'routePinnedHint' },
    disabled: { badge: 'routeDisabled', title: 'routeDisabledTitle', hint: 'routeDisabledHint' },
};
export function VisionCard(props) {
    const [open, setOpen] = useState(false);
    const { t } = props;
    const state = props.useVisionCard(snapshot => snapshot);
    if (!state.available)
        return null;
    const title = t('cardTitle');
    const desc = t('cardDescription');
    const blocked = !state.dirty || state.saving || !state.writable;
    const copy = ROUTE_COPY[state.route.kind];
    const selection = state.route.model ?? '';
    return (_jsxs("li", { className: `${css.card} ${open ? css.cardOpen : ''}`, children: [_jsxs("button", { type: "button", className: css.header, "aria-expanded": open, "aria-label": `${t(open ? 'collapse' : 'expand')}: ${title}`, onClick: () => setOpen(!open), children: [_jsxs("span", { className: css.headText, children: [_jsx("span", { className: css.name, children: title }), _jsx("span", { className: css.description, children: desc })] }), state.dirty && _jsx("span", { className: css.pending, children: t('unsaved') }), _jsx("span", { className: `${css.routeBadge} ${css[`route_${state.route.kind}`]}`, children: t(copy.badge) }), _jsx("svg", { className: `${css.chevron} ${open ? css.chevronOpen : ''}`, viewBox: "0 0 16 16", fill: "currentColor", children: _jsx("path", { fillRule: "evenodd", d: "M4.22 6.22a.75.75 0 0 1 1.06 0L8 8.94l2.72-2.72a.75.75 0 1 1 1.06 1.06l-3.25 3.25a.75.75 0 0 1-1.06 0L4.22 7.28a.75.75 0 0 1 0-1.06Z", clipRule: "evenodd" }) })] }), open && (_jsxs("div", { className: css.body, children: [!state.writable && (_jsx("p", { className: css.readOnly, role: "status", children: t('readOnly') })), _jsxs("div", { className: `${css.routeSummary} ${css.nativeRoute}`, "data-route": "shared-providers", role: "status", children: [_jsx("span", { className: css.routeDot, "aria-hidden": "true" }), _jsxs("span", { className: css.routeText, children: [_jsx("strong", { children: t('sharedProviderTitle') }), _jsx("span", { children: t('sharedProviderHint') })] })] }), _jsxs("div", { className: `${css.routeSummary} ${css[`route_${state.route.kind}`]}`, "data-route": state.route.kind, role: "status", "aria-live": "polite", children: [_jsx("span", { className: css.routeDot, "aria-hidden": "true" }), _jsxs("span", { className: css.routeText, children: [_jsx("strong", { children: t(copy.title) }), _jsx("span", { children: t(copy.hint) }), selection !== '' && _jsx("code", { children: selection })] })] }), _jsxs("div", { className: css.fieldRow, children: [_jsxs("div", { children: [_jsx("div", { className: css.label, children: t('enabled') }), _jsx("div", { className: css.hint, children: t('enabledHint') })] }), _jsxs("label", { className: css.switch, children: [_jsx("input", { type: "checkbox", checked: state.enabled, disabled: !state.writable, onChange: e => props.edit('enabled', e.target.checked) }), _jsx("span", { className: css.slider })] })] }), _jsxs("div", { className: css.field, children: [_jsx("label", { className: css.label, children: t('model') }), _jsx("input", { type: "text", className: css.input, value: state.model, disabled: !state.writable, placeholder: t('modelPlaceholder'), onChange: e => props.edit('model', e.target.value) }), _jsx("span", { className: css.hint, children: t('modelHint') })] }), state.route.kind === 'pinned' && (_jsx("button", { type: "button", className: `${css.btn} ${css.discard}`, disabled: !state.writable, onClick: props.useAutomaticModel, children: t('useAutomatic') })), _jsxs("div", { className: css.footer, children: [state.failed && (_jsx("span", { className: `${css.statusMsg} ${css.error}`, children: t('saveFailed') })), _jsx("button", { type: "button", className: `${css.btn} ${css.discard}`, disabled: !state.dirty || state.saving, onClick: props.discard, children: t('discard') }), _jsx("button", { type: "button", className: `${css.btn} ${css.save}`, disabled: blocked, onClick: props.save, children: t(state.saving ? 'saving' : 'save') })] })] }))] }));
}
//# sourceMappingURL=VisionCard.js.map