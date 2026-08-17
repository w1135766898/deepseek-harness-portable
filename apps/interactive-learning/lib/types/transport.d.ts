import { type LearningActivityEnvelopeV1, type LearningActivityEnvelopeInputV1 } from './protocol.ts';
/** Hide the structured activity envelope in a Markdown comment before the readable fallback. */
export declare function encodeLearningDetail(input: LearningActivityEnvelopeInputV1): string;
/** Decode and revalidate a package-owned question detail; ordinary questions return undefined. */
export declare function decodeLearningDetail(detail: unknown): LearningActivityEnvelopeV1 | undefined;
//# sourceMappingURL=transport.d.ts.map