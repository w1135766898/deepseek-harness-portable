import { c as RESPONSE_PROTOCOL, d as parseLearningResponse, l as TRANSPORT_PROTOCOL, u as parseLearningActivity } from "./protocol-D2kY57TF.js";
import { randomUUID } from "node:crypto";
import { Service } from "@deepseek-ai/cordis";
import { UserQuestionError } from "@deepseek-ai/dsh-user-questions";
//#region lib/types/transport.js
const MARKER_PREFIX = "<!--dsh-learning/transport@1:";
const MARKER_SUFFIX = "-->";
const BASE64URL = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
function encodeBase64Url(value) {
	const bytes = new TextEncoder().encode(value);
	let result = "";
	for (let index = 0; index < bytes.length; index += 3) {
		const a = bytes[index];
		const b = bytes[index + 1];
		const c = bytes[index + 2];
		const triple = a << 16 | (b ?? 0) << 8 | (c ?? 0);
		result += BASE64URL[triple >> 18 & 63];
		result += BASE64URL[triple >> 12 & 63];
		if (b !== void 0) result += BASE64URL[triple >> 6 & 63];
		if (c !== void 0) result += BASE64URL[triple & 63];
	}
	return result;
}
/** Hide the structured activity envelope in a Markdown comment before the readable fallback. */
function encodeLearningDetail(input) {
	const envelope = {
		transport: TRANSPORT_PROTOCOL,
		...input
	};
	return `${MARKER_PREFIX}${encodeBase64Url(JSON.stringify(envelope))}${MARKER_SUFFIX}\n${envelope.activity.fallbackMarkdown}`;
}
//#endregion
//#region lib/types/broker.js
const INTERACTIVE_LEARNING_PACKAGE = "@dsh-portable/interactive-learning";
const QUESTION_HEADER = "Interactive learning activity";
const QUESTION_ID_PREFIX = "learning:";
var LearningWaitAbort = class extends Error {
	reason;
	constructor(reason) {
		super(reason);
		this.reason = reason;
		this.name = "LearningWaitAbort";
	}
};
function fallback(activityId, activity, reason) {
	return {
		protocol: RESPONSE_PROTOCOL,
		activityId,
		action: "skip",
		interactionState: {
			reason,
			fallbackMarkdown: activity.fallbackMarkdown
		}
	};
}
function answerOf(answer, activityId, activity) {
	const custom = answer.answers[0]?.custom?.trim();
	if (custom === void 0 || custom === "") return fallback(activityId, activity, "user-skipped");
	try {
		const decoded = JSON.parse(custom);
		if (typeof decoded === "object" && decoded !== null && decoded.protocol === "dsh-learning/response@1") return parseLearningResponse(decoded, activityId);
	} catch {}
	return {
		protocol: RESPONSE_PROTOCOL,
		activityId,
		action: "submit",
		answer: { text: custom },
		interactionState: { renderer: "markdown-fallback" }
	};
}
/**
* Host-side interaction coordinator. It owns validation and activity identity,
* then reuses the pinned kernel's durable question wait for transport.
*/
var LearningActivityBroker = class extends Service {
	static inject = ["userQuestions"];
	pendingActivities = /* @__PURE__ */ new Map();
	constructor(ctx) {
		super(ctx, "learningActivities");
		ctx.effect(() => () => {
			for (const [controller, state] of this.pendingActivities) {
				state.reason = "plugin-disposed";
				controller.abort(new LearningWaitAbort(state.reason));
			}
			this.pendingActivities.clear();
		}, "interactive-learning: abort pending activities");
	}
	/** Diagnostics/test seam; no activity payloads or learner answers are exposed. */
	get pendingCount() {
		return this.pendingActivities.size;
	}
	/** Whether this Web composition advertises the matching Client bundle. */
	hasRichClient() {
		return this.ctx.get("clientModules")?.graph().entries.some((entry) => entry.id === INTERACTIVE_LEARNING_PACKAGE) === true;
	}
	async present(request) {
		const activity = parseLearningActivity(request.activity);
		const activityId = randomUUID();
		if (!this.hasRichClient()) return fallback(activityId, activity, "client-capability-unavailable");
		if (request.agent === void 0) return fallback(activityId, activity, "agent-context-unavailable");
		const timeoutMs = request.timeoutMs ?? 3e5;
		if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return fallback(activityId, activity, "client-response-timeout");
		const controller = new AbortController();
		const state = {};
		this.pendingActivities.set(controller, state);
		const abortFromSession = () => {
			state.reason = "session-aborted";
			controller.abort(new LearningWaitAbort(state.reason));
		};
		if (request.signal?.aborted === true) abortFromSession();
		else request.signal?.addEventListener("abort", abortFromSession, { once: true });
		const timer = setTimeout(() => {
			state.reason = "client-response-timeout";
			controller.abort(new LearningWaitAbort(state.reason));
		}, timeoutMs);
		timer.unref?.();
		try {
			const ask = this.ctx.userQuestions.ask({
				questions: [{
					id: `${QUESTION_ID_PREFIX}${activityId}`,
					header: QUESTION_HEADER,
					question: activity.prompt,
					detail: encodeLearningDetail({
						activityId,
						activity
					})
				}],
				agent: request.agent,
				signal: controller.signal
			});
			const aborted = new Promise((_resolve, reject) => {
				if (controller.signal.aborted) reject(controller.signal.reason);
				else controller.signal.addEventListener("abort", () => reject(controller.signal.reason), { once: true });
			});
			return answerOf(await Promise.race([ask, aborted]), activityId, activity);
		} catch (cause) {
			if (cause instanceof LearningWaitAbort) {
				if (cause.reason === "client-response-timeout") return fallback(activityId, activity, cause.reason);
				return {
					protocol: RESPONSE_PROTOCOL,
					activityId,
					action: "cancel",
					interactionState: { reason: cause.reason }
				};
			}
			const code = cause instanceof UserQuestionError ? cause.code : void 0;
			if (code === "ASK_CANCELLED") return {
				protocol: RESPONSE_PROTOCOL,
				activityId,
				action: "cancel",
				interactionState: { reason: "user-cancelled" }
			};
			if (code === "ASK_ABORTED") {
				const reason = state.reason ?? "session-aborted";
				if (reason === "client-response-timeout") return fallback(activityId, activity, reason);
				return {
					protocol: RESPONSE_PROTOCOL,
					activityId,
					action: "cancel",
					interactionState: { reason }
				};
			}
			if (code === "NO_PROVIDER" || code === "DELEGATED_CALLER" || code === "CALLER_NOT_LIVE") return fallback(activityId, activity, code.toLowerCase());
			throw cause;
		} finally {
			clearTimeout(timer);
			request.signal?.removeEventListener("abort", abortFromSession);
			this.pendingActivities.delete(controller);
		}
	}
};
//#endregion
export { LearningActivityBroker, LearningActivityBroker as default };
