/** Image-to-text routing for pasted prompt images. */
import type { PromptImageTextDecision, PromptImageTextRequest } from '@deepseek-ai/dsh-host-apiproxy';
import type { VisionConfig } from './types.ts';
/**
 * Create the host waterfall listener that supplies visual text to text-only
 * conversation models.
 * @param getConfig - live resolved Vision Bridge configuration.
 * @returns one image-to-text listener suitable for `ctx.on`.
 */
export declare function createPromptImageTextHandler(getConfig: () => Required<VisionConfig>): (request: PromptImageTextRequest) => Promise<PromptImageTextDecision>;
//# sourceMappingURL=prompt-image.d.ts.map