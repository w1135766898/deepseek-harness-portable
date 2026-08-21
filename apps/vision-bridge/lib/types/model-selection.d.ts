/**
 * Resolve which configured model performs image analysis.
 *
 * The kernel's model catalog is the single source of truth: a route is chosen
 * from the providers the deployment already configured, and capability comes
 * from each entry's declared input modalities rather than from a hand-kept
 * list of model names.
 * @module @dsh-portable/vision-bridge/model-selection
 */
import type { LlmModelInfo } from '@deepseek-ai/dsh-llm';
/** One provider/model route the vision tool can call. */
export interface VisionRoute {
    /** Registered provider route selecting the adapter. */
    provider: string;
    /** Model id passed to the adapter. */
    model: string;
}
/** The exact model selected for ordinary text responses. */
export type TextRoute = VisionRoute;
/** Capability state for the current text route's catalog entry. */
export type ImageInputCapability = 'supported' | 'unsupported' | 'unknown';
/** Stable machine-routing codes for an unresolvable vision route. */
export type VisionRouteFailureReason = 'VISION_BRIDGE_DISABLED' | 'VISION_MODEL_UNAVAILABLE' | 'VISION_MODEL_NOT_IMAGE_CAPABLE';
/** Either the resolved route or the reason no route could be chosen. */
export type VisionRouteOutcome = {
    ok: true;
    route: VisionRoute;
} | {
    ok: false;
    reason: VisionRouteFailureReason;
    message: string;
};
/** The subset of the configuration that decides the route. */
export interface VisionRouteConfig {
    enabled: boolean;
    /** Bare model ids remain supported; `provider/model` disambiguates duplicates. */
    model: string;
}
/**
 * Whether a catalog entry declares that it accepts image input.
 * @param model - one catalog entry.
 */
export declare function declaresImageInput(model: LlmModelInfo): boolean;
/**
 * Read image capability for one exact provider/model route.
 *
 * Catalog ids are only unique within a provider. Matching both parts keeps a
 * same-named model on another provider from changing the active route.
 */
export declare function imageInputCapability(route: TextRoute, catalog: readonly LlmModelInfo[]): ImageInputCapability;
/** True when the exact catalog entry positively declares image input. */
export declare function modelSupportsImages(route: TextRoute, catalog: readonly LlmModelInfo[]): boolean;
/** Find one exact catalog entry without conflating providers that share ids. */
export declare function findCatalogModel(route: TextRoute, catalog: readonly LlmModelInfo[]): LlmModelInfo | undefined;
/**
 * Whether a catalog entry declares input modalities that exclude images.
 *
 * An absent `inputModalities` is unknown capability rather than a denial: it
 * never earns an automatic selection, but it must not veto a route the operator
 * pinned deliberately.
 * @param model - one catalog entry.
 */
export declare function deniesImageInput(model: LlmModelInfo): boolean;
/**
 * Choose the route that will analyze images.
 *
 * A pinned model is resolved back to its configured provider and honored unless
 * the catalog positively denies image input. Otherwise the first entry
 * declaring image input wins, in catalog order.
 * @param config - the resolved enable/model configuration.
 * @param catalog - every model the configured providers report.
 * @returns the chosen route, or the reason none could be chosen.
 */
export declare function selectVisionRoute(config: VisionRouteConfig, catalog: readonly LlmModelInfo[]): VisionRouteOutcome;
/** Catalog entries an operator can reasonably pin as the vision route. */
export declare function imageCapableModels(catalog: readonly LlmModelInfo[]): LlmModelInfo[];
//# sourceMappingURL=model-selection.d.ts.map