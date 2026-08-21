/** Model-route selection and transient message rewriting for hybrid vision. */
import { type GenerateOptions, type Message } from '@deepseek-ai/dsh-llm';
import type { LlmModelInfo } from '@deepseek-ai/dsh-llm';
import { type TextRoute, type VisionRoute, type VisionRouteConfig } from './model-selection.ts';
import type { StructuredVisualEvidence } from './types.ts';
/** Stable route labels used by the host and tests. */
export type HybridRouteKind = 'text' | 'native-image' | 'vision-fallback';
/** A successful hybrid route selection. `route` is always the user's model. */
export type HybridRouteSelection = {
    ok: true;
    kind: 'text';
    route: TextRoute;
    hasImage: false;
} | {
    ok: true;
    kind: 'native-image';
    route: TextRoute;
    hasImage: true;
} | {
    ok: true;
    kind: 'vision-fallback';
    route: TextRoute;
    visionRoute: VisionRoute;
    hasImage: true;
};
/** Failure reasons returned before a provider call is attempted. */
export type HybridRouteFailureReason = 'VISION_BRIDGE_DISABLED' | 'VISION_MODEL_UNAVAILABLE' | 'VISION_MODEL_NOT_IMAGE_CAPABLE' | 'VISION_ANALYZER_UNAVAILABLE';
/** A route failure retains the existing vision selection's stable reason. */
export type HybridRouteOutcome = HybridRouteSelection | {
    ok: false;
    reason: HybridRouteFailureReason;
    message: string;
};
/** Inputs needed to choose one route for one request. */
export interface HybridRouteInput {
    /** The provider/model selected for ordinary conversation text. */
    current: TextRoute;
    /** Current provider catalog, including modality declarations. */
    catalog: readonly LlmModelInfo[];
    /** Existing vision-bridge configuration. */
    vision: VisionRouteConfig;
    /** Complete request history, used only when no current-turn slice is supplied. */
    messages?: readonly Message[];
    /** Messages belonging to this turn; preferred over scanning history. */
    currentTurnMessages?: readonly Message[];
    /** Explicit override for callers that already performed turn admission. */
    hasImage?: boolean;
}
/** Return the history suffix after the latest assistant message. */
export declare function currentTurnMessages(messages: readonly Message[]): Message[];
/**
 * Detect images in the current turn only.
 *
 * Looking at the whole derived history would keep a text-only conversation on
 * the vision route forever after its first image. The loop builds requests
 * from the full history, so the latest assistant boundary is the useful
 * stateless approximation when a Host does not already have turn events.
 */
export declare function currentTurnHasImage(messages: readonly Message[]): boolean;
/** Alias for callers that phrase the question as a predicate. */
export declare const hasCurrentTurnImage: typeof currentTurnHasImage;
/** Pick native image input, fallback vision analysis, or ordinary text. */
export declare function selectHybridRoute(input: HybridRouteInput): HybridRouteOutcome;
/** Alias used by Host code that calls the operation a model-route selection. */
export declare const selectHybridModelRoute: typeof selectHybridRoute;
/** True when the active model is known to accept image input. */
export declare function currentRouteAcceptsImages(current: TextRoute, catalog: readonly LlmModelInfo[]): boolean;
/** Input handed to the Host's configured vision-model call. */
export interface HybridVisionAnalysisInput {
    messages: readonly Message[];
    signal?: AbortSignal;
}
/** Host-provided callback; the bridge owns route choice, Host owns dispatch. */
export type HybridVisionAnalyzer = (input: HybridVisionAnalysisInput) => Promise<unknown>;
/** Inputs for converting a selected fallback route into a text-model request. */
export interface HybridRequestOptions extends HybridRouteInput {
    /** Required only for an image round on a text-only current route. */
    analyze?: HybridVisionAnalyzer;
}
export type HybridRequestOutcome = {
    ok: true;
    route: HybridRouteSelection;
    request: GenerateOptions;
    evidence?: StructuredVisualEvidence;
} | {
    ok: false;
    reason: HybridRouteFailureReason;
    message: string;
};
/**
 * Replace images with one aggregate evidence block for the current turn and a
 * text-only omission marker for older history. The returned messages are
 * transient and can safely be passed to a text adapter without changing the
 * durable image-bearing user message.
 */
export declare function replaceImagesWithEvidence(messages: readonly Message[], evidence: StructuredVisualEvidence, turnMessages?: readonly Message[]): Message[];
/** Alias for the common "rewrite image content" phrasing. */
export declare const rewriteImagesAsEvidence: typeof replaceImagesWithEvidence;
/** Build a text block suitable for appending as a model-facing evidence message. */
export declare function visualEvidenceText(evidence: StructuredVisualEvidence): string;
/**
 * Select a route and, for a text-only image round, ask the Host callback for
 * visual evidence and return a transient text-only request. The callback is
 * deliberately injected so this helper can run from either `agent/pre-step`
 * or a Host-owned dispatch seam without recursively entering `llm/stream`.
 */
export declare function prepareHybridRequest(request: GenerateOptions, options: HybridRequestOptions): Promise<HybridRequestOutcome>;
/** Prompt text for a Host callback that wants provider JSON rather than prose. */
export declare const VISUAL_EVIDENCE_INSTRUCTION: string;
//# sourceMappingURL=hybrid-routing.d.ts.map