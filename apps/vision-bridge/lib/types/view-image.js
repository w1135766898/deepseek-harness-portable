/**
 * Implementation of the `view_image` tool.
 *
 * Image bytes travel the kernel's own durable path: the attachment store
 * validates and commits them, and the resulting immutable reference rides an
 * `image` content block through `ctx.llm`. That inherits provider
 * configuration, retry policy, token metering, and telemetry instead of
 * restating them here.
 * @module @dsh-portable/vision-bridge/view-image
 */
import { readFile, stat } from 'node:fs/promises';
import { basename, extname, isAbsolute, resolve } from 'node:path';
import { createUserMessage } from '@deepseek-ai/dsh-llm';
import { selectVisionRoute } from "./model-selection.js";
/** File extensions the attachment store's version-one image path accepts. */
const SUPPORTED_MEDIA_TYPES = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
};
const DEFAULT_SYSTEM_PROMPT = 'You are an expert visual analysis assistant. Carefully inspect the provided image and describe its contents with high accuracy. '
    + 'Extract any visible text, user interface elements, error messages, code blocks, diagrams, chart trends, or technical layouts.';
const DEFAULT_INSTRUCTION = 'Please analyze and describe the contents of this image in detail.';
const VISION_TIMEOUT_MS = 60_000;
/**
 * Detect the attachment media type for a path from its extension.
 * @param filePath - path to the candidate image.
 * @returns the media type, or undefined when the extension is not supported.
 */
export function mediaTypeForPath(filePath) {
    return SUPPORTED_MEDIA_TYPES[extname(filePath).toLowerCase()];
}
/**
 * Enumerate every model the configured providers report.
 * @param llm - the kernel LLM service.
 * @returns catalog entries in provider order; a provider that cannot list is skipped.
 */
export async function visionModelCatalog(llm) {
    const catalog = [];
    for (const provider of llm.listProviders()) {
        try {
            catalog.push(...await llm.listModels(provider.id));
        }
        catch {
            // A provider that cannot list its models must not hide the ones that can.
            continue;
        }
    }
    return catalog;
}
/**
 * Drain a model stream into the assembled analysis text.
 * @param chunks - the raw chunk stream from `llm.stream`.
 * @returns the assembled text, or the terminal failure the stream reported.
 */
export async function collectAnalysis(chunks) {
    let text = '';
    let failed;
    for await (const chunk of chunks) {
        if (chunk.type === 'text-delta')
            text += chunk.text;
        else if (chunk.type === 'finish' && (chunk.reason.kind === 'error' || chunk.reason.kind === 'aborted')) {
            failed = {
                ok: false,
                message: `Vision analysis failed: ${chunk.reason.failure.message}`,
                reason: chunk.reason.failure.code,
            };
        }
    }
    if (failed !== undefined)
        return failed;
    if (text.trim().length === 0) {
        return { ok: false, message: 'The vision model returned an empty response.', reason: 'VISION_ANALYSIS_EMPTY' };
    }
    return { ok: true, text };
}
/** Build the failure result shape shared by every early return. */
function failure(input) {
    return {
        text: `Error: ${input.message}`,
        provider: input.route?.provider ?? '',
        model: input.route?.model ?? '',
        path: input.path,
        bytes: input.ref?.bytes ?? input.bytes ?? 0,
        ...input.ref === undefined ? {} : { width: input.ref.width, height: input.ref.height },
        reason: input.reason,
        isError: true,
    };
}
/**
 * Analyze one committed image through the configured vision route.
 * @param ref - durable attachment reference for the image.
 * @param instruction - the caller's question about the image.
 * @param cfg - resolved plugin configuration.
 * @param runtime - kernel services.
 * @param signal - cancellation from the tool execution.
 * @returns the assembled analysis, or the route/stream failure.
 */
export async function analyzeAttachment(ref, instruction, cfg, runtime, signal) {
    const selection = selectVisionRoute({ enabled: cfg.enabled, model: cfg.model }, await visionModelCatalog(runtime.llm));
    if (!selection.ok)
        return { ok: false, message: selection.message, reason: selection.reason };
    const timeout = AbortSignal.timeout(VISION_TIMEOUT_MS);
    const combined = signal === undefined ? timeout : AbortSignal.any([signal, timeout]);
    const message = createUserMessage({
        content: [
            { type: 'text', text: instruction },
            { type: 'image', attachment: ref },
        ],
        source: { kind: 'plugin', plugin: 'vision-bridge' },
    });
    const analysis = await collectAnalysis(runtime.llm.stream({
        provider: selection.route.provider,
        model: selection.route.model,
        messages: [message],
        system: DEFAULT_SYSTEM_PROMPT,
        temperature: 0.1,
        signal: combined,
    }));
    return analysis.ok
        ? { ok: true, text: analysis.text, route: selection.route }
        : { ok: false, message: analysis.message, reason: analysis.reason, route: selection.route };
}
/**
 * Execute the `view_image` tool.
 * @param args - tool invocation arguments.
 * @param exec - tool execution context supplying the session workspace and cancellation.
 * @param getConfig - accessor for the current resolved configuration.
 * @param runtime - kernel services.
 * @returns a structured result; recoverable problems are reported, not thrown.
 */
export async function executeViewImage(args, exec, getConfig, runtime) {
    const cfg = getConfig();
    if (typeof args.path !== 'string' || args.path.trim().length === 0) {
        throw new Error('path must be a non-empty string');
    }
    if (!cfg.enabled) {
        return failure({
            message: 'Vision Bridge is disabled. Enable it in Settings then Plugins before using view_image.',
            reason: 'VISION_BRIDGE_DISABLED',
            path: args.path,
        });
    }
    // The session header's cwd is the durable workspace identity; the host
    // process cwd is the fallback when the session carries none.
    const rawPath = args.path.trim();
    const workspaceRoot = exec.agent?.session.header.cwd ?? process.cwd();
    const targetPath = isAbsolute(rawPath) ? rawPath : resolve(workspaceRoot, rawPath);
    const mediaType = mediaTypeForPath(targetPath);
    if (mediaType === undefined) {
        return failure({
            message: `Cannot inspect "${rawPath}": view_image supports PNG, JPEG, WebP, and GIF images.`,
            reason: 'VISION_UNSUPPORTED_MEDIA_TYPE',
            path: targetPath,
        });
    }
    let fileStat;
    try {
        fileStat = await stat(targetPath);
    }
    catch (error) {
        return failure({
            message: `Image file not found at "${targetPath}": ${error instanceof Error ? error.message : String(error)}`,
            reason: 'VISION_IMAGE_UNREADABLE',
            path: targetPath,
        });
    }
    if (!fileStat.isFile()) {
        return failure({
            message: `Specified path is a directory, not a file: "${targetPath}"`,
            reason: 'VISION_IMAGE_UNREADABLE',
            path: targetPath,
        });
    }
    // The attachment store owns this deployment's image policy; checking its
    // bound before reading keeps an oversized file out of memory entirely.
    const maxBytes = runtime.attachments.imageLimits.maxImageBytes;
    if (fileStat.size > maxBytes) {
        return failure({
            message: `Image file size (${String(fileStat.size)} bytes) exceeds this deployment limit of ${String(maxBytes)} bytes.`,
            reason: 'VISION_IMAGE_TOO_LARGE',
            path: targetPath,
            bytes: fileStat.size,
        });
    }
    const data = await readFile(targetPath);
    let ref;
    try {
        // Admission decodes the raster, so the declared media type, the pixel
        // bound, and the dimension bound are all verified here rather than
        // trusted from the file extension.
        const [saved] = await runtime.attachments.saveImages([{ data, mediaType, name: basename(targetPath) }]);
        if (saved === undefined)
            throw new Error('the attachment store committed no reference');
        ref = saved;
    }
    catch (error) {
        return failure({
            message: `Image was rejected by the attachment store: ${error instanceof Error ? error.message : String(error)}`,
            reason: 'VISION_IMAGE_REJECTED',
            path: targetPath,
            bytes: data.byteLength,
        });
    }
    const instruction = args.prompt !== undefined && args.prompt.trim().length > 0
        ? args.prompt.trim()
        : DEFAULT_INSTRUCTION;
    const analysis = await analyzeAttachment(ref, instruction, cfg, runtime, exec.signal);
    if (!analysis.ok) {
        return failure({
            message: analysis.message,
            reason: analysis.reason,
            path: targetPath,
            ref,
            ...analysis.route === undefined ? {} : { route: analysis.route },
        });
    }
    return {
        text: analysis.text,
        provider: analysis.route.provider,
        model: analysis.route.model,
        path: targetPath,
        bytes: ref.bytes,
        width: ref.width,
        height: ref.height,
    };
}
/**
 * Format the tool result for model context.
 * @param result - the structured tool output.
 */
export function renderViewImageContent(result) {
    if (result.isError === true)
        return [{ type: 'text', text: result.text }];
    const formatted = `<image_analysis path="${result.path}" model="${result.model}">\n${result.text}\n</image_analysis>`;
    return [{ type: 'text', text: formatted }];
}
//# sourceMappingURL=view-image.js.map