/** Versioned, declarative protocol shared by the Host, Agent, and Client. */
export declare const ACTIVITY_PROTOCOL: "dsh-learning/activity@1";
export declare const RESPONSE_PROTOCOL: "dsh-learning/response@1";
export declare const TRANSPORT_PROTOCOL: "dsh-learning/transport@1";
export declare const ACTIVITY_PROTOCOL_V2: "dsh-learning/activity@2";
export declare const RESPONSE_PROTOCOL_V2: "dsh-learning/response@2";
export declare const TRANSPORT_PROTOCOL_V2: "dsh-learning/wait@2";
export declare const VISUAL_PROTOCOL_V3: "dsh-learning/visual@3";
export declare const VISUAL_RESULT_PROTOCOL_V3: "dsh-learning/visual-result@3";
export declare const VISUAL_PROTOCOL_V4: "dsh-learning/visual@4";
export declare const VISUAL_RESULT_PROTOCOL_V4: "dsh-learning/visual-result@4";
export declare const LEARNING_VISUAL_KINDS_V4: readonly ["plot", "node_link", "scene_2d", "relation", "timeline", "formula_steps", "study_map", "recall_deck"];
export declare const LEARNING_ACTIVITY_KINDS: readonly ["parameter_explorer", "process_stepper", "structure_compare"];
export declare const MAX_ACTIVITY_BYTES: number;
export declare const MAX_RESPONSE_BYTES: number;
export declare const MAX_MATH_DEPTH = 8;
export declare const MAX_MATH_NODES = 64;
export declare const MAX_VISUAL_MATH_DEPTH = 4;
export declare const MATH_BINARY_OPERATORS: readonly ["add", "sub", "mul", "div", "pow"];
export declare const MATH_UNARY_OPERATORS: readonly ["neg", "abs", "sqrt", "sin", "cos", "exp", "log", "sigmoid"];
export type LearningActivityKind = typeof LEARNING_ACTIVITY_KINDS[number];
export type LearningAction = 'submit' | 'skip' | 'cancel';
export type LearningJson = null | boolean | number | string | LearningJson[] | {
    [key: string]: LearningJson;
};
export type MathExpressionV1 = {
    op: 'constant';
    value: number;
} | {
    op: 'variable';
    name: string;
} | {
    op: 'add' | 'sub' | 'mul' | 'div' | 'pow';
    left: MathExpressionV1;
    right: MathExpressionV1;
} | {
    op: 'neg' | 'abs' | 'sqrt' | 'sin' | 'cos' | 'exp' | 'log' | 'sigmoid';
    value: MathExpressionV1;
};
export interface ParameterDefinitionV1 {
    id: string;
    label: string;
    min: number;
    max: number;
    step: number;
    initial: number;
}
export interface ParameterCurveV1 {
    id: string;
    label: string;
    expression: MathExpressionV1;
}
export interface ParameterExplorerPayloadV1 {
    parameters: ParameterDefinitionV1[];
    xAxis: {
        label?: string;
        min: number;
        max: number;
        samples?: number;
    };
    curves: ParameterCurveV1[];
    question?: string;
}
export interface ProcessCheckpointV1 {
    question: string;
    options?: string[];
}
export interface ProcessStepV1 {
    id: string;
    title: string;
    content: string;
    checkpoint?: ProcessCheckpointV1;
}
export interface ProcessStepperPayloadV1 {
    steps: ProcessStepV1[];
    question?: string;
}
export interface StructureItemV1 {
    id: string;
    label: string;
    detail?: string;
}
export interface StructureAlignmentV1 {
    id: string;
    leftId?: string;
    rightId?: string;
    prompt?: string;
}
export interface StructureComparePayloadV1 {
    left: {
        title: string;
        items: StructureItemV1[];
    };
    right: {
        title: string;
        items: StructureItemV1[];
    };
    alignments: StructureAlignmentV1[];
    question?: string;
}
interface ActivityBaseV1<K extends LearningActivityKind, P> {
    protocol: typeof ACTIVITY_PROTOCOL;
    kind: K;
    title: string;
    objective: string;
    prompt: string;
    scaffold?: string;
    payload: P;
    fallbackMarkdown: string;
}
export type LearningActivityV1 = ActivityBaseV1<'parameter_explorer', ParameterExplorerPayloadV1> | ActivityBaseV1<'process_stepper', ProcessStepperPayloadV1> | ActivityBaseV1<'structure_compare', StructureComparePayloadV1>;
export interface LearningResponseV1 {
    protocol: typeof RESPONSE_PROTOCOL;
    activityId: string;
    action: LearningAction;
    answer?: LearningJson;
    interactionState?: LearningJson;
}
export interface LearningActivityEnvelopeV1 {
    transport: typeof TRANSPORT_PROTOCOL;
    activityId: string;
    activity: LearningActivityV1;
}
export type LearningActivityEnvelopeInputV1 = Omit<LearningActivityEnvelopeV1, 'transport'>;
export interface LearningFocusV2 {
    title: string;
    progress?: {
        current: number;
        total?: number;
    };
}
export type LearningInputV2 = {
    kind: 'single_choice';
    options: Array<{
        id: string;
        label: string;
    }>;
} | {
    kind: 'short_text';
    placeholder?: string;
    maxLength?: number;
} | {
    kind: 'number';
    min?: number;
    max?: number;
    step?: number;
};
export interface LearningFrameV2 {
    id: string;
    title: string;
    content?: string;
}
export type LearningQuestionVisualV2 = {
    kind: 'process';
    frame: LearningFrameV2;
} | {
    kind: 'parameter';
    parameters: ParameterDefinitionV1[];
    xAxis: ParameterExplorerPayloadV1['xAxis'];
    curves: ParameterCurveV1[];
} | {
    kind: 'structure';
    left: StructureComparePayloadV1['left'];
    right: StructureComparePayloadV1['right'];
    alignments: StructureAlignmentV1[];
};
export type LearningRevealVisualV2 = {
    kind: 'process';
    before: LearningFrameV2;
    after: LearningFrameV2;
} | {
    kind: 'parameter';
    parameters: ParameterDefinitionV1[];
    xAxis: ParameterExplorerPayloadV1['xAxis'];
    curves: ParameterCurveV1[];
    emphasis?: string;
} | {
    kind: 'structure';
    left: StructureComparePayloadV1['left'];
    right: StructureComparePayloadV1['right'];
    alignments: StructureAlignmentV1[];
    emphasisAlignmentIds?: string[];
};
export interface LearningQuestionV2 {
    protocol: typeof ACTIVITY_PROTOCOL_V2;
    phase: 'question';
    lessonToken?: string;
    seq: number;
    focus: LearningFocusV2;
    prompt: string;
    scaffold?: string;
    input: LearningInputV2;
    visual?: LearningQuestionVisualV2;
    fallbackMarkdown: string;
}
export interface LearningRevealV2 {
    protocol: typeof ACTIVITY_PROTOCOL_V2;
    phase: 'reveal';
    lessonToken: string;
    roundToken: string;
    seq: number;
    focus: LearningFocusV2;
    feedback: {
        verdict?: 'correct' | 'partial' | 'misconception' | 'neutral';
        learnerEcho?: string;
        explanation: string;
        answer?: string;
    };
    visual?: LearningRevealVisualV2;
    animation: {
        kind: 'draw' | 'morph' | 'highlight' | 'step_complete';
        preferredDurationMs?: number;
        reducedMotion: 'commit-final-state';
    };
    advance: {
        mode: 'user-after-animation';
        label?: string;
    };
    fallbackMarkdown: string;
}
export type LearningActivityV2 = LearningQuestionV2 | LearningRevealV2;
interface LearningResponseBaseV2 {
    protocol: typeof RESPONSE_PROTOCOL_V2;
    activityId: string;
    lessonToken: string;
    roundToken: string;
    seq: number;
    receiptId: string;
    interactionState?: LearningJson;
}
export interface LearningQuestionResponseV2 extends LearningResponseBaseV2 {
    phase: 'question';
    action: 'submit' | 'skip' | 'cancel';
    answer?: LearningJson;
}
export interface LearningRevealResponseV2 extends LearningResponseBaseV2 {
    phase: 'reveal';
    action: 'continue' | 'skip' | 'cancel';
    animation: {
        completed: boolean;
        skipped?: boolean;
        reducedMotion?: boolean;
        error?: string;
    };
}
export type LearningResponseV2 = LearningQuestionResponseV2 | LearningRevealResponseV2;
export interface LearningWaitEnvelopeV2 {
    transport: typeof TRANSPORT_PROTOCOL_V2;
    waitId: string;
    activityId: string;
    callId?: string;
    lessonToken: string;
    roundToken: string;
    seq: number;
    phase: 'question' | 'reveal';
    activity: LearningActivityV2;
}
export type LearningWaitEnvelopeInputV2 = Omit<LearningWaitEnvelopeV2, 'transport'>;
export type LearningVisualToneV3 = 'blue' | 'green' | 'red' | 'orange' | 'purple' | 'gray';
export type LearningVisualStrokeV3 = 'solid' | 'dashed' | 'dotted';
export interface LearningVisualAxisV3 {
    label?: string;
    min: number;
    max: number;
    samples?: number;
}
export interface LearningVisualCurveV3 {
    type: 'curve';
    id: string;
    label: string;
    expression: MathExpressionV1;
    tone?: LearningVisualToneV3;
    stroke?: LearningVisualStrokeV3;
}
export interface LearningVisualPointV3 {
    x: number;
    y: number;
    label?: string;
}
export interface LearningVisualPointSeriesV3 {
    type: 'points';
    id: string;
    label: string;
    points: LearningVisualPointV3[];
    tone?: LearningVisualToneV3;
}
export type LearningVisualSeriesV3 = LearningVisualCurveV3 | LearningVisualPointSeriesV3;
export interface LearningVisualMetricV3 {
    id: string;
    label: string;
    expression: MathExpressionV1;
    digits?: number;
    suffix?: string;
}
/**
 * A non-blocking, replayable visual embedded in the assistant's normal turn.
 * It never owns learner input: the ordinary conversation composer remains live.
 */
export interface LearningVisualV3 {
    protocol: typeof VISUAL_PROTOCOL_V3;
    kind: 'parameter_chart';
    title: string;
    description?: string;
    parameters: ParameterDefinitionV1[];
    xAxis: LearningVisualAxisV3;
    yAxis: LearningVisualAxisV3;
    series: LearningVisualSeriesV3[];
    metrics?: LearningVisualMetricV3[];
}
export interface LearningVisualResultV3 {
    protocol: typeof VISUAL_RESULT_PROTOCOL_V3;
    status: 'ready';
}
export type LearningVisualKindV4 = typeof LEARNING_VISUAL_KINDS_V4[number];
export type LearningVisualToneV4 = LearningVisualToneV3;
export type LearningVisualStrokeV4 = LearningVisualStrokeV3;
export interface LearningVisualLineSeriesV4 {
    type: 'line';
    id: string;
    label: string;
    points: LearningVisualPointV3[];
    tone?: LearningVisualToneV4;
    stroke?: LearningVisualStrokeV4;
}
export interface LearningVisualBarSeriesV4 {
    type: 'bars';
    id: string;
    label: string;
    points: LearningVisualPointV3[];
    tone?: LearningVisualToneV4;
}
export type LearningPlotSeriesV4 = LearningVisualCurveV3 | LearningVisualPointSeriesV3 | LearningVisualLineSeriesV4 | LearningVisualBarSeriesV4;
export interface LearningPlotV4 {
    kind: 'plot';
    parameters?: ParameterDefinitionV1[];
    xAxis: LearningVisualAxisV3;
    yAxis: LearningVisualAxisV3;
    series: LearningPlotSeriesV4[];
    metrics?: LearningVisualMetricV3[];
}
export interface LearningNodeGroupV4 {
    id: string;
    label: string;
}
export interface LearningNodeV4 {
    id: string;
    label: string;
    detail?: string;
    group?: string;
    tone?: LearningVisualToneV4;
}
export interface LearningEdgeV4 {
    id: string;
    from: string;
    to: string;
    label?: string;
    detail?: string;
    tone?: LearningVisualToneV4;
    stroke?: LearningVisualStrokeV4;
    directed?: boolean;
}
export interface LearningNodeLinkV4 {
    kind: 'node_link';
    layout: 'layered' | 'hierarchy' | 'radial';
    groups?: LearningNodeGroupV4[];
    nodes: LearningNodeV4[];
    edges: LearningEdgeV4[];
}
interface LearningSceneElementBaseV4 {
    id: string;
    label?: string;
    detail?: string;
    tone?: LearningVisualToneV4;
}
export interface LearningScenePointV4 extends LearningSceneElementBaseV4 {
    type: 'point';
    x: number;
    y: number;
    size?: number;
}
export interface LearningSceneSegmentV4 extends LearningSceneElementBaseV4 {
    type: 'segment' | 'arrow';
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    stroke?: LearningVisualStrokeV4;
}
export interface LearningSceneCircleV4 extends LearningSceneElementBaseV4 {
    type: 'circle';
    cx: number;
    cy: number;
    r: number;
}
export interface LearningSceneRectV4 extends LearningSceneElementBaseV4 {
    type: 'rect';
    x: number;
    y: number;
    width: number;
    height: number;
}
export interface LearningScenePolygonV4 extends LearningSceneElementBaseV4 {
    type: 'polygon';
    points: Array<{
        x: number;
        y: number;
    }>;
}
export interface LearningSceneLabelV4 extends LearningSceneElementBaseV4 {
    type: 'label';
    x: number;
    y: number;
    text: string;
}
export type LearningSceneElementV4 = LearningScenePointV4 | LearningSceneSegmentV4 | LearningSceneCircleV4 | LearningSceneRectV4 | LearningScenePolygonV4 | LearningSceneLabelV4;
export interface LearningScene2DV4 {
    kind: 'scene_2d';
    xAxis: LearningVisualAxisV3;
    yAxis: LearningVisualAxisV3;
    grid?: boolean;
    elements: LearningSceneElementV4[];
}
export interface LearningRelationSubjectV4 {
    id: string;
    label: string;
    detail?: string;
    tone?: LearningVisualToneV4;
}
export interface LearningRelationComparisonRowV4 {
    id: string;
    label: string;
    cells: Array<{
        subjectId: string;
        value: string;
        tone?: LearningVisualToneV4;
    }>;
    detail?: string;
}
export interface LearningComparisonRelationV4 {
    kind: 'relation';
    variant: 'comparison';
    subjects: LearningRelationSubjectV4[];
    rows: LearningRelationComparisonRowV4[];
}
export interface LearningRelationAxisItemV4 {
    id: string;
    label: string;
}
export interface LearningRelationMatrixCellV4 {
    id: string;
    rowId: string;
    columnId: string;
    label: string;
    detail?: string;
    tone?: LearningVisualToneV4;
}
export interface LearningMatrixRelationV4 {
    kind: 'relation';
    variant: 'matrix';
    rows: LearningRelationAxisItemV4[];
    columns: LearningRelationAxisItemV4[];
    cells: LearningRelationMatrixCellV4[];
}
export interface LearningRelationSetV4 {
    id: string;
    label: string;
    detail?: string;
    tone?: LearningVisualToneV4;
}
export interface LearningRelationSetItemV4 {
    id: string;
    label: string;
    setIds: string[];
    detail?: string;
}
export interface LearningSetsRelationV4 {
    kind: 'relation';
    variant: 'sets';
    sets: LearningRelationSetV4[];
    items: LearningRelationSetItemV4[];
}
export type LearningRelationV4 = LearningComparisonRelationV4 | LearningMatrixRelationV4 | LearningSetsRelationV4;
export interface LearningTimelineEventV4 {
    id: string;
    time: string;
    label: string;
    detail?: string;
    /** Optional normalized position from 0 to 1; omit for equal spacing. */
    position?: number;
    tone?: LearningVisualToneV4;
}
export interface LearningTimelineEraV4 {
    id: string;
    label: string;
    startEventId: string;
    endEventId: string;
    detail?: string;
    tone?: LearningVisualToneV4;
}
export interface LearningTimelineV4 {
    kind: 'timeline';
    orientation?: 'horizontal' | 'vertical';
    events: LearningTimelineEventV4[];
    eras?: LearningTimelineEraV4[];
}
export interface LearningFormulaStepV4 {
    id: string;
    /** A single trusted Markdown-math expression, preferably LaTeX without delimiters. */
    expression: string;
    label?: string;
    /** The named rule that transforms the preceding expression into this one. */
    rule?: string;
    detail?: string;
    tone?: LearningVisualToneV4;
}
export interface LearningFormulaStepsV4 {
    kind: 'formula_steps';
    notation?: string;
    steps: LearningFormulaStepV4[];
    conclusion?: string;
}
export interface LearningStudySectionV4 {
    id: string;
    label: string;
    /** Human-readable source location such as “Chapter 2” or “pp. 18–23”. */
    anchor?: string;
    summary?: string;
}
export interface LearningStudyConceptV4 {
    id: string;
    label: string;
    sectionId: string;
    detail?: string;
    prerequisiteIds?: string[];
    role?: 'foundation' | 'core' | 'extension' | 'practice';
    tone?: LearningVisualToneV4;
}
export interface LearningStudyMapV4 {
    kind: 'study_map';
    sourceLabel: string;
    goal?: string;
    sections: LearningStudySectionV4[];
    concepts: LearningStudyConceptV4[];
}
export interface LearningRecallCardV4 {
    id: string;
    prompt: string;
    answer: string;
    hint?: string;
    tags?: string[];
}
export interface LearningRecallDeckV4 {
    kind: 'recall_deck';
    instructions?: string;
    cards: LearningRecallCardV4[];
}
export type LearningVisualContentV4 = LearningPlotV4 | LearningNodeLinkV4 | LearningScene2DV4 | LearningRelationV4 | LearningTimelineV4 | LearningFormulaStepsV4 | LearningStudyMapV4 | LearningRecallDeckV4;
export interface LearningVisualFrameV4 {
    id: string;
    label: string;
    description?: string;
    focusIds: string[];
}
export interface LearningVisualSequenceV4 {
    initialFrameId?: string;
    frames: LearningVisualFrameV4[];
}
/**
 * A semantic, non-blocking visual. The content discriminator selects a trusted
 * native renderer; arbitrary markup and executable payloads are never accepted.
 */
export interface LearningVisualV4 {
    protocol: typeof VISUAL_PROTOCOL_V4;
    title: string;
    description?: string;
    content: LearningVisualContentV4;
    sequence?: LearningVisualSequenceV4;
    fallbackMarkdown?: string;
}
export interface LearningVisualResultV4 {
    protocol: typeof VISUAL_RESULT_PROTOCOL_V4;
    status: 'ready';
}
/** A stable, actionable protocol rejection surfaced to the tool call. */
export declare class LearningProtocolError extends Error {
    readonly issues: readonly string[];
    readonly code = "INVALID_LEARNING_ACTIVITY";
    constructor(issues: readonly string[]);
}
/** Validate and narrow an untrusted model-provided activity. */
export declare function parseLearningActivity(value: unknown): LearningActivityV1;
/** Validate and narrow a Client response before it returns to the model. */
export declare function parseLearningResponse(value: unknown, expectedActivityId?: string): LearningResponseV1;
/** Strict live protocol. V1 is intentionally parsed separately for legacy replay only. */
export declare function parseLearningActivityV2(value: unknown): LearningActivityV2;
export type ExpectedLearningResponseV2 = Partial<Pick<LearningResponseV2, 'activityId' | 'phase' | 'lessonToken' | 'roundToken' | 'seq'>>;
/** Validate a phase-bound Client receipt before the Broker changes lesson state. */
export declare function parseLearningResponseV2(value: unknown, expected?: ExpectedLearningResponseV2): LearningResponseV2;
/** Validate the preferred, non-blocking visual protocol. */
export declare function parseLearningVisualV3(value: unknown): LearningVisualV3;
/** Validate the semantic, model-facing visual protocol while retaining V3 replay separately. */
export declare function parseLearningVisualV4(value: unknown): LearningVisualV4;
export declare function parseLearningVisualResultV4(value: unknown): LearningVisualResultV4;
export declare function parseLearningVisualResultV3(value: unknown): LearningVisualResultV3;
export {};
//# sourceMappingURL=protocol.d.ts.map