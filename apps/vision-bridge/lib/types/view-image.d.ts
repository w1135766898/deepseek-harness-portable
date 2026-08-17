/**
 * Implementation of the `view_image` tool.
 * Reads an image from disk and calls an OpenAI-compatible vision model.
 * @module @dsh-portable/vision-bridge/view-image
 */
import type { ToolExecution } from '@deepseek-ai/dsh-tools';
import type { ViewImageArgs, ViewImageResult, VisionConfig } from './types.ts';
/** Validated in-memory image supplied to the configured vision endpoint. */
export interface VisionByteInput {
    data: Uint8Array;
    mediaType: string;
    prompt?: string;
}
/** Provider-neutral result used by both pasted-image routing and `view_image`. */
export type VisionAnalysisOutcome = {
    ok: true;
    text: string;
    model: string;
} | {
    ok: false;
    message: string;
    model: string;
    reason: string;
};
/** Return the earliest actionable configuration problem, if any. */
export declare function visionConfigurationIssue(cfg: Required<VisionConfig>): {
    message: string;
    reason: string;
} | undefined;
/** Analyze validated image bytes through the configured OpenAI-compatible endpoint. */
export declare function analyzeImageBytes(input: VisionByteInput, cfg: Required<VisionConfig>, signal?: AbortSignal): Promise<VisionAnalysisOutcome>;
/**
 * Detect image MIME type from its file extension.
 * @param filePath - Path to the file.
 * @returns MIME string or undefined if not supported.
 */
export declare function mimeTypeForPath(filePath: string): string | undefined;
/**
 * Execute the `view_image` tool logic.
 * @param args - Tool invocation arguments.
 * @param exec - Cordis tool execution context.
 * @param getConfig - Accessor for current resolved vision configuration.
 * @returns Structured result with model-generated image description.
 */
export declare function executeViewImage(args: ViewImageArgs, exec: ToolExecution, getConfig: () => Required<VisionConfig>): Promise<ViewImageResult>;
/** Format output for model context. */
export declare function renderViewImageContent(result: ViewImageResult): {
    type: "text";
    text: string;
}[];
//# sourceMappingURL=view-image.d.ts.map