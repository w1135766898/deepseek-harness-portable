import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useId, useMemo, useRef, useState, } from 'react';
import { evaluateMathExpression } from "../math-expression.js";
import css from './LearningActivity.module.css';
const MAX_RENDERABLE_VALUE = 1e12;
const MAX_PARAMETER_DOMAIN_SAMPLES = 33;
function formatNumber(value) {
    return Number.isInteger(value) ? String(value) : String(Number(value.toPrecision(6)));
}
function uniqueNumbers(values) {
    return [...new Set(values.map(value => Number(value.toPrecision(12))))];
}
function parameterCandidates(parameter) {
    const discreteSteps = Math.max(1, Math.ceil((parameter.max - parameter.min) / parameter.step));
    const sampleCount = Math.min(discreteSteps + 1, MAX_PARAMETER_DOMAIN_SAMPLES);
    const candidates = Array.from({ length: sampleCount }, (_, index) => {
        const stepIndex = sampleCount === 1 ? 0 : Math.round(index * discreteSteps / (sampleCount - 1));
        return Math.min(parameter.max, parameter.min + stepIndex * parameter.step);
    });
    return uniqueNumbers([
        ...candidates,
        parameter.min,
        parameter.max,
        parameter.initial,
        ...(parameter.min <= 0 && parameter.max >= 0 ? [0] : []),
    ]);
}
function parameterStates(payload) {
    return payload.parameters.reduce((states, parameter) => {
        const candidates = parameterCandidates(parameter);
        return states.flatMap(state => candidates.map(value => ({ ...state, [parameter.id]: value })));
    }, [{}]);
}
function niceStep(rawStep) {
    if (!Number.isFinite(rawStep) || rawStep <= 0)
        return 1;
    const power = 10 ** Math.floor(Math.log10(rawStep));
    const normalized = rawStep / power;
    const multiple = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
    return multiple * power;
}
function paddedYDomain(min, max) {
    if (min === max) {
        const radius = Math.max(Math.abs(min) * 0.2, 1);
        return { min: min - radius, max: max + radius };
    }
    const span = max - min;
    const padding = span * 0.08;
    const step = niceStep((span + padding * 2) / 5);
    let domainMin = Math.floor((min - padding) / step) * step;
    let domainMax = Math.ceil((max + padding) / step) * step;
    if (domainMin === domainMax) {
        domainMin -= step;
        domainMax += step;
    }
    return { min: domainMin, max: domainMax };
}
function stableYDomain(payload) {
    const samples = Math.min(payload.xAxis.samples ?? 96, 96);
    let min = 0;
    let max = 0;
    let found = false;
    for (const values of parameterStates(payload)) {
        for (let index = 0; index < samples; index += 1) {
            const x = payload.xAxis.min + (payload.xAxis.max - payload.xAxis.min) * index / (samples - 1);
            for (const curve of payload.curves) {
                const y = evaluateMathExpression(curve.expression, { ...values, x });
                if (!Number.isFinite(y) || Math.abs(y) > MAX_RENDERABLE_VALUE)
                    continue;
                min = found ? Math.min(min, y) : Math.min(0, y);
                max = found ? Math.max(max, y) : Math.max(0, y);
                found = true;
            }
        }
    }
    if (!found)
        return { min: -1, max: 1 };
    return paddedYDomain(min, max);
}
function yDomainForState(payload, values, stable) {
    const samples = payload.xAxis.samples ?? 96;
    let min = stable.min;
    let max = stable.max;
    let expanded = false;
    for (let index = 0; index < samples; index += 1) {
        const x = payload.xAxis.min + (payload.xAxis.max - payload.xAxis.min) * index / (samples - 1);
        for (const curve of payload.curves) {
            const y = evaluateMathExpression(curve.expression, { ...values, x });
            if (!Number.isFinite(y) || Math.abs(y) > MAX_RENDERABLE_VALUE)
                continue;
            if (y < min) {
                min = y;
                expanded = true;
            }
            if (y > max) {
                max = y;
                expanded = true;
            }
        }
    }
    return expanded ? paddedYDomain(min, max) : stable;
}
function ticksFor(domain, targetCount = 5) {
    const step = niceStep((domain.max - domain.min) / targetCount);
    const first = Math.ceil(domain.min / step) * step;
    const ticks = [];
    for (let value = first; value <= domain.max + step * 1e-8; value += step) {
        ticks.push(Number(value.toPrecision(12)));
    }
    return ticks;
}
function chartGeometry(width) {
    const safeWidth = Math.max(280, Math.round(width));
    const height = safeWidth < 480 ? 260 : 300;
    const left = safeWidth < 360 ? 56 : 64;
    const right = 18;
    const top = 18;
    const bottom = 40;
    return {
        width: safeWidth,
        height,
        left,
        right,
        top,
        bottom,
        plotWidth: safeWidth - left - right,
        plotHeight: height - top - bottom,
    };
}
function scaleX(value, domain, geometry) {
    return geometry.left + (value - domain.min) / (domain.max - domain.min) * geometry.plotWidth;
}
function scaleY(value, domain, geometry) {
    return geometry.top + (domain.max - value) / (domain.max - domain.min) * geometry.plotHeight;
}
function pathsFor(payload, values, yDomain, geometry) {
    const samples = payload.xAxis.samples ?? 96;
    const xDomain = { min: payload.xAxis.min, max: payload.xAxis.max };
    const series = payload.curves.map(() => []);
    for (let index = 0; index < samples; index += 1) {
        const x = payload.xAxis.min + (payload.xAxis.max - payload.xAxis.min) * index / (samples - 1);
        for (const [curveIndex, curve] of payload.curves.entries()) {
            series[curveIndex]?.push({ x, y: evaluateMathExpression(curve.expression, { ...values, x }) });
        }
    }
    return series.map(points => {
        let open = false;
        let previousY = null;
        return points.map(point => {
            if (!Number.isFinite(point.y) || Math.abs(point.y) > MAX_RENDERABLE_VALUE) {
                open = false;
                previousY = null;
                return '';
            }
            const px = scaleX(point.x, xDomain, geometry);
            const py = scaleY(point.y, yDomain, geometry);
            if (previousY !== null && Math.abs(py - previousY) > geometry.plotHeight * 1.5)
                open = false;
            const command = open ? 'L' : 'M';
            open = true;
            previousY = py;
            return `${command}${px.toFixed(2)},${py.toFixed(2)}`;
        }).filter(Boolean).join(' ');
    });
}
function rangeStyle(parameter, value) {
    const span = parameter.max - parameter.min;
    const valuePercent = (value - parameter.min) / span * 100;
    const anchorValue = parameter.min <= 0 && parameter.max >= 0 ? 0 : parameter.min;
    const anchorPercent = (anchorValue - parameter.min) / span * 100;
    return {
        '--range-low': `${Math.min(valuePercent, anchorPercent)}%`,
        '--range-high': `${Math.max(valuePercent, anchorPercent)}%`,
    };
}
function shiftedValue(parameter, current, direction) {
    const shifted = current + parameter.step * direction;
    const clamped = Math.min(parameter.max, Math.max(parameter.min, shifted));
    return Number(clamped.toPrecision(12));
}
/** V2 current-frame parameter visual. It deliberately owns no teaching prompt or answer. */
export function ParameterRoundVisual({ payload, disabled, t, }) {
    const chartId = useId();
    const [values, setValues] = useState(() => Object.fromEntries(payload.parameters.map(parameter => [parameter.id, parameter.initial])));
    const fullPayload = payload;
    const stableDomain = useMemo(() => stableYDomain(fullPayload), [fullPayload]);
    const yDomain = useMemo(() => yDomainForState(fullPayload, values, stableDomain), [fullPayload, stableDomain, values]);
    const geometry = useMemo(() => chartGeometry(640), []);
    const paths = useMemo(() => pathsFor(fullPayload, values, yDomain, geometry), [fullPayload, geometry, values, yDomain]);
    const description = t('chartDescription', {
        parameters: payload.parameters.map(parameter => `${parameter.label} ${formatNumber(values[parameter.id] ?? parameter.initial)}`).join('; '),
        xAxis: `${payload.xAxis.label ?? 'x'} ${formatNumber(payload.xAxis.min)}–${formatNumber(payload.xAxis.max)}`,
        yAxis: `y ${formatNumber(yDomain.min)}–${formatNumber(yDomain.max)}`,
        curves: payload.curves.map(curve => curve.label).join('; '),
    });
    return (_jsxs("div", { className: css.explorer, children: [_jsx("div", { className: css.controls, children: payload.parameters.map(parameter => {
                    const value = values[parameter.id] ?? parameter.initial;
                    const inputId = `${chartId}-${parameter.id}`;
                    return (_jsxs("div", { className: css.rangeField, children: [_jsxs("div", { className: css.rangeHeader, children: [_jsx("label", { htmlFor: inputId, children: parameter.label }), _jsx("output", { htmlFor: inputId, "aria-live": "polite", children: formatNumber(value) })] }), _jsx("input", { id: inputId, className: css.rangeInput, style: rangeStyle(parameter, value), type: "range", min: parameter.min, max: parameter.max, step: parameter.step, value: value, disabled: disabled, onChange: event => setValues(current => ({ ...current, [parameter.id]: Number(event.target.value) })) })] }, parameter.id));
                }) }), _jsxs("div", { className: css.chartRegion, children: [_jsx("ul", { className: css.legend, children: payload.curves.map((curve, index) => _jsx("li", { "data-curve": index, children: curve.label }, curve.id)) }), _jsxs("svg", { className: css.chart, viewBox: `0 0 ${geometry.width} ${geometry.height}`, role: "img", "aria-labelledby": `${chartId}-title ${chartId}-description`, children: [_jsx("title", { id: `${chartId}-title`, children: t('chartLabel') }), _jsx("desc", { id: `${chartId}-description`, children: description }), _jsx("rect", { className: css.plotFrame, x: geometry.left, y: geometry.top, width: geometry.plotWidth, height: geometry.plotHeight, rx: "6" }), paths.map((path, index) => _jsx("path", { className: css.curve, "data-curve": index, d: path }, payload.curves[index]?.id))] })] })] }));
}
export function ParameterExplorer({ activity, busy, onSubmit, t }) {
    const payload = activity.payload;
    const chartId = useId();
    const chartContainer = useRef(null);
    const [chartWidth, setChartWidth] = useState(640);
    const [values, setValues] = useState(() => Object.fromEntries(payload.parameters.map(parameter => [parameter.id, parameter.initial])));
    const [answer, setAnswer] = useState('');
    const stableDomain = useMemo(() => stableYDomain(payload), [payload]);
    const yDomain = useMemo(() => yDomainForState(payload, values, stableDomain), [payload, stableDomain, values]);
    const geometry = useMemo(() => chartGeometry(chartWidth), [chartWidth]);
    const xDomain = useMemo(() => ({ min: payload.xAxis.min, max: payload.xAxis.max }), [payload.xAxis.max, payload.xAxis.min]);
    const xTicks = useMemo(() => ticksFor(xDomain), [xDomain]);
    const yTicks = useMemo(() => ticksFor(yDomain), [yDomain]);
    const paths = useMemo(() => pathsFor(payload, values, yDomain, geometry), [geometry, payload, values, yDomain]);
    const chartDescription = t('chartDescription', {
        parameters: payload.parameters.map(parameter => (`${parameter.label} ${formatNumber(values[parameter.id] ?? parameter.initial)} (${formatNumber(parameter.min)}–${formatNumber(parameter.max)})`)).join('; '),
        xAxis: `${payload.xAxis.label ?? 'x'} ${formatNumber(xDomain.min)}–${formatNumber(xDomain.max)}`,
        yAxis: `y ${formatNumber(yDomain.min)}–${formatNumber(yDomain.max)}`,
        curves: payload.curves.map(curve => curve.label).join('; '),
    });
    useEffect(() => {
        const container = chartContainer.current;
        if (!container)
            return;
        const updateWidth = (width) => {
            if (width >= 280)
                setChartWidth(current => Math.abs(current - width) < 1 ? current : width);
        };
        updateWidth(container.getBoundingClientRect().width);
        if (typeof ResizeObserver === 'undefined')
            return;
        const observer = new ResizeObserver(entries => {
            const entry = entries[0];
            if (entry)
                updateWidth(entry.contentRect.width);
        });
        observer.observe(container);
        return () => observer.disconnect();
    }, []);
    const setParameter = (parameter, value) => {
        setValues(current => ({ ...current, [parameter.id]: value }));
    };
    const submit = () => {
        const parameters = { ...values };
        onSubmit({
            answer: { parameters, explanation: answer.trim() },
            interactionState: { parameters },
        });
    };
    return (_jsxs("div", { className: css.activityContent, children: [_jsx("p", { className: css.prompt, children: payload.question ?? activity.prompt }), _jsxs("div", { className: css.explorer, children: [_jsx("div", { className: css.controls, children: payload.parameters.map(parameter => {
                            const value = values[parameter.id] ?? parameter.initial;
                            const inputId = `${chartId}-${parameter.id}`;
                            const zeroPercent = (0 - parameter.min) / (parameter.max - parameter.min) * 100;
                            return (_jsxs("div", { className: css.rangeField, children: [_jsxs("div", { className: css.rangeHeader, children: [_jsx("label", { htmlFor: inputId, children: parameter.label }), _jsx("output", { htmlFor: inputId, "aria-live": "polite", children: formatNumber(value) })] }), _jsxs("div", { className: css.rangeControl, children: [_jsx("button", { className: css.stepButton, type: "button", disabled: busy || value <= parameter.min, "aria-label": t('decreaseParameter', { label: parameter.label }), onClick: () => setParameter(parameter, shiftedValue(parameter, value, -1)), children: "\u2212" }), _jsx("input", { id: inputId, className: css.rangeInput, style: rangeStyle(parameter, value), type: "range", min: parameter.min, max: parameter.max, step: parameter.step, value: value, disabled: busy, "aria-valuetext": formatNumber(value), onChange: event => setParameter(parameter, Number(event.target.value)) }), _jsx("button", { className: css.stepButton, type: "button", disabled: busy || value >= parameter.max, "aria-label": t('increaseParameter', { label: parameter.label }), onClick: () => setParameter(parameter, shiftedValue(parameter, value, 1)), children: "+" }), _jsxs("div", { className: css.rangeEnds, "aria-hidden": "true", children: [_jsx("span", { children: formatNumber(parameter.min) }), parameter.min < 0 && parameter.max > 0 ? (_jsx("span", { className: css.rangeZero, style: { left: `${zeroPercent}%` }, children: "0" })) : null, _jsx("span", { children: formatNumber(parameter.max) })] })] })] }, parameter.id));
                        }) }), _jsxs("div", { className: css.chartRegion, ref: chartContainer, children: [_jsx("ul", { className: css.legend, children: payload.curves.map((curve, index) => _jsx("li", { "data-curve": index, children: curve.label }, curve.id)) }), _jsxs("svg", { className: css.chart, viewBox: `0 0 ${geometry.width} ${geometry.height}`, role: "img", "aria-labelledby": `${chartId}-title ${chartId}-description`, children: [_jsx("title", { id: `${chartId}-title`, children: t('chartLabel') }), _jsx("desc", { id: `${chartId}-description`, children: chartDescription }), _jsx("defs", { children: _jsx("clipPath", { id: `${chartId}-clip`, children: _jsx("rect", { x: geometry.left, y: geometry.top, width: geometry.plotWidth, height: geometry.plotHeight }) }) }), _jsx("rect", { className: css.plotFrame, x: geometry.left, y: geometry.top, width: geometry.plotWidth, height: geometry.plotHeight, rx: "6" }), yTicks.map(tick => {
                                        const y = scaleY(tick, yDomain, geometry);
                                        return (_jsxs("g", { children: [_jsx("line", { className: tick === 0 ? `${css.gridLine} ${css.zeroAxis}` : css.gridLine, x1: geometry.left, x2: geometry.left + geometry.plotWidth, y1: y, y2: y }), _jsx("text", { className: css.tickLabel, x: geometry.left - 9, y: y, textAnchor: "end", dominantBaseline: "middle", children: formatNumber(tick) })] }, `y-${tick}`));
                                    }), xTicks.map(tick => {
                                        const x = scaleX(tick, xDomain, geometry);
                                        return (_jsxs("g", { children: [_jsx("line", { className: tick === 0 ? `${css.gridLine} ${css.zeroAxis}` : css.gridLine, x1: x, x2: x, y1: geometry.top, y2: geometry.top + geometry.plotHeight }), _jsx("text", { className: css.tickLabel, x: x, y: geometry.top + geometry.plotHeight + 20, textAnchor: "middle", children: formatNumber(tick) })] }, `x-${tick}`));
                                    }), _jsx("text", { className: css.axisLabel, "data-axis": "y", x: geometry.left, y: geometry.top - 7, textAnchor: "start", children: "y" }), _jsx("text", { className: css.axisLabel, "data-axis": "x", x: geometry.left + geometry.plotWidth, y: geometry.height - 5, textAnchor: "end", children: payload.xAxis.label ?? 'x' }), _jsx("g", { clipPath: `url(#${chartId}-clip)`, children: paths.map((path, index) => (_jsx("path", { className: css.curve, "data-curve": index, d: path }, payload.curves[index]?.id))) })] })] })] }), _jsxs("label", { className: css.answerField, children: [_jsx("span", { children: t('answer') }), _jsx("textarea", { value: answer, disabled: busy, placeholder: t('answerPlaceholder'), onChange: event => setAnswer(event.target.value) })] }), _jsx("div", { className: css.primaryRow, children: _jsx("button", { className: css.primaryButton, type: "button", disabled: busy || answer.trim() === '', onClick: submit, children: busy ? t('submitting') : t('submit') }) })] }));
}
//# sourceMappingURL=ParameterExplorer.js.map