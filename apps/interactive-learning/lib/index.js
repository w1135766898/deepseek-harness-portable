import { S as parseLearningActivityV2, a as LearningProtocolError, g as TRANSPORT_PROTOCOL_V2, m as RESPONSE_PROTOCOL_V2, p as RESPONSE_PROTOCOL, w as parseLearningResponseV2, x as parseLearningActivity } from "./protocol-Bo-NX8ZC.js";
import { randomUUID } from "node:crypto";
import { Service } from "@deepseek-ai/cordis";
import { UserQuestionError } from "@deepseek-ai/dsh-user-questions";
//#region lib/types/transport.js
const MARKER_SUFFIX = "-->";
const WAIT_MARKER_PREFIX = "<!--dsh-learning/wait@2:";
const WAIT_QUESTION_ID_PREFIX = "dsh-learning/wait@2:";
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
/** V2 ids contain only an opaque reference, never the phase payload. */
function learningWaitQuestionId(waitId) {
	if (!/^[A-Za-z0-9_-]{1,128}$/.test(waitId)) throw new Error("waitId must be a URL-safe opaque token");
	return `${WAIT_QUESTION_ID_PREFIX}${waitId}`;
}
/** Detail persists one safe current-phase projection for refresh recovery. */
function encodeLearningWaitDetail(input) {
	const envelope = {
		transport: TRANSPORT_PROTOCOL_V2,
		...input
	};
	const activity = parseLearningActivityV2(envelope.activity);
	if (activity.phase !== envelope.phase || activity.seq !== envelope.seq) throw new Error("wait projection phase/seq mismatch");
	if (activity.phase === "reveal" && (activity.lessonToken !== envelope.lessonToken || activity.roundToken !== envelope.roundToken)) throw new Error("wait projection token mismatch");
	if (activity.phase === "question" && activity.lessonToken !== void 0 && activity.lessonToken !== envelope.lessonToken) throw new Error("wait projection token mismatch");
	return `${WAIT_MARKER_PREFIX}${encodeBase64Url(JSON.stringify({
		...envelope,
		activity
	}))}${MARKER_SUFFIX}\n${activity.fallbackMarkdown}`;
}
//#endregion
//#region lib/types/broker.js
const INTERACTIVE_LEARNING_PACKAGE = "@dsh-portable/interactive-learning";
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
/** Host-side V2 Question/Reveal coordinator; V1 is replay-only. */
var LearningActivityBroker = class extends Service {
	static inject = ["userQuestions"];
	pendingActivities = /* @__PURE__ */ new Map();
	lessons = /* @__PURE__ */ new Map();
	receipts = /* @__PURE__ */ new Map();
	gateCalls = /* @__PURE__ */ new Map();
	observers = /* @__PURE__ */ new Set();
	constructor(ctx) {
		super(ctx, "learningActivities");
		ctx.effect(() => () => {
			for (const [controller, state] of this.pendingActivities) {
				state.reason = "plugin-disposed";
				controller.abort(new LearningWaitAbort(state.reason));
			}
			this.pendingActivities.clear();
			this.lessons.clear();
			this.receipts.clear();
			this.gateCalls.clear();
		}, "interactive-learning: abort pending activities");
	}
	/** Diagnostics/test seam; no activity payloads or learner answers are exposed. */
	get pendingCount() {
		return this.pendingActivities.size;
	}
	/** Subscribe to answer-free lifecycle metadata. */
	observe(listener) {
		this.observers.add(listener);
		return () => this.observers.delete(listener);
	}
	/** Answer-free ingress for stream/UI/kernel instrumentation outside this service. */
	reportLifecycle(event) {
		this.emit(event);
	}
	emit(event) {
		const observed = {
			...event,
			at: Date.now()
		};
		for (const listener of this.observers) try {
			listener(observed);
		} catch {}
	}
	/** Whether this Web composition advertises the matching Client bundle. */
	hasRichClient() {
		return this.ctx.get("clientModules")?.graph().entries.some((entry) => entry.id === INTERACTIVE_LEARNING_PACKAGE) === true;
	}
	async presentQuestion(request) {
		return this.presentGate(request);
	}
	async presentReveal(request) {
		return this.presentGate(request);
	}
	/** V2 live path: one call owns exactly one durable Question or Reveal wait. */
	async presentGate(request) {
		const callKey = request.callId === void 0 || request.agent === void 0 ? void 0 : `${String(request.agent.session.id)}:${request.callId}`;
		const prior = callKey === void 0 ? void 0 : this.gateCalls.get(callKey);
		if (prior !== void 0) return prior;
		const pending = this.presentGateOnce(request);
		if (callKey !== void 0) {
			this.gateCalls.set(callKey, pending);
			if (this.gateCalls.size > 1024) {
				const oldest = this.gateCalls.keys().next().value;
				if (oldest !== void 0) this.gateCalls.delete(oldest);
			}
		}
		try {
			return await pending;
		} catch (cause) {
			if (callKey !== void 0) this.gateCalls.delete(callKey);
			throw cause;
		}
	}
	async presentGateOnce(request) {
		const activity = parseLearningActivityV2(request.activity);
		const activityId = randomUUID();
		const waitId = randomUUID();
		const sessionId = request.agent === void 0 ? "" : String(request.agent.session.id);
		let lessonToken;
		let roundToken;
		let lesson;
		if (activity.phase === "question") {
			if (activity.lessonToken === void 0) {
				if (activity.seq !== 0) throw new LearningProtocolError(["a new lesson must start with activity.seq 0"]);
				for (const [tokenValue, active] of this.lessons) if (active.sessionId === sessionId) this.lessons.delete(tokenValue);
				lessonToken = randomUUID();
				roundToken = randomUUID();
				if (sessionId !== "") {
					lesson = {
						sessionId,
						lessonToken,
						roundToken,
						seq: activity.seq,
						status: "question-pending"
					};
					this.lessons.set(lessonToken, lesson);
				}
			} else {
				lessonToken = activity.lessonToken;
				lesson = this.lessons.get(lessonToken);
				if (lesson === void 0) throw new LearningProtocolError(["activity.lessonToken is not active"]);
				if (lesson.sessionId !== sessionId) throw new LearningProtocolError(["activity.lessonToken belongs to another session"]);
				if (lesson.status !== "ready-question") throw new LearningProtocolError(["the previous reveal must resolve before the next question"]);
				if (activity.seq !== lesson.seq + 1) throw new LearningProtocolError(["activity.seq must advance by exactly one"]);
				roundToken = randomUUID();
				lesson.seq = activity.seq;
				lesson.roundToken = roundToken;
				lesson.status = "question-pending";
			}
		} else {
			lessonToken = activity.lessonToken;
			roundToken = activity.roundToken;
			lesson = this.lessons.get(lessonToken);
			if (lesson === void 0) throw new LearningProtocolError(["activity.lessonToken is not active"]);
			if (lesson.sessionId !== sessionId) throw new LearningProtocolError(["activity.lessonToken belongs to another session"]);
			if (lesson.status !== "awaiting-reveal") throw new LearningProtocolError(["reveal is not valid in the current lesson state"]);
			if (lesson.seq !== activity.seq) throw new LearningProtocolError(["activity.seq does not match the answered question"]);
			if (lesson.roundToken !== roundToken) throw new LearningProtocolError(["activity.roundToken does not match the answered question"]);
			lesson.status = "reveal-pending";
		}
		const eventBase = {
			phase: activity.phase,
			activityId,
			lessonToken,
			roundToken,
			seq: activity.seq,
			...request.callId === void 0 ? {} : { callId: request.callId }
		};
		if (activity.phase === "reveal" || activity.lessonToken !== void 0) this.emit({
			name: "learning.model.next_step_started",
			...eventBase
		});
		this.emit({
			name: "learning.call.args_completed",
			...eventBase
		});
		this.emit({
			name: "learning.protocol.validated",
			...eventBase
		});
		const fallbackV2 = (reason, action = "skip") => activity.phase === "question" ? {
			protocol: RESPONSE_PROTOCOL_V2,
			phase: "question",
			activityId,
			lessonToken,
			roundToken,
			seq: activity.seq,
			action,
			receiptId: randomUUID(),
			interactionState: {
				reason,
				fallbackMarkdown: activity.fallbackMarkdown
			}
		} : {
			protocol: RESPONSE_PROTOCOL_V2,
			phase: "reveal",
			activityId,
			lessonToken,
			roundToken,
			seq: activity.seq,
			action,
			animation: { completed: false },
			receiptId: randomUUID(),
			interactionState: {
				reason,
				fallbackMarkdown: activity.fallbackMarkdown
			}
		};
		let result;
		if (!this.hasRichClient()) result = fallbackV2("client-capability-unavailable");
		else if (request.agent === void 0) result = fallbackV2("agent-context-unavailable");
		else {
			const timeoutMs = request.timeoutMs ?? 3e5;
			if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) result = fallbackV2("client-response-timeout");
			else try {
				result = await this.waitForV2({
					request,
					activity,
					activityId,
					waitId,
					lessonToken,
					roundToken,
					eventBase,
					timeoutMs
				});
			} catch (cause) {
				this.lessons.delete(lessonToken);
				throw cause;
			}
		}
		if (lesson !== void 0) {
			if (result.action === "cancel" || result.action === "skip") this.lessons.delete(lessonToken);
			else if (activity.phase === "question") lesson.status = "awaiting-reveal";
			else lesson.status = "ready-question";
		}
		this.emit({
			name: "learning.wait.resolved",
			...eventBase
		});
		return result;
	}
	async waitForV2(input) {
		const { request, activity, activityId, waitId, lessonToken, roundToken, eventBase, timeoutMs } = input;
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
		const fallbackV2 = (reason, action = "skip") => activity.phase === "question" ? {
			protocol: RESPONSE_PROTOCOL_V2,
			phase: "question",
			activityId,
			lessonToken,
			roundToken,
			seq: activity.seq,
			action,
			receiptId: randomUUID(),
			interactionState: {
				reason,
				fallbackMarkdown: activity.fallbackMarkdown
			}
		} : {
			protocol: RESPONSE_PROTOCOL_V2,
			phase: "reveal",
			activityId,
			lessonToken,
			roundToken,
			seq: activity.seq,
			action,
			animation: { completed: false },
			receiptId: randomUUID(),
			interactionState: {
				reason,
				fallbackMarkdown: activity.fallbackMarkdown
			}
		};
		try {
			const ask = this.ctx.userQuestions.ask({
				questions: [{
					id: learningWaitQuestionId(waitId),
					question: activity.phase === "question" ? activity.prompt : "Review this reveal, then continue.",
					detail: encodeLearningWaitDetail({
						waitId,
						activityId,
						lessonToken,
						roundToken,
						seq: activity.seq,
						phase: activity.phase,
						activity,
						...request.callId === void 0 ? {} : { callId: request.callId }
					})
				}],
				agent: request.agent,
				signal: controller.signal
			});
			this.emit({
				name: "learning.wait.registered",
				...eventBase
			});
			if (activity.phase === "reveal") this.emit({
				name: "learning.reveal.received",
				...eventBase
			});
			const aborted = new Promise((_resolve, reject) => {
				if (controller.signal.aborted) reject(controller.signal.reason);
				else controller.signal.addEventListener("abort", () => reject(controller.signal.reason), { once: true });
			});
			const custom = (await Promise.race([ask, aborted])).answers[0]?.custom?.trim();
			let response;
			if (custom === void 0 || custom === "") response = fallbackV2("user-skipped");
			else {
				let decoded;
				try {
					decoded = JSON.parse(custom);
				} catch {
					decoded = void 0;
				}
				if (typeof decoded === "object" && decoded !== null && decoded.protocol === "dsh-learning/response@2") response = parseLearningResponseV2(decoded, {
					activityId,
					phase: activity.phase,
					lessonToken,
					roundToken,
					seq: activity.seq
				});
				else if (activity.phase === "question") response = {
					protocol: RESPONSE_PROTOCOL_V2,
					phase: "question",
					activityId,
					lessonToken,
					roundToken,
					seq: activity.seq,
					action: "submit",
					answer: { text: custom },
					receiptId: randomUUID(),
					interactionState: { renderer: "markdown-fallback" }
				};
				else response = fallbackV2("rich-client-required");
			}
			const prior = this.receipts.get(response.receiptId);
			if (prior !== void 0) {
				if (JSON.stringify(prior) !== JSON.stringify(response)) throw new LearningProtocolError(["response.receiptId was reused for different content"]);
				response = prior;
			} else {
				this.receipts.set(response.receiptId, response);
				if (this.receipts.size > 1024) {
					const oldest = this.receipts.keys().next().value;
					if (oldest !== void 0) this.receipts.delete(oldest);
				}
			}
			if (activity.phase === "question" && response.action === "submit") this.emit({
				name: "learning.answer.accepted",
				...eventBase
			});
			else if (activity.phase === "reveal" && response.action === "continue") this.emit({
				name: "learning.continue.accepted",
				...eventBase
			});
			return response;
		} catch (cause) {
			if (cause instanceof LearningProtocolError) throw cause;
			if (cause instanceof LearningWaitAbort) return fallbackV2(cause.reason, cause.reason === "client-response-timeout" ? "skip" : "cancel");
			const code = cause instanceof UserQuestionError ? cause.code : void 0;
			if (code === "ASK_CANCELLED") return fallbackV2("user-cancelled", "cancel");
			if (code === "ASK_ABORTED") {
				const reason = state.reason ?? "session-aborted";
				return fallbackV2(reason, reason === "client-response-timeout" ? "skip" : "cancel");
			}
			if (code === "NO_PROVIDER" || code === "DELEGATED_CALLER" || code === "CALLER_NOT_LIVE") return fallbackV2(code.toLowerCase());
			throw cause;
		} finally {
			clearTimeout(timer);
			request.signal?.removeEventListener("abort", abortFromSession);
			this.pendingActivities.delete(controller);
		}
	}
	/** @deprecated V1 is accepted only for static legacy replay/fallback. */
	async present(request) {
		const activity = parseLearningActivity(request.activity);
		return fallback(randomUUID(), activity, "legacy-replay-only");
	}
};
//#endregion
export { LearningActivityBroker, LearningActivityBroker as default };
