/**
 * Implementation of the `view_image` tool.
 *
 * Local image bytes travel the kernel's own durable path: the attachment store
 * validates and commits them, and the resulting immutable reference rides an
 * `image` content block through `ctx.llm`. History re-analysis resolves an
 * already committed reference from the current session and follows the same
 * model path without writing a second object. Both paths inherit provider
 * configuration, retry policy, token metering, and telemetry.
 * @module @dsh-portable/vision-bridge/view-image
 */
import type { AttachmentStore, ImageAttachmentRef, ImageMediaType } from '@deepseek-ai/dsh-attachment';
import type { LlmModelInfo, LlmRuntime, StreamChunk } from '@deepseek-ai/dsh-llm';
import type { ToolExecution } from '@deepseek-ai/dsh-tools';
import { type VisionRoute } from './model-selection.ts';
import type { ViewImageArgs, ViewImageResult, VisionConfig } from './types.ts';
/**
 * The exact kernel services this tool consumes.
 *
 * Narrowed to the members actually used so a test can supply doubles without
 * standing up the whole service graph.
 */
export interface VisionRuntime {
    readonly attachments: Pick<AttachmentStore, 'imageLimits' | 'saveImages'>;
    readonly llm: Pick<LlmRuntime, 'listProviders' | 'listModels' | 'stream'>;
}
/**
 * Detect the attachment media type for a path from its extension.
 * @param filePath - path to the candidate image.
 * @returns the media type, or undefined when the extension is not supported.
 */
export declare function mediaTypeForPath(filePath: string): ImageMediaType | undefined;
/**
 * Enumerate every model the configured providers report.
 * @param llm - the kernel LLM service.
 * @returns catalog entries in provider order; a provider that cannot list is skipped.
 */
export declare function visionModelCatalog(llm: VisionRuntime['llm']): Promise<LlmModelInfo[]>;
/** Outcome of draining one model call into a single analysis string. */
type AnalysisOutcome = {
    ok: true;
    text: string;
} | {
    ok: false;
    message: string;
    reason: string;
};
/**
 * Drain a model stream into the assembled analysis text.
 * @param chunks - the raw chunk stream from `llm.stream`.
 * @returns the assembled text, or the terminal failure the stream reported.
 */
export declare function collectAnalysis(chunks: AsyncIterable<StreamChunk>): Promise<AnalysisOutcome>;
/** Resolve an opaque history id only against refs present in this session log. */
export declare function findHistoricalImageRef(events: readonly unknown[], attachmentId: string): ImageAttachmentRef | undefined;
/** Either the assembled analysis or the route/stream failure that prevented it. */
export type AttachmentAnalysis = {
    ok: true;
    text: string;
    route: VisionRoute;
} | {
    ok: false;
    message: string;
    reason: string;
    route?: VisionRoute;
};
/**
 * Analyze one committed image through the configured vision route.
 * @param ref - durable attachment reference for the image.
 * @param instruction - the caller's question about the image.
 * @param cfg - resolved plugin configuration.
 * @param runtime - kernel services.
 * @param signal - cancellation from the tool execution.
 * @returns the assembled analysis, or the route/stream failure.
 */
export declare function analyzeAttachment(ref: ImageAttachmentRef, instruction: string, cfg: Required<VisionConfig>, runtime: VisionRuntime, signal?: AbortSignal): Promise<AttachmentAnalysis>;
/**
 * Execute the `view_image` tool.
 * @param args - tool invocation arguments.
 * @param exec - tool execution context supplying the session workspace and cancellation.
 * @param getConfig - accessor for the current resolved configuration.
 * @param runtime - kernel services.
 * @returns a structured result; recoverable problems are reported, not thrown.
 */
export declare function executeViewImage(args: ViewImageArgs, exec: ToolExecution, getConfig: () => Required<VisionConfig>, runtime: VisionRuntime): Promise<ViewImageResult>;
/**
 * Format the tool result for model context.
 * @param result - the structured tool output.
 */
export declare function renderViewImageContent(result: ViewImageResult): {
    type: "text";
    text: string;
}[];
export {};
//# sourceMappingURL=view-image.d.ts.map