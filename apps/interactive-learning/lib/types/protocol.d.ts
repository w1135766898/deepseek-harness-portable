/** Versioned, declarative protocol shared by the Host, Agent, and Client. */
export declare const ACTIVITY_PROTOCOL: "dsh-learning/activity@1";
export declare const RESPONSE_PROTOCOL: "dsh-learning/response@1";
export declare const TRANSPORT_PROTOCOL: "dsh-learning/transport@1";
export declare const ACTIVITY_PROTOCOL_V2: "dsh-learning/activity@2";
export declare const RESPONSE_PROTOCOL_V2: "dsh-learning/response@2";
export declare const TRANSPORT_PROTOCOL_V2: "dsh-learning/wait@2";
export declare const LEARNING_ACTIVITY_KINDS: readonly ["parameter_explorer", "process_stepper", "structure_compare"];
export declare const MAX_ACTIVITY_BYTES: number;
export declare const MAX_RESPONSE_BYTES: number;
export declare const MAX_MATH_DEPTH = 8;
export declare const MAX_MATH_NODES = 64;
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
    op: 'neg' | 'abs' | 'sqrt' | 'sin' | 'cos' | 'exp' | 'log';
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
export {};
//# sourceMappingURL=protocol.d.ts.map