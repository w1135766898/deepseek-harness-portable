import z from "@deepseek-ai/schemastery";
import { defineTool } from "@deepseek-ai/dsh-tools";
import { installSettingsSection, settingsNamespace } from "@deepseek-ai/dsh-settings";
import { readFile, stat } from "node:fs/promises";
import { basename, extname, isAbsolute, resolve } from "node:path";
import { createUserMessage } from "@deepseek-ai/dsh-llm";
//#region lib/types/model-selection.js
/**
* Resolve which configured model performs image analysis.
*
* The kernel's model catalog is the single source of truth: a route is chosen
* from the providers the deployment already configured, and capability comes
* from each entry's declared input modalities rather than from a hand-kept
* list of model names.
* @module @dsh-portable/vision-bridge/model-selection
*/
/**
* Whether a catalog entry declares that it accepts image input.
* @param model - one catalog entry.
*/
function declaresImageInput(model) {
	return model.inputModalities?.includes("image") === true;
}
/**
* Whether a catalog entry declares input modalities that exclude images.
*
* An absent `inputModalities` is unknown capability rather than a denial: it
* never earns an automatic selection, but it must not veto a route the operator
* pinned deliberately.
* @param model - one catalog entry.
*/
function deniesImageInput(model) {
	return model.inputModalities !== void 0 && !model.inputModalities.includes("image");
}
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
function selectVisionRoute(config, catalog) {
	if (!config.enabled) return {
		ok: false,
		reason: "VISION_BRIDGE_DISABLED",
		message: "Vision Bridge is disabled. Enable it in Settings → Plugins before using view_image."
	};
	if (config.model !== "") {
		const pinned = catalog.find((entry) => entry.id === config.model);
		if (pinned === void 0) return {
			ok: false,
			reason: "VISION_MODEL_UNAVAILABLE",
			message: `Model ${config.model} is not available from a configured provider. Choose a model from Settings → Models.`
		};
		if (deniesImageInput(pinned)) return {
			ok: false,
			reason: "VISION_MODEL_NOT_IMAGE_CAPABLE",
			message: `Model ${config.model} does not accept image input. Choose an image-capable model in Settings → Plugins.`
		};
		return {
			ok: true,
			route: {
				provider: pinned.provider,
				model: config.model
			}
		};
	}
	const discovered = catalog.find((entry) => declaresImageInput(entry));
	if (discovered === void 0) return {
		ok: false,
		reason: "VISION_MODEL_UNAVAILABLE",
		message: "No configured provider reports an image-capable model. Add one in Settings → Models."
	};
	return {
		ok: true,
		route: {
			provider: discovered.provider,
			model: discovered.id
		}
	};
}
/** Catalog entries an operator can reasonably pin as the vision route. */
function imageCapableModels(catalog) {
	return catalog.filter((entry) => !deniesImageInput(entry));
}
//#endregion
//#region lib/types/view-image.js
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
/** File extensions the attachment store's version-one image path accepts. */
const SUPPORTED_MEDIA_TYPES = {
	".png": "image/png",
	".jpg": "image/jpeg",
	".jpeg": "image/jpeg",
	".webp": "image/webp",
	".gif": "image/gif"
};
const DEFAULT_SYSTEM_PROMPT = "You are an expert visual analysis assistant. Carefully inspect the provided image and describe its contents with high accuracy. Extract any visible text, user interface elements, error messages, code blocks, diagrams, chart trends, or technical layouts.";
const DEFAULT_INSTRUCTION = "Please analyze and describe the contents of this image in detail.";
const VISION_TIMEOUT_MS = 6e4;
/**
* Detect the attachment media type for a path from its extension.
* @param filePath - path to the candidate image.
* @returns the media type, or undefined when the extension is not supported.
*/
function mediaTypeForPath(filePath) {
	return SUPPORTED_MEDIA_TYPES[extname(filePath).toLowerCase()];
}
/**
* Enumerate every model the configured providers report.
* @param llm - the kernel LLM service.
* @returns catalog entries in provider order; a provider that cannot list is skipped.
*/
async function visionModelCatalog(llm) {
	const catalog = [];
	for (const provider of llm.listProviders()) try {
		catalog.push(...await llm.listModels(provider.id));
	} catch {
		continue;
	}
	return catalog;
}
/**
* Drain a model stream into the assembled analysis text.
* @param chunks - the raw chunk stream from `llm.stream`.
* @returns the assembled text, or the terminal failure the stream reported.
*/
async function collectAnalysis(chunks) {
	let text = "";
	let failed;
	for await (const chunk of chunks) if (chunk.type === "text-delta") text += chunk.text;
	else if (chunk.type === "finish" && (chunk.reason.kind === "error" || chunk.reason.kind === "aborted")) failed = {
		ok: false,
		message: `Vision analysis failed: ${chunk.reason.failure.message}`,
		reason: chunk.reason.failure.code
	};
	if (failed !== void 0) return failed;
	if (text.trim().length === 0) return {
		ok: false,
		message: "The vision model returned an empty response.",
		reason: "VISION_ANALYSIS_EMPTY"
	};
	return {
		ok: true,
		text
	};
}
/** Build the failure result shape shared by every early return. */
function failure(input) {
	return {
		text: `Error: ${input.message}`,
		provider: input.route?.provider ?? "",
		model: input.route?.model ?? "",
		path: input.path,
		bytes: input.ref?.bytes ?? input.bytes ?? 0,
		...input.ref === void 0 ? {} : {
			width: input.ref.width,
			height: input.ref.height
		},
		reason: input.reason,
		isError: true
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
async function analyzeAttachment(ref, instruction, cfg, runtime, signal) {
	const selection = selectVisionRoute({
		enabled: cfg.enabled,
		model: cfg.model
	}, await visionModelCatalog(runtime.llm));
	if (!selection.ok) return {
		ok: false,
		message: selection.message,
		reason: selection.reason
	};
	const timeout = AbortSignal.timeout(VISION_TIMEOUT_MS);
	const combined = signal === void 0 ? timeout : AbortSignal.any([signal, timeout]);
	const message = createUserMessage({
		content: [{
			type: "text",
			text: instruction
		}, {
			type: "image",
			attachment: ref
		}],
		source: {
			kind: "plugin",
			plugin: "vision-bridge"
		}
	});
	const analysis = await collectAnalysis(runtime.llm.stream({
		provider: selection.route.provider,
		model: selection.route.model,
		messages: [message],
		system: DEFAULT_SYSTEM_PROMPT,
		temperature: .1,
		signal: combined
	}));
	return analysis.ok ? {
		ok: true,
		text: analysis.text,
		route: selection.route
	} : {
		ok: false,
		message: analysis.message,
		reason: analysis.reason,
		route: selection.route
	};
}
/**
* Execute the `view_image` tool.
* @param args - tool invocation arguments.
* @param exec - tool execution context supplying the session workspace and cancellation.
* @param getConfig - accessor for the current resolved configuration.
* @param runtime - kernel services.
* @returns a structured result; recoverable problems are reported, not thrown.
*/
async function executeViewImage(args, exec, getConfig, runtime) {
	const cfg = getConfig();
	if (typeof args.path !== "string" || args.path.trim().length === 0) throw new Error("path must be a non-empty string");
	if (!cfg.enabled) return failure({
		message: "Vision Bridge is disabled. Enable it in Settings then Plugins before using view_image.",
		reason: "VISION_BRIDGE_DISABLED",
		path: args.path
	});
	const rawPath = args.path.trim();
	const workspaceRoot = exec.agent?.session.header.cwd ?? process.cwd();
	const targetPath = isAbsolute(rawPath) ? rawPath : resolve(workspaceRoot, rawPath);
	const mediaType = mediaTypeForPath(targetPath);
	if (mediaType === void 0) return failure({
		message: `Cannot inspect "${rawPath}": view_image supports PNG, JPEG, WebP, and GIF images.`,
		reason: "VISION_UNSUPPORTED_MEDIA_TYPE",
		path: targetPath
	});
	let fileStat;
	try {
		fileStat = await stat(targetPath);
	} catch (error) {
		return failure({
			message: `Image file not found at "${targetPath}": ${error instanceof Error ? error.message : String(error)}`,
			reason: "VISION_IMAGE_UNREADABLE",
			path: targetPath
		});
	}
	if (!fileStat.isFile()) return failure({
		message: `Specified path is a directory, not a file: "${targetPath}"`,
		reason: "VISION_IMAGE_UNREADABLE",
		path: targetPath
	});
	const maxBytes = runtime.attachments.imageLimits.maxImageBytes;
	if (fileStat.size > maxBytes) return failure({
		message: `Image file size (${String(fileStat.size)} bytes) exceeds this deployment limit of ${String(maxBytes)} bytes.`,
		reason: "VISION_IMAGE_TOO_LARGE",
		path: targetPath,
		bytes: fileStat.size
	});
	const data = await readFile(targetPath);
	let ref;
	try {
		const [saved] = await runtime.attachments.saveImages([{
			data,
			mediaType,
			name: basename(targetPath)
		}]);
		if (saved === void 0) throw new Error("the attachment store committed no reference");
		ref = saved;
	} catch (error) {
		return failure({
			message: `Image was rejected by the attachment store: ${error instanceof Error ? error.message : String(error)}`,
			reason: "VISION_IMAGE_REJECTED",
			path: targetPath,
			bytes: data.byteLength
		});
	}
	const instruction = args.prompt !== void 0 && args.prompt.trim().length > 0 ? args.prompt.trim() : DEFAULT_INSTRUCTION;
	const analysis = await analyzeAttachment(ref, instruction, cfg, runtime, exec.signal);
	if (!analysis.ok) return failure({
		message: analysis.message,
		reason: analysis.reason,
		path: targetPath,
		ref,
		...analysis.route === void 0 ? {} : { route: analysis.route }
	});
	return {
		text: analysis.text,
		provider: analysis.route.provider,
		model: analysis.route.model,
		path: targetPath,
		bytes: ref.bytes,
		width: ref.width,
		height: ref.height
	};
}
/**
* Format the tool result for model context.
* @param result - the structured tool output.
*/
function renderViewImageContent(result) {
	if (result.isError === true) return [{
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
*
* The plugin contributes one thing: an explicit `view_image` tool that analyzes
* an image file on disk. Everything underneath it — provider credentials, model
* capability, durable image storage, retry and metering — belongs to the kernel
* services this plugin injects, so there is no parallel endpoint or secret to
* configure here.
* @module @dsh-portable/vision-bridge
*/
const name = "vision-bridge";
const inject = [
	"tools",
	"systemPrompt",
	"attachments",
	"llm"
];
const Config = z.object({
	enabled: z.boolean().default(true),
	model: z.string().default("")
});
const VISION_SETTINGS_NAMESPACE = settingsNamespace("vision");
/**
* Register the vision bridge on a host context.
* @param ctx - the injecting cordis context.
* @param config - entry configuration merged under the stored settings.
*/
function apply(ctx, config = {}) {
	const resolved = Config(config);
	let currentConfig = () => resolved;
	installSettingsSection(ctx, VISION_SETTINGS_NAMESPACE, Config, resolved, {
		setSource: (thunk) => {
			currentConfig = thunk;
		},
		onChange: () => {}
	});
	const runtime = {
		get attachments() {
			return ctx.attachments;
		},
		get llm() {
			return ctx.llm;
		}
	};
	ctx.tools.register(defineTool({
		name: "view_image",
		description: "Inspect and describe an image file using a configured image-capable model. Supports PNG, JPEG, WebP, and GIF images. Use this tool whenever you need to view screenshots, UI layouts, diagrams, charts, or images on disk.",
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
					provider: {
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
					width: { type: "number" },
					height: { type: "number" },
					reason: { type: "string" },
					isError: { type: "boolean" }
				}
			},
			render: (_args, value) => renderViewImageContent(value),
			presentationMeta: (_args, value) => {
				const result = value;
				return {
					path: result.path,
					provider: result.provider,
					model: result.model,
					bytes: result.bytes,
					isError: result.isError === true
				};
			}
		},
		timeoutMs: 6e4,
		isConcurrencySafe: () => true,
		async execute(args, exec) {
			return executeViewImage(args, exec, currentConfig, runtime);
		},
		presentCall(args) {
			return {
				card: "generic",
				title: `Inspect image ${args.path}`,
				kind: "read",
				locations: [{ path: args.path }]
			};
		},
		presentResult(_args, result) {
			const meta = result.meta;
			const leaf = (typeof meta === "object" && meta !== null && "path" in meta && typeof meta.path === "string" ? meta.path : void 0)?.replaceAll("\\", "/").split("/").at(-1);
			return {
				card: "generic",
				title: result.isError ? `Image inspection failed${leaf === void 0 ? "" : ` · ${leaf}`}` : `Image analyzed${leaf === void 0 ? "" : ` · ${leaf}`}`
			};
		}
	}));
	ctx.systemPrompt.section({
		name: "tool:view_image",
		order: 150,
		text: "Use view_image for image files on disk that need visual analysis. Images pasted into the conversation already ride the native attachment path and the selected image-capable model, and need no tool call."
	});
}
//#endregion
export { Config, VISION_SETTINGS_NAMESPACE, apply, declaresImageInput, deniesImageInput, imageCapableModels, inject, name, selectVisionRoute };
