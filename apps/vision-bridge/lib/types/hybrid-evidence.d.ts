/** Parse and render the provider-neutral evidence used by hybrid routing. */
import type { StructuredVisualEvidence } from './types.ts';
/** Current wire/schema version for visual evidence. */
export declare const VISUAL_EVIDENCE_SCHEMA_VERSION: 1;
/**
 * Parse arbitrary vision output into the stable evidence shape.
 *
 * Parsing is intentionally loss-tolerant: a provider that returns prose still
 * gives the text model a useful `summary`, while structured fields remain
 * deterministic empty arrays instead of changing shape between providers.
 */
export declare function parseVisualEvidence(input: unknown): StructuredVisualEvidence;
/** Alias that reads naturally at a response boundary. */
export declare const parseVisualEvidenceResponse: typeof parseVisualEvidence;
/** Serialize only the canonical evidence keys in a stable order. */
export declare function serializeVisualEvidence(input: StructuredVisualEvidence | unknown): string;
/** Render evidence as a clearly delimited model-facing text block. */
export declare function formatVisualEvidenceForModel(input: StructuredVisualEvidence | unknown): string;
/** Short alias for callers that already use the evidence vocabulary. */
export declare const renderVisualEvidence: typeof formatVisualEvidenceForModel;
//# sourceMappingURL=hybrid-evidence.d.ts.map