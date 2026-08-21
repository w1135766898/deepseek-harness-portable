import z from "@deepseek-ai/schemastery";
import { defineTool } from "@deepseek-ai/dsh-tools";
import { installSettingsSection, settingsNamespace } from "@deepseek-ai/dsh-settings";
import { OFFLOADED_IMAGE_TEXT, contentHasImage, createUserMessage } from "@deepseek-ai/dsh-llm";
import { readFile, stat } from "node:fs/promises";
import { basename, extname, isAbsolute, resolve } from "node:path";
//#region lib/types/hybrid-evidence.js
/** Parse and render the provider-neutral evidence used by hybrid routing. */
/** Current wire/schema version for visual evidence. */
const VISUAL_EVIDENCE_SCHEMA_VERSION = 1;
function record(value) {
	return typeof value === "object" && value !== null && !Array.isArray(value) ? value : void 0;
}
function textValue(value) {
	if (typeof value !== "string") return void 0;
	const text = value.trim();
	return text === "" ? void 0 : text;
}
function firstText(input, keys) {
	for (const key of keys) {
		const text = textValue(input[key]);
		if (text !== void 0) return text;
	}
}
function numberValue(value) {
	return typeof value === "number" && Number.isFinite(value) ? value : void 0;
}
function firstNumber(input, keys) {
	for (const key of keys) {
		const number = numberValue(input[key]);
		if (number !== void 0) return number;
	}
}
function optionalConfidence(input) {
	return firstNumber(input, [
		"confidence",
		"score",
		"probability"
	]);
}
/** Normalize the common x/y/width/height and left/top/right/bottom variants. */
function normalizeBox(value) {
	if (Array.isArray(value) && value.length >= 4) {
		const [x, y, width, height] = value;
		const values = [
			numberValue(x),
			numberValue(y),
			numberValue(width),
			numberValue(height)
		];
		if (values.every((item) => item !== void 0)) return {
			x: values[0],
			y: values[1],
			width: values[2],
			height: values[3]
		};
		return;
	}
	const input = record(value);
	if (input === void 0) return void 0;
	const x = firstNumber(input, [
		"x",
		"left",
		"x1"
	]);
	const y = firstNumber(input, [
		"y",
		"top",
		"y1"
	]);
	const right = firstNumber(input, ["right", "x2"]);
	const bottom = firstNumber(input, ["bottom", "y2"]);
	const width = firstNumber(input, ["width", "w"]) ?? (x === void 0 || right === void 0 ? void 0 : right - x);
	const height = firstNumber(input, ["height", "h"]) ?? (y === void 0 || bottom === void 0 ? void 0 : bottom - y);
	if (x === void 0 || y === void 0 || width === void 0 || height === void 0) return void 0;
	return {
		x,
		y,
		width,
		height,
		...input.normalized === true || input.coordinateSpace === "normalized" || input.units === "normalized" ? { normalized: true } : {}
	};
}
function boxFrom(input) {
	return normalizeBox(input.box) ?? normalizeBox(input.bbox) ?? normalizeBox(input.boundingBox);
}
function normalizeOcr(value) {
	return (Array.isArray(value) ? value : value === void 0 ? [] : [value]).flatMap((item) => {
		if (typeof item === "string") {
			const text = textValue(item);
			return text === void 0 ? [] : [{ text }];
		}
		const input = record(item);
		if (input === void 0) return [];
		const text = firstText(input, [
			"text",
			"value",
			"content",
			"transcription"
		]);
		if (text === void 0) return [];
		const box = boxFrom(input);
		const language = firstText(input, ["language", "lang"]);
		return [{
			text,
			...optionalConfidence(input) === void 0 ? {} : { confidence: optionalConfidence(input) },
			...box === void 0 ? {} : { box },
			...language === void 0 ? {} : { language }
		}];
	});
}
function normalizeLayout(value) {
	return (Array.isArray(value) ? value : value === void 0 ? [] : [value]).flatMap((item) => {
		if (typeof item === "string") {
			const text = textValue(item);
			return text === void 0 ? [] : [{
				type: "region",
				label: text
			}];
		}
		const input = record(item);
		if (input === void 0) return [];
		const type = firstText(input, [
			"type",
			"kind",
			"category",
			"role"
		]) ?? "region";
		const label = firstText(input, [
			"label",
			"name",
			"title"
		]);
		const text = firstText(input, [
			"text",
			"content",
			"value"
		]);
		const order = firstNumber(input, [
			"order",
			"readingOrder",
			"index"
		]);
		const box = boxFrom(input);
		return [{
			type,
			...label === void 0 ? {} : { label },
			...text === void 0 ? {} : { text },
			...box === void 0 ? {} : { box },
			...order === void 0 ? {} : { order }
		}];
	});
}
function normalizeAttributes(value) {
	const input = record(value);
	if (input === void 0) return void 0;
	const attributes = {};
	for (const [key, item] of Object.entries(input)) if (typeof item === "string" || typeof item === "number" || typeof item === "boolean") attributes[key] = String(item);
	return Object.keys(attributes).length === 0 ? void 0 : attributes;
}
function normalizeObjects(value) {
	return (Array.isArray(value) ? value : value === void 0 ? [] : [value]).flatMap((item) => {
		if (typeof item === "string") {
			const label = textValue(item);
			return label === void 0 ? [] : [{ label }];
		}
		const input = record(item);
		if (input === void 0) return [];
		const label = firstText(input, [
			"label",
			"name",
			"object",
			"target",
			"type",
			"category"
		]);
		if (label === void 0) return [];
		const confidence = optionalConfidence(input);
		const box = boxFrom(input);
		const attributes = normalizeAttributes(input.attributes ?? input.properties);
		return [{
			label,
			...confidence === void 0 ? {} : { confidence },
			...box === void 0 ? {} : { box },
			...attributes === void 0 ? {} : { attributes }
		}];
	});
}
function normalizeCoordinates(value) {
	return (Array.isArray(value) ? value : value === void 0 ? [] : [value]).flatMap((item) => {
		if (Array.isArray(item) && item.length >= 2) {
			const x = numberValue(item[0]);
			const y = numberValue(item[1]);
			return x === void 0 || y === void 0 ? [] : [{
				label: "point",
				x,
				y
			}];
		}
		const input = record(item);
		if (input === void 0) return [];
		const x = firstNumber(input, [
			"x",
			"left",
			"longitude"
		]);
		const y = firstNumber(input, [
			"y",
			"top",
			"latitude"
		]);
		if (x === void 0 || y === void 0) return [];
		return [{
			label: firstText(input, [
				"label",
				"name",
				"target",
				"object"
			]) ?? "point",
			x,
			y,
			...input.normalized === true || input.coordinateSpace === "normalized" || input.units === "normalized" ? { normalized: true } : {}
		}];
	});
}
function normalizeSemantics(value) {
	return (Array.isArray(value) ? value : value === void 0 ? [] : [value]).flatMap((item) => {
		if (typeof item === "string") {
			const object = textValue(item);
			return object === void 0 ? [] : [{
				subject: "image",
				predicate: "description",
				object
			}];
		}
		const input = record(item);
		if (input === void 0) return [];
		const subject = firstText(input, [
			"subject",
			"from",
			"source"
		]);
		const predicate = firstText(input, [
			"predicate",
			"relation",
			"relationship",
			"kind"
		]);
		const object = firstText(input, [
			"object",
			"to",
			"target",
			"value",
			"description"
		]);
		if (subject === void 0 || predicate === void 0 || object === void 0) return [];
		const confidence = optionalConfidence(input);
		return [{
			subject,
			predicate,
			object,
			...confidence === void 0 ? {} : { confidence }
		}];
	});
}
/**
* Extract the first balanced JSON object/array from a provider response.
* Providers commonly wrap JSON in a markdown fence or a short preamble.
*/
function jsonCandidate(text) {
	const source = (/```(?:json)?\s*([\s\S]*?)```/i.exec(text)?.[1] ?? text).trim();
	try {
		return JSON.parse(source);
	} catch {}
	for (let start = 0; start < source.length; start += 1) {
		if (source[start] !== "{" && source[start] !== "[") continue;
		const stack = [];
		let quoted = false;
		let escaped = false;
		for (let index = start; index < source.length; index += 1) {
			const character = source[index];
			if (quoted) {
				if (escaped) escaped = false;
				else if (character === "\\") escaped = true;
				else if (character === "\"") quoted = false;
				continue;
			}
			if (character === "\"") {
				quoted = true;
				continue;
			}
			if (character === "{" || character === "[") stack.push(character);
			else if (character === "}" || character === "]") {
				const expected = character === "}" ? "{" : "[";
				if (stack.pop() !== expected) break;
				if (stack.length === 0) try {
					return JSON.parse(source.slice(start, index + 1));
				} catch {
					break;
				}
			}
		}
	}
}
/**
* Parse arbitrary vision output into the stable evidence shape.
*
* Parsing is intentionally loss-tolerant: a provider that returns prose still
* gives the text model a useful `summary`, while structured fields remain
* deterministic empty arrays instead of changing shape between providers.
*/
function parseVisualEvidence(input) {
	const sourceText = typeof input === "string" ? input.trim() : "";
	const object = record(typeof input === "string" ? jsonCandidate(input) : input);
	const summary = object === void 0 ? sourceText : firstText(object, [
		"summary",
		"description",
		"caption",
		"overview"
	]) ?? "";
	const coordinates = object?.coordinates ?? object?.points ?? object?.landmarks;
	const semantics = object?.semantics ?? object?.relations ?? object?.relationships;
	return {
		schemaVersion: 1,
		summary,
		ocr: normalizeOcr(object?.ocr ?? object?.textRegions ?? object?.text),
		layout: normalizeLayout(object?.layout ?? object?.regions ?? object?.structure),
		objects: normalizeObjects(object?.objects ?? object?.targets ?? object?.detections),
		coordinates: normalizeCoordinates(coordinates),
		semantics: normalizeSemantics(semantics)
	};
}
/** Alias that reads naturally at a response boundary. */
const parseVisualEvidenceResponse = parseVisualEvidence;
/** Serialize only the canonical evidence keys in a stable order. */
function serializeVisualEvidence(input) {
	return JSON.stringify(parseVisualEvidence(input));
}
/** Render evidence as a clearly delimited model-facing text block. */
function formatVisualEvidenceForModel(input) {
	const evidence = parseVisualEvidence(input);
	return `<visual_evidence schema_version="${String(evidence.schemaVersion)}">\n${JSON.stringify(evidence, null, 2)}\n</visual_evidence>`;
}
/** Short alias for callers that already use the evidence vocabulary. */
const renderVisualEvidence = formatVisualEvidenceForModel;
//#endregion
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
* Read image capability for one exact provider/model route.
*
* Catalog ids are only unique within a provider. Matching both parts keeps a
* same-named model on another provider from changing the active route.
*/
function imageInputCapability(route, catalog) {
	const entry = catalog.find((candidate) => candidate.provider === route.provider && candidate.id === route.model);
	if (entry === void 0 || entry.inputModalities === void 0) return "unknown";
	return declaresImageInput(entry) ? "supported" : "unsupported";
}
/** True when the exact catalog entry positively declares image input. */
function modelSupportsImages(route, catalog) {
	return imageInputCapability(route, catalog) === "supported";
}
/** Find one exact catalog entry without conflating providers that share ids. */
function findCatalogModel(route, catalog) {
	return catalog.find((candidate) => candidate.provider === route.provider && candidate.id === route.model);
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
		const pinned = catalog.find((entry) => entry.id === config.model) ?? (() => {
			const separator = config.model.indexOf("/");
			if (separator <= 0 || separator === config.model.length - 1) return void 0;
			const provider = config.model.slice(0, separator);
			const model = config.model.slice(separator + 1);
			return catalog.find((entry) => entry.provider === provider && entry.id === model);
		})();
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
				model: pinned.id
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
	return catalog.filter(declaresImageInput);
}
//#endregion
//#region lib/types/hybrid-routing.js
/** Model-route selection and transient message rewriting for hybrid vision. */
/** Return the history suffix after the latest assistant message. */
function currentTurnMessages(messages) {
	let lastAssistant = -1;
	for (const [index, message] of messages.entries()) if (message.role === "assistant") lastAssistant = index;
	return messages.slice(lastAssistant + 1);
}
/**
* Detect images in the current turn only.
*
* Looking at the whole derived history would keep a text-only conversation on
* the vision route forever after its first image. The loop builds requests
* from the full history, so the latest assistant boundary is the useful
* stateless approximation when a Host does not already have turn events.
*/
function currentTurnHasImage(messages) {
	return currentTurnMessages(messages).some((message) => contentHasImage(message.content));
}
/** Alias for callers that phrase the question as a predicate. */
const hasCurrentTurnImage = currentTurnHasImage;
/** Pick native image input, fallback vision analysis, or ordinary text. */
function selectHybridRoute(input) {
	const turn = input.currentTurnMessages ?? (input.messages === void 0 ? [] : currentTurnMessages(input.messages));
	if (!(input.hasImage ?? turn.some((message) => contentHasImage(message.content)))) return {
		ok: true,
		kind: "text",
		route: input.current,
		hasImage: false
	};
	if (modelSupportsImages(input.current, input.catalog)) return {
		ok: true,
		kind: "native-image",
		route: input.current,
		hasImage: true
	};
	const vision = selectVisionRoute(input.vision, input.catalog);
	if (!vision.ok) return vision;
	return {
		ok: true,
		kind: "vision-fallback",
		route: input.current,
		visionRoute: vision.route,
		hasImage: true
	};
}
/** Alias used by Host code that calls the operation a model-route selection. */
const selectHybridModelRoute = selectHybridRoute;
/** True when the active model is known to accept image input. */
function currentRouteAcceptsImages(current, catalog) {
	return imageInputCapability(current, catalog) === "supported";
}
/** Replace image blocks without mutating the immutable session messages. */
function replaceBlocks(blocks, replacement) {
	let changed = false;
	const next = [];
	for (const block of blocks) if (block.type === "image") {
		next.push(replacement(block));
		changed = true;
	} else if (block.type === "tool-result") {
		const content = replaceBlocks(block.content, replacement);
		next.push(content === block.content ? block : {
			...block,
			content
		});
		changed ||= content !== block.content;
	} else next.push(block);
	return changed ? next : blocks;
}
/**
* Replace images with one aggregate evidence block for the current turn and a
* text-only omission marker for older history. The returned messages are
* transient and can safely be passed to a text adapter without changing the
* durable image-bearing user message.
*/
function replaceImagesWithEvidence(messages, evidence, turnMessages = currentTurnMessages(messages)) {
	const turnIds = new Set(turnMessages.map((message) => String(message.id)));
	const evidenceText = formatVisualEvidenceForModel(evidence);
	let emittedEvidence = false;
	return messages.map((message) => {
		const isCurrentTurn = turnIds.has(String(message.id));
		const content = replaceBlocks(message.content, () => {
			if (isCurrentTurn && !emittedEvidence) {
				emittedEvidence = true;
				return {
					type: "text",
					text: evidenceText
				};
			}
			return {
				type: "text",
				text: isCurrentTurn ? "[additional image represented by the visual evidence above]" : OFFLOADED_IMAGE_TEXT
			};
		});
		return content === message.content ? message : {
			...message,
			content
		};
	});
}
/** Alias for the common "rewrite image content" phrasing. */
const rewriteImagesAsEvidence = replaceImagesWithEvidence;
/** Build a text block suitable for appending as a model-facing evidence message. */
function visualEvidenceText(evidence) {
	return formatVisualEvidenceForModel(evidence);
}
/**
* Select a route and, for a text-only image round, ask the Host callback for
* visual evidence and return a transient text-only request. The callback is
* deliberately injected so this helper can run from either `agent/pre-step`
* or a Host-owned dispatch seam without recursively entering `llm/stream`.
*/
async function prepareHybridRequest(request, options) {
	const selection = selectHybridRoute({
		...options,
		messages: options.messages ?? request.messages
	});
	if (!selection.ok) return selection;
	if (selection.kind !== "vision-fallback") return {
		ok: true,
		route: selection,
		request
	};
	if (options.analyze === void 0) return {
		ok: false,
		reason: "VISION_ANALYZER_UNAVAILABLE",
		message: "A text-only model received an image, but no visual evidence analyzer is installed."
	};
	const turn = options.currentTurnMessages ?? currentTurnMessages(request.messages);
	const evidence = parseVisualEvidence(await options.analyze({
		messages: turn,
		signal: request.signal
	}));
	return {
		ok: true,
		route: selection,
		request: {
			...request,
			messages: replaceImagesWithEvidence(request.messages, evidence, turn)
		},
		evidence
	};
}
/** Prompt text for a Host callback that wants provider JSON rather than prose. */
const VISUAL_EVIDENCE_INSTRUCTION = [
	"Inspect the supplied image(s) and return JSON only.",
	"Use exactly these top-level keys: summary, ocr, layout, objects, coordinates, semantics.",
	"Include readable OCR text, layout regions, detected objects or UI targets, coordinates or bounding boxes, and semantic relations when present.",
	"Use numeric x, y, width, height values for boxes and numeric x, y values for points; omit unknown values rather than guessing."
].join(" ");
//#endregion
//#region lib/types/hybrid-host.js
/** Host middleware for routing image turns through the selected vision model. */
function routeConfig(config) {
	return {
		enabled: config.enabled === true,
		model: config.model ?? ""
	};
}
async function catalogOf(runtime, options) {
	if (options.catalog !== void 0) return await options.catalog();
	const providers = runtime.listProviders();
	return (await Promise.all(providers.map(async (provider) => {
		try {
			return await runtime.listModels(provider.id);
		} catch {
			return [];
		}
	}))).flat();
}
function routeFromAssembly(assembly) {
	const provider = assembly.variables.provider;
	const model = assembly.variables.model;
	return provider === void 0 || model === void 0 || provider === "" || model === "" ? void 0 : {
		provider,
		model
	};
}
function routeFromAgent(agent) {
	const provider = agent.options?.provider;
	const model = agent.options?.model;
	return provider === void 0 || model === void 0 || provider === "" || model === "" ? void 0 : {
		provider,
		model
	};
}
function evidenceMessage(evidence, original) {
	const text = original.content.filter((block) => block.type === "text").map((block) => block.text).join("\n");
	const evidenceText = formatVisualEvidenceForModel(evidence);
	return createUserMessage({
		content: [{
			type: "text",
			text: text === "" ? evidenceText : `${text}\n\n${evidenceText}`
		}],
		source: {
			kind: "plugin",
			plugin: "vision-bridge"
		}
	});
}
function continueFromEvidenceMessage() {
	return createUserMessage({
		content: [{
			type: "text",
			text: "Answer the user's request using the structured visual evidence already added above."
		}],
		source: {
			kind: "plugin",
			plugin: "vision-bridge"
		}
	});
}
async function analyzeWithRuntime(runtime, route, messages, signal) {
	const instruction = createUserMessage({
		content: [{
			type: "text",
			text: VISUAL_EVIDENCE_INSTRUCTION
		}],
		source: {
			kind: "plugin",
			plugin: "vision-bridge"
		}
	});
	let text = "";
	for await (const chunk of runtime.stream({
		provider: route.provider,
		model: route.model,
		messages: [instruction, ...messages],
		temperature: 0,
		signal
	})) {
		if (chunk.type === "text-delta") text += chunk.text;
		if (chunk.type === "block-end" && chunk.block.type === "text" && text === "") text = chunk.block.text;
		if (chunk.type === "finish" && (chunk.reason.kind === "error" || chunk.reason.kind === "aborted")) throw new Error(chunk.reason.failure.message);
	}
	return text;
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
function installHybridVisionRouting(ctx, getConfig, runtime, options = {}) {
	const assembledRoutes = /* @__PURE__ */ new WeakMap();
	const originalResolveModelInfo = runtime.resolveModelInfo.bind(runtime);
	const resolveModelInfo = async (provider, model, signal) => {
		const resolved = await originalResolveModelInfo(provider, model, signal);
		if (resolved.inputModalities === void 0 || resolved.inputModalities.includes("image")) return resolved;
		if (!selectVisionRoute(routeConfig(await getConfig()), await catalogOf(runtime, options)).ok) return resolved;
		return {
			...resolved,
			inputModalities: ["text", "image"]
		};
	};
	const assemblyDispose = ctx.on("system-prompt/assemble", async (assemblyValue, contextValue, next) => {
		const assembled = await next();
		const agent = contextValue?.agent;
		const route = routeFromAssembly(assembled);
		if (agent !== void 0 && route !== void 0) assembledRoutes.set(agent, route);
		return assembled;
	});
	const preStepDispose = ctx.on("agent/pre-step", async (payloadValue, next) => {
		const payload = payloadValue;
		const decision = await next();
		if (decision.kind !== "enter" || decision.messages === void 0 || decision.messages.length === 0) return decision;
		const current = assembledRoutes.get(payload.agent) ?? routeFromAgent(payload.agent);
		if (current === void 0) return decision;
		const turnMessages = decision.messages;
		if (!turnMessages.some((message) => contentHasImage(message.content))) return decision;
		const catalog = await catalogOf(runtime, options);
		if (modelSupportsImages(current, catalog)) return decision;
		const vision = selectVisionRoute(routeConfig(await getConfig()), catalog);
		if (!vision.ok) throw new Error(vision.message);
		const evidence = parseVisualEvidence(options.analyze === void 0 ? await analyzeWithRuntime(runtime, vision.route, turnMessages, payload.signal) : await options.analyze({
			route: vision.route,
			messages: turnMessages,
			signal: payload.signal
		}));
		const remaining = [];
		let replacedImageMessage = false;
		for (const message of turnMessages) {
			if (!contentHasImage(message.content)) {
				remaining.push(message);
				continue;
			}
			replacedImageMessage = true;
			const originalEvent = payload.agent.session.append("user/message", message, { surfaceOp: "append" });
			payload.agent.session.append("user/message", evidenceMessage(evidence, message), {
				surfaceOp: {
					op: "replace",
					start: originalEvent.seq,
					end: originalEvent.seq
				},
				sourceEventSeqs: [originalEvent.seq]
			});
		}
		return {
			...decision,
			messages: replacedImageMessage ? [...remaining, continueFromEvidenceMessage()] : remaining
		};
	});
	return {
		dispose: () => {
			assemblyDispose();
			preStepDispose();
		},
		resolveModelInfo,
		currentRoute: (agent) => assembledRoutes.get(agent)
	};
}
//#endregion
//#region lib/types/view-image.js
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
		...input.source === void 0 ? {} : { source: input.source },
		...input.attachmentId === void 0 ? {} : { attachmentId: input.attachmentId },
		reason: input.reason,
		isError: true
	};
}
/** Extract one image reference from an arbitrary model content array. */
function imageBlockIn(content, match) {
	if (!Array.isArray(content)) return void 0;
	for (const value of content) {
		if (typeof value !== "object" || value === null || Array.isArray(value)) continue;
		const block = value;
		if (block.type === "image" && typeof block.attachment === "object" && block.attachment !== null) {
			const ref = block.attachment;
			if (match(ref)) return ref;
		}
		if (block.type === "tool-result") {
			const nested = imageBlockIn(block.content, match);
			if (nested !== void 0) return nested;
		}
	}
}
/** Search all durable content carriers used by the session event vocabulary. */
function imageInEvent(event, match) {
	if (typeof event !== "object" || event === null) return void 0;
	const record = event;
	const data = record.data;
	if (data === void 0) return void 0;
	const direct = imageBlockIn(data.content, match);
	if (direct !== void 0) return direct;
	if (data.message !== void 0) {
		const wrapped = imageBlockIn(data.message.content, match);
		if (wrapped !== void 0) return wrapped;
	}
	if (Array.isArray(data.inserted)) for (const message of data.inserted) {
		const inserted = imageBlockIn(message.content, match);
		if (inserted !== void 0) return inserted;
	}
	if (record.type === "assistant/chunk" && data.chunk?.type === "block-end") return imageBlockIn([data.chunk.block], match);
}
/** Resolve an opaque history id only against refs present in this session log. */
function findHistoricalImageRef(events, attachmentId) {
	for (const event of events) {
		const found = imageInEvent(event, (ref) => String(ref.attachmentId) === attachmentId);
		if (found !== void 0) return found;
	}
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
	const input = args;
	const providedPath = typeof input.path === "string" ? input.path : "";
	const rawPath = providedPath.trim();
	const rawAttachmentId = typeof input.attachmentId === "string" ? input.attachmentId.trim() : "";
	if (rawPath.length === 0 && rawAttachmentId.length === 0) throw new Error("path must be a non-empty string, or attachmentId must be a non-empty string");
	if (rawPath.length > 0 && rawAttachmentId.length > 0) throw new Error("path and attachmentId are mutually exclusive");
	if (!cfg.enabled) return failure({
		message: "Vision Bridge is disabled. Enable it in Settings then Plugins before using view_image.",
		reason: "VISION_BRIDGE_DISABLED",
		path: rawAttachmentId.length > 0 ? historyDisplayPath(rawAttachmentId) : providedPath,
		source: rawAttachmentId.length > 0 ? "history" : "local",
		...rawAttachmentId.length > 0 ? { attachmentId: rawAttachmentId } : {}
	});
	if (rawAttachmentId.length > 0) {
		const ref = findHistoricalImageRef(sessionEvents(exec), rawAttachmentId);
		const path = historyDisplayPath(rawAttachmentId);
		if (ref === void 0) return failure({
			message: `Image attachment "${rawAttachmentId}" is not referenced by this session's history.`,
			reason: "VISION_ATTACHMENT_NOT_REFERENCED",
			path,
			source: "history",
			attachmentId: rawAttachmentId
		});
		const analysis = await analyzeAttachment(ref, input.prompt !== void 0 && input.prompt.trim().length > 0 ? input.prompt.trim() : DEFAULT_INSTRUCTION, cfg, runtime, exec.signal);
		if (!analysis.ok) return failure({
			message: analysis.message,
			reason: analysis.reason,
			path,
			ref,
			source: "history",
			attachmentId: rawAttachmentId,
			...analysis.route === void 0 ? {} : { route: analysis.route }
		});
		return {
			text: analysis.text,
			provider: analysis.route.provider,
			model: analysis.route.model,
			path,
			bytes: ref.bytes,
			width: ref.width,
			height: ref.height,
			source: "history",
			attachmentId: rawAttachmentId
		};
	}
	const workspaceRoot = exec.agent?.session.header.cwd ?? process.cwd();
	const targetPath = isAbsolute(rawPath) ? rawPath : resolve(workspaceRoot, rawPath);
	const mediaType = mediaTypeForPath(targetPath);
	if (mediaType === void 0) return failure({
		message: `Cannot inspect "${rawPath}": view_image supports PNG, JPEG, WebP, and GIF images.`,
		reason: "VISION_UNSUPPORTED_MEDIA_TYPE",
		path: targetPath,
		source: "local"
	});
	let fileStat;
	try {
		fileStat = await stat(targetPath);
	} catch (error) {
		return failure({
			message: `Image file not found at "${targetPath}": ${error instanceof Error ? error.message : String(error)}`,
			reason: "VISION_IMAGE_UNREADABLE",
			path: targetPath,
			source: "local"
		});
	}
	if (!fileStat.isFile()) return failure({
		message: `Specified path is a directory, not a file: "${targetPath}"`,
		reason: "VISION_IMAGE_UNREADABLE",
		path: targetPath,
		source: "local"
	});
	const maxBytes = runtime.attachments.imageLimits.maxImageBytes;
	if (fileStat.size > maxBytes) return failure({
		message: `Image file size (${String(fileStat.size)} bytes) exceeds this deployment limit of ${String(maxBytes)} bytes.`,
		reason: "VISION_IMAGE_TOO_LARGE",
		path: targetPath,
		bytes: fileStat.size,
		source: "local"
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
			bytes: data.byteLength,
			source: "local"
		});
	}
	const instruction = input.prompt !== void 0 && input.prompt.trim().length > 0 ? input.prompt.trim() : DEFAULT_INSTRUCTION;
	const analysis = await analyzeAttachment(ref, instruction, cfg, runtime, exec.signal);
	if (!analysis.ok) return failure({
		message: analysis.message,
		reason: analysis.reason,
		path: targetPath,
		ref,
		source: "local",
		...analysis.route === void 0 ? {} : { route: analysis.route }
	});
	return {
		text: analysis.text,
		provider: analysis.route.provider,
		model: analysis.route.model,
		path: targetPath,
		bytes: ref.bytes,
		width: ref.width,
		height: ref.height,
		source: "local"
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
		text: "source" in result && result.source === "history" && "attachmentId" in result && typeof result.attachmentId === "string" ? `<image_analysis source="history" attachment_id="${result.attachmentId}" model="${result.model}">\n${result.text}\n</image_analysis>` : `<image_analysis path="${result.path}" model="${result.model}">\n${result.text}\n</image_analysis>`
	}];
}
//#endregion
//#region lib/types/index.js
/**
* Host-side Cordis plugin entrypoint for @dsh-portable/vision-bridge.
*
* The plugin contributes one explicit `view_image` tool that analyzes local
* image files or re-analyzes durable images already referenced by the current
* session. Everything underneath it — provider credentials, model capability,
* durable image storage, retry and metering — belongs to the kernel services
* this plugin injects, so there is no parallel endpoint or secret to configure.
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
	const llm = ctx.get("llm") ?? ctx.llm;
	const runtime = {
		get attachments() {
			return ctx.attachments;
		},
		get llm() {
			return llm;
		}
	};
	const hybrid = installHybridVisionRouting(ctx, currentConfig, llm);
	const originalResolveModelInfo = llm.resolveModelInfo;
	ctx.effect(() => {
		llm.resolveModelInfo = hybrid.resolveModelInfo;
		return () => {
			if (llm.resolveModelInfo === hybrid.resolveModelInfo) llm.resolveModelInfo = originalResolveModelInfo;
			hybrid.dispose();
		};
	}, "vision-bridge: hybrid routing");
	ctx.tools.register(defineTool({
		name: "view_image",
		description: "Inspect and describe an image using a configured image-capable model. For a local PNG, JPEG, WebP, or GIF provide path; to re-analyze an image already present in this session history, provide attachmentId. Use this tool whenever you need to view screenshots, UI layouts, diagrams, charts, or images.",
		parameters: {
			path: {
				type: "string",
				description: "Absolute path or workspace-relative path to a local image file (mutually exclusive with attachmentId)."
			},
			attachmentId: {
				type: "string",
				description: "Opaque attachment id from this session history (mutually exclusive with path)."
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
					source: {
						type: "string",
						enum: ["local", "history"]
					},
					attachmentId: { type: "string" },
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
					source: result.source ?? "local",
					...result.attachmentId === void 0 ? {} : { attachmentId: result.attachmentId },
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
			const attachmentId = typeof args.attachmentId === "string" ? args.attachmentId : void 0;
			const path = typeof args.path === "string" ? args.path : void 0;
			return {
				card: "generic",
				title: attachmentId === void 0 ? `Inspect image ${path ?? ""}` : `Inspect historical image ${attachmentId}`,
				kind: "read",
				...attachmentId === void 0 && path !== void 0 ? { locations: [{ path }] } : {}
			};
		},
		presentResult(_args, result) {
			const meta = result.meta;
			const path = typeof meta === "object" && meta !== null && "path" in meta && typeof meta.path === "string" ? meta.path : void 0;
			const source = typeof meta === "object" && meta !== null && "source" in meta && meta.source === "history" ? "history" : "local";
			const attachmentId = typeof meta === "object" && meta !== null && "attachmentId" in meta && typeof meta.attachmentId === "string" ? meta.attachmentId : void 0;
			const leaf = path?.replaceAll("\\", "/").split("/").at(-1);
			return {
				card: "generic",
				title: source === "history" ? result.isError ? `Historical image inspection failed${attachmentId === void 0 ? "" : ` · ${attachmentId}`}` : `Historical image analyzed${attachmentId === void 0 ? "" : ` · ${attachmentId}`}` : result.isError ? `Image inspection failed${leaf === void 0 ? "" : ` · ${leaf}`}` : `Image analyzed${leaf === void 0 ? "" : ` · ${leaf}`}`
			};
		}
	}));
	ctx.systemPrompt.section({
		name: "tool:view_image",
		order: 150,
		text: () => currentConfig().enabled ? "Pasted or uploaded images use Hybrid Vision Bridge automatically. If the current model accepts images, keep the native image input. Otherwise, the configured vision model produces structured OCR, layout, object, coordinate, and semantic evidence for the original text model. Use view_image for local image files that need visual analysis. To revisit an image already saved in this session, pass its opaque attachmentId from history; this reuses the durable reference and does not upload it again." : "Hybrid Vision Bridge and view_image are disabled. Native model image capabilities are unchanged."
	});
}
//#endregion
export { Config, VISION_SETTINGS_NAMESPACE, VISUAL_EVIDENCE_INSTRUCTION, VISUAL_EVIDENCE_SCHEMA_VERSION, apply, currentRouteAcceptsImages, currentTurnHasImage, currentTurnMessages, declaresImageInput, deniesImageInput, findCatalogModel, formatVisualEvidenceForModel, hasCurrentTurnImage, imageCapableModels, imageInputCapability, inject, installHybridVisionRouting, modelSupportsImages, name, parseVisualEvidence, parseVisualEvidenceResponse, prepareHybridRequest, renderVisualEvidence, replaceImagesWithEvidence, rewriteImagesAsEvidence, selectHybridModelRoute, selectHybridRoute, selectVisionRoute, serializeVisualEvidence, visualEvidenceText };
