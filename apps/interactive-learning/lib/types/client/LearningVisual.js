import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { evaluateMathExpression } from "../math-expression.js";
import css from './LearningActivity.module.css';
const DEFAULT_TONES = ['blue', 'red', 'green', 'orange', 'purple', 'gray'];
function formatNumber(value, digits) {
    if (!Number.isFinite(value))
        return '—';
    if (digits !== undefined)
        return value.toFixed(digits);
    if (Number.isInteger(value))
        return String(value);
    return String(Number(value.toPrecision(6)));
}
function niceStep(rawStep) {
    if (!Number.isFinite(rawStep) || rawStep <= 0)
        return 1;
    const power = 10 ** Math.floor(Math.log10(rawStep));
    const normalized = rawStep / power;
    const multiple = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
    return multiple * power;
}
function normalizedPosition(value, min, max) {
    const span = max - min;
    if (Number.isFinite(span) && span > 0)
        return (value - min) / span;
    const scale = Math.max(Math.abs(value), Math.abs(min), Math.abs(max));
    if (!Number.isFinite(scale) || scale === 0)
        return 0;
    return (value / scale - min / scale) / (max / scale - min / scale);
}
function interpolate(min, max, ratio) {
    if (ratio <= 0)
        return min;
    if (ratio >= 1)
        return max;
    return min * (1 - ratio) + max * ratio;
}
function ticks(min, max, target = 6) {
    const step = niceStep(max / target - min / target);
    const first = Math.ceil(min / step) * step;
    if (!Number.isFinite(step) || step <= 0 || !Number.isFinite(first))
        return [min, max];
    const result = [];
    const limit = Math.max(4, target * 4);
    let previous;
    for (let index = 0; index < limit; index += 1) {
        const value = first + step * index;
        if (!Number.isFinite(value) || value > max)
            break;
        if (value === previous)
            break;
        result.push(Number(value.toPrecision(12)));
        previous = value;
    }
    return result.length > 0 ? result : [min, max];
}
function geometryFor(width) {
    const safeWidth = Math.max(300, Math.round(width));
    const compact = safeWidth < 520;
    const height = compact ? 270 : 330;
    const left = compact ? 54 : 64;
    const right = 18;
    const top = 18;
    const bottom = compact ? 48 : 54;
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
function scaleX(value, visual, geometry) {
    return geometry.left
        + normalizedPosition(value, visual.xAxis.min, visual.xAxis.max) * geometry.plotWidth;
}
function scaleY(value, visual, geometry) {
    return geometry.top
        + (1 - normalizedPosition(value, visual.yAxis.min, visual.yAxis.max)) * geometry.plotHeight;
}
function curvePath(curve, visual, values, geometry) {
    const samples = visual.xAxis.samples ?? 128;
    const commands = [];
    let drawing = false;
    let previousY;
    for (let index = 0; index < samples; index += 1) {
        const x = interpolate(visual.xAxis.min, visual.xAxis.max, index / Math.max(1, samples - 1));
        const y = evaluateMathExpression(curve.expression, { ...values, x });
        if (!Number.isFinite(y) || Math.abs(y) > 1e12) {
            drawing = false;
            previousY = undefined;
            continue;
        }
        const px = scaleX(x, visual, geometry);
        const py = scaleY(y, visual, geometry);
        if (previousY !== undefined && Math.abs(previousY - py) > geometry.plotHeight * 2)
            drawing = false;
        commands.push(`${drawing ? 'L' : 'M'}${px.toFixed(2)},${py.toFixed(2)}`);
        drawing = true;
        previousY = py;
    }
    return commands.join(' ');
}
function toneOf(series, index) {
    return series.tone ?? DEFAULT_TONES[index % DEFAULT_TONES.length] ?? 'blue';
}
function rangeStyle(parameter, value) {
    const progress = normalizedPosition(value, parameter.min, parameter.max) * 100;
    return { '--visual-range-progress': `${progress}%` };
}
function initialValues(visual, storageKey) {
    const defaults = Object.fromEntries(visual.parameters.map(parameter => [parameter.id, parameter.initial]));
    if (storageKey === undefined || typeof sessionStorage === 'undefined')
        return defaults;
    try {
        const stored = JSON.parse(sessionStorage.getItem(`dsh-learning/visual@3:${storageKey}`) ?? '{}');
        for (const parameter of visual.parameters) {
            const candidate = stored[parameter.id];
            if (typeof candidate === 'number' && Number.isFinite(candidate)
                && candidate >= parameter.min && candidate <= parameter.max) {
                defaults[parameter.id] = candidate;
            }
        }
    }
    catch {
        // Corrupt local UI state should never prevent the canonical visual replay.
    }
    return defaults;
}
export function LearningVisual({ visual, storageKey }) {
    const chartId = useId();
    const chartContainer = useRef(null);
    const [chartWidth, setChartWidth] = useState(760);
    const [values, setValues] = useState(() => initialValues(visual, storageKey));
    const geometry = useMemo(() => geometryFor(chartWidth), [chartWidth]);
    const xTicks = useMemo(() => ticks(visual.xAxis.min, visual.xAxis.max), [visual.xAxis.max, visual.xAxis.min]);
    const yTicks = useMemo(() => ticks(visual.yAxis.min, visual.yAxis.max), [visual.yAxis.max, visual.yAxis.min]);
    const curves = useMemo(() => visual.series.flatMap((series, index) => series.type === 'curve'
        ? [{ series, index, path: curvePath(series, visual, values, geometry) }]
        : []), [geometry, values, visual]);
    useEffect(() => {
        const container = chartContainer.current;
        if (container === null)
            return;
        const update = (width) => {
            if (width >= 280)
                setChartWidth(current => Math.abs(current - width) < 1 ? current : width);
        };
        update(container.getBoundingClientRect().width);
        if (typeof ResizeObserver === 'undefined')
            return;
        const observer = new ResizeObserver(entries => {
            const entry = entries[0];
            if (entry !== undefined)
                update(entry.contentRect.width);
        });
        observer.observe(container);
        return () => observer.disconnect();
    }, []);
    useEffect(() => {
        if (storageKey === undefined || typeof sessionStorage === 'undefined')
            return;
        try {
            sessionStorage.setItem(`dsh-learning/visual@3:${storageKey}`, JSON.stringify(values));
        }
        catch {
            // Persistence is an enhancement; interaction remains fully local without it.
        }
    }, [storageKey, values]);
    const description = [
        visual.description,
        visual.parameters.map(parameter => `${parameter.label} ${formatNumber(values[parameter.id] ?? parameter.initial)}`).join(', '),
        `${visual.xAxis.label ?? 'x'} ${formatNumber(visual.xAxis.min)} to ${formatNumber(visual.xAxis.max)}`,
        `${visual.yAxis.label ?? 'y'} ${formatNumber(visual.yAxis.min)} to ${formatNumber(visual.yAxis.max)}`,
        visual.series.map(series => series.label).join(', '),
    ].filter(Boolean).join('. ');
    return (_jsxs("section", { className: css.learningVisual, "data-learning-visual": "parameter_chart", "aria-labelledby": `${chartId}-title`, children: [_jsx("h3", { className: css.srOnly, id: `${chartId}-title`, children: visual.title }), visual.description === undefined ? null : _jsx("p", { className: css.visualDescription, children: visual.description }), _jsx("div", { className: css.visualControls, children: visual.parameters.map(parameter => {
                    const value = values[parameter.id] ?? parameter.initial;
                    const inputId = `${chartId}-${parameter.id}`;
                    return (_jsxs("label", { className: css.visualRange, htmlFor: inputId, children: [_jsxs("span", { className: css.visualRangeHeader, children: [_jsx("span", { children: parameter.label }), _jsx("output", { htmlFor: inputId, "aria-live": "polite", children: formatNumber(value) })] }), _jsx("input", { id: inputId, type: "range", min: parameter.min, max: parameter.max, step: parameter.step, value: value, "aria-label": parameter.label, style: rangeStyle(parameter, value), onChange: event => setValues(current => ({
                                    ...current,
                                    [parameter.id]: Number(event.target.value),
                                })) }), _jsxs("span", { className: css.visualRangeEnds, "aria-hidden": "true", children: [_jsx("span", { children: formatNumber(parameter.min) }), _jsx("span", { children: formatNumber(parameter.max) })] })] }, parameter.id));
                }) }), visual.metrics === undefined || visual.metrics.length === 0 ? null : (_jsx("div", { className: css.visualMetrics, children: visual.metrics.map(metric => {
                    const value = evaluateMathExpression(metric.expression, values);
                    return (_jsxs("span", { children: [_jsx("span", { children: metric.label }), _jsxs("output", { children: [formatNumber(value, metric.digits), metric.suffix ?? ''] })] }, metric.id));
                }) })), _jsxs("div", { className: css.visualChartRegion, ref: chartContainer, children: [_jsxs("svg", { className: css.visualChart, viewBox: `0 0 ${geometry.width} ${geometry.height}`, role: "img", "aria-labelledby": `${chartId}-title`, "aria-describedby": `${chartId}-description`, children: [_jsx("desc", { id: `${chartId}-description`, children: description }), _jsx("defs", { children: _jsx("clipPath", { id: `${chartId}-clip`, children: _jsx("rect", { x: geometry.left, y: geometry.top, width: geometry.plotWidth, height: geometry.plotHeight }) }) }), _jsx("rect", { className: css.visualPlot, x: geometry.left, y: geometry.top, width: geometry.plotWidth, height: geometry.plotHeight }), yTicks.map(value => {
                                const y = scaleY(value, visual, geometry);
                                return (_jsxs("g", { children: [_jsx("line", { className: css.visualGrid, x1: geometry.left, x2: geometry.left + geometry.plotWidth, y1: y, y2: y }), _jsx("text", { className: css.visualTick, x: geometry.left - 9, y: y, textAnchor: "end", dominantBaseline: "middle", children: formatNumber(value) })] }, `y-${String(value)}`));
                            }), xTicks.map(value => {
                                const x = scaleX(value, visual, geometry);
                                return (_jsxs("g", { children: [_jsx("line", { className: css.visualGrid, x1: x, x2: x, y1: geometry.top, y2: geometry.top + geometry.plotHeight }), _jsx("text", { className: css.visualTick, x: x, y: geometry.top + geometry.plotHeight + 21, textAnchor: "middle", children: formatNumber(value) })] }, `x-${String(value)}`));
                            }), _jsxs("g", { clipPath: `url(#${chartId}-clip)`, children: [curves.map(({ series, index, path }) => (_jsx("path", { className: css.visualCurve, "data-tone": toneOf(series, index), "data-stroke": series.stroke ?? 'solid', d: path }, series.id))), visual.series.map((series, index) => series.type !== 'points' ? null : (_jsx("g", { "data-series": series.id, children: series.points.map((point, pointIndex) => (_jsx("circle", { className: css.visualPoint, "data-tone": toneOf(series, index), cx: scaleX(point.x, visual, geometry), cy: scaleY(point.y, visual, geometry), r: "5.5", children: _jsx("title", { children: point.label ?? `${series.label}: (${formatNumber(point.x)}, ${formatNumber(point.y)})` }) }, `${series.id}-${String(pointIndex)}`))) }, series.id)))] }), _jsx("text", { className: css.visualAxisLabel, x: geometry.left + geometry.plotWidth / 2, y: geometry.height - 5, textAnchor: "middle", children: visual.xAxis.label ?? 'x' }), _jsx("text", { className: css.visualAxisLabel, x: 15, y: geometry.top + geometry.plotHeight / 2, textAnchor: "middle", transform: `rotate(-90 15 ${geometry.top + geometry.plotHeight / 2})`, children: visual.yAxis.label ?? 'y' })] }), _jsx("ul", { className: css.visualLegend, "aria-label": visual.title, children: visual.series.map((series, index) => (_jsxs("li", { "data-series-type": series.type, "data-tone": toneOf(series, index), "data-stroke": series.type === 'curve' ? series.stroke ?? 'solid' : undefined, children: [_jsx("span", { "aria-hidden": "true" }), series.label] }, series.id))) })] })] }));
}
//# sourceMappingURL=LearningVisual.js.map