window.__ModuleLoader__.load({
	id: "@dsh-portable/interactive-learning",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let _deepseek_ai_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");
		let react_jsx_runtime = require("react/jsx-runtime");
		//#region src/protocol.ts
		/** Versioned, declarative protocol shared by the Host, Agent, and Client. */
		const ACTIVITY_PROTOCOL = "dsh-learning/activity@1";
		const RESPONSE_PROTOCOL = "dsh-learning/response@1";
		const TRANSPORT_PROTOCOL = "dsh-learning/transport@1";
		const LEARNING_ACTIVITY_KINDS = [
			"parameter_explorer",
			"process_stepper",
			"structure_compare"
		];
		const MAX_ACTIVITY_BYTES = 65536;
		const MAX_RESPONSE_BYTES = 32768;
		/** A stable, actionable protocol rejection surfaced to the tool call. */
		var LearningProtocolError = class extends Error {
			issues;
			code = "INVALID_LEARNING_ACTIVITY";
			constructor(issues) {
				super(`Invalid Learning Activity: ${issues.join("; ")}`);
				this.issues = issues;
				this.name = "LearningProtocolError";
			}
		};
		function record(value) {
			return typeof value === "object" && value !== null && !Array.isArray(value);
		}
		function onlyKeys(value, allowed, path, issues) {
			for (const key of Object.keys(value)) if (!allowed.includes(key)) issues.push(`${path}.${key} is not supported`);
		}
		function text(value, path, issues, max = 8e3) {
			if (typeof value !== "string" || value.trim() === "") {
				issues.push(`${path} must be a non-empty string`);
				return false;
			}
			if (value.length > max) issues.push(`${path} exceeds ${String(max)} characters`);
			return true;
		}
		function finite(value, path, issues) {
			if (typeof value !== "number" || !Number.isFinite(value)) {
				issues.push(`${path} must be a finite number`);
				return false;
			}
			return true;
		}
		function id(value, path, issues) {
			if (typeof value !== "string" || !/^[a-z][a-z0-9_-]{0,31}$/.test(value)) {
				issues.push(`${path} must match ^[a-z][a-z0-9_-]{0,31}$`);
				return false;
			}
			return true;
		}
		function uniqueIds(values, path, issues) {
			const seen = /* @__PURE__ */ new Set();
			for (const [index, value] of values.entries()) {
				if (typeof value.id !== "string") continue;
				if (seen.has(value.id)) issues.push(`${path}[${String(index)}].id duplicates ${value.id}`);
				seen.add(value.id);
			}
		}
		function jsonBytes(value) {
			try {
				return new TextEncoder().encode(JSON.stringify(value)).byteLength;
			} catch {
				return;
			}
		}
		function validateJson(value, path, issues) {
			const stack = [{
				value,
				path,
				depth: 0
			}];
			let nodes = 0;
			while (stack.length > 0) {
				const current = stack.pop();
				nodes += 1;
				if (nodes > 512) {
					issues.push(`${path} exceeds 512 JSON nodes`);
					return false;
				}
				if (current.depth > 12) {
					issues.push(`${current.path} exceeds JSON depth 12`);
					return false;
				}
				const item = current.value;
				if (item === null || typeof item === "string" || typeof item === "boolean") continue;
				if (typeof item === "number") {
					if (!Number.isFinite(item)) issues.push(`${current.path} must contain finite numbers`);
					continue;
				}
				if (Array.isArray(item)) {
					for (let index = item.length - 1; index >= 0; index -= 1) stack.push({
						value: item[index],
						path: `${current.path}[${String(index)}]`,
						depth: current.depth + 1
					});
					continue;
				}
				if (record(item)) {
					for (const [key, child] of Object.entries(item)) stack.push({
						value: child,
						path: `${current.path}.${key}`,
						depth: current.depth + 1
					});
					continue;
				}
				issues.push(`${current.path} must be lossless JSON`);
			}
			return issues.length === 0;
		}
		function validateMath(value, parameterIds, path, issues) {
			const binary = /* @__PURE__ */ new Set([
				"add",
				"sub",
				"mul",
				"div",
				"pow"
			]);
			const unary = /* @__PURE__ */ new Set([
				"neg",
				"abs",
				"sqrt",
				"sin",
				"cos",
				"exp",
				"log"
			]);
			const stack = [{
				value,
				path,
				depth: 1
			}];
			let nodes = 0;
			while (stack.length > 0) {
				const node = stack.pop();
				nodes += 1;
				if (nodes > 64) {
					issues.push(`${path} exceeds ${String(64)} AST nodes`);
					return;
				}
				if (node.depth > 8) {
					issues.push(`${node.path} exceeds AST depth ${String(8)}`);
					return;
				}
				if (!record(node.value) || typeof node.value.op !== "string") {
					issues.push(`${node.path} must be a mathematical AST node`);
					continue;
				}
				const expression = node.value;
				const op = expression.op;
				if (op === "constant") {
					onlyKeys(expression, ["op", "value"], node.path, issues);
					if (finite(expression.value, `${node.path}.value`, issues) && Math.abs(expression.value) > 0xe8d4a51000) issues.push(`${node.path}.value exceeds the numeric limit`);
				} else if (op === "variable") {
					onlyKeys(expression, ["op", "name"], node.path, issues);
					if (typeof expression.name !== "string" || expression.name !== "x" && !parameterIds.has(expression.name)) issues.push(`${node.path}.name must be x or a declared parameter id`);
				} else if (binary.has(op)) {
					onlyKeys(expression, [
						"op",
						"left",
						"right"
					], node.path, issues);
					stack.push({
						value: expression.right,
						path: `${node.path}.right`,
						depth: node.depth + 1
					}, {
						value: expression.left,
						path: `${node.path}.left`,
						depth: node.depth + 1
					});
				} else if (unary.has(op)) {
					onlyKeys(expression, ["op", "value"], node.path, issues);
					stack.push({
						value: expression.value,
						path: `${node.path}.value`,
						depth: node.depth + 1
					});
				} else issues.push(`${node.path}.op is unknown`);
			}
		}
		function validateParameterExplorer(payload, issues) {
			if (!record(payload)) {
				issues.push("activity.payload must be an object");
				return;
			}
			onlyKeys(payload, [
				"parameters",
				"xAxis",
				"curves",
				"question"
			], "activity.payload", issues);
			if (!Array.isArray(payload.parameters) || payload.parameters.length < 1 || payload.parameters.length > 2) {
				issues.push("activity.payload.parameters must contain 1 or 2 parameters");
				return;
			}
			const parameters = payload.parameters.filter(record);
			if (parameters.length !== payload.parameters.length) issues.push("activity.payload.parameters entries must be objects");
			uniqueIds(parameters, "activity.payload.parameters", issues);
			for (const [index, parameter] of parameters.entries()) {
				const path = `activity.payload.parameters[${String(index)}]`;
				onlyKeys(parameter, [
					"id",
					"label",
					"min",
					"max",
					"step",
					"initial"
				], path, issues);
				id(parameter.id, `${path}.id`, issues);
				text(parameter.label, `${path}.label`, issues, 120);
				const min = parameter.min;
				const max = parameter.max;
				const step = parameter.step;
				const initial = parameter.initial;
				const minOk = finite(min, `${path}.min`, issues);
				const maxOk = finite(max, `${path}.max`, issues);
				const stepOk = finite(step, `${path}.step`, issues);
				const initialOk = finite(initial, `${path}.initial`, issues);
				if (minOk && maxOk && min >= max) issues.push(`${path}.min must be less than max`);
				if (stepOk && step <= 0) issues.push(`${path}.step must be positive`);
				if (minOk && maxOk && stepOk && step > max - min) issues.push(`${path}.step must not exceed the parameter range`);
				if (minOk && maxOk && initialOk && (initial < min || initial > max)) issues.push(`${path}.initial must be inside the parameter range`);
			}
			if (!record(payload.xAxis)) issues.push("activity.payload.xAxis must be an object");
			else {
				onlyKeys(payload.xAxis, [
					"label",
					"min",
					"max",
					"samples"
				], "activity.payload.xAxis", issues);
				if (payload.xAxis.label !== void 0) text(payload.xAxis.label, "activity.payload.xAxis.label", issues, 120);
				const xMin = payload.xAxis.min;
				const xMax = payload.xAxis.max;
				const samples = payload.xAxis.samples;
				const minOk = finite(xMin, "activity.payload.xAxis.min", issues);
				const maxOk = finite(xMax, "activity.payload.xAxis.max", issues);
				if (minOk && maxOk && xMin >= xMax) issues.push("activity.payload.xAxis.min must be less than max");
				if (samples !== void 0 && (typeof samples !== "number" || !Number.isInteger(samples) || samples < 16 || samples > 256)) issues.push("activity.payload.xAxis.samples must be an integer from 16 to 256");
			}
			if (!Array.isArray(payload.curves) || payload.curves.length < 1 || payload.curves.length > 3) issues.push("activity.payload.curves must contain 1 to 3 curves");
			else {
				const curves = payload.curves.filter(record);
				if (curves.length !== payload.curves.length) issues.push("activity.payload.curves entries must be objects");
				uniqueIds(curves, "activity.payload.curves", issues);
				const parameterIds = new Set(parameters.map((item) => typeof item.id === "string" ? item.id : ""));
				for (const [index, curve] of curves.entries()) {
					const path = `activity.payload.curves[${String(index)}]`;
					onlyKeys(curve, [
						"id",
						"label",
						"expression"
					], path, issues);
					id(curve.id, `${path}.id`, issues);
					text(curve.label, `${path}.label`, issues, 120);
					validateMath(curve.expression, parameterIds, `${path}.expression`, issues);
				}
			}
			if (payload.question !== void 0) text(payload.question, "activity.payload.question", issues, 2e3);
		}
		function validateProcessStepper(payload, issues) {
			if (!record(payload)) {
				issues.push("activity.payload must be an object");
				return;
			}
			onlyKeys(payload, ["steps", "question"], "activity.payload", issues);
			if (!Array.isArray(payload.steps) || payload.steps.length < 2 || payload.steps.length > 12) {
				issues.push("activity.payload.steps must contain 2 to 12 steps");
				return;
			}
			const steps = payload.steps.filter(record);
			if (steps.length !== payload.steps.length) issues.push("activity.payload.steps entries must be objects");
			uniqueIds(steps, "activity.payload.steps", issues);
			for (const [index, step] of steps.entries()) {
				const path = `activity.payload.steps[${String(index)}]`;
				onlyKeys(step, [
					"id",
					"title",
					"content",
					"checkpoint"
				], path, issues);
				id(step.id, `${path}.id`, issues);
				text(step.title, `${path}.title`, issues, 200);
				text(step.content, `${path}.content`, issues, 4e3);
				if (step.checkpoint !== void 0) {
					if (!record(step.checkpoint)) issues.push(`${path}.checkpoint must be an object`);
					else {
						onlyKeys(step.checkpoint, ["question", "options"], `${path}.checkpoint`, issues);
						text(step.checkpoint.question, `${path}.checkpoint.question`, issues, 2e3);
						if (step.checkpoint.options !== void 0) {
							if (!Array.isArray(step.checkpoint.options) || step.checkpoint.options.length < 2 || step.checkpoint.options.length > 6 || !step.checkpoint.options.every((option) => typeof option === "string" && option.trim() !== "")) issues.push(`${path}.checkpoint.options must contain 2 to 6 non-empty strings`);
						}
					}
				}
			}
			if (payload.question !== void 0) text(payload.question, "activity.payload.question", issues, 2e3);
		}
		function validateStructureSide(value, path, issues) {
			if (!record(value)) {
				issues.push(`${path} must be an object`);
				return [];
			}
			onlyKeys(value, ["title", "items"], path, issues);
			text(value.title, `${path}.title`, issues, 200);
			if (!Array.isArray(value.items) || value.items.length < 1 || value.items.length > 20) {
				issues.push(`${path}.items must contain 1 to 20 items`);
				return [];
			}
			const items = value.items.filter(record);
			if (items.length !== value.items.length) issues.push(`${path}.items entries must be objects`);
			uniqueIds(items, `${path}.items`, issues);
			for (const [index, item] of items.entries()) {
				const itemPath = `${path}.items[${String(index)}]`;
				onlyKeys(item, [
					"id",
					"label",
					"detail"
				], itemPath, issues);
				id(item.id, `${itemPath}.id`, issues);
				text(item.label, `${itemPath}.label`, issues, 500);
				if (item.detail !== void 0) text(item.detail, `${itemPath}.detail`, issues, 2e3);
			}
			return items;
		}
		function validateStructureCompare(payload, issues) {
			if (!record(payload)) {
				issues.push("activity.payload must be an object");
				return;
			}
			onlyKeys(payload, [
				"left",
				"right",
				"alignments",
				"question"
			], "activity.payload", issues);
			const left = validateStructureSide(payload.left, "activity.payload.left", issues);
			const right = validateStructureSide(payload.right, "activity.payload.right", issues);
			const leftIds = new Set(left.map((item) => typeof item.id === "string" ? item.id : ""));
			const rightIds = new Set(right.map((item) => typeof item.id === "string" ? item.id : ""));
			if (!Array.isArray(payload.alignments) || payload.alignments.length < 1 || payload.alignments.length > 24) issues.push("activity.payload.alignments must contain 1 to 24 rows");
			else {
				const alignments = payload.alignments.filter(record);
				if (alignments.length !== payload.alignments.length) issues.push("activity.payload.alignments entries must be objects");
				uniqueIds(alignments, "activity.payload.alignments", issues);
				for (const [index, alignment] of alignments.entries()) {
					const path = `activity.payload.alignments[${String(index)}]`;
					onlyKeys(alignment, [
						"id",
						"leftId",
						"rightId",
						"prompt"
					], path, issues);
					id(alignment.id, `${path}.id`, issues);
					if (alignment.leftId === void 0 && alignment.rightId === void 0) issues.push(`${path} must reference at least one side`);
					if (alignment.leftId !== void 0 && (typeof alignment.leftId !== "string" || !leftIds.has(alignment.leftId))) issues.push(`${path}.leftId must reference a left item`);
					if (alignment.rightId !== void 0 && (typeof alignment.rightId !== "string" || !rightIds.has(alignment.rightId))) issues.push(`${path}.rightId must reference a right item`);
					if (alignment.prompt !== void 0) text(alignment.prompt, `${path}.prompt`, issues, 1e3);
				}
			}
			if (payload.question !== void 0) text(payload.question, "activity.payload.question", issues, 2e3);
		}
		/** Validate and narrow an untrusted model-provided activity. */
		function parseLearningActivity(value) {
			const issues = [];
			const bytes = jsonBytes(value);
			if (bytes === void 0) issues.push("activity must be serializable JSON");
			else if (bytes > 65536) issues.push(`activity exceeds ${String(MAX_ACTIVITY_BYTES)} bytes`);
			if (!record(value)) throw new LearningProtocolError([...issues, "activity must be an object"]);
			onlyKeys(value, [
				"protocol",
				"kind",
				"title",
				"objective",
				"prompt",
				"scaffold",
				"payload",
				"fallbackMarkdown"
			], "activity", issues);
			if (value.protocol !== "dsh-learning/activity@1") issues.push(`activity.protocol must be ${ACTIVITY_PROTOCOL}`);
			if (!LEARNING_ACTIVITY_KINDS.includes(value.kind)) issues.push("activity.kind is unknown");
			text(value.title, "activity.title", issues, 200);
			text(value.objective, "activity.objective", issues, 1e3);
			text(value.prompt, "activity.prompt", issues, 2e3);
			if (value.scaffold !== void 0) text(value.scaffold, "activity.scaffold", issues, 4e3);
			text(value.fallbackMarkdown, "activity.fallbackMarkdown", issues, 16e3);
			if (value.kind === "parameter_explorer") validateParameterExplorer(value.payload, issues);
			else if (value.kind === "process_stepper") validateProcessStepper(value.payload, issues);
			else if (value.kind === "structure_compare") validateStructureCompare(value.payload, issues);
			if (issues.length > 0) throw new LearningProtocolError(issues);
			return value;
		}
		/** Validate and narrow a Client response before it returns to the model. */
		function parseLearningResponse(value, expectedActivityId) {
			const issues = [];
			const bytes = jsonBytes(value);
			if (bytes === void 0) issues.push("response must be serializable JSON");
			else if (bytes > 32768) issues.push(`response exceeds ${String(MAX_RESPONSE_BYTES)} bytes`);
			if (!record(value)) throw new LearningProtocolError([...issues, "response must be an object"]);
			onlyKeys(value, [
				"protocol",
				"activityId",
				"action",
				"answer",
				"interactionState"
			], "response", issues);
			if (value.protocol !== "dsh-learning/response@1") issues.push(`response.protocol must be ${RESPONSE_PROTOCOL}`);
			if (typeof value.activityId !== "string" || value.activityId === "") issues.push("response.activityId must be a non-empty string");
			if (expectedActivityId !== void 0 && value.activityId !== expectedActivityId) issues.push("response.activityId does not match the pending activity");
			if (value.action !== "submit" && value.action !== "skip" && value.action !== "cancel") issues.push("response.action is unknown");
			if (value.answer !== void 0) validateJson(value.answer, "response.answer", issues);
			if (value.interactionState !== void 0) validateJson(value.interactionState, "response.interactionState", issues);
			if (issues.length > 0) throw new LearningProtocolError(issues);
			return value;
		}
		//#endregion
		//#region src/transport.ts
		const MARKER_PREFIX = "<!--dsh-learning/transport@1:";
		const MARKER_SUFFIX = "-->";
		const QUESTION_ID_PREFIX = "dsh-learning/transport@1:";
		const BASE64URL = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
		function decodeBase64Url(value) {
			if (!/^[A-Za-z0-9_-]+$/.test(value) || value.length % 4 === 1) return void 0;
			const bytes = [];
			for (let index = 0; index < value.length; index += 4) {
				const a = BASE64URL.indexOf(value[index]);
				const b = BASE64URL.indexOf(value[index + 1]);
				const c = value[index + 2] === void 0 ? 0 : BASE64URL.indexOf(value[index + 2]);
				const d = value[index + 3] === void 0 ? 0 : BASE64URL.indexOf(value[index + 3]);
				if (a < 0 || b < 0 || c < 0 || d < 0) return void 0;
				const triple = a << 18 | b << 12 | c << 6 | d;
				bytes.push(triple >> 16 & 255);
				if (value[index + 2] !== void 0) bytes.push(triple >> 8 & 255);
				if (value[index + 3] !== void 0) bytes.push(triple & 255);
			}
			try {
				return new TextDecoder("utf-8", { fatal: true }).decode(new Uint8Array(bytes));
			} catch {
				return;
			}
		}
		function decodeEnvelope(value) {
			const json = decodeBase64Url(value);
			if (json === void 0) return void 0;
			try {
				const parsed = JSON.parse(json);
				if (parsed.transport !== "dsh-learning/transport@1" || typeof parsed.activityId !== "string" || parsed.activityId === "") return void 0;
				return {
					transport: TRANSPORT_PROTOCOL,
					activityId: parsed.activityId,
					activity: parseLearningActivity(parsed.activity)
				};
			} catch {
				return;
			}
		}
		/** Decode and revalidate a package-owned question id. */
		function decodeLearningQuestionId(value) {
			if (typeof value !== "string" || !value.startsWith(QUESTION_ID_PREFIX)) return void 0;
			return decodeEnvelope(value.slice(25));
		}
		/** Decode and revalidate a package-owned question detail; ordinary questions return undefined. */
		function decodeLearningDetail(detail) {
			if (typeof detail !== "string" || !detail.startsWith(MARKER_PREFIX)) return void 0;
			const end = detail.indexOf(MARKER_SUFFIX, 29);
			if (end < 0) return void 0;
			return decodeEnvelope(detail.slice(29, end));
		}
		//#endregion
		//#region \0dsh-css:C:\Users\Ryan\Desktop\deepseek-harness-portable\apps\interactive-learning\src\client\LearningActivity.module.css.mjs
		const css = "._7ar4Xq_inlineActivity{min-width:0;color:var(--dsw-alias-label-primary);flex-direction:column;gap:16px;font-size:16px;line-height:28px;display:flex}._7ar4Xq_scaffold{color:var(--dsw-alias-label-secondary);align-self:flex-start;font-size:13px;line-height:22px}._7ar4Xq_scaffold summary{cursor:pointer}._7ar4Xq_activityActions{align-items:center;gap:12px;margin-top:-6px;font-size:12px;line-height:20px;display:flex}._7ar4Xq_error{color:var(--dsw-alias-label-error);margin:0;font-size:13px;line-height:22px}._7ar4Xq_activityContent,._7ar4Xq_controls,._7ar4Xq_answerField,._7ar4Xq_stepFocus,._7ar4Xq_prediction{flex-direction:column;display:flex}._7ar4Xq_activityContent{gap:16px}._7ar4Xq_prompt{color:var(--dsw-alias-label-primary);margin:0;font-size:16px;font-weight:400;line-height:28px}._7ar4Xq_explorer{flex-direction:column;gap:16px;min-width:0;display:flex}._7ar4Xq_controls{grid-template-columns:repeat(auto-fit,minmax(min(280px,100%),1fr));gap:14px 24px;display:grid}._7ar4Xq_rangeField{min-width:0;color:var(--dsw-alias-label-secondary);font-size:13px}._7ar4Xq_rangeHeader{justify-content:space-between;align-items:baseline;gap:12px;margin-bottom:6px;display:flex}._7ar4Xq_rangeHeader label{color:var(--dsw-alias-label-primary);font-weight:500}._7ar4Xq_rangeHeader output{color:var(--dsw-alias-state-business-primary);font-variant-numeric:tabular-nums;font-size:14px;font-weight:650}._7ar4Xq_rangeControl{grid-template-rows:30px 16px;grid-template-columns:28px minmax(0,1fr) 28px;align-items:center;column-gap:9px;display:grid}._7ar4Xq_stepButton{appearance:none;border:1px solid var(--dsw-alias-border-l3);width:28px;height:28px;color:var(--dsw-alias-label-secondary);font:inherit;cursor:pointer;background:0 0;border-radius:7px;padding:0;font-size:17px;line-height:26px}._7ar4Xq_stepButton:hover:not(:disabled){border-color:var(--dsw-alias-state-business-primary);color:var(--dsw-alias-state-business-primary)}._7ar4Xq_stepButton:disabled{cursor:default;opacity:.35}._7ar4Xq_rangeInput{appearance:none;background:linear-gradient(to right, var(--dsw-alias-border-l4) 0 var(--range-low), var(--dsw-alias-state-business-primary) var(--range-low) var(--range-high), var(--dsw-alias-border-l4) var(--range-high) 100%);cursor:pointer;border-radius:999px;width:100%;height:4px}._7ar4Xq_rangeInput:disabled{cursor:default;opacity:.55}._7ar4Xq_rangeInput::-webkit-slider-runnable-track{background:0 0;border-radius:999px;height:4px}._7ar4Xq_rangeInput::-webkit-slider-thumb{appearance:none;border:3px solid var(--dsw-alias-bg-layer-1);background:var(--dsw-alias-state-business-primary);width:16px;height:16px;box-shadow:0 0 0 1px var(--dsw-alias-state-business-primary);border-radius:50%;margin-top:-6px}._7ar4Xq_rangeInput::-moz-range-track{background:0 0;border-radius:999px;height:4px}._7ar4Xq_rangeInput::-moz-range-thumb{border:3px solid var(--dsw-alias-bg-layer-1);background:var(--dsw-alias-state-business-primary);width:10px;height:10px;box-shadow:0 0 0 1px var(--dsw-alias-state-business-primary);border-radius:50%}._7ar4Xq_rangeInput:focus-visible,._7ar4Xq_compareRow input:focus-visible,._7ar4Xq_option input:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:4px}._7ar4Xq_rangeEnds{color:var(--dsw-alias-label-tertiary);font-variant-numeric:tabular-nums;grid-column:2;justify-content:space-between;font-size:11px;line-height:16px;display:flex;position:relative}._7ar4Xq_rangeZero{position:absolute;transform:translate(-50%)}._7ar4Xq_chartRegion{min-width:0}._7ar4Xq_chart{width:100%;height:auto;display:block;overflow:visible}._7ar4Xq_plotFrame{fill:var(--dsw-alias-bg-layer-1);stroke:var(--dsw-alias-border-l3);stroke-width:1px;vector-effect:non-scaling-stroke}._7ar4Xq_gridLine{stroke:var(--dsw-alias-border-l1);stroke-width:1px;vector-effect:non-scaling-stroke}._7ar4Xq_zeroAxis{stroke:var(--dsw-alias-border-l4);stroke-width:1.25px}._7ar4Xq_tickLabel{fill:var(--dsw-alias-label-tertiary);font-variant-numeric:tabular-nums;font-size:11px}._7ar4Xq_axisLabel{fill:var(--dsw-alias-label-secondary);font-size:12px;font-weight:500}._7ar4Xq_curve{fill:none;stroke:var(--dsw-alias-state-business-primary);stroke-width:3px;stroke-linecap:round;stroke-linejoin:round;vector-effect:non-scaling-stroke}._7ar4Xq_curve[data-curve=\"1\"]{stroke:var(--dsw-alias-state-success-primary);stroke-dasharray:9 5}._7ar4Xq_curve[data-curve=\"2\"]{stroke:var(--dsw-alias-state-warn-primary);stroke-dasharray:2 6}._7ar4Xq_legend{color:var(--dsw-alias-label-secondary);flex-wrap:wrap;gap:8px 14px;margin:0 0 5px 64px;padding:0;font-size:12px;list-style:none;display:flex}._7ar4Xq_legend li:before{content:\"\";border-top:3px solid var(--dsw-alias-state-business-primary);vertical-align:middle;width:18px;height:0;margin-right:5px;display:inline-block}._7ar4Xq_legend li[data-curve=\"1\"]:before{border-top-color:var(--dsw-alias-state-success-primary);border-top-style:dashed}._7ar4Xq_legend li[data-curve=\"2\"]:before{border-top-color:var(--dsw-alias-state-warn-primary);border-top-style:dotted}._7ar4Xq_answerField{color:var(--dsw-alias-label-secondary);gap:6px;font-size:13px}._7ar4Xq_answerField textarea{box-sizing:border-box;resize:vertical;border:0;border-bottom:1px solid var(--dsw-alias-border-l2);min-height:52px;color:var(--dsw-alias-label-primary);font:inherit;background:0 0;border-radius:0;padding:5px 0;line-height:1.5}._7ar4Xq_answerField textarea:focus-visible,._7ar4Xq_prediction textarea:focus-visible,._7ar4Xq_inlineActivity button:focus-visible,._7ar4Xq_inlineStatus:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}._7ar4Xq_primaryRow,._7ar4Xq_navigation{gap:8px;display:flex}._7ar4Xq_primaryRow{justify-content:flex-start}._7ar4Xq_navigation{justify-content:space-between}._7ar4Xq_primaryButton,._7ar4Xq_ghostButton,._7ar4Xq_revealButton,._7ar4Xq_textButton{appearance:none;font:inherit;cursor:pointer;border-radius:8px;padding:4px 10px;font-size:13px;line-height:20px}._7ar4Xq_primaryButton,._7ar4Xq_revealButton{border:1px solid var(--dsw-alias-brand-primary);background:var(--dsw-alias-brand-primary);color:var(--dsw-alias-label-on-primary,white)}._7ar4Xq_ghostButton{border:1px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-secondary);background:0 0}._7ar4Xq_textButton{color:var(--dsw-alias-brand-primary);background:0 0;border:0;border-radius:0;padding:2px 0}._7ar4Xq_primaryButton:disabled,._7ar4Xq_ghostButton:disabled,._7ar4Xq_revealButton:disabled,._7ar4Xq_textButton:disabled{cursor:default;opacity:.45}._7ar4Xq_stepMeta{color:var(--dsw-alias-label-tertiary);justify-content:space-between;align-items:center;font-size:12px;display:flex}._7ar4Xq_processMap{grid-template-columns:repeat(var(--process-step-count), minmax(0, 1fr));margin:0;padding:0;list-style:none;display:grid}._7ar4Xq_processStep{min-width:0;position:relative}._7ar4Xq_processStep:not(:last-child):after{z-index:0;background:var(--dsw-alias-border-l2);content:\"\";height:2px;position:absolute;top:13px;left:calc(50% + 16px);right:calc(16px - 50%)}._7ar4Xq_processStep[data-connector-complete]:after{background:var(--dsw-alias-state-business-primary)}._7ar4Xq_processStepButton{z-index:1;width:100%;min-width:0;color:var(--dsw-alias-label-tertiary);text-align:center;font:inherit;cursor:pointer;background:0 0;border:0;flex-direction:column;align-items:center;gap:6px;padding:0 4px;font-size:12px;line-height:18px;display:flex;position:relative}._7ar4Xq_processStepButton:disabled{cursor:default}._7ar4Xq_processNode{box-sizing:border-box;border:1px solid var(--dsw-alias-border-l4);background:var(--dsw-alias-bg-layer-1);width:28px;height:28px;color:var(--dsw-alias-label-tertiary);font-variant-numeric:tabular-nums;border-radius:50%;place-items:center;font-size:12px;line-height:1;display:grid}._7ar4Xq_processTitle{-webkit-line-clamp:2;-webkit-box-orient:vertical;min-width:0;display:-webkit-box;overflow:hidden}._7ar4Xq_processStep[data-state=current] ._7ar4Xq_processNode{border-color:var(--dsw-alias-state-business-primary);background:var(--dsw-alias-state-business-tertiary);color:var(--dsw-alias-state-business-primary)}._7ar4Xq_processStep[data-state=current] ._7ar4Xq_processTitle{color:var(--dsw-alias-label-primary);font-weight:500}._7ar4Xq_processStep[data-state=complete] ._7ar4Xq_processNode{border-color:var(--dsw-alias-state-business-primary);background:var(--dsw-alias-state-business-primary);color:var(--dsw-alias-label-primary-inverted)}._7ar4Xq_processStep[data-state=complete] ._7ar4Xq_processTitle{color:var(--dsw-alias-label-secondary)}._7ar4Xq_processMapVertical{grid-template-columns:1fr}._7ar4Xq_processMapVertical ._7ar4Xq_processStep:not(:last-child):after{width:2px;height:auto;inset:29px auto -1px 13px}._7ar4Xq_processMapVertical ._7ar4Xq_processStepButton{text-align:left;flex-direction:row;align-items:flex-start;gap:10px;padding:4px 0 10px}._7ar4Xq_processMapVertical ._7ar4Xq_processNode{flex:none}._7ar4Xq_processMapVertical ._7ar4Xq_processTitle{-webkit-line-clamp:3;padding-top:4px}._7ar4Xq_stepFocus{border-left:2px solid var(--dsw-alias-state-business-primary);gap:12px;padding-left:16px}._7ar4Xq_stepFocus h3,._7ar4Xq_prediction p{margin:0}._7ar4Xq_stepFocus h3{color:var(--dsw-alias-label-primary);font-size:16px;font-weight:500;line-height:24px}._7ar4Xq_stepFocus>._7ar4Xq_revealButton{align-self:flex-start}._7ar4Xq_prediction{border:0;gap:9px;margin:0;padding:0}._7ar4Xq_prediction legend{color:var(--dsw-alias-state-business-primary);margin-bottom:8px;font-size:12px;font-weight:500}._7ar4Xq_prediction textarea{box-sizing:border-box;resize:vertical;border:0;border-bottom:1px solid var(--dsw-alias-border-l2);min-height:52px;color:var(--dsw-alias-label-primary);font:inherit;background:0 0;padding:5px 0}._7ar4Xq_predictionOptions{grid-template-columns:repeat(auto-fit,minmax(min(180px,100%),1fr));gap:0 18px;display:grid}._7ar4Xq_option{border-bottom:1px solid var(--dsw-alias-border-l1);color:var(--dsw-alias-label-secondary);cursor:pointer;align-items:flex-start;gap:8px;padding:7px 0;display:flex}._7ar4Xq_option[data-selected]{color:var(--dsw-alias-label-primary)}._7ar4Xq_option input{accent-color:var(--dsw-alias-state-business-primary);margin-top:3px}._7ar4Xq_revealed{color:var(--dsw-alias-label-secondary);line-height:1.6}._7ar4Xq_compareHeader,._7ar4Xq_compareRow{grid-template-columns:minmax(0,1fr) minmax(16px,36px) 24px minmax(16px,36px) minmax(0,1fr);align-items:center;display:grid}._7ar4Xq_compareHeader{color:var(--dsw-alias-label-secondary);padding-bottom:4px;font-size:13px}._7ar4Xq_compareHeader strong{min-width:0;font-weight:500}._7ar4Xq_compareHeader strong[data-side=left]{text-align:right;grid-column:1}._7ar4Xq_compareHeader strong[data-side=right]{text-align:left;grid-column:5}._7ar4Xq_compareHeaderLink{color:var(--dsw-alias-label-tertiary);text-align:center;grid-column:3}._7ar4Xq_compareRows{min-width:0}._7ar4Xq_compareRow{cursor:pointer;background:0 0;min-width:0;padding:12px 0;position:relative}._7ar4Xq_compareRow+._7ar4Xq_compareRow{border-top:1px solid var(--dsw-alias-border-l2)}._7ar4Xq_compareLine{background:var(--dsw-alias-border-l3);height:1px}._7ar4Xq_compareRow[data-selected] ._7ar4Xq_compareLine{background:var(--dsw-alias-state-business-primary);height:2px}._7ar4Xq_compareSelector{place-items:center;display:grid}._7ar4Xq_compareSelector input{width:16px;height:16px;accent-color:var(--dsw-alias-state-business-primary);margin:0}._7ar4Xq_compareItem{min-width:0;color:var(--dsw-alias-label-primary);padding:0 5px;font-size:13px;line-height:1.5}._7ar4Xq_compareItem[data-side=left]{text-align:right}._7ar4Xq_compareItem[data-side=right]{text-align:left}._7ar4Xq_compareItem strong{font-weight:500}._7ar4Xq_compareRow[data-selected] ._7ar4Xq_compareItem strong{color:var(--dsw-alias-state-business-primary)}._7ar4Xq_compareItem p{color:var(--dsw-alias-label-tertiary);margin:4px 0 0}._7ar4Xq_emptyCell{color:var(--dsw-alias-label-tertiary);padding:0 5px}._7ar4Xq_emptyCell[data-side=left]{text-align:right}._7ar4Xq_emptyCell[data-side=right]{text-align:left}._7ar4Xq_rowPrompt{max-width:80%;color:var(--dsw-alias-label-tertiary);text-align:center;grid-column:1/6;justify-self:center;margin-top:6px;font-size:11px;line-height:17px}._7ar4Xq_inlineStatus{width:max-content;max-width:100%;color:var(--dsw-alias-label-tertiary);text-align:left;font:inherit;background:0 0;border:0;align-items:center;gap:8px;margin:0;padding:0;font-size:13px;line-height:22px;display:flex}._7ar4Xq_runningDot{background:var(--dsw-alias-brand-primary);border-radius:50%;flex:none;width:6px;height:6px;animation:1.2s ease-in-out infinite _7ar4Xq_pulse}._7ar4Xq_skeletonLine{background:var(--dsw-alias-border-l2);border-radius:999px;width:64px;height:6px;animation:1.2s ease-in-out infinite _7ar4Xq_skeletonPulse}._7ar4Xq_inlineResult{color:var(--dsw-alias-label-secondary);flex-wrap:wrap;align-items:baseline;gap:7px;margin:0;font-size:13px;line-height:22px;display:flex}._7ar4Xq_inlineFallback{flex-direction:column;gap:4px;display:flex}._7ar4Xq_fallbackText{color:var(--dsw-alias-label-secondary);font-size:13px;line-height:22px}._7ar4Xq_resultMark{color:var(--dsw-alias-label-success,var(--dsw-alias-brand-primary))}._7ar4Xq_resultEvidence{color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums}._7ar4Xq_resultAnswer{color:var(--dsw-alias-label-tertiary)}@keyframes _7ar4Xq_pulse{0%,to{opacity:.35;transform:scale(.8)}50%{opacity:1;transform:scale(1)}}@keyframes _7ar4Xq_skeletonPulse{0%,to{opacity:.35}50%{opacity:.75}}@media (width<=560px){._7ar4Xq_processMap{grid-template-columns:1fr}._7ar4Xq_processMap ._7ar4Xq_processStep:not(:last-child):after{width:2px;height:auto;inset:29px auto -1px 13px}._7ar4Xq_processMap ._7ar4Xq_processStepButton{text-align:left;flex-direction:row;align-items:flex-start;gap:10px;padding:4px 0 10px}._7ar4Xq_processMap ._7ar4Xq_processNode{flex:none}._7ar4Xq_processMap ._7ar4Xq_processTitle{-webkit-line-clamp:3;padding-top:4px}._7ar4Xq_compareHeader,._7ar4Xq_compareRow{grid-template-columns:minmax(0,1fr) 12px 22px 12px minmax(0,1fr)}._7ar4Xq_rowPrompt{max-width:100%}}@media (width<=420px){._7ar4Xq_legend{margin-left:56px}._7ar4Xq_stepFocus{padding-left:12px}}@media (prefers-reduced-motion:reduce){._7ar4Xq_runningDot,._7ar4Xq_skeletonLine{animation:none}}";
		const tagId = "@dsh-portable/interactive-learning/LearningActivity.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "@dsh-portable/interactive-learning";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		var LearningActivity_module_css_default = {
			"stepFocus": "_7ar4Xq_stepFocus",
			"curve": "_7ar4Xq_curve",
			"error": "_7ar4Xq_error",
			"runningDot": "_7ar4Xq_runningDot",
			"tickLabel": "_7ar4Xq_tickLabel",
			"answerField": "_7ar4Xq_answerField",
			"chart": "_7ar4Xq_chart",
			"rangeZero": "_7ar4Xq_rangeZero",
			"plotFrame": "_7ar4Xq_plotFrame",
			"compareLine": "_7ar4Xq_compareLine",
			"emptyCell": "_7ar4Xq_emptyCell",
			"resultAnswer": "_7ar4Xq_resultAnswer",
			"primaryButton": "_7ar4Xq_primaryButton",
			"textButton": "_7ar4Xq_textButton",
			"inlineFallback": "_7ar4Xq_inlineFallback",
			"resultEvidence": "_7ar4Xq_resultEvidence",
			"fallbackText": "_7ar4Xq_fallbackText",
			"resultMark": "_7ar4Xq_resultMark",
			"inlineResult": "_7ar4Xq_inlineResult",
			"ghostButton": "_7ar4Xq_ghostButton",
			"controls": "_7ar4Xq_controls",
			"compareRows": "_7ar4Xq_compareRows",
			"activityActions": "_7ar4Xq_activityActions",
			"pulse": "_7ar4Xq_pulse",
			"skeletonPulse": "_7ar4Xq_skeletonPulse",
			"option": "_7ar4Xq_option",
			"processNode": "_7ar4Xq_processNode",
			"zeroAxis": "_7ar4Xq_zeroAxis",
			"rangeControl": "_7ar4Xq_rangeControl",
			"compareHeaderLink": "_7ar4Xq_compareHeaderLink",
			"gridLine": "_7ar4Xq_gridLine",
			"chartRegion": "_7ar4Xq_chartRegion",
			"rangeEnds": "_7ar4Xq_rangeEnds",
			"processMap": "_7ar4Xq_processMap",
			"explorer": "_7ar4Xq_explorer",
			"processStepButton": "_7ar4Xq_processStepButton",
			"rowPrompt": "_7ar4Xq_rowPrompt",
			"axisLabel": "_7ar4Xq_axisLabel",
			"rangeHeader": "_7ar4Xq_rangeHeader",
			"activityContent": "_7ar4Xq_activityContent",
			"compareSelector": "_7ar4Xq_compareSelector",
			"compareItem": "_7ar4Xq_compareItem",
			"legend": "_7ar4Xq_legend",
			"navigation": "_7ar4Xq_navigation",
			"primaryRow": "_7ar4Xq_primaryRow",
			"compareRow": "_7ar4Xq_compareRow",
			"prediction": "_7ar4Xq_prediction",
			"revealed": "_7ar4Xq_revealed",
			"skeletonLine": "_7ar4Xq_skeletonLine",
			"inlineStatus": "_7ar4Xq_inlineStatus",
			"stepButton": "_7ar4Xq_stepButton",
			"stepMeta": "_7ar4Xq_stepMeta",
			"prompt": "_7ar4Xq_prompt",
			"processTitle": "_7ar4Xq_processTitle",
			"inlineActivity": "_7ar4Xq_inlineActivity",
			"predictionOptions": "_7ar4Xq_predictionOptions",
			"rangeField": "_7ar4Xq_rangeField",
			"scaffold": "_7ar4Xq_scaffold",
			"revealButton": "_7ar4Xq_revealButton",
			"rangeInput": "_7ar4Xq_rangeInput",
			"processStep": "_7ar4Xq_processStep",
			"compareHeader": "_7ar4Xq_compareHeader",
			"processMapVertical": "_7ar4Xq_processMapVertical"
		};
		//#endregion
		//#region src/client/ActivityFrame.tsx
		function ActivityFrame({ activityId, activity, busy, error, children, onSkip, onCancel, t }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
				className: LearningActivity_module_css_default.inlineActivity,
				"aria-label": activity.title,
				"data-learning-activity": activity.kind,
				"data-learning-activity-id": activityId,
				"data-learning-surface": "inline",
				children: [
					children,
					activity.scaffold === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("details", {
						className: LearningActivity_module_css_default.scaffold,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("summary", { children: t("scaffold") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.MarkdownText, { text: activity.scaffold })]
					}),
					error === null ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: LearningActivity_module_css_default.error,
						role: "alert",
						children: error
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: LearningActivity_module_css_default.activityActions,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							className: LearningActivity_module_css_default.textButton,
							type: "button",
							disabled: busy,
							onClick: onSkip,
							children: t("skip")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							className: LearningActivity_module_css_default.textButton,
							type: "button",
							disabled: busy,
							onClick: onCancel,
							children: t("cancel")
						})]
					})
				]
			});
		}
		//#endregion
		//#region src/math-expression.ts
		/**
		* Evaluate the protocol's closed mathematical AST. The protocol validator
		* bounds its depth and node count; this evaluator never executes source text.
		*/
		function evaluateMathExpression(expression, bindings) {
			switch (expression.op) {
				case "constant": return expression.value;
				case "variable": return bindings[expression.name] ?? NaN;
				case "add": return evaluateMathExpression(expression.left, bindings) + evaluateMathExpression(expression.right, bindings);
				case "sub": return evaluateMathExpression(expression.left, bindings) - evaluateMathExpression(expression.right, bindings);
				case "mul": return evaluateMathExpression(expression.left, bindings) * evaluateMathExpression(expression.right, bindings);
				case "div": return evaluateMathExpression(expression.left, bindings) / evaluateMathExpression(expression.right, bindings);
				case "pow": return evaluateMathExpression(expression.left, bindings) ** evaluateMathExpression(expression.right, bindings);
				case "neg": return -evaluateMathExpression(expression.value, bindings);
				case "abs": return Math.abs(evaluateMathExpression(expression.value, bindings));
				case "sqrt": return Math.sqrt(evaluateMathExpression(expression.value, bindings));
				case "sin": return Math.sin(evaluateMathExpression(expression.value, bindings));
				case "cos": return Math.cos(evaluateMathExpression(expression.value, bindings));
				case "exp": return Math.exp(evaluateMathExpression(expression.value, bindings));
				case "log": return Math.log(evaluateMathExpression(expression.value, bindings));
			}
		}
		//#endregion
		//#region src/client/ParameterExplorer.tsx
		const MAX_RENDERABLE_VALUE = 0xe8d4a51000;
		const MAX_PARAMETER_DOMAIN_SAMPLES = 33;
		function formatNumber(value) {
			return Number.isInteger(value) ? String(value) : String(Number(value.toPrecision(6)));
		}
		function uniqueNumbers(values) {
			return [...new Set(values.map((value) => Number(value.toPrecision(12))))];
		}
		function parameterCandidates(parameter) {
			const discreteSteps = Math.max(1, Math.ceil((parameter.max - parameter.min) / parameter.step));
			const sampleCount = Math.min(discreteSteps + 1, MAX_PARAMETER_DOMAIN_SAMPLES);
			return uniqueNumbers([
				...Array.from({ length: sampleCount }, (_, index) => {
					const stepIndex = sampleCount === 1 ? 0 : Math.round(index * discreteSteps / (sampleCount - 1));
					return Math.min(parameter.max, parameter.min + stepIndex * parameter.step);
				}),
				parameter.min,
				parameter.max,
				parameter.initial,
				...parameter.min <= 0 && parameter.max >= 0 ? [0] : []
			]);
		}
		function parameterStates(payload) {
			return payload.parameters.reduce((states, parameter) => {
				const candidates = parameterCandidates(parameter);
				return states.flatMap((state) => candidates.map((value) => ({
					...state,
					[parameter.id]: value
				})));
			}, [{}]);
		}
		function niceStep(rawStep) {
			if (!Number.isFinite(rawStep) || rawStep <= 0) return 1;
			const power = 10 ** Math.floor(Math.log10(rawStep));
			const normalized = rawStep / power;
			return (normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10) * power;
		}
		function paddedYDomain(min, max) {
			if (min === max) {
				const radius = Math.max(Math.abs(min) * .2, 1);
				return {
					min: min - radius,
					max: max + radius
				};
			}
			const span = max - min;
			const padding = span * .08;
			const step = niceStep((span + padding * 2) / 5);
			let domainMin = Math.floor((min - padding) / step) * step;
			let domainMax = Math.ceil((max + padding) / step) * step;
			if (domainMin === domainMax) {
				domainMin -= step;
				domainMax += step;
			}
			return {
				min: domainMin,
				max: domainMax
			};
		}
		function stableYDomain(payload) {
			const samples = Math.min(payload.xAxis.samples ?? 96, 96);
			let min = 0;
			let max = 0;
			let found = false;
			for (const values of parameterStates(payload)) for (let index = 0; index < samples; index += 1) {
				const x = payload.xAxis.min + (payload.xAxis.max - payload.xAxis.min) * index / (samples - 1);
				for (const curve of payload.curves) {
					const y = evaluateMathExpression(curve.expression, {
						...values,
						x
					});
					if (!Number.isFinite(y) || Math.abs(y) > MAX_RENDERABLE_VALUE) continue;
					min = found ? Math.min(min, y) : Math.min(0, y);
					max = found ? Math.max(max, y) : Math.max(0, y);
					found = true;
				}
			}
			if (!found) return {
				min: -1,
				max: 1
			};
			return paddedYDomain(min, max);
		}
		function yDomainForState(payload, values, stable) {
			const samples = payload.xAxis.samples ?? 96;
			let min = stable.min;
			let max = stable.max;
			let expanded = false;
			for (let index = 0; index < samples; index += 1) {
				const x = payload.xAxis.min + (payload.xAxis.max - payload.xAxis.min) * index / (samples - 1);
				for (const curve of payload.curves) {
					const y = evaluateMathExpression(curve.expression, {
						...values,
						x
					});
					if (!Number.isFinite(y) || Math.abs(y) > MAX_RENDERABLE_VALUE) continue;
					if (y < min) {
						min = y;
						expanded = true;
					}
					if (y > max) {
						max = y;
						expanded = true;
					}
				}
			}
			return expanded ? paddedYDomain(min, max) : stable;
		}
		function ticksFor(domain, targetCount = 5) {
			const step = niceStep((domain.max - domain.min) / targetCount);
			const first = Math.ceil(domain.min / step) * step;
			const ticks = [];
			for (let value = first; value <= domain.max + step * 1e-8; value += step) ticks.push(Number(value.toPrecision(12)));
			return ticks;
		}
		function chartGeometry(width) {
			const safeWidth = Math.max(280, Math.round(width));
			const height = safeWidth < 480 ? 260 : 300;
			const left = safeWidth < 360 ? 56 : 64;
			const right = 18;
			const top = 18;
			const bottom = 40;
			return {
				width: safeWidth,
				height,
				left,
				right,
				top,
				bottom,
				plotWidth: safeWidth - left - right,
				plotHeight: height - top - bottom
			};
		}
		function scaleX(value, domain, geometry) {
			return geometry.left + (value - domain.min) / (domain.max - domain.min) * geometry.plotWidth;
		}
		function scaleY(value, domain, geometry) {
			return geometry.top + (domain.max - value) / (domain.max - domain.min) * geometry.plotHeight;
		}
		function pathsFor(payload, values, yDomain, geometry) {
			const samples = payload.xAxis.samples ?? 96;
			const xDomain = {
				min: payload.xAxis.min,
				max: payload.xAxis.max
			};
			const series = payload.curves.map(() => []);
			for (let index = 0; index < samples; index += 1) {
				const x = payload.xAxis.min + (payload.xAxis.max - payload.xAxis.min) * index / (samples - 1);
				for (const [curveIndex, curve] of payload.curves.entries()) series[curveIndex]?.push({
					x,
					y: evaluateMathExpression(curve.expression, {
						...values,
						x
					})
				});
			}
			return series.map((points) => {
				let open = false;
				let previousY = null;
				return points.map((point) => {
					if (!Number.isFinite(point.y) || Math.abs(point.y) > MAX_RENDERABLE_VALUE) {
						open = false;
						previousY = null;
						return "";
					}
					const px = scaleX(point.x, xDomain, geometry);
					const py = scaleY(point.y, yDomain, geometry);
					if (previousY !== null && Math.abs(py - previousY) > geometry.plotHeight * 1.5) open = false;
					const command = open ? "L" : "M";
					open = true;
					previousY = py;
					return `${command}${px.toFixed(2)},${py.toFixed(2)}`;
				}).filter(Boolean).join(" ");
			});
		}
		function rangeStyle(parameter, value) {
			const span = parameter.max - parameter.min;
			const valuePercent = (value - parameter.min) / span * 100;
			const anchorPercent = ((parameter.min <= 0 && parameter.max >= 0 ? 0 : parameter.min) - parameter.min) / span * 100;
			return {
				"--range-low": `${Math.min(valuePercent, anchorPercent)}%`,
				"--range-high": `${Math.max(valuePercent, anchorPercent)}%`
			};
		}
		function shiftedValue(parameter, current, direction) {
			const shifted = current + parameter.step * direction;
			const clamped = Math.min(parameter.max, Math.max(parameter.min, shifted));
			return Number(clamped.toPrecision(12));
		}
		function ParameterExplorer({ activity, busy, onSubmit, t }) {
			const payload = activity.payload;
			const chartId = (0, react.useId)();
			const chartContainer = (0, react.useRef)(null);
			const [chartWidth, setChartWidth] = (0, react.useState)(640);
			const [values, setValues] = (0, react.useState)(() => Object.fromEntries(payload.parameters.map((parameter) => [parameter.id, parameter.initial])));
			const [answer, setAnswer] = (0, react.useState)("");
			const stableDomain = (0, react.useMemo)(() => stableYDomain(payload), [payload]);
			const yDomain = (0, react.useMemo)(() => yDomainForState(payload, values, stableDomain), [
				payload,
				stableDomain,
				values
			]);
			const geometry = (0, react.useMemo)(() => chartGeometry(chartWidth), [chartWidth]);
			const xDomain = (0, react.useMemo)(() => ({
				min: payload.xAxis.min,
				max: payload.xAxis.max
			}), [payload.xAxis.max, payload.xAxis.min]);
			const xTicks = (0, react.useMemo)(() => ticksFor(xDomain), [xDomain]);
			const yTicks = (0, react.useMemo)(() => ticksFor(yDomain), [yDomain]);
			const paths = (0, react.useMemo)(() => pathsFor(payload, values, yDomain, geometry), [
				geometry,
				payload,
				values,
				yDomain
			]);
			const chartDescription = t("chartDescription", {
				parameters: payload.parameters.map((parameter) => `${parameter.label} ${formatNumber(values[parameter.id] ?? parameter.initial)} (${formatNumber(parameter.min)}–${formatNumber(parameter.max)})`).join("; "),
				xAxis: `${payload.xAxis.label ?? "x"} ${formatNumber(xDomain.min)}–${formatNumber(xDomain.max)}`,
				yAxis: `y ${formatNumber(yDomain.min)}–${formatNumber(yDomain.max)}`,
				curves: payload.curves.map((curve) => curve.label).join("; ")
			});
			(0, react.useEffect)(() => {
				const container = chartContainer.current;
				if (!container) return;
				const updateWidth = (width) => {
					if (width >= 280) setChartWidth((current) => Math.abs(current - width) < 1 ? current : width);
				};
				updateWidth(container.getBoundingClientRect().width);
				if (typeof ResizeObserver === "undefined") return;
				const observer = new ResizeObserver((entries) => {
					const entry = entries[0];
					if (entry) updateWidth(entry.contentRect.width);
				});
				observer.observe(container);
				return () => observer.disconnect();
			}, []);
			const setParameter = (parameter, value) => {
				setValues((current) => ({
					...current,
					[parameter.id]: value
				}));
			};
			const submit = () => {
				const parameters = { ...values };
				onSubmit({
					answer: {
						parameters,
						explanation: answer.trim()
					},
					interactionState: { parameters }
				});
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: LearningActivity_module_css_default.activityContent,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: LearningActivity_module_css_default.prompt,
						children: payload.question ?? activity.prompt
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: LearningActivity_module_css_default.explorer,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: LearningActivity_module_css_default.controls,
							children: payload.parameters.map((parameter) => {
								const value = values[parameter.id] ?? parameter.initial;
								const inputId = `${chartId}-${parameter.id}`;
								const zeroPercent = (0 - parameter.min) / (parameter.max - parameter.min) * 100;
								return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: LearningActivity_module_css_default.rangeField,
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: LearningActivity_module_css_default.rangeHeader,
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", {
											htmlFor: inputId,
											children: parameter.label
										}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("output", {
											htmlFor: inputId,
											"aria-live": "polite",
											children: formatNumber(value)
										})]
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: LearningActivity_module_css_default.rangeControl,
										children: [
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
												className: LearningActivity_module_css_default.stepButton,
												type: "button",
												disabled: busy || value <= parameter.min,
												"aria-label": t("decreaseParameter", { label: parameter.label }),
												onClick: () => setParameter(parameter, shiftedValue(parameter, value, -1)),
												children: "−"
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
												id: inputId,
												className: LearningActivity_module_css_default.rangeInput,
												style: rangeStyle(parameter, value),
												type: "range",
												min: parameter.min,
												max: parameter.max,
												step: parameter.step,
												value,
												disabled: busy,
												"aria-valuetext": formatNumber(value),
												onChange: (event) => setParameter(parameter, Number(event.target.value))
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
												className: LearningActivity_module_css_default.stepButton,
												type: "button",
												disabled: busy || value >= parameter.max,
												"aria-label": t("increaseParameter", { label: parameter.label }),
												onClick: () => setParameter(parameter, shiftedValue(parameter, value, 1)),
												children: "+"
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
												className: LearningActivity_module_css_default.rangeEnds,
												"aria-hidden": "true",
												children: [
													/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: formatNumber(parameter.min) }),
													parameter.min < 0 && parameter.max > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
														className: LearningActivity_module_css_default.rangeZero,
														style: { left: `${zeroPercent}%` },
														children: "0"
													}) : null,
													/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: formatNumber(parameter.max) })
												]
											})
										]
									})]
								}, parameter.id);
							})
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: LearningActivity_module_css_default.chartRegion,
							ref: chartContainer,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("ul", {
								className: LearningActivity_module_css_default.legend,
								children: payload.curves.map((curve, index) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("li", {
									"data-curve": index,
									children: curve.label
								}, curve.id))
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("svg", {
								className: LearningActivity_module_css_default.chart,
								viewBox: `0 0 ${geometry.width} ${geometry.height}`,
								role: "img",
								"aria-labelledby": `${chartId}-title ${chartId}-description`,
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("title", {
										id: `${chartId}-title`,
										children: t("chartLabel")
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("desc", {
										id: `${chartId}-description`,
										children: chartDescription
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("defs", { children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("clipPath", {
										id: `${chartId}-clip`,
										children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("rect", {
											x: geometry.left,
											y: geometry.top,
											width: geometry.plotWidth,
											height: geometry.plotHeight
										})
									}) }),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("rect", {
										className: LearningActivity_module_css_default.plotFrame,
										x: geometry.left,
										y: geometry.top,
										width: geometry.plotWidth,
										height: geometry.plotHeight,
										rx: "6"
									}),
									yTicks.map((tick) => {
										const y = scaleY(tick, yDomain, geometry);
										return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("g", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("line", {
											className: tick === 0 ? `${LearningActivity_module_css_default.gridLine} ${LearningActivity_module_css_default.zeroAxis}` : LearningActivity_module_css_default.gridLine,
											x1: geometry.left,
											x2: geometry.left + geometry.plotWidth,
											y1: y,
											y2: y
										}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("text", {
											className: LearningActivity_module_css_default.tickLabel,
											x: geometry.left - 9,
											y,
											textAnchor: "end",
											dominantBaseline: "middle",
											children: formatNumber(tick)
										})] }, `y-${tick}`);
									}),
									xTicks.map((tick) => {
										const x = scaleX(tick, xDomain, geometry);
										return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("g", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("line", {
											className: tick === 0 ? `${LearningActivity_module_css_default.gridLine} ${LearningActivity_module_css_default.zeroAxis}` : LearningActivity_module_css_default.gridLine,
											x1: x,
											x2: x,
											y1: geometry.top,
											y2: geometry.top + geometry.plotHeight
										}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("text", {
											className: LearningActivity_module_css_default.tickLabel,
											x,
											y: geometry.top + geometry.plotHeight + 20,
											textAnchor: "middle",
											children: formatNumber(tick)
										})] }, `x-${tick}`);
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("text", {
										className: LearningActivity_module_css_default.axisLabel,
										"data-axis": "y",
										x: geometry.left,
										y: geometry.top - 7,
										textAnchor: "start",
										children: "y"
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("text", {
										className: LearningActivity_module_css_default.axisLabel,
										"data-axis": "x",
										x: geometry.left + geometry.plotWidth,
										y: geometry.height - 5,
										textAnchor: "end",
										children: payload.xAxis.label ?? "x"
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("g", {
										clipPath: `url(#${chartId}-clip)`,
										children: paths.map((path, index) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
											className: LearningActivity_module_css_default.curve,
											"data-curve": index,
											d: path
										}, payload.curves[index]?.id))
									})
								]
							})]
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
						className: LearningActivity_module_css_default.answerField,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("answer") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("textarea", {
							value: answer,
							disabled: busy,
							placeholder: t("answerPlaceholder"),
							onChange: (event) => setAnswer(event.target.value)
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: LearningActivity_module_css_default.primaryRow,
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							className: LearningActivity_module_css_default.primaryButton,
							type: "button",
							disabled: busy || answer.trim() === "",
							onClick: submit,
							children: busy ? t("submitting") : t("submit")
						})
					})
				]
			});
		}
		//#endregion
		//#region src/client/ProcessStepper.tsx
		function ProcessStepper({ activity, busy, onSubmit, t }) {
			const { steps } = activity.payload;
			const headingId = (0, react.useId)();
			const [index, setIndex] = (0, react.useState)(0);
			const [furthest, setFurthest] = (0, react.useState)(0);
			const [answers, setAnswers] = (0, react.useState)({});
			const [revealed, setRevealed] = (0, react.useState)(() => new Set(steps.filter((step) => step.checkpoint === void 0).map((step) => step.id)));
			const step = steps[index];
			const isRevealed = revealed.has(step.id);
			const prediction = answers[step.id] ?? "";
			const canReveal = step.checkpoint === void 0 || prediction.trim() !== "";
			const reveal = () => setRevealed((current) => /* @__PURE__ */ new Set([...current, step.id]));
			const restart = () => {
				setIndex(0);
				setFurthest(0);
				setAnswers({});
				setRevealed(new Set(steps.filter((item) => item.checkpoint === void 0).map((item) => item.id)));
			};
			const advance = () => {
				const next = Math.min(index + 1, steps.length - 1);
				setIndex(next);
				setFurthest((current) => Math.max(current, next));
			};
			const submit = () => {
				onSubmit({
					answer: { checkpoints: steps.filter((item) => item.checkpoint !== void 0).map((item) => ({
						stepId: item.id,
						answer: answers[item.id] ?? ""
					})) },
					interactionState: {
						currentStep: index,
						revealed: [...revealed]
					}
				});
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: LearningActivity_module_css_default.activityContent,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: LearningActivity_module_css_default.prompt,
						children: activity.payload.question ?? activity.prompt
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: LearningActivity_module_css_default.stepMeta,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("step", {
							current: index + 1,
							total: steps.length
						}) }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							className: LearningActivity_module_css_default.textButton,
							type: "button",
							disabled: busy,
							onClick: restart,
							children: t("restart")
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("ol", {
						className: `${LearningActivity_module_css_default.processMap} ${steps.length > 6 ? LearningActivity_module_css_default.processMapVertical : ""}`,
						style: { "--process-step-count": steps.length },
						"aria-label": t("processMap"),
						"data-process-map": "true",
						children: steps.map((item, itemIndex) => {
							const state = itemIndex === index ? "current" : itemIndex <= furthest ? "complete" : "upcoming";
							const connectorComplete = itemIndex < furthest || itemIndex === index && revealed.has(item.id);
							return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("li", {
								className: LearningActivity_module_css_default.processStep,
								"data-state": state,
								"data-connector-complete": connectorComplete || void 0,
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
									className: LearningActivity_module_css_default.processStepButton,
									type: "button",
									disabled: busy || itemIndex > furthest,
									"aria-current": itemIndex === index ? "step" : void 0,
									onClick: () => setIndex(itemIndex),
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: LearningActivity_module_css_default.processNode,
										"aria-hidden": "true",
										children: state === "complete" ? "✓" : itemIndex + 1
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: LearningActivity_module_css_default.processTitle,
										children: item.title
									})]
								})
							}, item.id);
						})
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
						className: LearningActivity_module_css_default.stepFocus,
						"aria-labelledby": headingId,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", {
								id: headingId,
								children: step.title
							}),
							step.checkpoint === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("fieldset", {
								className: LearningActivity_module_css_default.prediction,
								disabled: busy || isRevealed,
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("legend", { children: t("predict") }),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: step.checkpoint.question }),
									step.checkpoint.options === void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("textarea", {
										"aria-label": step.checkpoint.question,
										value: prediction,
										onChange: (event) => setAnswers((current) => ({
											...current,
											[step.id]: event.target.value
										}))
									}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
										className: LearningActivity_module_css_default.predictionOptions,
										children: step.checkpoint.options.map((option) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
											className: LearningActivity_module_css_default.option,
											"data-selected": prediction === option || void 0,
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
												type: "radio",
												name: `prediction-${step.id}`,
												value: option,
												checked: prediction === option,
												onChange: () => setAnswers((current) => ({
													...current,
													[step.id]: option
												}))
											}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: option })]
										}, option))
									})
								]
							}),
							!isRevealed ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								className: LearningActivity_module_css_default.revealButton,
								type: "button",
								disabled: busy || !canReveal,
								onClick: reveal,
								children: t("reveal")
							}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: LearningActivity_module_css_default.revealed,
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.MarkdownText, { text: step.content })
							})
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: LearningActivity_module_css_default.navigation,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							className: LearningActivity_module_css_default.ghostButton,
							type: "button",
							disabled: busy || index === 0,
							onClick: () => setIndex((current) => current - 1),
							children: t("previous")
						}), index < steps.length - 1 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							className: LearningActivity_module_css_default.primaryButton,
							type: "button",
							disabled: busy || !isRevealed,
							onClick: advance,
							children: t("next")
						}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							className: LearningActivity_module_css_default.primaryButton,
							type: "button",
							disabled: busy || !isRevealed,
							onClick: submit,
							children: busy ? t("submitting") : t("submit")
						})]
					})
				]
			});
		}
		//#endregion
		//#region src/client/StructureCompare.tsx
		function Item({ item, side }) {
			if (item === void 0) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
				className: LearningActivity_module_css_default.emptyCell,
				"data-side": side,
				children: "—"
			});
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: LearningActivity_module_css_default.compareItem,
				"data-side": side,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: item.label }), item.detail === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.MarkdownText, { text: item.detail })]
			});
		}
		function StructureCompare({ activity, busy, onSubmit, t }) {
			const payload = activity.payload;
			const [selected, setSelected] = (0, react.useState)(() => /* @__PURE__ */ new Set());
			const [answer, setAnswer] = (0, react.useState)("");
			const left = new Map(payload.left.items.map((item) => [item.id, item]));
			const right = new Map(payload.right.items.map((item) => [item.id, item]));
			const toggle = (id) => setSelected((current) => {
				const next = new Set(current);
				if (next.has(id)) next.delete(id);
				else next.add(id);
				return next;
			});
			const submit = () => {
				const selectedDifferences = [...selected];
				onSubmit({
					answer: {
						selectedDifferences,
						explanation: answer.trim()
					},
					interactionState: { selectedDifferences }
				});
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: LearningActivity_module_css_default.activityContent,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: LearningActivity_module_css_default.prompt,
						children: payload.question ?? activity.prompt
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: LearningActivity_module_css_default.compareHeader,
						"aria-hidden": "true",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", {
								"data-side": "left",
								children: payload.left.title
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: LearningActivity_module_css_default.compareHeaderLink,
								children: "↔"
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", {
								"data-side": "right",
								children: payload.right.title
							})
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: LearningActivity_module_css_default.compareRows,
						role: "group",
						"aria-label": t("compareMap"),
						"data-structure-map": "true",
						children: payload.alignments.map((alignment) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
							className: LearningActivity_module_css_default.compareRow,
							"data-alignment-id": alignment.id,
							"data-selected": selected.has(alignment.id) || void 0,
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Item, {
									item: alignment.leftId === void 0 ? void 0 : left.get(alignment.leftId),
									side: "left"
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: LearningActivity_module_css_default.compareLine,
									"aria-hidden": "true"
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: LearningActivity_module_css_default.compareSelector,
									children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
										type: "checkbox",
										checked: selected.has(alignment.id),
										disabled: busy,
										"aria-label": alignment.prompt ?? alignment.id,
										onChange: () => toggle(alignment.id)
									})
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: LearningActivity_module_css_default.compareLine,
									"aria-hidden": "true"
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Item, {
									item: alignment.rightId === void 0 ? void 0 : right.get(alignment.rightId),
									side: "right"
								}),
								alignment.prompt === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: LearningActivity_module_css_default.rowPrompt,
									children: alignment.prompt
								})
							]
						}, alignment.id))
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
						className: LearningActivity_module_css_default.answerField,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("answer") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("textarea", {
							value: answer,
							disabled: busy,
							placeholder: t("answerPlaceholder"),
							onChange: (event) => setAnswer(event.target.value)
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: LearningActivity_module_css_default.primaryRow,
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							className: LearningActivity_module_css_default.primaryButton,
							type: "button",
							disabled: busy || selected.size === 0 || answer.trim() === "",
							onClick: submit,
							children: busy ? t("submitting") : t("submit")
						})
					})
				]
			});
		}
		//#endregion
		//#region src/client/ActivityRenderer.tsx
		/**
		* Dispatch table for trusted, package-supplied React components. Extending the
		* protocol means registering another compiled component here, never accepting
		* model-provided HTML or JavaScript.
		*/
		var ActivityRendererRegistry = class {
			#renderers = /* @__PURE__ */ new Map();
			register(kind, renderer) {
				if (this.#renderers.has(kind)) throw new Error(`learning renderer already registered: ${kind}`);
				this.#renderers.set(kind, renderer);
				return () => {
					if (this.#renderers.get(kind) === renderer) this.#renderers.delete(kind);
				};
			}
			resolve(kind) {
				return this.#renderers.get(kind);
			}
			kinds() {
				return [...this.#renderers.keys()];
			}
		};
		const activityRendererRegistry = new ActivityRendererRegistry();
		activityRendererRegistry.register("parameter_explorer", ParameterExplorer);
		activityRendererRegistry.register("process_stepper", ProcessStepper);
		activityRendererRegistry.register("structure_compare", StructureCompare);
		function ActivityRenderer(props) {
			const Renderer = activityRendererRegistry.resolve(props.activity.kind);
			return Renderer === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Renderer, { ...props });
		}
		//#endregion
		//#region src/client/LearningComposer.tsx
		function envelopeOf(wait) {
			if (wait.payload.questions.length !== 1) return void 0;
			const question = wait.payload.questions[0];
			if (question === void 0) return void 0;
			return decodeLearningQuestionId(question.id) ?? decodeLearningDetail(question.detail);
		}
		/** Pure composer-chain selector: only package-owned question envelopes are claimed. */
		function selectLearningActivity({ interactions, session }) {
			const currentSessionId = session?.sessionId;
			for (const interaction of interactions) {
				if (interaction.kind !== "question") continue;
				const wait = interaction;
				if (currentSessionId === void 0 || String(wait.sessionId) !== String(currentSessionId)) continue;
				if (envelopeOf(wait) !== void 0) return wait;
			}
			return null;
		}
		function LearningComposer({ matched, t }) {
			return null;
		}
		function LearningInteraction({ matched, t }) {
			const envelope = (0, react.useMemo)(() => envelopeOf(matched), [matched]);
			const [busy, setBusy] = (0, react.useState)(false);
			const [error, setError] = (0, react.useState)(null);
			if (envelope === void 0) return null;
			const respond = (response) => {
				const question = matched.payload.questions[0];
				if (question === void 0) return;
				setBusy(true);
				setError(null);
				matched.respond({
					ok: true,
					value: {
						sessionId: matched.sessionId,
						answer: { answers: [{
							id: question.id,
							selected: [],
							custom: JSON.stringify(response)
						}] }
					}
				}).then((receipt) => {
					if (!receipt.accepted) throw new Error(receipt.reason);
				}).catch((cause) => {
					setBusy(false);
					setError(t("error", { message: cause instanceof Error ? cause.message : String(cause) }));
				});
			};
			const submit = ({ answer, interactionState }) => respond({
				protocol: RESPONSE_PROTOCOL,
				activityId: envelope.activityId,
				action: "submit",
				answer,
				interactionState
			});
			const skip = () => respond({
				protocol: RESPONSE_PROTOCOL,
				activityId: envelope.activityId,
				action: "skip"
			});
			const cancel = () => {
				setBusy(true);
				setError(null);
				matched.respond({
					ok: false,
					error: {
						code: "cancelled",
						message: "the learner cancelled this activity",
						details: {}
					}
				}).then((receipt) => {
					if (!receipt.accepted) throw new Error(receipt.reason);
				}).catch((cause) => {
					setBusy(false);
					setError(t("error", { message: cause instanceof Error ? cause.message : String(cause) }));
				});
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ActivityFrame, {
				activityId: envelope.activityId,
				activity: envelope.activity,
				busy,
				error,
				onSkip: skip,
				onCancel: cancel,
				t,
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ActivityRenderer, {
					activity: envelope.activity,
					busy,
					onSubmit: submit,
					t
				})
			}, matched.key);
		}
		//#endregion
		//#region src/client/LearningToolView.tsx
		function pendingActivity(interactions, sessionId, activity) {
			if (activity === void 0) return void 0;
			const canonical = JSON.stringify(activity);
			return interactions.find((interaction) => {
				if (interaction.kind !== "question" || String(interaction.sessionId) !== sessionId) return false;
				const envelope = envelopeOf(interaction);
				return envelope !== void 0 && JSON.stringify(envelope.activity) === canonical;
			});
		}
		function activityOf(block) {
			const raw = "kind" in block ? block.call?.argsRaw : block.argsRaw;
			if (raw === void 0 || raw === "") return void 0;
			try {
				return parseLearningActivity(JSON.parse(raw));
			} catch {
				return;
			}
		}
		function responseOf(block) {
			if (!("kind" in block)) return void 0;
			const text = block.content.filter((item) => item.type === "text").map((item) => item.text).join("");
			if (text === "") return void 0;
			try {
				return parseLearningResponse(JSON.parse(text));
			} catch {
				return;
			}
		}
		function explanationOf(response) {
			if (response?.action !== "submit" || typeof response.answer !== "object" || response.answer === null || Array.isArray(response.answer)) return void 0;
			const explanation = response.answer.explanation;
			return typeof explanation === "string" && explanation.trim() !== "" ? explanation.trim() : void 0;
		}
		function answerRecord(response) {
			if (response?.action !== "submit" || typeof response.answer !== "object" || response.answer === null || Array.isArray(response.answer)) return void 0;
			return response.answer;
		}
		function evidenceOf(activity, response, t) {
			const answer = answerRecord(response);
			if (answer === void 0) return void 0;
			if (activity.kind === "parameter_explorer") {
				const parameters = answer.parameters;
				if (typeof parameters !== "object" || parameters === null || Array.isArray(parameters)) return void 0;
				const values = activity.payload.parameters.flatMap((parameter) => {
					const value = parameters[parameter.id];
					return typeof value === "number" ? [t("rangeValue", {
						label: parameter.label,
						value
					})] : [];
				});
				return values.length === 0 ? void 0 : values.join(" · ");
			}
			if (activity.kind === "process_stepper") {
				const checkpoints = answer.checkpoints;
				return Array.isArray(checkpoints) && checkpoints.length > 0 ? t("processEvidence", { count: checkpoints.length }) : void 0;
			}
			const selected = answer.selectedDifferences;
			return Array.isArray(selected) ? t("structureEvidence", { count: selected.length }) : void 0;
		}
		function LearningToolView({ block, inspect, t, useSession, sessionId }) {
			const activity = activityOf(block);
			const done = "kind" in block;
			const response = responseOf(block);
			const matched = pendingActivity(useSession((snapshot) => snapshot.pending), String(sessionId), activity);
			if (activity === void 0) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
				className: LearningActivity_module_css_default.inlineStatus,
				"data-state": done ? "done" : "running",
				children: t("invalidActivity")
			});
			if (!done) {
				if (matched !== void 0) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(LearningInteraction, {
					matched,
					t
				});
				return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
					className: LearningActivity_module_css_default.inlineStatus,
					"data-state": "running",
					role: "status",
					"aria-live": "polite",
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: LearningActivity_module_css_default.runningDot,
							"aria-hidden": "true"
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("waiting") }),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: LearningActivity_module_css_default.skeletonLine,
							"aria-hidden": "true"
						})
					]
				});
			}
			if (response === void 0) return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: LearningActivity_module_css_default.inlineFallback,
				"data-learning-result": "unknown",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
					className: LearningActivity_module_css_default.inlineResult,
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: LearningActivity_module_css_default.resultMark,
						"aria-hidden": "true",
						children: "!"
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("invalidResult") })]
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: LearningActivity_module_css_default.fallbackText,
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.MarkdownText, { text: activity.fallbackMarkdown })
				})]
			});
			const status = response?.action === "submit" ? t("completed") : response?.action === "skip" ? t("skipped") : response?.action === "cancel" ? t("cancelled") : t("invalidResult");
			const evidence = evidenceOf(activity, response, t);
			const explanation = explanationOf(response);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
				className: LearningActivity_module_css_default.inlineResult,
				"data-learning-result": response?.action ?? "unknown",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: LearningActivity_module_css_default.resultMark,
						"aria-hidden": "true",
						children: "✓"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: status }),
					evidence === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: LearningActivity_module_css_default.resultEvidence,
						children: evidence
					}),
					explanation === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
						className: LearningActivity_module_css_default.resultAnswer,
						children: [
							"“",
							explanation,
							"”"
						]
					})
				]
			});
		}
		//#endregion
		//#region src/client/locales.ts
		const zh = {
			scaffold: "提示",
			submit: "提交回答",
			skip: "先跳过",
			cancel: "结束这里",
			submitting: "正在提交…",
			waiting: "准备交互内容…",
			completed: "已提交你的回答",
			skipped: "已跳过",
			cancelled: "已结束",
			noResponse: "未记录回答",
			invalidResult: "互动已结束，但结果无法恢复",
			processEvidence: "完成了 {count} 个检查点",
			structureEvidence: "选择了 {count} 项差异",
			answer: "你的解释",
			answerPlaceholder: "用一两句话解释你观察到的关系…",
			predict: "先预测",
			reveal: "揭示这一步",
			previous: "上一步",
			next: "下一步",
			restart: "重新开始",
			step: "第 {current} / {total} 步",
			processMap: "流程步骤",
			compareMap: "结构对应关系",
			rangeValue: "{label}：{value}",
			decreaseParameter: "减小{label}",
			increaseParameter: "增大{label}",
			chartLabel: "参数变化曲线",
			chartDescription: "参数：{parameters}。横轴：{xAxis}。纵轴：{yAxis}。曲线：{curves}。",
			invalidActivity: "该互动活动无法安全显示，已保留 Markdown 降级内容。",
			error: "提交失败：{message}"
		};
		const en = {
			scaffold: "Hint",
			submit: "Submit response",
			skip: "Skip for now",
			cancel: "End here",
			submitting: "Submitting…",
			waiting: "Preparing the interaction…",
			completed: "Response submitted",
			skipped: "Skipped",
			cancelled: "Ended",
			noResponse: "No response recorded",
			invalidResult: "The interaction ended, but its result could not be restored",
			processEvidence: "{count} checkpoints completed",
			structureEvidence: "{count} differences selected",
			answer: "Your explanation",
			answerPlaceholder: "Explain the relationship you noticed in one or two sentences…",
			predict: "Predict first",
			reveal: "Reveal this step",
			previous: "Previous",
			next: "Next",
			restart: "Restart",
			step: "Step {current} / {total}",
			processMap: "Process steps",
			compareMap: "Structural relationships",
			rangeValue: "{label}: {value}",
			decreaseParameter: "Decrease {label}",
			increaseParameter: "Increase {label}",
			chartLabel: "Parameter relationship chart",
			chartDescription: "Parameters: {parameters}. X axis: {xAxis}. Y axis: {yAxis}. Curves: {curves}.",
			invalidActivity: "This activity could not be displayed safely. Its Markdown fallback is preserved.",
			error: "Submission failed: {message}"
		};
		//#endregion
		//#region src/client/index.ts
		const NS = "interactive-learning";
		const name = "interactive-learning-client";
		const inject = ["slots", "locale"];
		function apply(ctx) {
			ctx.effect(() => ctx.locale.register(NS, {
				zh,
				en
			}), "interactive-learning: dictionaries");
			ctx.slots.inject("conversation.composer", () => ctx.slots.register({
				name: "conversation.composer",
				select: selectLearningActivity,
				priority: -100,
				locale: NS
			}, LearningComposer));
			ctx.slots.inject("tool.call.toolview", () => ctx.slots.register({
				name: "tool.call.toolview",
				key: "learning_activity",
				locale: NS
			}, LearningToolView));
		}
		//#endregion
		exports.ActivityRendererRegistry = ActivityRendererRegistry;
		exports.activityRendererRegistry = activityRendererRegistry;
		exports.apply = apply;
		exports.inject = inject;
		exports.name = name;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map