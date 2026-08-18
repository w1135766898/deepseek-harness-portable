import { type LearningActivityEnvelopeV1, type LearningActivityEnvelopeInputV1, type LearningWaitEnvelopeInputV2, type LearningWaitEnvelopeV2 } from './protocol.ts';
/**
 * Encode the package-owned envelope in the question id. Generic question
 * clients do not render ids, so an incompatible Client sees only the readable
 * prompt and Markdown fallback instead of a Base64 transport marker.
 */
export declare function encodeLearningQuestionId(input: LearningActivityEnvelopeInputV1): string;
/** Decode and revalidate a package-owned question id. */
export declare function decodeLearningQuestionId(value: unknown): LearningActivityEnvelopeV1 | undefined;
/**
 * Legacy transport retained for pending waits created by older package
 * versions. New requests use encodeLearningQuestionId so generic renderers do
 * not expose the machine envelope.
 */
export declare function encodeLearningDetail(input: LearningActivityEnvelopeInputV1): string;
/** Decode and revalidate a package-owned question detail; ordinary questions return undefined. */
export declare function decodeLearningDetail(detail: unknown): LearningActivityEnvelopeV1 | undefined;
/** V2 ids contain only an opaque reference, never the phase payload. */
export declare function learningWaitQuestionId(waitId: string): string;
export declare function decodeLearningWaitQuestionId(value: unknown): string | undefined;
/** Detail persists one safe current-phase projection for refresh recovery. */
export declare function encodeLearningWaitDetail(input: LearningWaitEnvelopeInputV2): string;
export declare function decodeLearningWaitDetail(detail: unknown): LearningWaitEnvelopeV2 | undefined;
//# sourceMappingURL=transport.d.ts.map