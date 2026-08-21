import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { planVisionTurn } from "./vision-route.js";
import css from './VisionRouteMarker.module.css';
export function VisionRouteMarker({ input, t, useVisionCard }) {
    const enabled = useVisionCard(state => state.enabled);
    const plan = planVisionTurn(input.imageIds);
    if (!enabled || plan.kind === 'text')
        return null;
    return (_jsxs("div", { className: css.root, "data-route": plan.kind, role: "status", "aria-live": "polite", children: [_jsx("span", { className: css.dot, "aria-hidden": "true" }), _jsx("span", { children: t('visionTurnReady') }), _jsx("span", { className: css.count, children: t('visionTurnImages', { count: plan.imageCount }) }), _jsx("span", { className: css.srOnly, children: t('visionTurnRestore') })] }));
}
//# sourceMappingURL=VisionRouteMarker.js.map