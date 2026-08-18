import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Component, createContext, useEffect, useId, useContext, useMemo, useRef, useState, } from 'react';
import { MarkdownText } from '@deepseek-ai/dsh-client-ui-primitives';
import { evaluateMathExpression } from "../math-expression.js";
import css from './LearningVisualV4.module.css';
const DEFAULT_LABELS = {
    eyebrow: '交互可视化',
    errorTitle: '视觉组件暂时无法显示',
    errorContinue: '你仍可继续阅读上下文。',
    sequenceLabel: '视觉讲解步骤',
    previousStep: '上一步',
    nextStep: '下一步',
    reset: '重置',
    chartProbeHint: '图表，按左右方向键开始探查数值',
    metricsLabel: '当前指标',
    legendLabel: '图例与系列显示',
    plotInteractionHint: '鼠标移入图表可探查数值；键盘聚焦图表后可用 ← → 移动。',
    nodeLinkSummary: '{nodes} 个节点，{edges} 条连线。',
    connection: '{from} 到 {to}',
    layerLabel: '第 {index} 层',
    edgeLabel: '连线',
    nodeLinkInteractionHint: '选择节点或连线查看解释；键盘可用 Tab 与 Enter 操作。',
    nodeKind: '节点',
    edgeKind: '连线',
    noDetail: '暂无补充说明。',
    closeDetail: '关闭详细说明',
    elementFallback: '图元 {id}',
    sceneSummary: '二维场景，{elements} 个图元。{labels}',
    sceneInteractionHint: '选择图中的点、线或形状查看说明。',
    elementKind: '图元',
    comparisonCaption: '特征对比表',
    comparisonDimension: '对比维度',
    comparisonSubject: '对比对象',
    comparisonInteractionHint: '按行阅读可对比同一维度；选择表头可查看补充说明。',
    matrixCaption: '关系矩阵',
    matrixAxes: '行 ↓ / 列 →',
    noRelation: '无关系',
    matrixInteractionHint: '从行与列的交点读取关系；选择单元格可查看细节。',
    setsLabel: '集合关系图',
    noExclusiveItems: '无独有项',
    intersections: '交集 / 共有',
    uncategorized: '未归类',
    setsInteractionHint: '单一归属项在各集合内，多重归属项在交集区。',
    timelineLabel: '时间线',
    timelineEventKind: '事件',
    timelineEraKind: '时期',
    timelineInteractionHint: '选择事件或时期可查看补充说明。',
    formulaLabel: '公式推导',
    formulaProgress: '第 {current} / {total} 步',
    formulaRule: '规则',
    formulaConclusion: '结论',
    revealNextFormulaStep: '显示下一步',
    formulaComplete: '推导已完成',
    formulaInteractionHint: '先预测下一步，再逐步揭示变形规则。',
    studySource: '学习来源',
    studyGoal: '学习目标',
    studySections: '来源章节',
    studyConcepts: '本节概念',
    studyAnchor: '位置',
    studySummary: '摘要',
    prerequisite: '前置概念',
    noPrerequisite: '无',
    roleFoundation: '基础',
    roleCore: '核心',
    roleExtension: '拓展',
    rolePractice: '练习',
    studyInteractionHint: '按来源章节导览，选择概念查看作用、前置关系与详细说明。',
    recallDeckLabel: '回忆卡组',
    recallProgress: '第 {current} / {total} 张',
    recallPrompt: '问题',
    recallHint: '提示',
    recallAnswer: '答案',
    showHint: '查看提示',
    showAnswer: '显示答案',
    previousCard: '上一张',
    nextCard: '下一张',
    resetDeck: '重置卡组',
    mastered: '已掌握',
    reviewAgain: '待复习',
    unrated: '未标记',
    recallStatus: '掌握 {mastered} · 待复习 {review}',
    recallInteractionHint: '先在心中回答，再查看提示和答案，最后标记掌握状态。',
};
const VisualLabelsContext = createContext(DEFAULT_LABELS);
function useVisualLabels() {
    return useContext(VisualLabelsContext);
}
function labelTemplate(template, values) {
    return template.replace(/\{([a-z]+)\}/gi, (match, key) => values[key] === undefined ? match : String(values[key]));
}
function displayMath(expression) {
    const value = expression.trim()
        .replaceAll('′', "'")
        .replaceAll('−', '-')
        .replaceAll('²', '^{2}')
        .replaceAll('³', '^{3}')
        .replaceAll('→', '\\to ')
        .replaceAll('≤', '\\le ')
        .replaceAll('≥', '\\ge ')
        .replaceAll('≠', '\\ne ')
        .replaceAll('×', '\\times ')
        .replaceAll('÷', '\\div ')
        .replaceAll('∞', '\\infty ')
        .replace(/\blim\s*\[([^\]]+)\]/g, '\\lim_{$1}');
    if ((value.startsWith('$$') && value.endsWith('$$')) || (value.startsWith('\\[') && value.endsWith('\\]')))
        return value;
    return `$$\n${value}\n$$`;
}
const DEFAULT_TONES = ['blue', 'red', 'green', 'orange', 'purple', 'gray'];
const SVG_MIN_WIDTH = 560;
function formatNumber(value, digits) {
    if (!Number.isFinite(value))
        return '—';
    if (digits !== undefined)
        return value.toFixed(digits);
    if (Number.isInteger(value))
        return String(value);
    return String(Number(value.toPrecision(6)));
}
function normalizedPosition(value, min, max) {
    if (!Number.isFinite(value) || !Number.isFinite(min) || !Number.isFinite(max) || max <= min)
        return 0;
    return Math.max(0, Math.min(1, (value - min) / (max - min)));
}
function interpolate(min, max, ratio) {
    return min + (max - min) * Math.max(0, Math.min(1, ratio));
}
function niceStep(rawStep) {
    if (!Number.isFinite(rawStep) || rawStep <= 0)
        return 1;
    const power = 10 ** Math.floor(Math.log10(rawStep));
    const normalized = rawStep / power;
    return (normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10) * power;
}
function ticks(min, max, target = 6) {
    const step = niceStep((max - min) / target);
    const first = Math.ceil(min / step) * step;
    const values = [];
    for (let value = first, index = 0; value <= max && index < target * 4; value += step, index += 1) {
        values.push(Number(value.toPrecision(12)));
    }
    return values.length > 0 ? values : [min, max];
}
function toneAt(tone, index = 0) {
    if (tone === 'blue' || tone === 'green' || tone === 'red' || tone === 'orange'
        || tone === 'purple' || tone === 'gray')
        return tone;
    return DEFAULT_TONES[index % DEFAULT_TONES.length] ?? 'blue';
}
function strokeDash(stroke) {
    if (stroke === 'dashed')
        return '9 6';
    if (stroke === 'dotted')
        return '2 6';
    return undefined;
}
function focusState(id, focusedIds) {
    if (focusedIds.size === 0)
        return undefined;
    return focusedIds.has(id) ? 'focus' : 'dim';
}
function relatedFocusState(id, relatedIds, focusedIds) {
    if (focusedIds.size === 0)
        return undefined;
    return focusedIds.has(id) || relatedIds.some(relatedId => relatedId !== undefined && focusedIds.has(relatedId)) ? 'focus' : 'dim';
}
function activateWithKeyboard(event, action) {
    if (event.key !== 'Enter' && event.key !== ' ')
        return;
    event.preventDefault();
    action();
}
function useContainerWidth(minimum = 280) {
    const ref = useRef(null);
    const [width, setWidth] = useState(760);
    useEffect(() => {
        const element = ref.current;
        if (element === null)
            return;
        const update = (next) => {
            if (next >= minimum)
                setWidth(current => Math.abs(current - next) < 1 ? current : next);
        };
        update(element.getBoundingClientRect().width);
        if (typeof ResizeObserver === 'undefined')
            return;
        const observer = new ResizeObserver(entries => {
            const entry = entries[0];
            if (entry !== undefined)
                update(entry.contentRect.width);
        });
        observer.observe(element);
        return () => observer.disconnect();
    }, [minimum]);
    return [ref, width];
}
function chartGeometry(containerWidth, minWidth = SVG_MIN_WIDTH) {
    const width = Math.max(minWidth, Math.round(containerWidth));
    const height = width < 700 ? 350 : 390;
    const left = 62;
    const right = 22;
    const top = 24;
    const bottom = 58;
    return {
        width,
        height,
        left,
        right,
        top,
        bottom,
        plotWidth: width - left - right,
        plotHeight: height - top - bottom,
    };
}
function scaleX(value, axis, geometry) {
    return geometry.left + normalizedPosition(value, axis.min, axis.max) * geometry.plotWidth;
}
function scaleY(value, axis, geometry) {
    return geometry.top + (1 - normalizedPosition(value, axis.min, axis.max)) * geometry.plotHeight;
}
class VisualErrorBoundary extends Component {
    state = {};
    static getDerivedStateFromError(error) {
        return { error };
    }
    componentDidCatch(error, info) {
        console.error('Learning visual renderer failed', error, info);
    }
    render() {
        if (this.state.error === undefined)
            return this.props.children;
        return (_jsxs("div", { className: css.errorFallback, role: "alert", children: [_jsx("strong", { children: this.props.labels.errorTitle }), this.props.fallbackMarkdown === undefined
                    ? _jsx("span", { children: this.props.labels.errorContinue })
                    : _jsx("pre", { children: this.props.fallbackMarkdown })] }));
    }
}
function SequenceController({ sequence, frameIndex, onFrameChange, }) {
    const labels = useVisualLabels();
    const frame = sequence.frames[frameIndex];
    const initialIndex = Math.max(0, sequence.frames.findIndex(item => item.id === sequence.initialFrameId));
    const move = (delta) => {
        onFrameChange(Math.max(0, Math.min(sequence.frames.length - 1, frameIndex + delta)));
    };
    const onKeyDown = (event) => {
        if (event.key === 'ArrowLeft') {
            event.preventDefault();
            move(-1);
        }
        else if (event.key === 'ArrowRight') {
            event.preventDefault();
            move(1);
        }
        else if (event.key === 'Home') {
            event.preventDefault();
            onFrameChange(0);
        }
        else if (event.key === 'End') {
            event.preventDefault();
            onFrameChange(sequence.frames.length - 1);
        }
    };
    return (_jsxs("div", { className: css.sequence, onKeyDown: onKeyDown, "aria-label": labels.sequenceLabel, children: [_jsxs("div", { className: css.sequenceText, "aria-live": "polite", "aria-atomic": "true", children: [_jsxs("span", { children: [frameIndex + 1, " / ", sequence.frames.length] }), _jsx("strong", { children: frame?.label }), frame?.description === undefined ? null : _jsx("p", { children: frame.description })] }), _jsxs("div", { className: css.sequenceActions, children: [_jsxs("button", { type: "button", onClick: () => move(-1), disabled: frameIndex === 0, "aria-label": labels.previousStep, children: [_jsx("span", { "aria-hidden": "true", children: "\u2190" }), _jsx("span", { children: labels.previousStep })] }), _jsxs("button", { type: "button", onClick: () => move(1), disabled: frameIndex >= sequence.frames.length - 1, "aria-label": labels.nextStep, children: [_jsx("span", { children: labels.nextStep }), _jsx("span", { "aria-hidden": "true", children: "\u2192" })] }), _jsx("button", { type: "button", onClick: () => onFrameChange(initialIndex), disabled: frameIndex === initialIndex, children: labels.reset })] })] }));
}
function initialParameterValues(content, storageKey) {
    const parameters = content.parameters ?? [];
    const values = Object.fromEntries(parameters.map(parameter => [parameter.id, parameter.initial]));
    if (storageKey === undefined || typeof sessionStorage === 'undefined')
        return values;
    try {
        const stored = JSON.parse(sessionStorage.getItem(`dsh-learning/visual@4:${storageKey}`) ?? '{}');
        for (const parameter of parameters) {
            const candidate = stored[parameter.id];
            if (typeof candidate === 'number' && Number.isFinite(candidate)
                && candidate >= parameter.min && candidate <= parameter.max)
                values[parameter.id] = candidate;
        }
    }
    catch {
        // Invalid optional UI state must not prevent replaying the canonical visual.
    }
    return values;
}
function plotCurvePath(series, content, values, geometry) {
    const samples = content.xAxis.samples ?? 160;
    const commands = [];
    let drawing = false;
    let previousY;
    for (let index = 0; index < samples; index += 1) {
        const x = interpolate(content.xAxis.min, content.xAxis.max, index / Math.max(1, samples - 1));
        const y = evaluateMathExpression(series.expression, { ...values, x });
        if (!Number.isFinite(y) || Math.abs(y) > 1e12) {
            drawing = false;
            previousY = undefined;
            continue;
        }
        const px = scaleX(x, content.xAxis, geometry);
        const py = scaleY(y, content.yAxis, geometry);
        if (previousY !== undefined && Math.abs(previousY - py) > geometry.plotHeight * 2)
            drawing = false;
        commands.push(`${drawing ? 'L' : 'M'}${px.toFixed(2)},${py.toFixed(2)}`);
        drawing = true;
        previousY = py;
    }
    return commands.join(' ');
}
function pointsPath(points, content, geometry) {
    return points.map((point, index) => `${index === 0 ? 'M' : 'L'}${scaleX(point.x, content.xAxis, geometry).toFixed(2)},${scaleY(point.y, content.yAxis, geometry).toFixed(2)}`).join(' ');
}
function nearestPointValue(points, x) {
    let nearest;
    for (const point of points) {
        if (nearest === undefined || Math.abs(point.x - x) < Math.abs(nearest.x - x))
            nearest = point;
    }
    return nearest?.y;
}
function interpolatedLineValue(points, x) {
    const ordered = [...points].sort((a, b) => a.x - b.x);
    if (ordered.length === 0)
        return undefined;
    if (x <= (ordered[0]?.x ?? x))
        return ordered[0]?.y;
    if (x >= (ordered.at(-1)?.x ?? x))
        return ordered.at(-1)?.y;
    for (let index = 1; index < ordered.length; index += 1) {
        const right = ordered[index];
        const left = ordered[index - 1];
        if (left !== undefined && right !== undefined && x <= right.x) {
            return interpolate(left.y, right.y, normalizedPosition(x, left.x, right.x));
        }
    }
    return undefined;
}
function PlotRenderer({ content, focusedIds, storageKey }) {
    const labels = useVisualLabels();
    const id = useId();
    const [regionRef, containerWidth] = useContainerWidth();
    const geometry = useMemo(() => chartGeometry(containerWidth), [containerWidth]);
    const [values, setValues] = useState(() => initialParameterValues(content, storageKey));
    const [hiddenSeries, setHiddenSeries] = useState(() => new Set());
    const [probeX, setProbeX] = useState();
    const xTicks = useMemo(() => ticks(content.xAxis.min, content.xAxis.max), [content.xAxis.max, content.xAxis.min]);
    const yTicks = useMemo(() => ticks(content.yAxis.min, content.yAxis.max), [content.yAxis.max, content.yAxis.min]);
    const parameters = content.parameters ?? [];
    useEffect(() => {
        if (storageKey === undefined || typeof sessionStorage === 'undefined')
            return;
        try {
            sessionStorage.setItem(`dsh-learning/visual@4:${storageKey}`, JSON.stringify(values));
        }
        catch {
            // Persistence is an enhancement; interaction remains local without it.
        }
    }, [storageKey, values]);
    const curvePaths = useMemo(() => content.series.flatMap(series => series.type === 'curve'
        ? [{ id: series.id, path: plotCurvePath(series, content, values, geometry) }]
        : []), [content, geometry, values]);
    const visibleSeries = content.series.filter(series => !hiddenSeries.has(series.id));
    const probeValues = probeX === undefined ? [] : visibleSeries.flatMap(series => {
        let y;
        if (series.type === 'curve')
            y = evaluateMathExpression(series.expression, { ...values, x: probeX });
        else if (series.type === 'line')
            y = interpolatedLineValue(series.points, probeX);
        else
            y = nearestPointValue(series.points, probeX);
        return y === undefined || !Number.isFinite(y) ? [] : [{ id: series.id, label: series.label, y, tone: series.tone }];
    });
    const chartDescription = `${content.xAxis.label ?? 'x'} ${formatNumber(content.xAxis.min)}–${formatNumber(content.xAxis.max)}; ${content.yAxis.label ?? 'y'} ${formatNumber(content.yAxis.min)}–${formatNumber(content.yAxis.max)}; ${content.series.map(series => series.label).join(', ')}`;
    const probeDescription = probeX === undefined ? `${labels.chartProbeHint}. ${chartDescription}`
        : `x ${formatNumber(probeX)}。${probeValues.map(item => `${item.label} ${formatNumber(item.y)}`).join('，')}`;
    const updateProbeFromPointer = (event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        const viewX = (event.clientX - rect.left) / rect.width * geometry.width;
        const ratio = (viewX - geometry.left) / geometry.plotWidth;
        setProbeX(interpolate(content.xAxis.min, content.xAxis.max, ratio));
    };
    const moveProbe = (event) => {
        const step = (content.xAxis.max - content.xAxis.min) / 50;
        if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
            event.preventDefault();
            const current = probeX ?? (content.xAxis.min + content.xAxis.max) / 2;
            setProbeX(Math.max(content.xAxis.min, Math.min(content.xAxis.max, current + (event.key === 'ArrowLeft' ? -step : step))));
        }
        else if (event.key === 'Home') {
            event.preventDefault();
            setProbeX(content.xAxis.min);
        }
        else if (event.key === 'End') {
            event.preventDefault();
            setProbeX(content.xAxis.max);
        }
        else if (event.key === 'Escape')
            setProbeX(undefined);
    };
    const toggleSeries = (seriesId) => {
        setHiddenSeries(current => {
            const next = new Set(current);
            if (next.has(seriesId))
                next.delete(seriesId);
            else
                next.add(seriesId);
            return next;
        });
    };
    return (_jsxs("div", { className: css.plotRenderer, children: [parameters.length === 0 ? null : (_jsx("div", { className: css.parameterGrid, children: parameters.map(parameter => {
                    const value = values[parameter.id] ?? parameter.initial;
                    const inputId = `${id}-${parameter.id}`;
                    const progress = normalizedPosition(value, parameter.min, parameter.max) * 100;
                    return (_jsxs("label", { className: css.parameter, htmlFor: inputId, "data-visual-id": parameter.id, "data-focus-state": focusState(parameter.id, focusedIds), children: [_jsxs("span", { className: css.parameterHeader, children: [_jsx("span", { children: parameter.label }), _jsx("output", { htmlFor: inputId, children: formatNumber(value) })] }), _jsx("input", { id: inputId, type: "range", min: parameter.min, max: parameter.max, step: parameter.step, value: value, style: { '--range-progress': `${progress}%` }, onChange: event => setValues(current => ({ ...current, [parameter.id]: Number(event.target.value) })) }), _jsxs("span", { className: css.parameterEnds, "aria-hidden": "true", children: [_jsx("span", { children: formatNumber(parameter.min) }), _jsx("span", { children: formatNumber(parameter.max) })] })] }, parameter.id));
                }) })), content.metrics === undefined || content.metrics.length === 0 ? null : (_jsx("dl", { className: css.metrics, "aria-label": labels.metricsLabel, children: content.metrics.map(metric => (_jsxs("div", { "data-visual-id": metric.id, "data-focus-state": focusState(metric.id, focusedIds), children: [_jsx("dt", { children: metric.label }), _jsxs("dd", { children: [formatNumber(evaluateMathExpression(metric.expression, values), metric.digits), metric.suffix ?? ''] })] }, metric.id))) })), _jsxs("div", { className: css.chartViewport, ref: regionRef, children: [_jsxs("svg", { className: css.plotSvg, width: geometry.width, height: geometry.height, viewBox: `0 0 ${geometry.width} ${geometry.height}`, role: "img", tabIndex: 0, "aria-label": probeDescription, onPointerMove: updateProbeFromPointer, onPointerLeave: () => setProbeX(undefined), onKeyDown: moveProbe, children: [_jsx("defs", { children: _jsx("clipPath", { id: `${id}-plot-clip`, children: _jsx("rect", { x: geometry.left, y: geometry.top, width: geometry.plotWidth, height: geometry.plotHeight }) }) }), _jsx("rect", { className: css.plotFrame, x: geometry.left, y: geometry.top, width: geometry.plotWidth, height: geometry.plotHeight }), yTicks.map(value => {
                                const y = scaleY(value, content.yAxis, geometry);
                                return _jsxs("g", { children: [_jsx("line", { className: css.gridLine, x1: geometry.left, x2: geometry.left + geometry.plotWidth, y1: y, y2: y }), _jsx("text", { className: css.tickLabel, x: geometry.left - 10, y: y, textAnchor: "end", dominantBaseline: "middle", children: formatNumber(value) })] }, `y-${String(value)}`);
                            }), xTicks.map(value => {
                                const x = scaleX(value, content.xAxis, geometry);
                                return _jsxs("g", { children: [_jsx("line", { className: css.gridLine, x1: x, x2: x, y1: geometry.top, y2: geometry.top + geometry.plotHeight }), _jsx("text", { className: css.tickLabel, x: x, y: geometry.top + geometry.plotHeight + 22, textAnchor: "middle", children: formatNumber(value) })] }, `x-${String(value)}`);
                            }), _jsxs("g", { clipPath: `url(#${id}-plot-clip)`, children: [content.series.map((series, seriesIndex) => {
                                        if (hiddenSeries.has(series.id))
                                            return null;
                                        const tone = toneAt(series.tone, seriesIndex);
                                        const state = focusState(series.id, focusedIds);
                                        if (series.type === 'curve')
                                            return (_jsx("path", { className: css.seriesLine, "data-tone": tone, "data-focus-state": state, "data-visual-id": series.id, "data-stroke": series.stroke ?? 'solid', d: curvePaths.find(item => item.id === series.id)?.path }, series.id));
                                        if (series.type === 'line')
                                            return (_jsx("path", { className: css.seriesLine, "data-tone": tone, "data-focus-state": state, "data-visual-id": series.id, "data-stroke": series.stroke ?? 'solid', d: pointsPath(series.points, content, geometry) }, series.id));
                                        if (series.type === 'bars') {
                                            const sortedXs = series.points.map(point => scaleX(point.x, content.xAxis, geometry)).sort((a, b) => a - b);
                                            const smallestGap = sortedXs.slice(1).reduce((gap, x, index) => Math.min(gap, x - (sortedXs[index] ?? x)), geometry.plotWidth / Math.max(1, sortedXs.length));
                                            const barWidth = Math.max(6, Math.min(44, smallestGap * 0.68));
                                            const zeroY = scaleY(Math.max(content.yAxis.min, Math.min(content.yAxis.max, 0)), content.yAxis, geometry);
                                            return _jsx("g", { "data-visual-id": series.id, "data-focus-state": state, children: series.points.map((point, pointIndex) => {
                                                    const x = scaleX(point.x, content.xAxis, geometry);
                                                    const y = scaleY(point.y, content.yAxis, geometry);
                                                    return _jsx("rect", { className: css.seriesBar, "data-tone": tone, x: x - barWidth / 2, y: Math.min(y, zeroY), width: barWidth, height: Math.max(1, Math.abs(zeroY - y)), children: _jsx("title", { children: point.label ?? `${series.label}: ${formatNumber(point.y)}` }) }, `${series.id}-${String(pointIndex)}`);
                                                }) }, series.id);
                                        }
                                        return (_jsx("g", { "data-visual-id": series.id, "data-focus-state": state, children: series.points.map((point, pointIndex) => _jsx("circle", { className: css.seriesPoint, "data-tone": tone, cx: scaleX(point.x, content.xAxis, geometry), cy: scaleY(point.y, content.yAxis, geometry), r: "5.5", children: _jsx("title", { children: point.label ?? `${series.label}: (${formatNumber(point.x)}, ${formatNumber(point.y)})` }) }, `${series.id}-${String(pointIndex)}`)) }, series.id));
                                    }), probeX === undefined ? null : _jsx("line", { className: css.probeLine, x1: scaleX(probeX, content.xAxis, geometry), x2: scaleX(probeX, content.xAxis, geometry), y1: geometry.top, y2: geometry.top + geometry.plotHeight }), probeX === undefined ? null : probeValues.map((item, index) => _jsx("circle", { className: css.probePoint, "data-tone": toneAt(item.tone, index), cx: scaleX(probeX, content.xAxis, geometry), cy: scaleY(item.y, content.yAxis, geometry), r: "5" }, item.id))] }), _jsx("text", { className: css.axisLabel, x: geometry.left + geometry.plotWidth / 2, y: geometry.height - 7, textAnchor: "middle", children: content.xAxis.label ?? 'x' }), _jsx("text", { className: css.axisLabel, x: "16", y: geometry.top + geometry.plotHeight / 2, textAnchor: "middle", transform: `rotate(-90 16 ${geometry.top + geometry.plotHeight / 2})`, children: content.yAxis.label ?? 'y' })] }), probeX === undefined ? null : (_jsxs("div", { className: css.probeCard, style: { '--probe-x': `${normalizedPosition(probeX, content.xAxis.min, content.xAxis.max) * 100}%` }, "aria-hidden": "true", children: [_jsxs("strong", { children: ["x = ", formatNumber(probeX)] }), probeValues.map((item, index) => _jsxs("span", { "data-tone": toneAt(item.tone, index), children: [item.label, ": ", formatNumber(item.y)] }, item.id))] }))] }), _jsx("div", { className: css.seriesToggles, "aria-label": labels.legendLabel, children: content.series.map((series, index) => (_jsxs("button", { type: "button", "aria-pressed": !hiddenSeries.has(series.id), "data-tone": toneAt(series.tone, index), "data-series-type": series.type, "data-stroke": 'stroke' in series ? series.stroke ?? 'solid' : undefined, onClick: () => toggleSeries(series.id), children: [_jsx("span", { "aria-hidden": "true" }), series.label] }, series.id))) }), _jsx("p", { className: css.interactionHint, children: labels.plotInteractionHint })] }));
}
function graphLayers(content) {
    if (content.groups !== undefined && content.groups.length > 0) {
        const grouped = content.groups.map(group => ({
            id: group.id,
            label: group.label,
            nodes: content.nodes.filter(node => node.group === group.id),
        })).filter(layer => layer.nodes.length > 0);
        const knownGroups = new Set(content.groups.map(group => group.id));
        const ungrouped = content.nodes.filter(node => node.group === undefined || !knownGroups.has(node.group));
        if (ungrouped.length > 0)
            grouped.push({ id: 'ungrouped', nodes: ungrouped });
        return grouped;
    }
    const incoming = new Map(content.nodes.map(node => [node.id, 0]));
    const outgoing = new Map(content.nodes.map(node => [node.id, []]));
    for (const edge of content.edges) {
        incoming.set(edge.to, (incoming.get(edge.to) ?? 0) + 1);
        outgoing.get(edge.from)?.push(edge.to);
    }
    const levels = new Map(content.nodes.map(node => [node.id, 0]));
    const queue = content.nodes.filter(node => (incoming.get(node.id) ?? 0) === 0).map(node => node.id);
    const visited = new Set();
    while (queue.length > 0) {
        const current = queue.shift();
        if (current === undefined)
            break;
        visited.add(current);
        for (const target of outgoing.get(current) ?? []) {
            levels.set(target, Math.max(levels.get(target) ?? 0, (levels.get(current) ?? 0) + 1));
            incoming.set(target, (incoming.get(target) ?? 1) - 1);
            if (incoming.get(target) === 0)
                queue.push(target);
        }
    }
    const fallbackLevel = Math.max(0, ...levels.values());
    for (const node of content.nodes)
        if (!visited.has(node.id))
            levels.set(node.id, fallbackLevel);
    const levelCount = Math.max(0, ...levels.values()) + 1;
    return Array.from({ length: levelCount }, (_, index) => ({
        id: `layer-${String(index)}`,
        nodes: content.nodes.filter(node => levels.get(node.id) === index),
    })).filter(layer => layer.nodes.length > 0);
}
function graphLayout(content, containerWidth) {
    const layers = graphLayers(content);
    const positions = new Map();
    if (content.layout === 'radial') {
        const width = Math.max(SVG_MIN_WIDTH, Math.round(containerWidth));
        const height = Math.max(430, Math.min(600, width * 0.68));
        const centerX = width / 2;
        const centerY = height / 2;
        const radius = Math.max(120, Math.min(width, height) / 2 - 68);
        content.nodes.forEach((node, index) => {
            const angle = -Math.PI / 2 + index / Math.max(1, content.nodes.length) * Math.PI * 2;
            positions.set(node.id, { id: node.id, x: centerX + Math.cos(angle) * radius, y: centerY + Math.sin(angle) * radius });
        });
        return { width, height, positions, layers };
    }
    if (content.layout === 'hierarchy') {
        const widestLayer = Math.max(1, ...layers.map(layer => layer.nodes.length));
        const width = Math.max(SVG_MIN_WIDTH, Math.round(containerWidth), widestLayer * 142 + 72);
        const height = Math.max(390, layers.length * 128 + 74);
        layers.forEach((layer, layerIndex) => layer.nodes.forEach((node, nodeIndex) => {
            positions.set(node.id, {
                id: node.id,
                x: width * (nodeIndex + 1) / (layer.nodes.length + 1),
                y: 56 + layerIndex * ((height - 104) / Math.max(1, layers.length - 1)),
            });
        }));
        return { width, height, positions, layers };
    }
    const tallestLayer = Math.max(1, ...layers.map(layer => layer.nodes.length));
    const width = Math.max(SVG_MIN_WIDTH, Math.round(containerWidth), layers.length * 182 + 78);
    const height = Math.max(390, tallestLayer * 82 + 92);
    layers.forEach((layer, layerIndex) => layer.nodes.forEach((node, nodeIndex) => {
        positions.set(node.id, {
            id: node.id,
            x: 58 + layerIndex * ((width - 116) / Math.max(1, layers.length - 1)),
            y: 62 + (nodeIndex + 1) * ((height - 92) / (layer.nodes.length + 1)),
        });
    }));
    return { width, height, positions, layers };
}
function shortenedEdge(from, to, radius = 30) {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const length = Math.hypot(dx, dy) || 1;
    const ux = dx / length;
    const uy = dy / length;
    return {
        start: { x: from.x + ux * radius, y: from.y + uy * radius },
        end: { x: to.x - ux * (radius + 3), y: to.y - uy * (radius + 3) },
    };
}
function edgePath(from, to, layout) {
    const { start, end } = shortenedEdge(from, to);
    if (layout === 'layered') {
        const middle = (start.x + end.x) / 2;
        return `M${start.x},${start.y} C${middle},${start.y} ${middle},${end.y} ${end.x},${end.y}`;
    }
    if (layout === 'hierarchy') {
        const middle = (start.y + end.y) / 2;
        return `M${start.x},${start.y} C${start.x},${middle} ${end.x},${middle} ${end.x},${end.y}`;
    }
    return `M${start.x},${start.y} L${end.x},${end.y}`;
}
function NodeLinkRenderer({ content, focusedIds }) {
    const labels = useVisualLabels();
    const id = useId();
    const [regionRef, containerWidth] = useContainerWidth();
    const layout = useMemo(() => graphLayout(content, containerWidth), [containerWidth, content]);
    const [selected, setSelected] = useState();
    const nodeById = useMemo(() => new Map(content.nodes.map(node => [node.id, node])), [content.nodes]);
    const selectNode = (node) => setSelected({
        id: node.id,
        label: node.label,
        detail: node.detail,
        kind: 'node',
    });
    const selectEdge = (edge) => setSelected({
        id: edge.id,
        label: edge.label ?? `${nodeById.get(edge.from)?.label ?? edge.from} → ${nodeById.get(edge.to)?.label ?? edge.to}`,
        detail: edge.detail,
        kind: 'edge',
    });
    const accessibleDescription = [
        labelTemplate(labels.nodeLinkSummary, { nodes: content.nodes.length, edges: content.edges.length }),
        ...content.nodes.map(node => `${node.label}${node.detail === undefined ? '' : `: ${node.detail}`}`),
        ...content.edges.map(edge => `${labelTemplate(labels.connection, { from: nodeById.get(edge.from)?.label ?? edge.from, to: nodeById.get(edge.to)?.label ?? edge.to })}${edge.label === undefined ? '' : `, ${edge.label}`}`),
    ].join(' ');
    return (_jsxs("div", { className: css.nodeLinkRenderer, children: [_jsx("div", { className: css.graphViewport, ref: regionRef, children: _jsxs("svg", { className: css.graphSvg, width: layout.width, height: layout.height, viewBox: `0 0 ${layout.width} ${layout.height}`, role: "group", "aria-label": accessibleDescription, "data-dense-edges": content.edges.length > 12 || undefined, children: [_jsx("defs", { children: DEFAULT_TONES.map(tone => (_jsx("marker", { id: `${id}-arrow-${tone}`, className: css.arrowMarker, "data-tone": tone, markerWidth: "8", markerHeight: "8", refX: "7", refY: "4", orient: "auto", markerUnits: "strokeWidth", children: _jsx("path", { d: "M0,0 L8,4 L0,8 z" }) }, tone))) }), content.layout !== 'radial' && layout.layers.map((layer, index) => {
                            const first = layer.nodes[0];
                            const position = first === undefined ? undefined : layout.positions.get(first.id);
                            if (position === undefined)
                                return null;
                            return _jsx("text", { className: css.layerLabel, x: position.x, y: content.layout === 'layered' ? 30 : Math.max(22, position.y - 42), textAnchor: "middle", "data-visual-id": layer.id, "data-focus-state": focusState(layer.id, focusedIds), children: layer.label ?? labelTemplate(labels.layerLabel, { index: index + 1 }) }, layer.id);
                        }), _jsx("g", { children: content.edges.map((edge, edgeIndex) => {
                                const from = layout.positions.get(edge.from);
                                const to = layout.positions.get(edge.to);
                                if (from === undefined || to === undefined)
                                    return null;
                                const tone = toneAt(edge.tone, edgeIndex);
                                const fromNode = nodeById.get(edge.from);
                                const toNode = nodeById.get(edge.to);
                                const state = relatedFocusState(edge.id, [edge.from, edge.to, fromNode?.group, toNode?.group], focusedIds);
                                const path = edgePath(from, to, content.layout);
                                const labelX = (from.x + to.x) / 2;
                                const labelY = (from.y + to.y) / 2 - 7;
                                return (_jsxs("g", { className: css.edgeGroup, "data-tone": tone, "data-stroke": edge.stroke ?? 'solid', "data-focus-state": state, "data-edge-focused": focusedIds.has(edge.id) || undefined, "data-selected": selected?.id === edge.id || undefined, "data-visual-id": edge.id, role: "button", tabIndex: 0, "aria-label": `${edge.label ?? labels.edgeLabel}: ${labelTemplate(labels.connection, { from: nodeById.get(edge.from)?.label ?? edge.from, to: nodeById.get(edge.to)?.label ?? edge.to })}${edge.detail === undefined ? '' : `. ${edge.detail}`}`, onClick: () => selectEdge(edge), onKeyDown: event => activateWithKeyboard(event, () => selectEdge(edge)), children: [_jsx("path", { className: css.edgeVisible, d: path, markerEnd: edge.directed === true ? `url(#${id}-arrow-${tone})` : undefined }), _jsx("path", { className: css.edgeHit, d: path }), edge.label === undefined ? null : _jsx("text", { className: css.edgeLabel, x: labelX, y: labelY, textAnchor: "middle", children: edge.label })] }, edge.id));
                            }) }), _jsx("g", { children: content.nodes.map((node, nodeIndex) => {
                                const position = layout.positions.get(node.id);
                                if (position === undefined)
                                    return null;
                                return (_jsxs("g", { className: css.nodeGroup, "data-tone": toneAt(node.tone, nodeIndex), "data-focus-state": relatedFocusState(node.id, [node.group], focusedIds), "data-selected": selected?.id === node.id || undefined, "data-visual-id": node.id, role: "button", tabIndex: 0, "aria-label": `${node.label}${node.detail === undefined ? '' : `。${node.detail}`}`, transform: `translate(${position.x} ${position.y})`, onClick: () => selectNode(node), onKeyDown: event => activateWithKeyboard(event, () => selectNode(node)), children: [_jsx("circle", { r: "29" }), _jsx("text", { textAnchor: "middle", dominantBaseline: "middle", children: node.label })] }, node.id));
                            }) })] }) }), selected === undefined ? (_jsx("p", { className: css.interactionHint, children: labels.nodeLinkInteractionHint })) : (_jsxs("aside", { className: css.detailPanel, "aria-live": "polite", children: [_jsx("span", { children: selected.kind === 'node' ? labels.nodeKind : labels.edgeKind }), _jsx("strong", { children: selected.label }), _jsx("p", { children: selected.detail ?? labels.noDetail }), _jsx("button", { type: "button", onClick: () => setSelected(undefined), "aria-label": labels.closeDetail, children: "\u00D7" })] }))] }));
}
function Scene2DRenderer({ content, focusedIds }) {
    const labels = useVisualLabels();
    const id = useId();
    const [regionRef, containerWidth] = useContainerWidth();
    const geometry = useMemo(() => chartGeometry(containerWidth, SVG_MIN_WIDTH), [containerWidth]);
    const [selected, setSelected] = useState();
    const xTicks = useMemo(() => ticks(content.xAxis.min, content.xAxis.max), [content.xAxis.max, content.xAxis.min]);
    const yTicks = useMemo(() => ticks(content.yAxis.min, content.yAxis.max), [content.yAxis.max, content.yAxis.min]);
    const zeroX = content.xAxis.min <= 0 && content.xAxis.max >= 0 ? scaleX(0, content.xAxis, geometry) : undefined;
    const zeroY = content.yAxis.min <= 0 && content.yAxis.max >= 0 ? scaleY(0, content.yAxis, geometry) : undefined;
    const selectElement = (element) => setSelected({
        id: element.id,
        label: element.type === 'label' ? element.text : element.label ?? labelTemplate(labels.elementFallback, { id: element.id }),
        detail: element.detail,
        kind: 'element',
    });
    return (_jsxs("div", { className: css.sceneRenderer, children: [_jsx("div", { className: css.sceneViewport, ref: regionRef, children: _jsxs("svg", { className: css.sceneSvg, width: geometry.width, height: geometry.height, viewBox: `0 0 ${geometry.width} ${geometry.height}`, role: "group", "aria-label": labelTemplate(labels.sceneSummary, {
                        elements: content.elements.length,
                        labels: content.elements.map(element => element.type === 'label' ? element.text : element.label).filter(Boolean).join(', '),
                    }), children: [_jsxs("defs", { children: [_jsx("clipPath", { id: `${id}-scene-clip`, children: _jsx("rect", { x: geometry.left, y: geometry.top, width: geometry.plotWidth, height: geometry.plotHeight }) }), DEFAULT_TONES.map(tone => (_jsx("marker", { id: `${id}-scene-arrow-${tone}`, className: css.arrowMarker, "data-tone": tone, markerWidth: "9", markerHeight: "9", refX: "8", refY: "4.5", orient: "auto", markerUnits: "strokeWidth", children: _jsx("path", { d: "M0,0 L9,4.5 L0,9 z" }) }, tone)))] }), _jsx("rect", { className: css.plotFrame, x: geometry.left, y: geometry.top, width: geometry.plotWidth, height: geometry.plotHeight }), content.grid !== true ? null : yTicks.map(value => _jsx("line", { className: css.gridLine, x1: geometry.left, x2: geometry.left + geometry.plotWidth, y1: scaleY(value, content.yAxis, geometry), y2: scaleY(value, content.yAxis, geometry) }, `gy-${String(value)}`)), content.grid !== true ? null : xTicks.map(value => _jsx("line", { className: css.gridLine, x1: scaleX(value, content.xAxis, geometry), x2: scaleX(value, content.xAxis, geometry), y1: geometry.top, y2: geometry.top + geometry.plotHeight }, `gx-${String(value)}`)), zeroX === undefined ? null : _jsx("line", { className: css.zeroAxis, x1: zeroX, x2: zeroX, y1: geometry.top, y2: geometry.top + geometry.plotHeight }), zeroY === undefined ? null : _jsx("line", { className: css.zeroAxis, x1: geometry.left, x2: geometry.left + geometry.plotWidth, y1: zeroY, y2: zeroY }), yTicks.map(value => _jsx("text", { className: css.tickLabel, x: geometry.left - 10, y: scaleY(value, content.yAxis, geometry), textAnchor: "end", dominantBaseline: "middle", children: formatNumber(value) }, `yt-${String(value)}`)), xTicks.map(value => _jsx("text", { className: css.tickLabel, x: scaleX(value, content.xAxis, geometry), y: geometry.top + geometry.plotHeight + 22, textAnchor: "middle", children: formatNumber(value) }, `xt-${String(value)}`)), _jsx("g", { clipPath: `url(#${id}-scene-clip)`, children: content.elements.map((element, index) => {
                                const tone = toneAt(element.tone, index);
                                const common = {
                                    className: css.sceneElement,
                                    'data-tone': tone,
                                    'data-focus-state': focusState(element.id, focusedIds),
                                    'data-selected': selected?.id === element.id || undefined,
                                    'data-visual-id': element.id,
                                    role: 'button',
                                    tabIndex: 0,
                                    'aria-label': `${element.type === 'label' ? element.text : element.label ?? element.type}${element.detail === undefined ? '' : `。${element.detail}`}`,
                                    onClick: () => selectElement(element),
                                    onKeyDown: (event) => activateWithKeyboard(event, () => selectElement(element)),
                                };
                                if (element.type === 'point') {
                                    const x = scaleX(element.x, content.xAxis, geometry);
                                    const y = scaleY(element.y, content.yAxis, geometry);
                                    return _jsxs("g", { ...common, children: [_jsx("circle", { className: css.scenePoint, cx: x, cy: y, r: element.size ?? 6 }), element.label === undefined ? null : _jsx("text", { className: css.shapeLabel, x: x + 10, y: y - 10, children: element.label })] }, element.id);
                                }
                                if (element.type === 'segment' || element.type === 'arrow') {
                                    const x1 = scaleX(element.x1, content.xAxis, geometry);
                                    const y1 = scaleY(element.y1, content.yAxis, geometry);
                                    const x2 = scaleX(element.x2, content.xAxis, geometry);
                                    const y2 = scaleY(element.y2, content.yAxis, geometry);
                                    return _jsxs("g", { ...common, "data-stroke": element.stroke ?? 'solid', children: [_jsx("line", { className: css.sceneLine, x1: x1, y1: y1, x2: x2, y2: y2, markerEnd: element.type === 'arrow' ? `url(#${id}-scene-arrow-${tone})` : undefined }), _jsx("line", { className: css.sceneHit, x1: x1, y1: y1, x2: x2, y2: y2 }), element.label === undefined ? null : _jsx("text", { className: css.shapeLabel, x: (x1 + x2) / 2, y: (y1 + y2) / 2 - 8, textAnchor: "middle", children: element.label })] }, element.id);
                                }
                                if (element.type === 'circle') {
                                    const cx = scaleX(element.cx, content.xAxis, geometry);
                                    const cy = scaleY(element.cy, content.yAxis, geometry);
                                    const rx = Math.abs(scaleX(element.cx + element.r, content.xAxis, geometry) - cx);
                                    const ry = Math.abs(scaleY(element.cy + element.r, content.yAxis, geometry) - cy);
                                    return _jsxs("g", { ...common, children: [_jsx("ellipse", { className: css.sceneShape, cx: cx, cy: cy, rx: rx, ry: ry }), element.label === undefined ? null : _jsx("text", { className: css.shapeLabel, x: cx, y: cy, textAnchor: "middle", dominantBaseline: "middle", children: element.label })] }, element.id);
                                }
                                if (element.type === 'rect') {
                                    const x = scaleX(element.x, content.xAxis, geometry);
                                    const y = scaleY(element.y + element.height, content.yAxis, geometry);
                                    const width = Math.abs(scaleX(element.x + element.width, content.xAxis, geometry) - x);
                                    const height = Math.abs(scaleY(element.y, content.yAxis, geometry) - y);
                                    return _jsxs("g", { ...common, children: [_jsx("rect", { className: css.sceneShape, x: x, y: y, width: width, height: height, rx: "3" }), element.label === undefined ? null : _jsx("text", { className: css.shapeLabel, x: x + width / 2, y: y + height / 2, textAnchor: "middle", dominantBaseline: "middle", children: element.label })] }, element.id);
                                }
                                if (element.type === 'polygon') {
                                    const points = element.points.map(point => `${scaleX(point.x, content.xAxis, geometry)},${scaleY(point.y, content.yAxis, geometry)}`).join(' ');
                                    const center = element.points.reduce((total, point) => ({ x: total.x + point.x / element.points.length, y: total.y + point.y / element.points.length }), { x: 0, y: 0 });
                                    return _jsxs("g", { ...common, children: [_jsx("polygon", { className: css.sceneShape, points: points }), element.label === undefined ? null : _jsx("text", { className: css.shapeLabel, x: scaleX(center.x, content.xAxis, geometry), y: scaleY(center.y, content.yAxis, geometry), textAnchor: "middle", dominantBaseline: "middle", children: element.label })] }, element.id);
                                }
                                if (element.type === 'label')
                                    return _jsx("g", { ...common, children: _jsx("text", { className: css.sceneText, x: scaleX(element.x, content.xAxis, geometry), y: scaleY(element.y, content.yAxis, geometry), textAnchor: "middle", dominantBaseline: "middle", children: element.text }) }, element.id);
                                return null;
                            }) }), _jsx("text", { className: css.axisLabel, x: geometry.left + geometry.plotWidth / 2, y: geometry.height - 7, textAnchor: "middle", children: content.xAxis.label ?? 'x' }), _jsx("text", { className: css.axisLabel, x: "16", y: geometry.top + geometry.plotHeight / 2, textAnchor: "middle", transform: `rotate(-90 16 ${geometry.top + geometry.plotHeight / 2})`, children: content.yAxis.label ?? 'y' })] }) }), selected === undefined ? (_jsx("p", { className: css.interactionHint, children: labels.sceneInteractionHint })) : (_jsxs("aside", { className: css.detailPanel, "aria-live": "polite", children: [_jsx("span", { children: labels.elementKind }), _jsx("strong", { children: selected.label }), _jsx("p", { children: selected.detail ?? labels.noDetail }), _jsx("button", { type: "button", onClick: () => setSelected(undefined), "aria-label": labels.closeDetail, children: "\u00D7" })] }))] }));
}
function RelationRenderer({ content, focusedIds }) {
    const labels = useVisualLabels();
    const [selected, setSelected] = useState();
    if (content.variant === 'comparison') {
        return (_jsxs("div", { className: css.relationRenderer, children: [_jsx("div", { className: css.tableViewport, children: _jsxs("table", { className: css.relationTable, children: [_jsx("caption", { className: css.srOnly, children: labels.comparisonCaption }), _jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { scope: "col", children: labels.comparisonDimension }), content.subjects.map(subject => (_jsx("th", { scope: "col", "data-tone": toneAt(subject.tone), "data-focus-state": focusState(subject.id, focusedIds), "data-visual-id": subject.id, children: _jsx("button", { type: "button", onClick: () => setSelected({ label: subject.label, detail: subject.detail, kind: labels.comparisonSubject }), children: subject.label }) }, subject.id)))] }) }), _jsx("tbody", { children: content.rows.map(row => (_jsxs("tr", { "data-focus-state": focusState(row.id, focusedIds), "data-visual-id": row.id, children: [_jsx("th", { scope: "row", children: _jsx("button", { type: "button", onClick: () => setSelected({ label: row.label, detail: row.detail, kind: labels.comparisonDimension }), children: row.label }) }), content.subjects.map(subject => {
                                            const cell = row.cells.find(item => item.subjectId === subject.id);
                                            return _jsx("td", { "data-tone": toneAt(cell?.tone), children: cell?.value ?? '—' }, subject.id);
                                        })] }, row.id))) })] }) }), selected === undefined ? _jsx("p", { className: css.interactionHint, children: labels.comparisonInteractionHint }) : _jsx(RelationDetail, { selected: selected, onClose: () => setSelected(undefined) })] }));
    }
    if (content.variant === 'matrix') {
        return (_jsxs("div", { className: css.relationRenderer, children: [_jsx("div", { className: css.tableViewport, children: _jsxs("table", { className: `${css.relationTable} ${css.matrixTable}`, children: [_jsx("caption", { className: css.srOnly, children: labels.matrixCaption }), _jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { scope: "col", children: labels.matrixAxes }), content.columns.map(column => _jsx("th", { scope: "col", "data-focus-state": focusState(column.id, focusedIds), "data-visual-id": column.id, children: column.label }, column.id))] }) }), _jsx("tbody", { children: content.rows.map(row => (_jsxs("tr", { children: [_jsx("th", { scope: "row", "data-focus-state": focusState(row.id, focusedIds), "data-visual-id": row.id, children: row.label }), content.columns.map(column => {
                                            const cell = content.cells.find(item => item.rowId === row.id && item.columnId === column.id);
                                            return _jsx("td", { children: cell === undefined ? _jsx("span", { className: css.emptyCell, "aria-label": labels.noRelation, children: "\u00B7" }) : (_jsx("button", { type: "button", className: css.matrixCell, "data-tone": toneAt(cell.tone), "data-focus-state": focusState(cell.id, focusedIds), "data-visual-id": cell.id, onClick: () => setSelected({ label: cell.label, detail: cell.detail, kind: `${row.label} × ${column.label}` }), children: cell.label })) }, column.id);
                                        })] }, row.id))) })] }) }), selected === undefined ? _jsx("p", { className: css.interactionHint, children: labels.matrixInteractionHint }) : _jsx(RelationDetail, { selected: selected, onClose: () => setSelected(undefined) })] }));
    }
    const setById = new Map(content.sets.map(set => [set.id, set]));
    const exclusiveItems = (setId) => content.items.filter(item => item.setIds.length === 1 && item.setIds[0] === setId);
    const sharedItems = content.items.filter(item => item.setIds.length !== 1);
    return (_jsxs("div", { className: css.relationRenderer, children: [_jsxs("div", { className: css.setMap, "aria-label": labels.setsLabel, children: [_jsx("div", { className: css.setZones, children: content.sets.map((set, setIndex) => (_jsxs("section", { className: css.setZone, "data-tone": toneAt(set.tone, setIndex), "data-focus-state": focusState(set.id, focusedIds), "data-visual-id": set.id, children: [_jsxs("h4", { children: [_jsx("span", { "aria-hidden": "true" }), set.label] }), _jsxs("div", { children: [exclusiveItems(set.id).map(item => (_jsx("button", { type: "button", "data-focus-state": focusState(item.id, focusedIds), "data-visual-id": item.id, onClick: () => setSelected({ label: item.label, detail: item.detail, kind: set.label }), children: item.label }, item.id))), exclusiveItems(set.id).length === 0 ? _jsx("span", { className: css.emptySet, children: labels.noExclusiveItems }) : null] })] }, set.id))) }), sharedItems.length === 0 ? null : (_jsxs("section", { className: css.intersections, children: [_jsx("h4", { children: labels.intersections }), _jsx("div", { children: sharedItems.map(item => (_jsxs("button", { type: "button", "data-focus-state": focusState(item.id, focusedIds), "data-visual-id": item.id, onClick: () => setSelected({ label: item.label, detail: item.detail, kind: item.setIds.map(setId => setById.get(setId)?.label ?? setId).join(' ∩ ') || labels.uncategorized }), children: [_jsx("strong", { children: item.label }), _jsx("span", { children: item.setIds.map(setId => setById.get(setId)?.label ?? setId).join(' ∩ ') || labels.uncategorized })] }, item.id))) })] }))] }), selected === undefined ? _jsx("p", { className: css.interactionHint, children: labels.setsInteractionHint }) : _jsx(RelationDetail, { selected: selected, onClose: () => setSelected(undefined) })] }));
}
function RelationDetail({ selected, onClose, }) {
    const labels = useVisualLabels();
    return (_jsxs("aside", { className: css.detailPanel, "aria-live": "polite", children: [_jsx("span", { children: selected.kind }), _jsx("strong", { children: selected.label }), _jsx("p", { children: selected.detail ?? labels.noDetail }), _jsx("button", { type: "button", onClick: onClose, "aria-label": labels.closeDetail, children: "\u00D7" })] }));
}
function timelinePosition(event, index, count) {
    if (event.position !== undefined)
        return Math.max(0, Math.min(1, event.position));
    return count <= 1 ? 0.5 : index / (count - 1);
}
function TimelineRenderer({ content, focusedIds }) {
    const labels = useVisualLabels();
    const [regionRef, containerWidth] = useContainerWidth();
    const [selected, setSelected] = useState();
    const eras = content.eras ?? [];
    const eventIndex = useMemo(() => new Map(content.events.map((event, index) => [event.id, index])), [content.events]);
    const selectEvent = (event) => setSelected({ label: `${event.time} · ${event.label}`, detail: event.detail, kind: labels.timelineEventKind });
    const selectEra = (era) => setSelected({ label: era.label, detail: era.detail, kind: labels.timelineEraKind });
    if ((content.orientation ?? 'horizontal') === 'vertical') {
        return (_jsxs("div", { className: css.timelineRenderer, role: "group", "aria-label": labels.timelineLabel, children: [eras.length === 0 ? null : (_jsx("div", { className: css.timelineEraChips, "aria-label": labels.timelineEraKind, children: eras.map((era, index) => _jsxs("button", { type: "button", "data-tone": toneAt(era.tone, index), "data-focus-state": focusState(era.id, focusedIds), "data-visual-id": era.id, onClick: () => selectEra(era), children: [_jsx("strong", { children: era.label }), _jsxs("span", { children: [content.events[eventIndex.get(era.startEventId) ?? 0]?.time, " \u2013 ", content.events[eventIndex.get(era.endEventId) ?? 0]?.time] })] }, era.id)) })), _jsx("ol", { className: css.timelineVertical, children: content.events.map((event, index) => (_jsx("li", { "data-tone": toneAt(event.tone, index), "data-focus-state": focusState(event.id, focusedIds), "data-visual-id": event.id, children: _jsxs("button", { type: "button", onClick: () => selectEvent(event), children: [_jsx("span", { children: event.time }), _jsx("strong", { children: event.label }), event.detail === undefined ? null : _jsx("small", { children: event.detail })] }) }, event.id))) }), selected === undefined ? _jsx("p", { className: css.interactionHint, children: labels.timelineInteractionHint }) : _jsx(RelationDetail, { selected: selected, onClose: () => setSelected(undefined) })] }));
    }
    const eventCount = content.events.length;
    const minimumWidth = eventCount <= 4
        ? Math.max(360, 144 + Math.max(0, eventCount - 1) * 104)
        : 144 + Math.max(0, eventCount - 1) * 142;
    const width = Math.max(minimumWidth, Math.floor(containerWidth) - 2);
    const axisY = 72 + Math.min(4, eras.length) * 30;
    const height = axisY + 142;
    const inset = 72;
    const eventX = (event, index) => inset + timelinePosition(event, index, content.events.length) * (width - inset * 2);
    return (_jsxs("div", { className: css.timelineRenderer, role: "group", "aria-label": labels.timelineLabel, children: [_jsx("div", { className: css.timelineViewport, ref: regionRef, children: _jsxs("div", { className: css.timelineCanvas, style: { width, height }, children: [eras.map((era, index) => {
                            const startIndex = eventIndex.get(era.startEventId) ?? 0;
                            const endIndex = eventIndex.get(era.endEventId) ?? startIndex;
                            const start = eventX(content.events[startIndex], startIndex);
                            const end = eventX(content.events[endIndex], endIndex);
                            return (_jsx("button", { type: "button", className: css.timelineEra, "data-tone": toneAt(era.tone, index), "data-focus-state": focusState(era.id, focusedIds), "data-visual-id": era.id, style: { left: Math.min(start, end), top: 16 + index % 4 * 30, width: Math.max(42, Math.abs(end - start)) }, onClick: () => selectEra(era), children: era.label }, era.id));
                        }), _jsx("div", { className: css.timelineAxis, style: { top: axisY }, "aria-hidden": "true" }), content.events.map((event, index) => (_jsxs("button", { type: "button", className: css.timelineEvent, "data-tone": toneAt(event.tone, index), "data-side": index % 2 === 0 ? 'top' : 'bottom', "data-focus-state": focusState(event.id, focusedIds), "data-visual-id": event.id, style: { left: eventX(event, index), top: index % 2 === 0 ? axisY - 74 : axisY + 24 }, onClick: () => selectEvent(event), children: [_jsx("span", { children: event.time }), _jsx("strong", { children: event.label })] }, event.id)))] }) }), selected === undefined ? _jsx("p", { className: css.interactionHint, children: labels.timelineInteractionHint }) : _jsx(RelationDetail, { selected: selected, onClose: () => setSelected(undefined) })] }));
}
function FormulaStepsRenderer({ content, focusedIds }) {
    const labels = useVisualLabels();
    const [revealedIndex, setRevealedIndex] = useState(0);
    const lastIndex = content.steps.length - 1;
    useEffect(() => {
        const focusedIndex = content.steps.findIndex(step => focusedIds.has(step.id));
        if (focusedIndex >= 0)
            setRevealedIndex(current => Math.max(current, focusedIndex));
    }, [content.steps, focusedIds]);
    const move = (delta) => setRevealedIndex(current => Math.max(0, Math.min(lastIndex, current + delta)));
    const onKeyDown = (event) => {
        if (event.target !== event.currentTarget)
            return;
        if (event.key === 'ArrowLeft') {
            event.preventDefault();
            move(-1);
        }
        else if (event.key === 'ArrowRight') {
            event.preventDefault();
            move(1);
        }
        else if (event.key === 'Home') {
            event.preventDefault();
            setRevealedIndex(0);
        }
        else if (event.key === 'End') {
            event.preventDefault();
            setRevealedIndex(lastIndex);
        }
    };
    return (_jsxs("div", { className: css.formulaRenderer, tabIndex: 0, onKeyDown: onKeyDown, "aria-label": labels.formulaLabel, children: [_jsxs("div", { className: css.formulaMeta, children: [_jsx("span", { children: labelTemplate(labels.formulaProgress, { current: revealedIndex + 1, total: content.steps.length }) }), content.notation === undefined ? null : _jsx("code", { children: content.notation })] }), _jsx("ol", { className: css.formulaSteps, "aria-live": "polite", children: content.steps.slice(0, revealedIndex + 1).map((step, index) => (_jsxs("li", { "data-tone": toneAt(step.tone, index), "data-focus-state": focusState(step.id, focusedIds), "data-visual-id": step.id, children: [index === 0 || step.rule === undefined ? null : _jsxs("div", { className: css.formulaRule, children: [_jsx("span", { "aria-hidden": "true", children: "\u2193" }), _jsx("strong", { children: labels.formulaRule }), _jsx("span", { children: step.rule })] }), _jsxs("div", { className: css.formulaStepCard, children: [_jsx("span", { children: index + 1 }), _jsxs("div", { children: [_jsx("div", { className: css.formulaExpression, "aria-label": step.expression, children: _jsx(MarkdownText, { text: displayMath(step.expression) }) }), step.label === undefined ? null : _jsx("strong", { children: step.label }), step.detail === undefined ? null : _jsx("p", { children: step.detail })] })] })] }, step.id))) }), revealedIndex >= lastIndex ? (_jsxs("div", { className: css.formulaConclusion, "aria-live": "polite", children: [_jsx("span", { children: labels.formulaConclusion }), _jsx("strong", { children: content.conclusion ?? labels.formulaComplete })] })) : _jsxs("div", { className: css.formulaUnknown, "aria-hidden": "true", children: [_jsx("span", { children: "\u2193" }), _jsx("code", { children: "?" })] }), _jsxs("div", { className: css.formulaActions, children: [_jsx("button", { type: "button", onClick: () => move(-1), disabled: revealedIndex === 0, children: labels.previousStep }), _jsx("button", { type: "button", className: css.primaryAction, onClick: () => move(1), disabled: revealedIndex >= lastIndex, children: labels.revealNextFormulaStep }), _jsx("button", { type: "button", onClick: () => setRevealedIndex(0), disabled: revealedIndex === 0, children: labels.reset })] }), _jsx("p", { className: css.interactionHint, children: labels.formulaInteractionHint })] }));
}
function studyRoleLabel(role, labels) {
    if (role === 'foundation')
        return labels.roleFoundation;
    if (role === 'core')
        return labels.roleCore;
    if (role === 'extension')
        return labels.roleExtension;
    if (role === 'practice')
        return labels.rolePractice;
    return undefined;
}
function StudyMapRenderer({ content, focusedIds }) {
    const labels = useVisualLabels();
    const conceptById = useMemo(() => new Map(content.concepts.map(concept => [concept.id, concept])), [content.concepts]);
    const focusedConcept = content.concepts.find(concept => focusedIds.has(concept.id));
    const focusedSection = content.sections.find(section => focusedIds.has(section.id));
    const [sectionId, setSectionId] = useState(focusedConcept?.sectionId ?? focusedSection?.id ?? content.sections[0]?.id ?? '');
    const [selectedConceptId, setSelectedConceptId] = useState(focusedConcept?.id);
    useEffect(() => {
        const concept = content.concepts.find(item => focusedIds.has(item.id));
        const section = content.sections.find(item => focusedIds.has(item.id));
        if (concept !== undefined) {
            setSectionId(concept.sectionId);
            setSelectedConceptId(concept.id);
        }
        else if (section !== undefined)
            setSectionId(section.id);
    }, [content.concepts, content.sections, focusedIds]);
    const section = content.sections.find(item => item.id === sectionId) ?? content.sections[0];
    const concepts = content.concepts.filter(concept => concept.sectionId === section?.id);
    const selectedConcept = selectedConceptId === undefined ? undefined : conceptById.get(selectedConceptId);
    const selectSection = (nextId) => { setSectionId(nextId); setSelectedConceptId(undefined); };
    const sectionKeyDown = (event, index) => {
        if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown' && event.key !== 'ArrowLeft' && event.key !== 'ArrowRight')
            return;
        event.preventDefault();
        const delta = event.key === 'ArrowUp' || event.key === 'ArrowLeft' ? -1 : 1;
        const nextIndex = (index + delta + content.sections.length) % content.sections.length;
        const next = content.sections[nextIndex];
        if (next !== undefined) {
            selectSection(next.id);
            const buttons = event.currentTarget.parentElement?.querySelectorAll('[role="tab"]');
            buttons?.[nextIndex]?.focus();
        }
    };
    return (_jsxs("div", { className: css.studyRenderer, children: [_jsxs("div", { className: css.studySource, children: [_jsx("span", { children: labels.studySource }), _jsx("strong", { children: content.sourceLabel }), content.goal === undefined ? null : _jsxs("p", { children: [_jsx("b", { children: labels.studyGoal }), content.goal] })] }), _jsxs("div", { className: css.studyLayout, children: [_jsx("nav", { className: css.studySections, role: "tablist", "aria-label": labels.studySections, children: content.sections.map((item, index) => (_jsxs("button", { type: "button", role: "tab", tabIndex: item.id === section?.id ? 0 : -1, "aria-selected": item.id === section?.id, "data-focus-state": relatedFocusState(item.id, content.concepts.filter(concept => concept.sectionId === item.id).map(concept => concept.id), focusedIds), "data-visual-id": item.id, onClick: () => selectSection(item.id), onKeyDown: event => sectionKeyDown(event, index), children: [_jsx("span", { children: index + 1 }), _jsx("strong", { children: item.label }), item.anchor === undefined ? null : _jsx("small", { children: item.anchor })] }, item.id))) }), _jsxs("section", { className: css.studySectionPanel, role: "tabpanel", children: [section === undefined ? null : _jsxs("header", { children: [_jsxs("div", { children: [_jsx("span", { children: section.anchor === undefined ? labels.studySummary : `${labels.studyAnchor} · ${section.anchor}` }), _jsx("h4", { children: section.label })] }), section.summary === undefined ? null : _jsx("p", { children: section.summary })] }), _jsx("div", { className: css.studyConcepts, "aria-label": labels.studyConcepts, children: concepts.map((concept, index) => {
                                    const role = studyRoleLabel(concept.role, labels);
                                    const prerequisites = (concept.prerequisiteIds ?? []).map(id => conceptById.get(id)?.label ?? id);
                                    return (_jsxs("button", { type: "button", "data-tone": toneAt(concept.tone, index), "data-role": concept.role, "data-focus-state": focusState(concept.id, focusedIds), "data-selected": concept.id === selectedConceptId || undefined, "data-visual-id": concept.id, onClick: () => setSelectedConceptId(concept.id), children: [_jsx("span", { children: role ?? labels.studyConcepts }), _jsx("strong", { children: concept.label }), _jsxs("small", { children: [_jsx("b", { children: labels.prerequisite }), prerequisites.length === 0 ? labels.noPrerequisite : prerequisites.join(' → ')] })] }, concept.id));
                                }) })] })] }), selectedConcept === undefined ? _jsx("p", { className: css.interactionHint, children: labels.studyInteractionHint }) : (_jsxs("aside", { className: css.studyDetail, "aria-live": "polite", children: [_jsxs("div", { children: [_jsx("span", { children: studyRoleLabel(selectedConcept.role, labels) ?? labels.studyConcepts }), _jsx("strong", { children: selectedConcept.label })] }), _jsx("p", { children: selectedConcept.detail ?? labels.noDetail }), _jsxs("dl", { children: [_jsx("dt", { children: labels.prerequisite }), _jsx("dd", { children: (selectedConcept.prerequisiteIds ?? []).map(id => conceptById.get(id)?.label ?? id).join(' → ') || labels.noPrerequisite })] }), _jsx("button", { type: "button", onClick: () => setSelectedConceptId(undefined), "aria-label": labels.closeDetail, children: "\u00D7" })] }))] }));
}
function initialRecallState(content, storageKey) {
    const initial = { index: 0, stage: 'prompt', statuses: {} };
    if (storageKey === undefined || typeof sessionStorage === 'undefined')
        return initial;
    try {
        const stored = JSON.parse(sessionStorage.getItem(`dsh-learning/visual@4:recall:${storageKey}`) ?? '{}');
        if (typeof stored.index === 'number' && Number.isInteger(stored.index))
            initial.index = Math.max(0, Math.min(content.cards.length - 1, stored.index));
        if (stored.stage === 'prompt' || stored.stage === 'hint' || stored.stage === 'answer')
            initial.stage = stored.stage;
        if (typeof stored.statuses === 'object' && stored.statuses !== null && !Array.isArray(stored.statuses)) {
            for (const card of content.cards) {
                const status = stored.statuses[card.id];
                if (status === 'mastered' || status === 'review')
                    initial.statuses[card.id] = status;
            }
        }
        if (initial.stage === 'hint' && content.cards[initial.index]?.hint === undefined)
            initial.stage = 'answer';
    }
    catch {
        // Corrupt optional recall state should never prevent the canonical deck replay.
    }
    return initial;
}
function RecallDeckRenderer({ content, focusedIds, storageKey }) {
    const labels = useVisualLabels();
    const initial = useMemo(() => initialRecallState(content, storageKey), [content, storageKey]);
    const [cardIndex, setCardIndex] = useState(initial.index);
    const [stage, setStage] = useState(initial.stage);
    const [statuses, setStatuses] = useState(initial.statuses);
    const current = content.cards[cardIndex];
    useEffect(() => {
        const focusedIndex = content.cards.findIndex(card => focusedIds.has(card.id));
        if (focusedIndex >= 0) {
            setCardIndex(focusedIndex);
            setStage('prompt');
        }
    }, [content.cards, focusedIds]);
    useEffect(() => {
        if (storageKey === undefined || typeof sessionStorage === 'undefined')
            return;
        try {
            sessionStorage.setItem(`dsh-learning/visual@4:recall:${storageKey}`, JSON.stringify({ index: cardIndex, stage, statuses }));
        }
        catch {
            // Persistence is optional; the deck remains fully usable without it.
        }
    }, [cardIndex, stage, statuses, storageKey]);
    if (current === undefined)
        return null;
    const move = (delta) => {
        setCardIndex(index => Math.max(0, Math.min(content.cards.length - 1, index + delta)));
        setStage('prompt');
    };
    const reset = () => { setCardIndex(0); setStage('prompt'); setStatuses({}); };
    const mark = (status) => setStatuses(value => ({ ...value, [current.id]: status }));
    const masteredCount = Object.values(statuses).filter(status => status === 'mastered').length;
    const reviewCount = Object.values(statuses).filter(status => status === 'review').length;
    const status = statuses[current.id];
    const revealNext = () => setStage(value => value === 'prompt' && current.hint !== undefined ? 'hint' : 'answer');
    const onKeyDown = (event) => {
        if (event.target !== event.currentTarget)
            return;
        if (event.key === 'ArrowLeft') {
            event.preventDefault();
            move(-1);
        }
        else if (event.key === 'ArrowRight') {
            event.preventDefault();
            move(1);
        }
    };
    return (_jsxs("div", { className: css.recallRenderer, tabIndex: 0, onKeyDown: onKeyDown, "aria-label": labels.recallDeckLabel, children: [_jsxs("div", { className: css.recallToolbar, children: [_jsx("span", { children: labelTemplate(labels.recallProgress, { current: cardIndex + 1, total: content.cards.length }) }), _jsx("output", { children: labelTemplate(labels.recallStatus, { mastered: masteredCount, review: reviewCount }) })] }), content.instructions === undefined ? null : _jsx("p", { className: css.recallInstructions, children: content.instructions }), _jsxs("article", { className: css.recallCard, "data-visual-id": current.id, "data-focus-state": focusState(current.id, focusedIds), "data-stage": stage, children: [_jsxs("div", { className: css.recallCardHeader, children: [_jsx("span", { children: labels.recallPrompt }), _jsx("small", { "data-status": status ?? 'unrated', children: status === 'mastered' ? labels.mastered : status === 'review' ? labels.reviewAgain : labels.unrated })] }), _jsx("h4", { children: current.prompt }), current.tags === undefined || current.tags.length === 0 ? null : _jsx("ul", { className: css.recallTags, children: current.tags.map(tag => _jsx("li", { children: tag }, tag)) }), stage === 'prompt' || current.hint === undefined ? null : _jsxs("section", { className: css.recallReveal, "data-kind": "hint", "aria-live": "polite", children: [_jsx("span", { children: labels.recallHint }), _jsx("p", { children: current.hint })] }), stage !== 'answer' ? null : _jsxs("section", { className: css.recallReveal, "data-kind": "answer", "aria-live": "polite", children: [_jsx("span", { children: labels.recallAnswer }), _jsx("p", { children: current.answer })] }), stage === 'answer' ? (_jsxs("div", { className: css.recallRating, children: [_jsx("button", { type: "button", "aria-pressed": status === 'review', onClick: () => mark('review'), children: labels.reviewAgain }), _jsx("button", { type: "button", "aria-pressed": status === 'mastered', onClick: () => mark('mastered'), children: labels.mastered })] })) : _jsx("button", { type: "button", className: css.recallRevealButton, onClick: revealNext, children: stage === 'prompt' && current.hint !== undefined ? labels.showHint : labels.showAnswer })] }), _jsxs("div", { className: css.recallNavigation, children: [_jsxs("button", { type: "button", onClick: () => move(-1), disabled: cardIndex === 0, children: ["\u2190 ", labels.previousCard] }), _jsxs("button", { type: "button", onClick: () => move(1), disabled: cardIndex >= content.cards.length - 1, children: [labels.nextCard, " \u2192"] }), _jsx("button", { type: "button", onClick: reset, disabled: cardIndex === 0 && stage === 'prompt' && Object.keys(statuses).length === 0, children: labels.resetDeck })] }), _jsx("p", { className: css.interactionHint, children: labels.recallInteractionHint })] }));
}
const VISUAL_RENDERER_REGISTRY = {
    plot: PlotRenderer,
    node_link: NodeLinkRenderer,
    scene_2d: Scene2DRenderer,
    relation: RelationRenderer,
    timeline: TimelineRenderer,
    formula_steps: FormulaStepsRenderer,
    study_map: StudyMapRenderer,
    recall_deck: RecallDeckRenderer,
};
function RegisteredVisual({ content, focusedIds, storageKey, }) {
    const Renderer = VISUAL_RENDERER_REGISTRY[content.kind];
    return _jsx(Renderer, { content: content, focusedIds: focusedIds, storageKey: storageKey });
}
export function LearningVisualV4({ visual, storageKey, labels: suppliedLabels, }) {
    const titleId = useId();
    const descriptionId = useId();
    const initialFrameIndex = visual.sequence === undefined ? 0 : Math.max(0, visual.sequence.frames.findIndex(frame => frame.id === visual.sequence?.initialFrameId));
    const [frameIndex, setFrameIndex] = useState(initialFrameIndex);
    const frame = visual.sequence?.frames[frameIndex];
    const focusedIds = useMemo(() => new Set(frame?.focusIds ?? []), [frame?.focusIds]);
    const labels = useMemo(() => ({ ...DEFAULT_LABELS, ...suppliedLabels }), [suppliedLabels]);
    useEffect(() => setFrameIndex(initialFrameIndex), [initialFrameIndex, visual]);
    return (_jsx(VisualLabelsContext.Provider, { value: labels, children: _jsxs("section", { className: css.visualShell, "data-learning-visual": visual.content.kind, "data-render-state": "ready", "aria-labelledby": titleId, "aria-describedby": visual.description === undefined ? undefined : descriptionId, children: [_jsxs("header", { className: css.visualHeader, children: [_jsx("span", { className: css.visualEyebrow, "aria-hidden": "true", children: labels.eyebrow }), _jsx("h3", { id: titleId, children: visual.title }), visual.description === undefined ? null : _jsx("p", { id: descriptionId, children: visual.description })] }), visual.sequence === undefined || visual.sequence.frames.length === 0 ? null : (_jsx(SequenceController, { sequence: visual.sequence, frameIndex: frameIndex, onFrameChange: setFrameIndex })), _jsx(VisualErrorBoundary, { fallbackMarkdown: visual.fallbackMarkdown, labels: labels, children: _jsx(RegisteredVisual, { content: visual.content, focusedIds: focusedIds, storageKey: storageKey }) }, `${visual.protocol}:${visual.title}:${visual.content.kind}`)] }) }));
}
//# sourceMappingURL=LearningVisualV4.js.map