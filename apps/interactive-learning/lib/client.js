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
		/** Decode and revalidate a package-owned question detail; ordinary questions return undefined. */
		function decodeLearningDetail(detail) {
			if (typeof detail !== "string" || !detail.startsWith(MARKER_PREFIX)) return void 0;
			const end = detail.indexOf(MARKER_SUFFIX, 29);
			if (end < 0) return void 0;
			const json = decodeBase64Url(detail.slice(29, end));
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
		//#endregion
		//#region \0dsh-css:C:\Users\Ryan\Desktop\deepseek-harness-portable\apps\interactive-learning\src\client\LearningActivity.module.css.mjs
		const css = "._7ar4Xq_frame{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2);width:min(920px,100% - 24px);color:var(--dsw-alias-label-primary);box-shadow:var(--dsw-shadow-l2,0 8px 30px #00000014);border-radius:16px;margin:0 auto 12px;overflow:hidden}._7ar4Xq_header{border-bottom:1px solid var(--dsw-alias-border-l2);background:linear-gradient(135deg, var(--dsw-alias-bg-module-platform), transparent 70%);padding:18px 20px 14px}._7ar4Xq_eyebrow{color:var(--dsw-alias-brand-primary);letter-spacing:.08em;text-transform:uppercase;margin-bottom:5px;font-size:11px;font-weight:700;display:block}._7ar4Xq_title{margin:0;font-size:20px;line-height:1.35}._7ar4Xq_objective{color:var(--dsw-alias-label-secondary);gap:8px;margin-top:8px;font-size:13px;line-height:1.55;display:flex}._7ar4Xq_objective strong{color:var(--dsw-alias-label-primary);flex:none}._7ar4Xq_scaffold{color:var(--dsw-alias-label-secondary);margin-top:10px;font-size:13px}._7ar4Xq_scaffold summary,._7ar4Xq_replay summary{cursor:pointer}._7ar4Xq_body{padding:18px 20px}._7ar4Xq_footer{border-top:1px solid var(--dsw-alias-border-l2);align-items:center;gap:8px;padding:10px 20px 14px;display:flex}._7ar4Xq_footerSpacer{flex:1}._7ar4Xq_error{color:var(--dsw-alias-label-error);flex:1;margin:0;font-size:12px}._7ar4Xq_activityContent,._7ar4Xq_controls,._7ar4Xq_answerField,._7ar4Xq_stepCard,._7ar4Xq_prediction,._7ar4Xq_predictionGate{flex-direction:column;display:flex}._7ar4Xq_activityContent{gap:16px}._7ar4Xq_predictionGate{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);border-radius:12px;gap:10px;padding:14px}._7ar4Xq_predictionStatus{color:var(--dsw-alias-label-success,var(--dsw-alias-brand-primary));margin:0;font-size:12px}._7ar4Xq_prompt{color:var(--dsw-alias-label-primary);margin:0;font-size:15px;font-weight:550;line-height:1.55}._7ar4Xq_explorerGrid{grid-template-columns:minmax(190px,.75fr) minmax(320px,1.5fr);align-items:stretch;gap:18px;display:grid}._7ar4Xq_controls{justify-content:center;gap:16px}._7ar4Xq_rangeField{color:var(--dsw-alias-label-secondary);gap:6px;font-size:13px;display:grid}._7ar4Xq_rangeField input{width:100%;accent-color:var(--dsw-alias-brand-primary)}._7ar4Xq_rangeField input:focus-visible,._7ar4Xq_compareRow input:focus-visible,._7ar4Xq_option input:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}._7ar4Xq_rangeEnds{color:var(--dsw-alias-label-tertiary);justify-content:space-between;font-size:11px;display:flex}._7ar4Xq_chart{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);border-radius:12px;width:100%;min-height:220px}._7ar4Xq_axis{stroke:var(--dsw-alias-border-l1);stroke-width:1px}._7ar4Xq_curve{fill:none;stroke:var(--dsw-alias-brand-primary);stroke-width:3px;vector-effect:non-scaling-stroke}._7ar4Xq_curve[data-curve=\"1\"]{stroke:var(--dsw-alias-label-success,var(--dsw-alias-label-secondary))}._7ar4Xq_curve[data-curve=\"2\"]{stroke:var(--dsw-alias-label-warning,var(--dsw-alias-label-tertiary))}._7ar4Xq_legend{color:var(--dsw-alias-label-secondary);flex-wrap:wrap;gap:8px 14px;margin:0;padding:0;font-size:12px;list-style:none;display:flex}._7ar4Xq_legend li:before{content:\"\";background:var(--dsw-alias-brand-primary);border-radius:50%;width:9px;height:9px;margin-right:5px;display:inline-block}._7ar4Xq_answerField{color:var(--dsw-alias-label-secondary);gap:6px;font-size:13px}._7ar4Xq_answerField textarea,._7ar4Xq_prediction textarea{box-sizing:border-box;resize:vertical;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);min-height:76px;color:var(--dsw-alias-label-primary);font:inherit;border-radius:10px;padding:9px 11px;line-height:1.5}._7ar4Xq_answerField textarea:focus-visible,._7ar4Xq_prediction textarea:focus-visible,._7ar4Xq_frame button:focus-visible,._7ar4Xq_toolRow:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}._7ar4Xq_primaryRow,._7ar4Xq_navigation{justify-content:flex-end;gap:8px;display:flex}._7ar4Xq_primaryButton,._7ar4Xq_ghostButton,._7ar4Xq_revealButton,._7ar4Xq_textButton{appearance:none;font:inherit;cursor:pointer;border-radius:9px;padding:7px 13px;font-size:13px}._7ar4Xq_primaryButton,._7ar4Xq_revealButton{border:1px solid var(--dsw-alias-brand-primary);background:var(--dsw-alias-brand-primary);color:var(--dsw-alias-label-on-primary,white)}._7ar4Xq_ghostButton{border:1px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-secondary);background:0 0}._7ar4Xq_textButton{color:var(--dsw-alias-brand-primary);background:0 0;border:0}._7ar4Xq_primaryButton:disabled,._7ar4Xq_ghostButton:disabled,._7ar4Xq_revealButton:disabled,._7ar4Xq_textButton:disabled{cursor:default;opacity:.45}._7ar4Xq_stepMeta{color:var(--dsw-alias-label-tertiary);justify-content:space-between;align-items:center;font-size:12px;display:flex}._7ar4Xq_progress{gap:6px;margin:0;padding:0;list-style:none;display:flex}._7ar4Xq_progress li{background:var(--dsw-alias-border-l1);border-radius:999px;flex:1;height:4px}._7ar4Xq_progress li[data-active],._7ar4Xq_progress li[data-done]{background:var(--dsw-alias-brand-primary)}._7ar4Xq_stepCard{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);border-radius:12px;gap:14px;min-height:180px;padding:16px}._7ar4Xq_stepCard h3,._7ar4Xq_prediction p{margin:0}._7ar4Xq_prediction{border:0;gap:9px;margin:0;padding:0}._7ar4Xq_prediction legend{color:var(--dsw-alias-brand-primary);margin-bottom:8px;font-size:12px;font-weight:700}._7ar4Xq_option{border:1px solid var(--dsw-alias-border-l2);cursor:pointer;border-radius:9px;align-items:flex-start;gap:8px;padding:8px 10px;display:flex}._7ar4Xq_option input{accent-color:var(--dsw-alias-brand-primary);margin-top:3px}._7ar4Xq_revealed{color:var(--dsw-alias-label-secondary);line-height:1.6}._7ar4Xq_compareHeader,._7ar4Xq_compareRow{grid-template-columns:28px minmax(0,1fr) minmax(0,1fr);gap:10px;display:grid}._7ar4Xq_compareHeader{color:var(--dsw-alias-label-secondary);padding:0 10px;font-size:13px}._7ar4Xq_compareRows{border:1px solid var(--dsw-alias-border-l2);border-radius:12px;overflow:hidden}._7ar4Xq_compareRow{background:var(--dsw-alias-bg-layer-3);cursor:pointer;align-items:stretch;padding:10px;position:relative}._7ar4Xq_compareRow+._7ar4Xq_compareRow{border-top:1px solid var(--dsw-alias-border-l2)}._7ar4Xq_compareRow>input{accent-color:var(--dsw-alias-brand-primary);margin:7px 0 0}._7ar4Xq_compareItem{background:var(--dsw-alias-bg-layer-2);border-radius:8px;min-width:0;padding:7px 9px;font-size:13px;line-height:1.5}._7ar4Xq_compareItem p{color:var(--dsw-alias-label-tertiary);margin:4px 0 0}._7ar4Xq_emptyCell{color:var(--dsw-alias-label-tertiary);padding:7px 9px}._7ar4Xq_rowPrompt{color:var(--dsw-alias-label-tertiary);grid-column:2/4;font-size:11px}._7ar4Xq_toolRow{box-sizing:border-box;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);width:100%;color:var(--dsw-alias-label-primary);text-align:left;font:inherit;border-radius:10px;justify-content:space-between;align-items:center;gap:10px;padding:9px 11px;display:flex}button._7ar4Xq_toolRow{cursor:pointer}._7ar4Xq_toolRow>span:first-child,._7ar4Xq_replay summary>span{flex-direction:column;gap:2px;min-width:0;display:flex}._7ar4Xq_toolRow small,._7ar4Xq_replay small{color:var(--dsw-alias-label-tertiary);font-size:11px}._7ar4Xq_runningDot{background:var(--dsw-alias-brand-primary);border-radius:50%;flex:none;width:8px;height:8px;animation:1.2s ease-in-out infinite _7ar4Xq_pulse}._7ar4Xq_replay{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);border-radius:10px}._7ar4Xq_replay>summary{padding:9px 11px;list-style-position:inside}._7ar4Xq_replayBody{color:var(--dsw-alias-label-secondary);gap:14px;padding:0 14px 14px;font-size:13px;display:grid}._7ar4Xq_replayOutline,._7ar4Xq_replayCompare{grid-template-columns:1fr 1fr;gap:12px;display:grid}._7ar4Xq_replaySteps{gap:10px;display:grid}._7ar4Xq_replayCompare section{border:1px solid var(--dsw-alias-border-l2);border-radius:8px;padding:9px}._7ar4Xq_response{min-width:0}._7ar4Xq_response pre{background:var(--dsw-alias-bg-layer-2);white-space:pre-wrap;word-break:break-word;border-radius:8px;max-height:220px;padding:9px;overflow:auto}@keyframes _7ar4Xq_pulse{0%,to{opacity:.35;transform:scale(.8)}50%{opacity:1;transform:scale(1)}}@media (width<=720px){._7ar4Xq_explorerGrid{grid-template-columns:1fr}._7ar4Xq_frame{width:calc(100% - 16px)}._7ar4Xq_header,._7ar4Xq_body{padding-left:14px;padding-right:14px}._7ar4Xq_footer{flex-wrap:wrap;padding-left:14px;padding-right:14px}}@media (prefers-reduced-motion:reduce){._7ar4Xq_runningDot{animation:none}}";
		const tagId = "@dsh-portable/interactive-learning/LearningActivity.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "@dsh-portable/interactive-learning";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		var LearningActivity_module_css_default = {
			"toolRow": "_7ar4Xq_toolRow",
			"activityContent": "_7ar4Xq_activityContent",
			"revealButton": "_7ar4Xq_revealButton",
			"rangeField": "_7ar4Xq_rangeField",
			"body": "_7ar4Xq_body",
			"replayOutline": "_7ar4Xq_replayOutline",
			"revealed": "_7ar4Xq_revealed",
			"eyebrow": "_7ar4Xq_eyebrow",
			"replay": "_7ar4Xq_replay",
			"error": "_7ar4Xq_error",
			"controls": "_7ar4Xq_controls",
			"predictionStatus": "_7ar4Xq_predictionStatus",
			"primaryRow": "_7ar4Xq_primaryRow",
			"emptyCell": "_7ar4Xq_emptyCell",
			"rowPrompt": "_7ar4Xq_rowPrompt",
			"replayBody": "_7ar4Xq_replayBody",
			"scaffold": "_7ar4Xq_scaffold",
			"axis": "_7ar4Xq_axis",
			"replayCompare": "_7ar4Xq_replayCompare",
			"footerSpacer": "_7ar4Xq_footerSpacer",
			"stepMeta": "_7ar4Xq_stepMeta",
			"pulse": "_7ar4Xq_pulse",
			"chart": "_7ar4Xq_chart",
			"title": "_7ar4Xq_title",
			"footer": "_7ar4Xq_footer",
			"legend": "_7ar4Xq_legend",
			"rangeEnds": "_7ar4Xq_rangeEnds",
			"explorerGrid": "_7ar4Xq_explorerGrid",
			"ghostButton": "_7ar4Xq_ghostButton",
			"stepCard": "_7ar4Xq_stepCard",
			"compareHeader": "_7ar4Xq_compareHeader",
			"header": "_7ar4Xq_header",
			"predictionGate": "_7ar4Xq_predictionGate",
			"navigation": "_7ar4Xq_navigation",
			"answerField": "_7ar4Xq_answerField",
			"compareItem": "_7ar4Xq_compareItem",
			"textButton": "_7ar4Xq_textButton",
			"runningDot": "_7ar4Xq_runningDot",
			"objective": "_7ar4Xq_objective",
			"prediction": "_7ar4Xq_prediction",
			"compareRow": "_7ar4Xq_compareRow",
			"option": "_7ar4Xq_option",
			"primaryButton": "_7ar4Xq_primaryButton",
			"prompt": "_7ar4Xq_prompt",
			"response": "_7ar4Xq_response",
			"progress": "_7ar4Xq_progress",
			"frame": "_7ar4Xq_frame",
			"replaySteps": "_7ar4Xq_replaySteps",
			"compareRows": "_7ar4Xq_compareRows",
			"curve": "_7ar4Xq_curve"
		};
		//#endregion
		//#region src/client/ActivityFrame.tsx
		function ActivityFrame({ activity, busy, error, children, onSkip, onCancel, t }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
				className: LearningActivity_module_css_default.frame,
				"aria-labelledby": "learning-activity-title",
				"data-learning-activity": activity.kind,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("header", {
						className: LearningActivity_module_css_default.header,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: LearningActivity_module_css_default.eyebrow,
								children: t("activity")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h2", {
								id: "learning-activity-title",
								className: LearningActivity_module_css_default.title,
								children: activity.title
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: LearningActivity_module_css_default.objective,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: t("objective") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: activity.objective })]
							}),
							activity.scaffold === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("details", {
								className: LearningActivity_module_css_default.scaffold,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("summary", { children: t("scaffold") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.MarkdownText, { text: activity.scaffold })]
							})
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: LearningActivity_module_css_default.body,
						children
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("footer", {
						className: LearningActivity_module_css_default.footer,
						children: [
							error === null ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { className: LearningActivity_module_css_default.footerSpacer }) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: LearningActivity_module_css_default.error,
								role: "alert",
								children: error
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								className: LearningActivity_module_css_default.ghostButton,
								type: "button",
								disabled: busy,
								onClick: onCancel,
								children: t("cancel")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								className: LearningActivity_module_css_default.ghostButton,
								type: "button",
								disabled: busy,
								onClick: onSkip,
								children: t("skip")
							})
						]
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
		function formatNumber(value) {
			return Number.isInteger(value) ? String(value) : String(Number(value.toPrecision(6)));
		}
		function pathsFor(payload, values) {
			const samples = payload.xAxis.samples ?? 96;
			const series = payload.curves.map(() => []);
			const finiteY = [];
			for (let index = 0; index < samples; index += 1) {
				const x = payload.xAxis.min + (payload.xAxis.max - payload.xAxis.min) * index / (samples - 1);
				for (const [curveIndex, curve] of payload.curves.entries()) {
					const y = evaluateMathExpression(curve.expression, {
						...values,
						x
					});
					series[curveIndex]?.push({
						x,
						y
					});
					if (Number.isFinite(y) && Math.abs(y) <= 0xe8d4a51000) finiteY.push(y);
				}
			}
			if (finiteY.length === 0) return series.map(() => "");
			let minY = Math.min(...finiteY);
			let maxY = Math.max(...finiteY);
			if (minY === maxY) {
				minY -= 1;
				maxY += 1;
			}
			const width = 640;
			const height = 220;
			return series.map((points) => {
				let open = false;
				return points.map((point) => {
					if (!Number.isFinite(point.y) || Math.abs(point.y) > 0xe8d4a51000) {
						open = false;
						return "";
					}
					const px = (point.x - payload.xAxis.min) / (payload.xAxis.max - payload.xAxis.min) * width;
					const py = height - (point.y - minY) / (maxY - minY) * height;
					const command = open ? "L" : "M";
					open = true;
					return `${command}${px.toFixed(2)},${py.toFixed(2)}`;
				}).filter(Boolean).join(" ");
			});
		}
		function ParameterExplorer({ activity, busy, onSubmit, t }) {
			const payload = activity.payload;
			const [values, setValues] = (0, react.useState)(() => Object.fromEntries(payload.parameters.map((parameter) => [parameter.id, parameter.initial])));
			const [answer, setAnswer] = (0, react.useState)("");
			const [prediction, setPrediction] = (0, react.useState)("");
			const [predictionCommitted, setPredictionCommitted] = (0, react.useState)(false);
			const paths = (0, react.useMemo)(() => pathsFor(payload, values), [payload, values]);
			const submit = () => {
				const parameters = { ...values };
				onSubmit({
					answer: {
						prediction: prediction.trim(),
						parameters,
						explanation: answer.trim()
					},
					interactionState: {
						prediction: prediction.trim(),
						predictionCommitted,
						parameters
					}
				});
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: LearningActivity_module_css_default.activityContent,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: LearningActivity_module_css_default.prompt,
						children: payload.question ?? activity.prompt
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
						className: LearningActivity_module_css_default.predictionGate,
						"aria-labelledby": "parameter-prediction-title",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
							className: LearningActivity_module_css_default.answerField,
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", {
									id: "parameter-prediction-title",
									children: t("predict")
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("parameterPredictionPrompt") }),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("textarea", {
									value: prediction,
									disabled: busy || predictionCommitted,
									placeholder: t("parameterPredictionPlaceholder"),
									onChange: (event) => setPrediction(event.target.value)
								})
							]
						}), predictionCommitted ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: LearningActivity_module_css_default.predictionStatus,
							role: "status",
							children: t("predictionCommitted")
						}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: LearningActivity_module_css_default.primaryRow,
							children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								className: LearningActivity_module_css_default.primaryButton,
								type: "button",
								disabled: busy || prediction.trim() === "",
								onClick: () => setPredictionCommitted(true),
								children: t("commitPrediction")
							})
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: LearningActivity_module_css_default.explorerGrid,
						"aria-disabled": !predictionCommitted,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: LearningActivity_module_css_default.controls,
							children: [payload.parameters.map((parameter) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
								className: LearningActivity_module_css_default.rangeField,
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("rangeValue", {
										label: parameter.label,
										value: formatNumber(values[parameter.id] ?? parameter.initial)
									}) }),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
										type: "range",
										min: parameter.min,
										max: parameter.max,
										step: parameter.step,
										value: values[parameter.id] ?? parameter.initial,
										disabled: busy || !predictionCommitted,
										"aria-valuetext": formatNumber(values[parameter.id] ?? parameter.initial),
										onChange: (event) => setValues((current) => ({
											...current,
											[parameter.id]: Number(event.target.value)
										}))
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
										className: LearningActivity_module_css_default.rangeEnds,
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: formatNumber(parameter.min) }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: formatNumber(parameter.max) })]
									})
								]
							}, parameter.id)), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("ul", {
								className: LearningActivity_module_css_default.legend,
								children: payload.curves.map((curve, index) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("li", {
									"data-curve": index,
									children: curve.label
								}, curve.id))
							})]
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("svg", {
							className: LearningActivity_module_css_default.chart,
							viewBox: "0 0 640 220",
							role: "img",
							"aria-label": t("chartLabel"),
							"aria-hidden": !predictionCommitted,
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("line", {
									className: LearningActivity_module_css_default.axis,
									x1: "0",
									x2: "640",
									y1: "110",
									y2: "110"
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("line", {
									className: LearningActivity_module_css_default.axis,
									x1: "320",
									x2: "320",
									y1: "0",
									y2: "220"
								}),
								paths.map((path, index) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
									className: LearningActivity_module_css_default.curve,
									"data-curve": index,
									d: path
								}, payload.curves[index]?.id))
							]
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
						className: LearningActivity_module_css_default.answerField,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("answer") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("textarea", {
							value: answer,
							disabled: busy || !predictionCommitted,
							placeholder: t("answerPlaceholder"),
							onChange: (event) => setAnswer(event.target.value)
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: LearningActivity_module_css_default.primaryRow,
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							className: LearningActivity_module_css_default.primaryButton,
							type: "button",
							disabled: busy || !predictionCommitted || answer.trim() === "",
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
			const [index, setIndex] = (0, react.useState)(0);
			const [answers, setAnswers] = (0, react.useState)({});
			const [revealed, setRevealed] = (0, react.useState)(() => new Set(steps.filter((step) => step.checkpoint === void 0).map((step) => step.id)));
			const step = steps[index];
			const isRevealed = revealed.has(step.id);
			const prediction = answers[step.id] ?? "";
			const canReveal = step.checkpoint === void 0 || prediction.trim() !== "";
			const reveal = () => setRevealed((current) => /* @__PURE__ */ new Set([...current, step.id]));
			const restart = () => {
				setIndex(0);
				setAnswers({});
				setRevealed(new Set(steps.filter((item) => item.checkpoint === void 0).map((item) => item.id)));
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
						className: LearningActivity_module_css_default.progress,
						"aria-label": t("step", {
							current: index + 1,
							total: steps.length
						}),
						children: steps.map((item, itemIndex) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("li", {
							"data-active": itemIndex === index || void 0,
							"data-done": itemIndex < index || void 0
						}, item.id))
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
						className: LearningActivity_module_css_default.stepCard,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", { children: step.title }),
							step.checkpoint === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("fieldset", {
								className: LearningActivity_module_css_default.prediction,
								disabled: busy || isRevealed,
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("legend", { children: t("predict") }),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: step.checkpoint.question }),
									step.checkpoint.options === void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("textarea", {
										value: prediction,
										onChange: (event) => setAnswers((current) => ({
											...current,
											[step.id]: event.target.value
										}))
									}) : step.checkpoint.options.map((option) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
										className: LearningActivity_module_css_default.option,
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
							onClick: () => setIndex((current) => current + 1),
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
		function Item({ item }) {
			if (item === void 0) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
				className: LearningActivity_module_css_default.emptyCell,
				children: "—"
			});
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: LearningActivity_module_css_default.compareItem,
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
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: payload.left.title }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: payload.right.title })
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: LearningActivity_module_css_default.compareRows,
						children: payload.alignments.map((alignment) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
							className: LearningActivity_module_css_default.compareRow,
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
									type: "checkbox",
									checked: selected.has(alignment.id),
									disabled: busy,
									"aria-label": alignment.prompt ?? alignment.id,
									onChange: () => toggle(alignment.id)
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Item, { item: alignment.leftId === void 0 ? void 0 : left.get(alignment.leftId) }),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Item, { item: alignment.rightId === void 0 ? void 0 : right.get(alignment.rightId) }),
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
			const envelope = decodeLearningDetail(question?.detail);
			if (envelope === void 0 || question?.id !== `learning:${envelope.activityId}`) return void 0;
			return envelope;
		}
		/** Pure composer-chain selector: only package-owned question envelopes are claimed. */
		function selectLearningActivity({ interactions, session }) {
			const currentSessionId = session?.id;
			for (const interaction of interactions) {
				if (interaction.kind !== "question") continue;
				const wait = interaction;
				if (currentSessionId === void 0 || String(wait.sessionId) !== String(currentSessionId)) continue;
				if (envelopeOf(wait) !== void 0) return wait;
			}
			return null;
		}
		function LearningComposer({ matched, t }) {
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
		function ActivityOutline({ activity }) {
			switch (activity.kind) {
				case "parameter_explorer": return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: LearningActivity_module_css_default.replayOutline,
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("ul", { children: activity.payload.parameters.map((item) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("li", { children: [
						item.label,
						": ",
						item.min,
						"–",
						item.max
					] }, item.id)) }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("ul", { children: activity.payload.curves.map((item) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("li", { children: item.label }, item.id)) })]
				});
				case "process_stepper": return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("ol", {
					className: LearningActivity_module_css_default.replaySteps,
					children: activity.payload.steps.map((step) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("li", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: step.title }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.MarkdownText, { text: step.content })] }, step.id))
				});
				case "structure_compare": return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: LearningActivity_module_css_default.replayCompare,
					children: [activity.payload.left, activity.payload.right].map((side) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: side.title }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("ul", { children: side.items.map((item) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("li", { children: item.label }, item.id)) })] }, side.title))
				});
			}
		}
		function LearningToolView({ block, inspect, t }) {
			const activity = activityOf(block);
			const done = "kind" in block;
			const response = responseOf(block);
			if (activity === void 0) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: LearningActivity_module_css_default.toolRow,
				"data-state": done ? "done" : "running",
				children: t("invalidActivity")
			});
			if (!done) return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
				className: LearningActivity_module_css_default.toolRow,
				"data-state": "running",
				type: "button",
				onClick: inspect,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: activity.title }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("small", { children: t("waiting") })] }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: LearningActivity_module_css_default.runningDot,
					"aria-hidden": "true"
				})]
			});
			const status = response?.action === "submit" ? t("completed") : response?.action === "skip" ? t("skipped") : response?.action === "cancel" ? t("cancelled") : t("noResponse");
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("details", {
				className: LearningActivity_module_css_default.replay,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("summary", { children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: activity.title }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("small", { children: status })] }) }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: LearningActivity_module_css_default.replayBody,
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: activity.objective }),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)(ActivityOutline, { activity }),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("details", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("summary", { children: t("fallback") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.MarkdownText, { text: activity.fallbackMarkdown })] }),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
							className: LearningActivity_module_css_default.response,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: t("response") }), response === void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("noResponse") }) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("pre", { children: JSON.stringify(response, null, 2) })]
						})
					]
				})]
			});
		}
		//#endregion
		//#region src/client/locales.ts
		const zh = {
			activity: "互动学习活动",
			objective: "学习目标",
			scaffold: "提示",
			submit: "提交回答",
			skip: "跳过活动",
			cancel: "取消活动",
			submitting: "正在提交…",
			waiting: "等待你完成活动",
			completed: "已完成互动活动",
			skipped: "已跳过互动活动",
			cancelled: "已取消互动活动",
			answer: "你的解释",
			answerPlaceholder: "用一两句话解释你观察到的关系…",
			response: "学习者回应",
			selected: "已选择的关键差异",
			predict: "先预测",
			parameterPredictionPrompt: "在移动参数前，先写下你预计曲线会怎样变化。",
			parameterPredictionPlaceholder: "例如：参数变为负数时，曲线方向会反转。",
			commitPrediction: "锁定预测并开始探索",
			predictionCommitted: "预测已锁定。现在可以用键盘方向键或鼠标调整参数。",
			reveal: "揭示这一步",
			previous: "上一步",
			next: "下一步",
			restart: "重新开始",
			step: "第 {current} / {total} 步",
			rangeValue: "{label}：{value}",
			chartLabel: "参数变化曲线",
			invalidActivity: "该互动活动无法安全显示，已保留 Markdown 降级内容。",
			error: "提交失败：{message}",
			noResponse: "未记录结构化回应。",
			fallback: "Markdown 降级内容"
		};
		const en = {
			activity: "Interactive learning activity",
			objective: "Learning objective",
			scaffold: "Hint",
			submit: "Submit response",
			skip: "Skip activity",
			cancel: "Cancel activity",
			submitting: "Submitting…",
			waiting: "Waiting for you to complete the activity",
			completed: "Interactive activity completed",
			skipped: "Interactive activity skipped",
			cancelled: "Interactive activity cancelled",
			answer: "Your explanation",
			answerPlaceholder: "Explain the relationship you noticed in one or two sentences…",
			response: "Learner response",
			selected: "Selected key differences",
			predict: "Predict first",
			parameterPredictionPrompt: "Before moving a parameter, write down how you expect the curve to change.",
			parameterPredictionPlaceholder: "For example: a negative value will reverse the direction of the curve.",
			commitPrediction: "Lock prediction and explore",
			predictionCommitted: "Prediction locked. You can now adjust parameters with arrow keys or a pointer.",
			reveal: "Reveal this step",
			previous: "Previous",
			next: "Next",
			restart: "Restart",
			step: "Step {current} / {total}",
			rangeValue: "{label}: {value}",
			chartLabel: "Parameter relationship chart",
			invalidActivity: "This activity could not be displayed safely. Its Markdown fallback is preserved.",
			error: "Submission failed: {message}",
			noResponse: "No structured response was recorded.",
			fallback: "Markdown fallback"
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