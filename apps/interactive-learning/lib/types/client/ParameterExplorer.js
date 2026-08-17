import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useMemo, useState } from 'react';
import { evaluateMathExpression } from "../math-expression.js";
import css from './LearningActivity.module.css';
function formatNumber(value) {
    return Number.isInteger(value) ? String(value) : String(Number(value.toPrecision(6)));
}
function pathsFor(payload, values) {
    const samples = payload.xAxis.samples ?? 96;
    const series = payload.curves.map(() => []);
    const finiteY = [];
    for (let index = 0; index < samples; index += 1) {
        const x = payload.xAxis.min + (payload.xAxis.max - payload.xAxis.min) * index / (samples - 1);
        for (const [curveIndex, curve] of payload.curves.entries()) {
            const y = evaluateMathExpression(curve.expression, { ...values, x });
            series[curveIndex]?.push({ x, y });
            if (Number.isFinite(y) && Math.abs(y) <= 1e12)
                finiteY.push(y);
        }
    }
    if (finiteY.length === 0)
        return series.map(() => '');
    let minY = Math.min(...finiteY);
    let maxY = Math.max(...finiteY);
    if (minY === maxY) {
        minY -= 1;
        maxY += 1;
    }
    const width = 640;
    const height = 220;
    return series.map(points => {
        let open = false;
        return points.map(point => {
            if (!Number.isFinite(point.y) || Math.abs(point.y) > 1e12) {
                open = false;
                return '';
            }
            const px = (point.x - payload.xAxis.min) / (payload.xAxis.max - payload.xAxis.min) * width;
            const py = height - (point.y - minY) / (maxY - minY) * height;
            const command = open ? 'L' : 'M';
            open = true;
            return `${command}${px.toFixed(2)},${py.toFixed(2)}`;
        }).filter(Boolean).join(' ');
    });
}
export function ParameterExplorer({ activity, busy, onSubmit, t }) {
    const payload = activity.payload;
    const [values, setValues] = useState(() => Object.fromEntries(payload.parameters.map(parameter => [parameter.id, parameter.initial])));
    const [answer, setAnswer] = useState('');
    const [prediction, setPrediction] = useState('');
    const [predictionCommitted, setPredictionCommitted] = useState(false);
    const paths = useMemo(() => pathsFor(payload, values), [payload, values]);
    const submit = () => {
        const parameters = { ...values };
        onSubmit({
            answer: { prediction: prediction.trim(), parameters, explanation: answer.trim() },
            interactionState: { prediction: prediction.trim(), predictionCommitted, parameters },
        });
    };
    return (_jsxs("div", { className: css.activityContent, children: [_jsx("p", { className: css.prompt, children: payload.question ?? activity.prompt }), _jsxs("section", { className: css.predictionGate, "aria-labelledby": "parameter-prediction-title", children: [_jsxs("label", { className: css.answerField, children: [_jsx("strong", { id: "parameter-prediction-title", children: t('predict') }), _jsx("span", { children: t('parameterPredictionPrompt') }), _jsx("textarea", { value: prediction, disabled: busy || predictionCommitted, placeholder: t('parameterPredictionPlaceholder'), onChange: event => setPrediction(event.target.value) })] }), predictionCommitted ? (_jsx("p", { className: css.predictionStatus, role: "status", children: t('predictionCommitted') })) : (_jsx("div", { className: css.primaryRow, children: _jsx("button", { className: css.primaryButton, type: "button", disabled: busy || prediction.trim() === '', onClick: () => setPredictionCommitted(true), children: t('commitPrediction') }) }))] }), _jsxs("div", { className: css.explorerGrid, "aria-disabled": !predictionCommitted, children: [_jsxs("div", { className: css.controls, children: [payload.parameters.map(parameter => (_jsxs("label", { className: css.rangeField, children: [_jsx("span", { children: t('rangeValue', { label: parameter.label, value: formatNumber(values[parameter.id] ?? parameter.initial) }) }), _jsx("input", { type: "range", min: parameter.min, max: parameter.max, step: parameter.step, value: values[parameter.id] ?? parameter.initial, disabled: busy || !predictionCommitted, "aria-valuetext": formatNumber(values[parameter.id] ?? parameter.initial), onChange: event => setValues(current => ({ ...current, [parameter.id]: Number(event.target.value) })) }), _jsxs("span", { className: css.rangeEnds, children: [_jsx("span", { children: formatNumber(parameter.min) }), _jsx("span", { children: formatNumber(parameter.max) })] })] }, parameter.id))), _jsx("ul", { className: css.legend, children: payload.curves.map((curve, index) => _jsx("li", { "data-curve": index, children: curve.label }, curve.id)) })] }), _jsxs("svg", { className: css.chart, viewBox: "0 0 640 220", role: "img", "aria-label": t('chartLabel'), "aria-hidden": !predictionCommitted, children: [_jsx("line", { className: css.axis, x1: "0", x2: "640", y1: "110", y2: "110" }), _jsx("line", { className: css.axis, x1: "320", x2: "320", y1: "0", y2: "220" }), paths.map((path, index) => _jsx("path", { className: css.curve, "data-curve": index, d: path }, payload.curves[index]?.id))] })] }), _jsxs("label", { className: css.answerField, children: [_jsx("span", { children: t('answer') }), _jsx("textarea", { value: answer, disabled: busy || !predictionCommitted, placeholder: t('answerPlaceholder'), onChange: event => setAnswer(event.target.value) })] }), _jsx("div", { className: css.primaryRow, children: _jsx("button", { className: css.primaryButton, type: "button", disabled: busy || !predictionCommitted || answer.trim() === '', onClick: submit, children: busy ? t('submitting') : t('submit') }) })] }));
}
//# sourceMappingURL=ParameterExplorer.js.map