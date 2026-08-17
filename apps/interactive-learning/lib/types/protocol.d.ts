/** Versioned, declarative protocol shared by the Host, Agent, and Client. */
export declare const ACTIVITY_PROTOCOL: "dsh-learning/activity@1";
export declare const RESPONSE_PROTOCOL: "dsh-learning/response@1";
export declare const TRANSPORT_PROTOCOL: "dsh-learning/transport@1";
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
export {};
//# sourceMappingURL=protocol.d.ts.map