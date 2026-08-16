import z from "@deepseek-ai/schemastery";
import { defineTool } from "@deepseek-ai/dsh-tools";
import { installSettingsSection, settingsNamespace } from "@deepseek-ai/dsh-settings";
import { readFile, stat } from "node:fs/promises";
import { extname, isAbsolute, resolve } from "node:path";
//#region lib/types/view-image.js
/**
* Implementation of the `view_image` tool.
* Reads an image from disk and calls an OpenAI-compatible vision model.
* @module @dsh-portable/vision-bridge/view-image
*/
const SUPPORTED_MIME_TYPES = {
	".png": "image/png",
	".jpg": "image/jpeg",
	".jpeg": "image/jpeg",
	".webp": "image/webp",
	".gif": "image/gif"
};
const DEFAULT_SYSTEM_PROMPT = "You are an expert visual analysis assistant. Carefully inspect the provided image and describe its contents with high accuracy. Extract any visible text, user interface elements, error messages, code blocks, diagrams, chart trends, or technical layouts.";
/**
* Detect image MIME type from its file extension.
* @param filePath - Path to the file.
* @returns MIME string or undefined if not supported.
*/
function mimeTypeForPath(filePath) {
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
async function executeViewImage(args, exec, getConfig) {
	const cfg = getConfig();
	if (!cfg.enabled) return {
		text: "Error: Vision Bridge is currently disabled. Enable it in Settings → Plugins.",
		model: cfg.model,
		path: args.path,
		bytes: 0,
		isError: true
	};
	if (cfg.provider !== "ollama" && (!cfg.apiKey || cfg.apiKey.trim().length === 0)) return {
		text: "Error: Vision Bridge has no API key configured. Please set your API key in Settings → Plugins.",
		model: cfg.model,
		path: args.path,
		bytes: 0,
		isError: true
	};
	if (typeof args.path !== "string" || args.path.trim().length === 0) throw new Error("path must be a non-empty string");
	const rawPath = args.path.trim();
	const workspaceRoot = exec.agent?.session.header.cwd ?? process.cwd();
	const targetPath = isAbsolute(rawPath) ? rawPath : resolve(workspaceRoot, rawPath);
	const mime = mimeTypeForPath(targetPath);
	if (mime === void 0) return {
		text: `Error: Cannot inspect "${rawPath}": view_image only supports PNG, JPEG, WebP, and GIF images.`,
		model: cfg.model,
		path: targetPath,
		bytes: 0,
		isError: true
	};
	let fileStat;
	try {
		fileStat = await stat(targetPath);
	} catch (err) {
		return {
			text: `Error: Image file not found at "${targetPath}": ${err instanceof Error ? err.message : String(err)}`,
			model: cfg.model,
			path: targetPath,
			bytes: 0,
			isError: true
		};
	}
	if (!fileStat.isFile()) return {
		text: `Error: Specified path is a directory, not a file: "${targetPath}"`,
		model: cfg.model,
		path: targetPath,
		bytes: 0,
		isError: true
	};
	if (fileStat.size > cfg.maxImageBytes) return {
		text: `Error: Image file size (${fileStat.size} bytes) exceeds configured limit of ${cfg.maxImageBytes} bytes.`,
		model: cfg.model,
		path: targetPath,
		bytes: fileStat.size,
		isError: true
	};
	const buffer = await readFile(targetPath);
	const dataUrl = `data:${mime};base64,${buffer.toString("base64")}`;
	const endpoint = `${cfg.baseURL.replace(/\/+$/, "")}/chat/completions`;
	const requestPrompt = args.prompt && args.prompt.trim().length > 0 ? args.prompt.trim() : "Please analyze and describe the contents of this image in detail.";
	const headers = { "Content-Type": "application/json" };
	if (cfg.apiKey && cfg.apiKey.trim().length > 0) headers.Authorization = `Bearer ${cfg.apiKey.trim()}`;
	const payload = {
		model: cfg.model,
		messages: [{
			role: "system",
			content: cfg.prompt && cfg.prompt.trim().length > 0 ? cfg.prompt.trim() : DEFAULT_SYSTEM_PROMPT
		}, {
			role: "user",
			content: [{
				type: "text",
				text: requestPrompt
			}, {
				type: "image_url",
				image_url: { url: dataUrl }
			}]
		}],
		temperature: .1
	};
	const timeoutSignal = AbortSignal.timeout(cfg.timeoutMs);
	const combinedSignal = exec.signal ? AbortSignal.any([exec.signal, timeoutSignal]) : timeoutSignal;
	try {
		const response = await fetch(endpoint, {
			method: "POST",
			headers,
			body: JSON.stringify(payload),
			redirect: "error",
			signal: combinedSignal
		});
		if (!response.ok) {
			const errorText = await response.text().catch(() => "");
			const truncated = errorText.length > 300 ? `${errorText.slice(0, 300)}...` : errorText;
			return {
				text: `Vision API call failed with HTTP ${response.status}: ${truncated}`,
				model: cfg.model,
				path: targetPath,
				bytes: buffer.length,
				isError: true
			};
		}
		const content = (await response.json()).choices?.[0]?.message?.content;
		if (!content || typeof content !== "string") return {
			text: "Vision API returned an empty or invalid response.",
			model: cfg.model,
			path: targetPath,
			bytes: buffer.length,
			isError: true
		};
		return {
			text: content,
			model: cfg.model,
			path: targetPath,
			bytes: buffer.length
		};
	} catch (error) {
		return {
			text: `Vision inspection failed: ${error instanceof Error ? error.message : String(error)}`,
			model: cfg.model,
			path: targetPath,
			bytes: buffer.length,
			isError: true
		};
	}
}
/** Format output for model context. */
function renderViewImageContent(result) {
	if (result.isError) return [{
		type: "text",
		text: result.text
	}];
	return [{
		type: "text",
		text: `<image_analysis path="${result.path}" model="${result.model}">\n${result.text}\n</image_analysis>`
	}];
}
//#endregion
//#region lib/types/index.js
/**
* Host-side Cordis plugin entrypoint for @dsh-portable/vision-bridge.
* @module @dsh-portable/vision-bridge
*/
const name = "vision-bridge";
const inject = ["tools", "systemPrompt"];
const Config = z.object({
	enabled: z.boolean().default(true),
	provider: z.string().default("compatible"),
	model: z.string().default("gpt-4o-mini"),
	baseURL: z.string().default("https://api.openai.com/v1"),
	apiKey: z.string().role("secret").default(""),
	maxImageBytes: z.number().default(20971520),
	timeoutMs: z.number().default(6e4),
	prompt: z.string().default("")
});
const VISION_SETTINGS_NAMESPACE = settingsNamespace("vision");
function apply(ctx, config = {}) {
	const resolved = Config(config);
	let currentConfig = () => resolved;
	installSettingsSection(ctx, VISION_SETTINGS_NAMESPACE, Config, resolved, {
		setSource: (thunk) => {
			currentConfig = thunk;
		},
		onChange: () => {}
	});
	ctx.tools.register(defineTool({
		name: "view_image",
		description: "Inspect and describe an image file using an external vision model. Supports PNG, JPEG, WebP, and GIF images. Use this tool whenever you need to view screenshots, UI layouts, diagrams, charts, or images on disk.",
		parameters: {
			path: {
				type: "string",
				required: true,
				description: "Absolute path or workspace-relative path to the image file."
			},
			prompt: {
				type: "string",
				description: "Specific question or instruction for the vision model (e.g. \"Extract the error code from this dialog\")."
			}
		},
		output: {
			schema: {
				type: "object",
				additionalProperties: false,
				properties: {
					text: {
						type: "string",
						required: true
					},
					model: {
						type: "string",
						required: true
					},
					path: {
						type: "string",
						required: true
					},
					bytes: { type: "number" },
					isError: { type: "boolean" }
				}
			},
			render: (_args, value) => renderViewImageContent(value)
		},
		timeoutMs: resolved.timeoutMs,
		isConcurrencySafe: () => true,
		async execute(args, exec) {
			return executeViewImage(args, exec, currentConfig);
		},
		presentCall(args) {
			return {
				card: "generic",
				title: `Inspect image ${args.path}`,
				kind: "read",
				locations: [{ path: args.path }]
			};
		}
	}));
	ctx.systemPrompt.section({
		name: "tool:view_image",
		order: 150,
		text: "Use the view_image tool when the user provides or asks about an image file: it inspects and describes the image with an external vision model."
	});
}
//#endregion
export { Config, VISION_SETTINGS_NAMESPACE, apply, inject, name };
