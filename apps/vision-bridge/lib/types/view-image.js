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
        ...input.source === undefined ? {} : { source: input.source },
        ...input.attachmentId === undefined ? {} : { attachmentId: input.attachmentId },
        reason: input.reason,
        isError: true,
    };
}
/** Extract one image reference from an arbitrary model content array. */
function imageBlockIn(content, match) {
    if (!Array.isArray(content))
        return undefined;
    for (const value of content) {
        if (typeof value !== 'object' || value === null || Array.isArray(value))
            continue;
        const block = value;
        if (block.type === 'image' && typeof block.attachment === 'object' && block.attachment !== null) {
            const ref = block.attachment;
            if (match(ref))
                return ref;
        }
        // Tool results can carry an image block nested inside their content array.
        if (block.type === 'tool-result') {
            const nested = imageBlockIn(block.content, match);
            if (nested !== undefined)
                return nested;
        }
    }
    return undefined;
}
/** Search all durable content carriers used by the session event vocabulary. */
function imageInEvent(event, match) {
    if (typeof event !== 'object' || event === null)
        return undefined;
    const record = event;
    const data = record.data;
    if (data === undefined)
        return undefined;
    const direct = imageBlockIn(data.content, match);
    if (direct !== undefined)
        return direct;
    if (data.message !== undefined) {
        const wrapped = imageBlockIn(data.message.content, match);
        if (wrapped !== undefined)
            return wrapped;
    }
    if (Array.isArray(data.inserted)) {
        for (const message of data.inserted) {
            const inserted = imageBlockIn(message.content, match);
            if (inserted !== undefined)
                return inserted;
        }
    }
    // Raw assistant chunks can carry a structured image block before the
    // assembled assistant/message event is appended.
    if (record.type === 'assistant/chunk' && data.chunk?.type === 'block-end') {
        return imageBlockIn([data.chunk.block], match);
    }
    return undefined;
}
/** Resolve an opaque history id only against refs present in this session log. */
export function findHistoricalImageRef(events, attachmentId) {
    for (const event of events) {
        const found = imageInEvent(event, ref => String(ref.attachmentId) === attachmentId);
        if (found !== undefined)
            return found;
    }
    return undefined;
}
/** Get the live session event log without coupling this package to a session package. */
function sessionEvents(exec) {
    const candidate = exec.agent?.session?.events;
    return Array.isArray(candidate) ? candidate : [];
}
/** Render a stable, non-path display key for a history-backed image. */
function historyDisplayPath(attachmentId) {
    return `<history:${attachmentId}>`;
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
    const input = args;
    const providedPath = typeof input.path === 'string' ? input.path : '';
    const rawPath = providedPath.trim();
    const rawAttachmentId = typeof input.attachmentId === 'string' ? input.attachmentId.trim() : '';
    if (rawPath.length === 0 && rawAttachmentId.length === 0) {
        throw new Error('path must be a non-empty string, or attachmentId must be a non-empty string');
    }
    if (rawPath.length > 0 && rawAttachmentId.length > 0) {
        throw new Error('path and attachmentId are mutually exclusive');
    }
    if (!cfg.enabled) {
        return failure({
            message: 'Vision Bridge is disabled. Enable it in Settings then Plugins before using view_image.',
            reason: 'VISION_BRIDGE_DISABLED',
            path: rawAttachmentId.length > 0 ? historyDisplayPath(rawAttachmentId) : providedPath,
            source: rawAttachmentId.length > 0 ? 'history' : 'local',
            ...rawAttachmentId.length > 0 ? { attachmentId: rawAttachmentId } : {},
        });
    }
    if (rawAttachmentId.length > 0) {
        const ref = findHistoricalImageRef(sessionEvents(exec), rawAttachmentId);
        const path = historyDisplayPath(rawAttachmentId);
        if (ref === undefined) {
            return failure({
                message: `Image attachment "${rawAttachmentId}" is not referenced by this session's history.`,
                reason: 'VISION_ATTACHMENT_NOT_REFERENCED',
                path,
                source: 'history',
                attachmentId: rawAttachmentId,
            });
        }
        const instruction = input.prompt !== undefined && input.prompt.trim().length > 0
            ? input.prompt.trim()
            : DEFAULT_INSTRUCTION;
        const analysis = await analyzeAttachment(ref, instruction, cfg, runtime, exec.signal);
        if (!analysis.ok) {
            return failure({
                message: analysis.message,
                reason: analysis.reason,
                path,
                ref,
                source: 'history',
                attachmentId: rawAttachmentId,
                ...analysis.route === undefined ? {} : { route: analysis.route },
            });
        }
        return {
            text: analysis.text,
            provider: analysis.route.provider,
            model: analysis.route.model,
            path,
            bytes: ref.bytes,
            width: ref.width,
            height: ref.height,
            source: 'history',
            attachmentId: rawAttachmentId,
        };
    }
    // The session header's cwd is the durable workspace identity; the host
    // process cwd is the fallback when the session carries none.
    const workspaceRoot = exec.agent?.session.header.cwd ?? process.cwd();
    const targetPath = isAbsolute(rawPath) ? rawPath : resolve(workspaceRoot, rawPath);
    const mediaType = mediaTypeForPath(targetPath);
    if (mediaType === undefined) {
        return failure({
            message: `Cannot inspect "${rawPath}": view_image supports PNG, JPEG, WebP, and GIF images.`,
            reason: 'VISION_UNSUPPORTED_MEDIA_TYPE',
            path: targetPath,
            source: 'local',
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
            source: 'local',
        });
    }
    if (!fileStat.isFile()) {
        return failure({
            message: `Specified path is a directory, not a file: "${targetPath}"`,
            reason: 'VISION_IMAGE_UNREADABLE',
            path: targetPath,
            source: 'local',
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
            source: 'local',
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
            source: 'local',
        });
    }
    const instruction = input.prompt !== undefined && input.prompt.trim().length > 0
        ? input.prompt.trim()
        : DEFAULT_INSTRUCTION;
    const analysis = await analyzeAttachment(ref, instruction, cfg, runtime, exec.signal);
    if (!analysis.ok) {
        return failure({
            message: analysis.message,
            reason: analysis.reason,
            path: targetPath,
            ref,
            source: 'local',
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
        source: 'local',
    };
}
/**
 * Format the tool result for model context.
 * @param result - the structured tool output.
 */
export function renderViewImageContent(result) {
    if (result.isError === true)
        return [{ type: 'text', text: result.text }];
    const isHistory = 'source' in result && result.source === 'history';
    const formatted = isHistory && 'attachmentId' in result && typeof result.attachmentId === 'string'
        ? `<image_analysis source="history" attachment_id="${result.attachmentId}" model="${result.model}">\n${result.text}\n</image_analysis>`
        : `<image_analysis path="${result.path}" model="${result.model}">\n${result.text}\n</image_analysis>`;
    return [{ type: 'text', text: formatted }];
}
//# sourceMappingURL=view-image.js.map