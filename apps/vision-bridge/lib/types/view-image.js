/**
 * Implementation of the `view_image` tool.
 * Reads an image from disk and calls an OpenAI-compatible vision model.
 * @module @dsh-portable/vision-bridge/view-image
 */
import { stat, readFile } from 'node:fs/promises';
import { extname, isAbsolute, resolve } from 'node:path';
const SUPPORTED_MIME_TYPES = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
};
const DEFAULT_SYSTEM_PROMPT = 'You are an expert visual analysis assistant. Carefully inspect the provided image and describe its contents with high accuracy. ' +
    'Extract any visible text, user interface elements, error messages, code blocks, diagrams, chart trends, or technical layouts.';
/**
 * Detect image MIME type from its file extension.
 * @param filePath - Path to the file.
 * @returns MIME string or undefined if not supported.
 */
export function mimeTypeForPath(filePath) {
    const ext = extname(filePath).toLowerCase();
    return SUPPORTED_MIME_TYPES[ext];
}
/**
 * Execute the `view_image` tool logic.
 * @param args - Tool invocation arguments.
 * @param exec - Cordis tool execution context.
 * @param getConfig - Accessor for current resolved vision configuration.
 * @returns Structured result with model-generated image description.
 */
export async function executeViewImage(args, exec, getConfig) {
    const cfg = getConfig();
    if (!cfg.enabled) {
        return {
            text: 'Error: Vision Bridge is currently disabled. Enable it in Settings → Plugins.',
            model: cfg.model,
            path: args.path,
            bytes: 0,
            isError: true,
        };
    }
    if (cfg.provider !== 'ollama' && (!cfg.apiKey || cfg.apiKey.trim().length === 0)) {
        return {
            text: 'Error: Vision Bridge has no API key configured. Please set your API key in Settings → Plugins.',
            model: cfg.model,
            path: args.path,
            bytes: 0,
            isError: true,
        };
    }
    if (typeof args.path !== 'string' || args.path.trim().length === 0) {
        throw new Error('path must be a non-empty string');
    }
    // 1. Resolve path (absolute or relative to the session workspace)
    const rawPath = args.path.trim();
    // The session header's cwd is the durable session workspace identity; the
    // host process cwd is the fallback when the session carries none.
    const sessionCwd = exec.agent?.session.header.cwd;
    const workspaceRoot = sessionCwd ?? process.cwd();
    const targetPath = isAbsolute(rawPath) ? rawPath : resolve(workspaceRoot, rawPath);
    // 2. MIME type check
    const mime = mimeTypeForPath(targetPath);
    if (mime === undefined) {
        return {
            text: `Error: Cannot inspect "${rawPath}": view_image only supports PNG, JPEG, WebP, and GIF images.`,
            model: cfg.model,
            path: targetPath,
            bytes: 0,
            isError: true,
        };
    }
    // 3. File existence and size check
    let fileStat;
    try {
        fileStat = await stat(targetPath);
    }
    catch (err) {
        return {
            text: `Error: Image file not found at "${targetPath}": ${err instanceof Error ? err.message : String(err)}`,
            model: cfg.model,
            path: targetPath,
            bytes: 0,
            isError: true,
        };
    }
    if (!fileStat.isFile()) {
        return {
            text: `Error: Specified path is a directory, not a file: "${targetPath}"`,
            model: cfg.model,
            path: targetPath,
            bytes: 0,
            isError: true,
        };
    }
    if (fileStat.size > cfg.maxImageBytes) {
        return {
            text: `Error: Image file size (${fileStat.size} bytes) exceeds configured limit of ${cfg.maxImageBytes} bytes.`,
            model: cfg.model,
            path: targetPath,
            bytes: fileStat.size,
            isError: true,
        };
    }
    // 4. Read file bytes and encode to base64 Data URL
    const buffer = await readFile(targetPath);
    const b64 = buffer.toString('base64');
    const dataUrl = `data:${mime};base64,${b64}`;
    // 5. Call OpenAI-compatible Vision API
    const endpoint = `${cfg.baseURL.replace(/\/+$/, '')}/chat/completions`;
    const requestPrompt = args.prompt && args.prompt.trim().length > 0
        ? args.prompt.trim()
        : 'Please analyze and describe the contents of this image in detail.';
    const headers = {
        'Content-Type': 'application/json',
    };
    if (cfg.apiKey && cfg.apiKey.trim().length > 0) {
        headers.Authorization = `Bearer ${cfg.apiKey.trim()}`;
    }
    const payload = {
        model: cfg.model,
        messages: [
            {
                role: 'system',
                content: cfg.prompt && cfg.prompt.trim().length > 0 ? cfg.prompt.trim() : DEFAULT_SYSTEM_PROMPT,
            },
            {
                role: 'user',
                content: [
                    {
                        type: 'text',
                        text: requestPrompt,
                    },
                    {
                        type: 'image_url',
                        image_url: {
                            url: dataUrl,
                        },
                    },
                ],
            },
        ],
        temperature: 0.1,
    };
    const timeoutSignal = AbortSignal.timeout(cfg.timeoutMs);
    const combinedSignal = exec.signal ? AbortSignal.any([exec.signal, timeoutSignal]) : timeoutSignal;
    try {
        const response = await fetch(endpoint, {
            method: 'POST',
            headers,
            body: JSON.stringify(payload),
            redirect: 'error', // Strict security policy: never follow redirects with credentials
            signal: combinedSignal,
        });
        if (!response.ok) {
            const errorText = await response.text().catch(() => '');
            const truncated = errorText.length > 300 ? `${errorText.slice(0, 300)}...` : errorText;
            return {
                text: `Vision API call failed with HTTP ${response.status}: ${truncated}`,
                model: cfg.model,
                path: targetPath,
                bytes: buffer.length,
                isError: true,
            };
        }
        const data = await response.json();
        const content = data.choices?.[0]?.message?.content;
        if (!content || typeof content !== 'string') {
            return {
                text: 'Vision API returned an empty or invalid response.',
                model: cfg.model,
                path: targetPath,
                bytes: buffer.length,
                isError: true,
            };
        }
        return {
            text: content,
            model: cfg.model,
            path: targetPath,
            bytes: buffer.length,
        };
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
            text: `Vision inspection failed: ${message}`,
            model: cfg.model,
            path: targetPath,
            bytes: buffer.length,
            isError: true,
        };
    }
}
/** Format output for model context. */
export function renderViewImageContent(result) {
    if (result.isError) {
        return [{ type: 'text', text: result.text }];
    }
    const formatted = `<image_analysis path="${result.path}" model="${result.model}">\n${result.text}\n</image_analysis>`;
    return [{ type: 'text', text: formatted }];
}
//# sourceMappingURL=view-image.js.map