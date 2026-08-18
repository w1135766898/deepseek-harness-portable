/** Versioned, declarative protocol shared by the Host, Agent, and Client. */
export const ACTIVITY_PROTOCOL = 'dsh-learning/activity@1';
export const RESPONSE_PROTOCOL = 'dsh-learning/response@1';
export const TRANSPORT_PROTOCOL = 'dsh-learning/transport@1';
export const ACTIVITY_PROTOCOL_V2 = 'dsh-learning/activity@2';
export const RESPONSE_PROTOCOL_V2 = 'dsh-learning/response@2';
export const TRANSPORT_PROTOCOL_V2 = 'dsh-learning/wait@2';
export const LEARNING_ACTIVITY_KINDS = [
    'parameter_explorer',
    'process_stepper',
    'structure_compare',
];
export const MAX_ACTIVITY_BYTES = 64 * 1024;
export const MAX_RESPONSE_BYTES = 32 * 1024;
export const MAX_MATH_DEPTH = 8;
export const MAX_MATH_NODES = 64;
/** A stable, actionable protocol rejection surfaced to the tool call. */
export class LearningProtocolError extends Error {
    issues;
    code = 'INVALID_LEARNING_ACTIVITY';
    constructor(issues) {
        super(`Invalid Learning Activity: ${issues.join('; ')}`);
        this.issues = issues;
        this.name = 'LearningProtocolError';
    }
}
function record(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function onlyKeys(value, allowed, path, issues) {
    for (const key of Object.keys(value)) {
        if (!allowed.includes(key))
            issues.push(`${path}.${key} is not supported`);
    }
}
function text(value, path, issues, max = 8_000) {
    if (typeof value !== 'string' || value.trim() === '') {
        issues.push(`${path} must be a non-empty string`);
        return false;
    }
    if (value.length > max)
        issues.push(`${path} exceeds ${String(max)} characters`);
    return true;
}
function finite(value, path, issues) {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        issues.push(`${path} must be a finite number`);
        return false;
    }
    return true;
}
function id(value, path, issues) {
    if (typeof value !== 'string' || !/^[a-z][a-z0-9_-]{0,31}$/.test(value)) {
        issues.push(`${path} must match ^[a-z][a-z0-9_-]{0,31}$`);
        return false;
    }
    return true;
}
function uniqueIds(values, path, issues) {
    const seen = new Set();
    for (const [index, value] of values.entries()) {
        if (typeof value.id !== 'string')
            continue;
        if (seen.has(value.id))
            issues.push(`${path}[${String(index)}].id duplicates ${value.id}`);
        seen.add(value.id);
    }
}
function jsonBytes(value) {
    try {
        return new TextEncoder().encode(JSON.stringify(value)).byteLength;
    }
    catch {
        return undefined;
    }
}
function validateJson(value, path, issues) {
    const stack = [{ value, path, depth: 0 }];
    let nodes = 0;
    while (stack.length > 0) {
        const current = stack.pop();
        nodes += 1;
        if (nodes > 512) {
            issues.push(`${path} exceeds 512 JSON nodes`);
            return false;
        }
        if (current.depth > 12) {
            issues.push(`${current.path} exceeds JSON depth 12`);
            return false;
        }
        const item = current.value;
        if (item === null || typeof item === 'string' || typeof item === 'boolean')
            continue;
        if (typeof item === 'number') {
            if (!Number.isFinite(item))
                issues.push(`${current.path} must contain finite numbers`);
            continue;
        }
        if (Array.isArray(item)) {
            for (let index = item.length - 1; index >= 0; index -= 1) {
                stack.push({ value: item[index], path: `${current.path}[${String(index)}]`, depth: current.depth + 1 });
            }
            continue;
        }
        if (record(item)) {
            for (const [key, child] of Object.entries(item)) {
                stack.push({ value: child, path: `${current.path}.${key}`, depth: current.depth + 1 });
            }
            continue;
        }
        issues.push(`${current.path} must be lossless JSON`);
    }
    return issues.length === 0;
}
function validateMath(value, parameterIds, path, issues) {
    const binary = new Set(['add', 'sub', 'mul', 'div', 'pow']);
    const unary = new Set(['neg', 'abs', 'sqrt', 'sin', 'cos', 'exp', 'log']);
    const stack = [{ value, path, depth: 1 }];
    let nodes = 0;
    while (stack.length > 0) {
        const node = stack.pop();
        nodes += 1;
        if (nodes > MAX_MATH_NODES) {
            issues.push(`${path} exceeds ${String(MAX_MATH_NODES)} AST nodes`);
            return;
        }
        if (node.depth > MAX_MATH_DEPTH) {
            issues.push(`${node.path} exceeds AST depth ${String(MAX_MATH_DEPTH)}`);
            return;
        }
        if (!record(node.value) || typeof node.value.op !== 'string') {
            issues.push(`${node.path} must be a mathematical AST node`);
            continue;
        }
        const expression = node.value;
        const op = expression.op;
        if (op === 'constant') {
            onlyKeys(expression, ['op', 'value'], node.path, issues);
            if (finite(expression.value, `${node.path}.value`, issues) && Math.abs(expression.value) > 1e12) {
                issues.push(`${node.path}.value exceeds the numeric limit`);
            }
        }
        else if (op === 'variable') {
            onlyKeys(expression, ['op', 'name'], node.path, issues);
            if (typeof expression.name !== 'string' || (expression.name !== 'x' && !parameterIds.has(expression.name))) {
                issues.push(`${node.path}.name must be x or a declared parameter id`);
            }
        }
        else if (binary.has(op)) {
            onlyKeys(expression, ['op', 'left', 'right'], node.path, issues);
            stack.push({ value: expression.right, path: `${node.path}.right`, depth: node.depth + 1 }, { value: expression.left, path: `${node.path}.left`, depth: node.depth + 1 });
        }
        else if (unary.has(op)) {
            onlyKeys(expression, ['op', 'value'], node.path, issues);
            stack.push({ value: expression.value, path: `${node.path}.value`, depth: node.depth + 1 });
        }
        else {
            issues.push(`${node.path}.op is unknown`);
        }
    }
}
function validateParameterExplorer(payload, issues) {
    if (!record(payload)) {
        issues.push('activity.payload must be an object');
        return;
    }
    onlyKeys(payload, ['parameters', 'xAxis', 'curves', 'question'], 'activity.payload', issues);
    if (!Array.isArray(payload.parameters) || payload.parameters.length < 1 || payload.parameters.length > 2) {
        issues.push('activity.payload.parameters must contain 1 or 2 parameters');
        return;
    }
    const parameters = payload.parameters.filter(record);
    if (parameters.length !== payload.parameters.length)
        issues.push('activity.payload.parameters entries must be objects');
    uniqueIds(parameters, 'activity.payload.parameters', issues);
    for (const [index, parameter] of parameters.entries()) {
        const path = `activity.payload.parameters[${String(index)}]`;
        onlyKeys(parameter, ['id', 'label', 'min', 'max', 'step', 'initial'], path, issues);
        id(parameter.id, `${path}.id`, issues);
        text(parameter.label, `${path}.label`, issues, 120);
        const min = parameter.min;
        const max = parameter.max;
        const step = parameter.step;
        const initial = parameter.initial;
        const minOk = finite(min, `${path}.min`, issues);
        const maxOk = finite(max, `${path}.max`, issues);
        const stepOk = finite(step, `${path}.step`, issues);
        const initialOk = finite(initial, `${path}.initial`, issues);
        if (minOk && maxOk && min >= max)
            issues.push(`${path}.min must be less than max`);
        if (stepOk && step <= 0)
            issues.push(`${path}.step must be positive`);
        if (minOk && maxOk && stepOk && step > max - min) {
            issues.push(`${path}.step must not exceed the parameter range`);
        }
        if (minOk && maxOk && initialOk && (initial < min || initial > max)) {
            issues.push(`${path}.initial must be inside the parameter range`);
        }
    }
    if (!record(payload.xAxis)) {
        issues.push('activity.payload.xAxis must be an object');
    }
    else {
        onlyKeys(payload.xAxis, ['label', 'min', 'max', 'samples'], 'activity.payload.xAxis', issues);
        if (payload.xAxis.label !== undefined)
            text(payload.xAxis.label, 'activity.payload.xAxis.label', issues, 120);
        const xMin = payload.xAxis.min;
        const xMax = payload.xAxis.max;
        const samples = payload.xAxis.samples;
        const minOk = finite(xMin, 'activity.payload.xAxis.min', issues);
        const maxOk = finite(xMax, 'activity.payload.xAxis.max', issues);
        if (minOk && maxOk && xMin >= xMax)
            issues.push('activity.payload.xAxis.min must be less than max');
        if (samples !== undefined
            && (typeof samples !== 'number' || !Number.isInteger(samples) || samples < 16 || samples > 256)) {
            issues.push('activity.payload.xAxis.samples must be an integer from 16 to 256');
        }
    }
    if (!Array.isArray(payload.curves) || payload.curves.length < 1 || payload.curves.length > 3) {
        issues.push('activity.payload.curves must contain 1 to 3 curves');
    }
    else {
        const curves = payload.curves.filter(record);
        if (curves.length !== payload.curves.length)
            issues.push('activity.payload.curves entries must be objects');
        uniqueIds(curves, 'activity.payload.curves', issues);
        const parameterIds = new Set(parameters.map(item => typeof item.id === 'string' ? item.id : ''));
        for (const [index, curve] of curves.entries()) {
            const path = `activity.payload.curves[${String(index)}]`;
            onlyKeys(curve, ['id', 'label', 'expression'], path, issues);
            id(curve.id, `${path}.id`, issues);
            text(curve.label, `${path}.label`, issues, 120);
            validateMath(curve.expression, parameterIds, `${path}.expression`, issues);
        }
    }
    if (payload.question !== undefined)
        text(payload.question, 'activity.payload.question', issues, 2_000);
}
function validateProcessStepper(payload, issues) {
    if (!record(payload)) {
        issues.push('activity.payload must be an object');
        return;
    }
    onlyKeys(payload, ['steps', 'question'], 'activity.payload', issues);
    if (!Array.isArray(payload.steps) || payload.steps.length < 2 || payload.steps.length > 12) {
        issues.push('activity.payload.steps must contain 2 to 12 steps');
        return;
    }
    const steps = payload.steps.filter(record);
    if (steps.length !== payload.steps.length)
        issues.push('activity.payload.steps entries must be objects');
    uniqueIds(steps, 'activity.payload.steps', issues);
    for (const [index, step] of steps.entries()) {
        const path = `activity.payload.steps[${String(index)}]`;
        onlyKeys(step, ['id', 'title', 'content', 'checkpoint'], path, issues);
        id(step.id, `${path}.id`, issues);
        text(step.title, `${path}.title`, issues, 200);
        text(step.content, `${path}.content`, issues, 4_000);
        if (step.checkpoint !== undefined) {
            if (!record(step.checkpoint)) {
                issues.push(`${path}.checkpoint must be an object`);
            }
            else {
                onlyKeys(step.checkpoint, ['question', 'options'], `${path}.checkpoint`, issues);
                text(step.checkpoint.question, `${path}.checkpoint.question`, issues, 2_000);
                if (step.checkpoint.options !== undefined) {
                    if (!Array.isArray(step.checkpoint.options)
                        || step.checkpoint.options.length < 2 || step.checkpoint.options.length > 6
                        || !step.checkpoint.options.every(option => typeof option === 'string' && option.trim() !== '')) {
                        issues.push(`${path}.checkpoint.options must contain 2 to 6 non-empty strings`);
                    }
                }
            }
        }
    }
    if (payload.question !== undefined)
        text(payload.question, 'activity.payload.question', issues, 2_000);
}
function validateStructureSide(value, path, issues) {
    if (!record(value)) {
        issues.push(`${path} must be an object`);
        return [];
    }
    onlyKeys(value, ['title', 'items'], path, issues);
    text(value.title, `${path}.title`, issues, 200);
    if (!Array.isArray(value.items) || value.items.length < 1 || value.items.length > 20) {
        issues.push(`${path}.items must contain 1 to 20 items`);
        return [];
    }
    const items = value.items.filter(record);
    if (items.length !== value.items.length)
        issues.push(`${path}.items entries must be objects`);
    uniqueIds(items, `${path}.items`, issues);
    for (const [index, item] of items.entries()) {
        const itemPath = `${path}.items[${String(index)}]`;
        onlyKeys(item, ['id', 'label', 'detail'], itemPath, issues);
        id(item.id, `${itemPath}.id`, issues);
        text(item.label, `${itemPath}.label`, issues, 500);
        if (item.detail !== undefined)
            text(item.detail, `${itemPath}.detail`, issues, 2_000);
    }
    return items;
}
function validateStructureCompare(payload, issues) {
    if (!record(payload)) {
        issues.push('activity.payload must be an object');
        return;
    }
    onlyKeys(payload, ['left', 'right', 'alignments', 'question'], 'activity.payload', issues);
    const left = validateStructureSide(payload.left, 'activity.payload.left', issues);
    const right = validateStructureSide(payload.right, 'activity.payload.right', issues);
    const leftIds = new Set(left.map(item => typeof item.id === 'string' ? item.id : ''));
    const rightIds = new Set(right.map(item => typeof item.id === 'string' ? item.id : ''));
    if (!Array.isArray(payload.alignments) || payload.alignments.length < 1 || payload.alignments.length > 24) {
        issues.push('activity.payload.alignments must contain 1 to 24 rows');
    }
    else {
        const alignments = payload.alignments.filter(record);
        if (alignments.length !== payload.alignments.length)
            issues.push('activity.payload.alignments entries must be objects');
        uniqueIds(alignments, 'activity.payload.alignments', issues);
        for (const [index, alignment] of alignments.entries()) {
            const path = `activity.payload.alignments[${String(index)}]`;
            onlyKeys(alignment, ['id', 'leftId', 'rightId', 'prompt'], path, issues);
            id(alignment.id, `${path}.id`, issues);
            if (alignment.leftId === undefined && alignment.rightId === undefined)
                issues.push(`${path} must reference at least one side`);
            if (alignment.leftId !== undefined && (typeof alignment.leftId !== 'string' || !leftIds.has(alignment.leftId))) {
                issues.push(`${path}.leftId must reference a left item`);
            }
            if (alignment.rightId !== undefined && (typeof alignment.rightId !== 'string' || !rightIds.has(alignment.rightId))) {
                issues.push(`${path}.rightId must reference a right item`);
            }
            if (alignment.prompt !== undefined)
                text(alignment.prompt, `${path}.prompt`, issues, 1_000);
        }
    }
    if (payload.question !== undefined)
        text(payload.question, 'activity.payload.question', issues, 2_000);
}
/** Validate and narrow an untrusted model-provided activity. */
export function parseLearningActivity(value) {
    const issues = [];
    const bytes = jsonBytes(value);
    if (bytes === undefined)
        issues.push('activity must be serializable JSON');
    else if (bytes > MAX_ACTIVITY_BYTES)
        issues.push(`activity exceeds ${String(MAX_ACTIVITY_BYTES)} bytes`);
    if (!record(value))
        throw new LearningProtocolError([...issues, 'activity must be an object']);
    onlyKeys(value, ['protocol', 'kind', 'title', 'objective', 'prompt', 'scaffold', 'payload', 'fallbackMarkdown'], 'activity', issues);
    if (value.protocol !== ACTIVITY_PROTOCOL)
        issues.push(`activity.protocol must be ${ACTIVITY_PROTOCOL}`);
    if (!LEARNING_ACTIVITY_KINDS.includes(value.kind))
        issues.push('activity.kind is unknown');
    text(value.title, 'activity.title', issues, 200);
    text(value.objective, 'activity.objective', issues, 1_000);
    text(value.prompt, 'activity.prompt', issues, 2_000);
    if (value.scaffold !== undefined)
        text(value.scaffold, 'activity.scaffold', issues, 4_000);
    text(value.fallbackMarkdown, 'activity.fallbackMarkdown', issues, 16_000);
    if (value.kind === 'parameter_explorer')
        validateParameterExplorer(value.payload, issues);
    else if (value.kind === 'process_stepper')
        validateProcessStepper(value.payload, issues);
    else if (value.kind === 'structure_compare')
        validateStructureCompare(value.payload, issues);
    if (issues.length > 0)
        throw new LearningProtocolError(issues);
    return value;
}
/** Validate and narrow a Client response before it returns to the model. */
export function parseLearningResponse(value, expectedActivityId) {
    const issues = [];
    const bytes = jsonBytes(value);
    if (bytes === undefined)
        issues.push('response must be serializable JSON');
    else if (bytes > MAX_RESPONSE_BYTES)
        issues.push(`response exceeds ${String(MAX_RESPONSE_BYTES)} bytes`);
    if (!record(value))
        throw new LearningProtocolError([...issues, 'response must be an object']);
    onlyKeys(value, ['protocol', 'activityId', 'action', 'answer', 'interactionState'], 'response', issues);
    if (value.protocol !== RESPONSE_PROTOCOL)
        issues.push(`response.protocol must be ${RESPONSE_PROTOCOL}`);
    if (typeof value.activityId !== 'string' || value.activityId === '')
        issues.push('response.activityId must be a non-empty string');
    if (expectedActivityId !== undefined && value.activityId !== expectedActivityId)
        issues.push('response.activityId does not match the pending activity');
    if (value.action !== 'submit' && value.action !== 'skip' && value.action !== 'cancel')
        issues.push('response.action is unknown');
    if (value.answer !== undefined)
        validateJson(value.answer, 'response.answer', issues);
    if (value.interactionState !== undefined)
        validateJson(value.interactionState, 'response.interactionState', issues);
    if (issues.length > 0)
        throw new LearningProtocolError(issues);
    return value;
}
function integer(value, path, issues, min = 0) {
    if (typeof value !== 'number' || !Number.isInteger(value) || value < min) {
        issues.push(`${path} must be an integer >= ${String(min)}`);
        return false;
    }
    return true;
}
function token(value, path, issues) {
    if (typeof value !== 'string' || value.length < 1 || value.length > 128 || !/^[A-Za-z0-9_-]+$/.test(value)) {
        issues.push(`${path} must be an opaque token of 1 to 128 URL-safe characters`);
        return false;
    }
    return true;
}
function validateFocusV2(value, path, issues) {
    if (!record(value)) {
        issues.push(`${path} must be an object`);
        return;
    }
    onlyKeys(value, ['title', 'progress'], path, issues);
    text(value.title, `${path}.title`, issues, 200);
    if (value.progress !== undefined) {
        if (!record(value.progress))
            issues.push(`${path}.progress must be an object`);
        else {
            onlyKeys(value.progress, ['current', 'total'], `${path}.progress`, issues);
            const currentOk = integer(value.progress.current, `${path}.progress.current`, issues, 1);
            const totalOk = value.progress.total === undefined
                ? false
                : integer(value.progress.total, `${path}.progress.total`, issues, 1);
            if (currentOk && totalOk && value.progress.current > value.progress.total) {
                issues.push(`${path}.progress.current must not exceed total`);
            }
        }
    }
}
function validateInputV2(value, issues) {
    const path = 'activity.input';
    if (!record(value)) {
        issues.push(`${path} must be an object`);
        return;
    }
    if (value.kind === 'single_choice') {
        onlyKeys(value, ['kind', 'options'], path, issues);
        if (!Array.isArray(value.options) || value.options.length < 2 || value.options.length > 8) {
            issues.push(`${path}.options must contain 2 to 8 options`);
            return;
        }
        const options = value.options.filter(record);
        if (options.length !== value.options.length)
            issues.push(`${path}.options entries must be objects`);
        uniqueIds(options, `${path}.options`, issues);
        for (const [index, option] of options.entries()) {
            const optionPath = `${path}.options[${String(index)}]`;
            onlyKeys(option, ['id', 'label'], optionPath, issues);
            id(option.id, `${optionPath}.id`, issues);
            text(option.label, `${optionPath}.label`, issues, 500);
        }
    }
    else if (value.kind === 'short_text') {
        onlyKeys(value, ['kind', 'placeholder', 'maxLength'], path, issues);
        if (value.placeholder !== undefined)
            text(value.placeholder, `${path}.placeholder`, issues, 500);
        if (value.maxLength !== undefined
            && (!integer(value.maxLength, `${path}.maxLength`, issues, 1) || value.maxLength > 8_000)) {
            issues.push(`${path}.maxLength must not exceed 8000`);
        }
    }
    else if (value.kind === 'number') {
        onlyKeys(value, ['kind', 'min', 'max', 'step'], path, issues);
        const minOk = value.min === undefined ? false : finite(value.min, `${path}.min`, issues);
        const maxOk = value.max === undefined ? false : finite(value.max, `${path}.max`, issues);
        const stepOk = value.step === undefined ? false : finite(value.step, `${path}.step`, issues);
        if (minOk && maxOk && value.min >= value.max)
            issues.push(`${path}.min must be less than max`);
        if (stepOk && value.step <= 0)
            issues.push(`${path}.step must be positive`);
    }
    else {
        issues.push(`${path}.kind is unknown`);
    }
}
function validateFrameV2(value, path, issues) {
    if (!record(value)) {
        issues.push(`${path} must be an object`);
        return;
    }
    onlyKeys(value, ['id', 'title', 'content'], path, issues);
    id(value.id, `${path}.id`, issues);
    text(value.title, `${path}.title`, issues, 200);
    if (value.content !== undefined)
        text(value.content, `${path}.content`, issues, 4_000);
}
function validateParameterVisualV2(value, path, issues, reveal) {
    onlyKeys(value, reveal
        ? ['kind', 'parameters', 'xAxis', 'curves', 'emphasis']
        : ['kind', 'parameters', 'xAxis', 'curves'], path, issues);
    validateParameterExplorer({ parameters: value.parameters, xAxis: value.xAxis, curves: value.curves }, issues);
    if (reveal && value.emphasis !== undefined)
        text(value.emphasis, `${path}.emphasis`, issues, 2_000);
}
function validateStructureVisualV2(value, path, issues, reveal) {
    onlyKeys(value, reveal
        ? ['kind', 'left', 'right', 'alignments', 'emphasisAlignmentIds']
        : ['kind', 'left', 'right', 'alignments'], path, issues);
    validateStructureCompare({ left: value.left, right: value.right, alignments: value.alignments }, issues);
    if (reveal && value.emphasisAlignmentIds !== undefined) {
        if (!Array.isArray(value.emphasisAlignmentIds)
            || !value.emphasisAlignmentIds.every(item => typeof item === 'string')) {
            issues.push(`${path}.emphasisAlignmentIds must be an array of ids`);
        }
    }
}
function validateVisualV2(value, phase, issues) {
    const path = 'activity.visual';
    if (!record(value)) {
        issues.push(`${path} must be an object`);
        return;
    }
    if (value.kind === 'process') {
        if (phase === 'question') {
            onlyKeys(value, ['kind', 'frame'], path, issues);
            validateFrameV2(value.frame, `${path}.frame`, issues);
        }
        else {
            onlyKeys(value, ['kind', 'before', 'after'], path, issues);
            validateFrameV2(value.before, `${path}.before`, issues);
            validateFrameV2(value.after, `${path}.after`, issues);
        }
    }
    else if (value.kind === 'parameter') {
        validateParameterVisualV2(value, path, issues, phase === 'reveal');
    }
    else if (value.kind === 'structure') {
        validateStructureVisualV2(value, path, issues, phase === 'reveal');
    }
    else {
        issues.push(`${path}.kind is unknown`);
    }
}
/** Strict live protocol. V1 is intentionally parsed separately for legacy replay only. */
export function parseLearningActivityV2(value) {
    const issues = [];
    const bytes = jsonBytes(value);
    if (bytes === undefined)
        issues.push('activity must be serializable JSON');
    else if (bytes > MAX_ACTIVITY_BYTES)
        issues.push(`activity exceeds ${String(MAX_ACTIVITY_BYTES)} bytes`);
    if (!record(value))
        throw new LearningProtocolError([...issues, 'activity must be an object']);
    if (value.protocol !== ACTIVITY_PROTOCOL_V2)
        issues.push(`activity.protocol must be ${ACTIVITY_PROTOCOL_V2}`);
    if (value.phase === 'question') {
        onlyKeys(value, ['protocol', 'phase', 'lessonToken', 'seq', 'focus', 'prompt', 'scaffold', 'input', 'visual', 'fallbackMarkdown'], 'activity', issues);
        if (value.lessonToken !== undefined)
            token(value.lessonToken, 'activity.lessonToken', issues);
        integer(value.seq, 'activity.seq', issues);
        validateFocusV2(value.focus, 'activity.focus', issues);
        text(value.prompt, 'activity.prompt', issues, 2_000);
        if (value.scaffold !== undefined)
            text(value.scaffold, 'activity.scaffold', issues, 4_000);
        validateInputV2(value.input, issues);
        if (value.visual !== undefined)
            validateVisualV2(value.visual, 'question', issues);
        text(value.fallbackMarkdown, 'activity.fallbackMarkdown', issues, 16_000);
    }
    else if (value.phase === 'reveal') {
        onlyKeys(value, ['protocol', 'phase', 'lessonToken', 'roundToken', 'seq', 'focus', 'feedback', 'visual', 'animation', 'advance', 'fallbackMarkdown'], 'activity', issues);
        token(value.lessonToken, 'activity.lessonToken', issues);
        token(value.roundToken, 'activity.roundToken', issues);
        integer(value.seq, 'activity.seq', issues);
        validateFocusV2(value.focus, 'activity.focus', issues);
        if (!record(value.feedback))
            issues.push('activity.feedback must be an object');
        else {
            onlyKeys(value.feedback, ['verdict', 'learnerEcho', 'explanation', 'answer'], 'activity.feedback', issues);
            if (value.feedback.verdict !== undefined
                && !['correct', 'partial', 'misconception', 'neutral'].includes(value.feedback.verdict)) {
                issues.push('activity.feedback.verdict is unknown');
            }
            if (value.feedback.learnerEcho !== undefined)
                text(value.feedback.learnerEcho, 'activity.feedback.learnerEcho', issues, 2_000);
            text(value.feedback.explanation, 'activity.feedback.explanation', issues, 8_000);
            if (value.feedback.answer !== undefined)
                text(value.feedback.answer, 'activity.feedback.answer', issues, 4_000);
        }
        if (value.visual !== undefined)
            validateVisualV2(value.visual, 'reveal', issues);
        if (!record(value.animation))
            issues.push('activity.animation must be an object');
        else {
            onlyKeys(value.animation, ['kind', 'preferredDurationMs', 'reducedMotion'], 'activity.animation', issues);
            if (!['draw', 'morph', 'highlight', 'step_complete'].includes(value.animation.kind))
                issues.push('activity.animation.kind is unknown');
            if (value.animation.preferredDurationMs !== undefined
                && (!integer(value.animation.preferredDurationMs, 'activity.animation.preferredDurationMs', issues, 0)
                    || value.animation.preferredDurationMs > 10_000)) {
                issues.push('activity.animation.preferredDurationMs must not exceed 10000');
            }
            if (value.animation.reducedMotion !== 'commit-final-state')
                issues.push('activity.animation.reducedMotion must be commit-final-state');
        }
        if (!record(value.advance))
            issues.push('activity.advance must be an object');
        else {
            onlyKeys(value.advance, ['mode', 'label'], 'activity.advance', issues);
            if (value.advance.mode !== 'user-after-animation')
                issues.push('activity.advance.mode must be user-after-animation');
            if (value.advance.label !== undefined)
                text(value.advance.label, 'activity.advance.label', issues, 120);
        }
        text(value.fallbackMarkdown, 'activity.fallbackMarkdown', issues, 16_000);
    }
    else {
        issues.push('activity.phase must be question or reveal');
    }
    if (issues.length > 0)
        throw new LearningProtocolError(issues);
    return value;
}
/** Validate a phase-bound Client receipt before the Broker changes lesson state. */
export function parseLearningResponseV2(value, expected = {}) {
    const issues = [];
    const bytes = jsonBytes(value);
    if (bytes === undefined)
        issues.push('response must be serializable JSON');
    else if (bytes > MAX_RESPONSE_BYTES)
        issues.push(`response exceeds ${String(MAX_RESPONSE_BYTES)} bytes`);
    if (!record(value))
        throw new LearningProtocolError([...issues, 'response must be an object']);
    if (value.phase === 'question') {
        onlyKeys(value, ['protocol', 'phase', 'activityId', 'lessonToken', 'roundToken', 'seq', 'action', 'answer', 'receiptId', 'interactionState'], 'response', issues);
        if (!['submit', 'skip', 'cancel'].includes(value.action))
            issues.push('response.action is unknown');
        if (value.answer !== undefined)
            validateJson(value.answer, 'response.answer', issues);
    }
    else if (value.phase === 'reveal') {
        onlyKeys(value, ['protocol', 'phase', 'activityId', 'lessonToken', 'roundToken', 'seq', 'action', 'animation', 'receiptId', 'interactionState'], 'response', issues);
        if (!['continue', 'skip', 'cancel'].includes(value.action))
            issues.push('response.action is unknown');
        if (!record(value.animation))
            issues.push('response.animation must be an object');
        else {
            onlyKeys(value.animation, ['completed', 'skipped', 'reducedMotion', 'error'], 'response.animation', issues);
            if (typeof value.animation.completed !== 'boolean')
                issues.push('response.animation.completed must be boolean');
            if (value.animation.skipped !== undefined && typeof value.animation.skipped !== 'boolean')
                issues.push('response.animation.skipped must be boolean');
            if (value.animation.reducedMotion !== undefined && typeof value.animation.reducedMotion !== 'boolean')
                issues.push('response.animation.reducedMotion must be boolean');
            if (value.animation.error !== undefined && typeof value.animation.error !== 'string')
                issues.push('response.animation.error must be a string');
            if (value.action === 'continue' && value.animation.completed !== true)
                issues.push('response.animation.completed must be true before continue');
        }
    }
    else {
        issues.push('response.phase must be question or reveal');
    }
    if (value.protocol !== RESPONSE_PROTOCOL_V2)
        issues.push(`response.protocol must be ${RESPONSE_PROTOCOL_V2}`);
    token(value.activityId, 'response.activityId', issues);
    token(value.lessonToken, 'response.lessonToken', issues);
    token(value.roundToken, 'response.roundToken', issues);
    integer(value.seq, 'response.seq', issues);
    token(value.receiptId, 'response.receiptId', issues);
    if (value.interactionState !== undefined)
        validateJson(value.interactionState, 'response.interactionState', issues);
    for (const [key, expectedValue] of Object.entries(expected)) {
        if (expectedValue !== undefined && value[key] !== expectedValue)
            issues.push(`response.${key} does not match the pending activity`);
    }
    if (issues.length > 0)
        throw new LearningProtocolError(issues);
    return value;
}
//# sourceMappingURL=protocol.js.map