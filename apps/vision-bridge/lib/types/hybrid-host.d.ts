/** Host middleware for routing image turns through the selected vision model. */
import { type GenerateOptions, type LlmModelInfo, type LlmResolvedModelInfo, type Message, type StreamChunk } from '@deepseek-ai/dsh-llm';
import { type TextRoute, type VisionRoute, type VisionRouteConfig } from './model-selection.ts';
import type { VisionConfig } from './types.ts';
/** The small portion of LlmRuntime used by the installer. */
export interface HybridHostRuntime {
    listProviders(): readonly {
        id: string;
    }[];
    listModels(provider: string): Promise<readonly LlmModelInfo[]>;
    stream(options: GenerateOptions): AsyncIterable<StreamChunk>;
    resolveModelInfo(provider: string, model: string, signal?: AbortSignal): Promise<LlmResolvedModelInfo>;
}
/** Cordis context shape kept structural so the app need not depend on dsh-agent. */
export interface HybridHostContext {
    on(event: string, listener: (...args: any[]) => unknown): () => void;
}
/** A resolved config getter can read the live settings source on every turn. */
export type HybridConfigGetter = () => VisionConfig | VisionRouteConfig | Promise<VisionConfig | VisionRouteConfig>;
/** Optional seams for hosts that already cache a catalog or own the analyzer call. */
export interface HybridHostOptions {
    catalog?: () => readonly LlmModelInfo[] | Promise<readonly LlmModelInfo[]>;
    analyze?: (input: {
        route: VisionRoute;
        messages: readonly Message[];
        signal: AbortSignal;
    }) => Promise<unknown>;
}
/** Returned handles are used by api-proxy admission and plugin disposal. */
export interface HybridHostInstallation {
    /** Remove both waterfall listeners. */
    dispose(): void;
    /** Resolver to use only at image admission boundaries in api-proxy. */
    resolveModelInfo(provider: string, model: string, signal?: AbortSignal): Promise<LlmResolvedModelInfo>;
    /** The route captured after the model-selection assembly waterfall. */
    currentRoute(agent: object): TextRoute | undefined;
}
/**
 * Install the only durable bridge point available before agent-loop request
 * construction. The returned resolver is deliberately separate from the
 * runtime's resolver: native capability checks in this middleware always use
 * the unmodified catalog, while api-proxy may use the returned resolver solely
 * to admit a text-only model when a fallback route is configured.
 *
 * Typical Host wiring:
 *
 * ```ts
 * const hybrid = installHybridVisionRouting(ctx, getVisionConfig, ctx.llm)
 * // api-proxy's image admission calls hybrid.resolveModelInfo(...)
 * // dispose hybrid when the plugin context is torn down
 * ```
 */
export declare function installHybridVisionRouting(ctx: HybridHostContext, getConfig: HybridConfigGetter, runtime: HybridHostRuntime, options?: HybridHostOptions): HybridHostInstallation;
//# sourceMappingURL=hybrid-host.d.ts.map