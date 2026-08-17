/** Image-to-text routing for pasted prompt images. */

import type {
  PromptImageTextDecision,
  PromptImageTextRequest,
} from '@deepseek-ai/dsh-host-apiproxy'
import type { VisionConfig } from './types.ts'
import { analyzeImageBytes } from './view-image.ts'

function escapeAttribute(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
}

/**
 * Create the host waterfall listener that supplies visual text to text-only
 * conversation models.
 * @param getConfig - live resolved Vision Bridge configuration.
 * @returns one image-to-text listener suitable for `ctx.on`.
 */
export function createPromptImageTextHandler(
  getConfig: () => Required<VisionConfig>,
): (request: PromptImageTextRequest) => Promise<PromptImageTextDecision> {
  return async (request) => {
    const analysis = await analyzeImageBytes({
      data: request.data,
      mediaType: request.mediaType,
      ...request.prompt.length === 0 ? {} : { prompt: request.prompt },
    }, getConfig())
    if (!analysis.ok) {
      return { kind: 'reject', message: analysis.message, reason: analysis.reason }
    }
    const name = request.name === undefined ? '' : ` name="${escapeAttribute(request.name)}"`
    return {
      kind: 'accept',
      text: `<image_analysis source="vision-bridge" model="${escapeAttribute(analysis.model)}"${name}>\n${analysis.text}\n</image_analysis>`,
    }
  }
}
