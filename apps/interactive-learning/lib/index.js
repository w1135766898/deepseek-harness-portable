import { a as LEARNER_STATE_SESSION_EVENT_TYPE, c as foldLearnerStateSession, d as reduceLearnerState, f as registerLearningSessionEventType, h as serializeLearnerStateSnapshot, i as LEARNER_STATE_PROTOCOL, l as hydrateLearnerStateSnapshot, m as resetLearnerState, n as DEFAULT_TRANSCRIPT_TOKEN_BUDGET, o as createInitialLearnerState, p as renderLearnerStateTranscript, r as LEARNER_STATE_EVENT_PROTOCOL, s as createLearnerStateSnapshotEvent, t as registerInteractiveLearningSessionCompatibility, u as parseLearnerStateSnapshotEvent } from "./bootstrap-BiT0bfyq.js";
import { A as parseLearningCheckpointV1, D as parseLearningActivity, M as parseLearningResponseV2, O as parseLearningActivityV2, a as CHECKPOINT_TRANSPORT_PROTOCOL, i as CHECKPOINT_RESULT_PROTOCOL, k as parseLearningCheckpointResultV1, p as MAX_ACTIVITY_BYTES, u as LearningProtocolError, v as RESPONSE_PROTOCOL, x as TRANSPORT_PROTOCOL_V2, y as RESPONSE_PROTOCOL_V2 } from "./protocol-BBlGCutI.js";
import { createHash, randomUUID } from "node:crypto";
import { Service } from "@deepseek-ai/cordis";
import { UserQuestionError } from "@deepseek-ai/dsh-user-questions";
//#region lib/types/transport.js
const MARKER_SUFFIX = "-->";
const WAIT_MARKER_PREFIX = "<!--dsh-learning/wait@2:";
const WAIT_QUESTION_ID_PREFIX = "dsh-learning/wait@2:";
const CHECKPOINT_WAIT_MARKER_PREFIX = "<!--dsh-learning/checkpoint-wait@1:";
const CHECKPOINT_WAIT_QUESTION_ID_PREFIX = "dsh-learning/checkpoint-wait@1:";
const BASE64URL = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
Math.ceil((MAX_ACTIVITY_BYTES + 8192) * 4 / 3);
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
function opaqueToken(value) {
	return typeof value === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(value);
}
function boundedTransportIdentity(value) {
	return typeof value === "string" && value.length >= 1 && value.length <= 512 && value.trim() === value && !/[\u0000-\u001F\u007F]/.test(value);
}
function assertCheckpointEnvelopeInput(input) {
	if (!boundedTransportIdentity(input.sessionId)) throw new Error("sessionId must be a non-empty bounded transport identity");
	if (!boundedTransportIdentity(input.callId)) throw new Error("callId must be a non-empty bounded transport identity");
	if (!opaqueToken(input.waitId)) throw new Error("waitId must be a URL-safe opaque token");
	if (!opaqueToken(input.checkpointId)) throw new Error("checkpointId must be a URL-safe opaque token");
	parseLearningCheckpointV1(input.checkpoint);
}
/** A checkpoint question id contains one opaque lookup token and no teaching payload. */
function learningCheckpointQuestionId(waitId) {
	if (!opaqueToken(waitId)) throw new Error("waitId must be a URL-safe opaque token");
	return `${CHECKPOINT_WAIT_QUESTION_ID_PREFIX}${waitId}`;
}
/** Persist one answer-free checkpoint projection so a pending wait survives refresh. */
function encodeLearningCheckpointDetail(input) {
	assertCheckpointEnvelopeInput(input);
	const envelope = {
		transport: CHECKPOINT_TRANSPORT_PROTOCOL,
		...input
	};
	return `${CHECKPOINT_WAIT_MARKER_PREFIX}${encodeBase64Url(JSON.stringify(envelope))}${MARKER_SUFFIX}\n${input.checkpoint.fallbackMarkdown}`;
}
//#endregion
//#region lib/types/broker.js
registerInteractiveLearningSessionCompatibility();
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
function boundedIdentity(value, label) {
	if (typeof value !== "string" || value.length < 1 || value.length > 512 || value.trim() !== value || /[\u0000-\u001F\u007F]/.test(value)) throw new LearningProtocolError([`${label} must be a non-empty bounded identity`]);
	return value;
}
function trimOldest(values, limit = 1024) {
	if (values.size <= limit) return;
	const oldest = values.keys().next().value;
	if (oldest !== void 0) values.delete(oldest);
}
function pedagogicalStateFingerprint(state) {
	const { revision: _revision, appliedEventIds: _appliedEventIds, ...pedagogicalState } = state;
	return JSON.stringify(pedagogicalState);
}
function learnerObservationId(prefix, ...parts) {
	return `${prefix}:${createHash("sha256").update(JSON.stringify(parts)).digest("hex")}`;
}
function snapshotCheckpoint(value) {
	const parsed = parseLearningCheckpointV1(value);
	return {
		protocol: parsed.protocol,
		kind: parsed.kind,
		prompt: parsed.prompt,
		...parsed.context === void 0 ? {} : { context: parsed.context },
		expectedEvidence: parsed.expectedEvidence,
		...parsed.options === void 0 ? {} : { options: parsed.options.map((option) => ({
			id: option.id,
			label: option.label
		})) },
		fallbackMarkdown: parsed.fallbackMarkdown
	};
}
function normalizeCheckpointResult(result) {
	if (result.status !== "submitted") return {
		protocol: result.protocol,
		checkpointId: result.checkpointId,
		status: result.status,
		receiptId: result.receiptId
	};
	const response = "text" in result.response ? { text: result.response.text } : "optionId" in result.response ? { optionId: result.response.optionId } : { number: result.response.number };
	return {
		protocol: result.protocol,
		checkpointId: result.checkpointId,
		status: "submitted",
		response,
		receiptId: result.receiptId
	};
}
function checkpointFallbackSubmission(checkpoint, checkpointId, custom) {
	let response;
	if (checkpoint.kind === "single_choice") {
		const option = checkpoint.options?.find((candidate) => candidate.id === custom);
		if (option !== void 0) response = { optionId: option.id };
	} else if (checkpoint.kind === "numeric") {
		const number = Number(custom);
		if (Number.isFinite(number)) response = { number };
	} else response = { text: custom };
	if (response === void 0) return void 0;
	return normalizeCheckpointResult(parseLearningCheckpointResultV1({
		protocol: CHECKPOINT_RESULT_PROTOCOL,
		checkpointId,
		status: "submitted",
		response,
		receiptId: randomUUID()
	}, {
		checkpointId,
		checkpoint
	}));
}
/** Host-side V2 Question/Reveal coordinator; V1 is replay-only. */
var LearningActivityBroker = class extends Service {
	static inject = ["userQuestions"];
	pendingActivities = /* @__PURE__ */ new Map();
	lessons = /* @__PURE__ */ new Map();
	receipts = /* @__PURE__ */ new Map();
	gateCalls = /* @__PURE__ */ new Map();
	checkpointCalls = /* @__PURE__ */ new Map();
	checkpointReceipts = /* @__PURE__ */ new Map();
	pendingCheckpointSessions = /* @__PURE__ */ new Map();
	pendingCheckpointWaits = /* @__PURE__ */ new Map();
	learnerStates = /* @__PURE__ */ new Map();
	observers = /* @__PURE__ */ new Set();
	disposed = false;
	constructor(ctx) {
		super(ctx, "learningActivities");
		ctx.effect(() => () => {
			this.disposed = true;
			for (const [controller, state] of this.pendingActivities) {
				state.reason = "plugin-disposed";
				controller.abort(new LearningWaitAbort(state.reason));
			}
			this.pendingActivities.clear();
			this.lessons.clear();
			this.receipts.clear();
			this.gateCalls.clear();
			this.checkpointCalls.clear();
			this.checkpointReceipts.clear();
			this.pendingCheckpointSessions.clear();
			this.pendingCheckpointWaits.clear();
			this.learnerStates.clear();
			this.observers.clear();
		}, "interactive-learning: abort pending activities");
		ctx.on("agent/disposed", ({ agent }) => {
			this.abortPendingCheckpointSession(agent.session);
			this.dropLearnerState(agent.session);
		});
		ctx.on("session/disposed", (session) => {
			this.abortPendingCheckpointSession(session);
			this.dropLearnerState(session);
		});
	}
	/** Diagnostics/test seam; no activity payloads or learner answers are exposed. */
	get pendingCount() {
		return this.pendingActivities.size;
	}
	/** Diagnostics/test seam; state content remains private to its session. */
	get learnerStateCacheSize() {
		return this.learnerStates.size;
	}
	/** Diagnostics/test seam; counts only, never checkpoint or learner content. */
	get checkpointCacheSize() {
		return this.checkpointCalls.size + this.checkpointReceipts.size + this.pendingCheckpointSessions.size + this.pendingCheckpointWaits.size;
	}
	/** Fold the latest durable full snapshot for this exact live session. */
	learnerState(agent) {
		const session = agent.session;
		const sessionId = String(session.id);
		const current = this.learnerStates.get(sessionId);
		if (current?.session === session && current.eventCount === session.events.length) return current.state;
		const state = foldLearnerStateSession(sessionId, session.events);
		this.learnerStates.set(sessionId, {
			session,
			eventCount: session.events.length,
			state
		});
		return state;
	}
	/** Render only the bounded, model-facing projection of the current state. */
	learnerStateTranscript(agent, maxTokens = 300) {
		return renderLearnerStateTranscript(this.learnerState(agent), { maxTokens });
	}
	/** CAS mutation used exclusively by the internal, immediate state tool. */
	updateLearnerState(request) {
		const current = this.learnerState(request.agent);
		if (!Number.isSafeInteger(request.expectedRevision) || request.expectedRevision < 0) throw new TypeError("expectedRevision must be a non-negative safe integer");
		if (current.revision !== request.expectedRevision) throw new Error(`Learner state revision changed: expected ${request.expectedRevision}, current ${current.revision}`);
		if (request.action === "reset") {
			this.abortPendingCheckpointSession(request.agent.session);
			const state = resetLearnerState(current);
			this.appendLearnerState(request.agent, state, "reset");
			return {
				status: "reset",
				revision: state.revision
			};
		}
		const event = request.action === "correct" ? {
			type: "state_corrected",
			correction: request.correction,
			observation: request.observation
		} : request.event;
		const state = reduceLearnerState(current, event);
		if (state === current) return {
			status: request.action === "correct" ? "corrected" : "updated",
			revision: current.revision
		};
		if (pedagogicalStateFingerprint(state) === pedagogicalStateFingerprint(current)) throw new Error("learning_state_update requires a substantive observable state change");
		this.appendLearnerState(request.agent, state, request.action === "correct" ? "correction" : "update");
		return {
			status: request.action === "correct" ? "corrected" : "updated",
			revision: state.revision
		};
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
	dropLearnerState(session) {
		const sessionId = String(session.id);
		if (this.learnerStates.get(sessionId)?.session === session) this.learnerStates.delete(sessionId);
		for (const [key, record] of this.checkpointCalls) if (record.session === session) this.checkpointCalls.delete(key);
		for (const [key, record] of this.checkpointReceipts) if (record.session === session) this.checkpointReceipts.delete(key);
		if (this.pendingCheckpointWaits.get(sessionId)?.session === session) {
			this.pendingCheckpointWaits.delete(sessionId);
			this.pendingCheckpointSessions.delete(sessionId);
		}
	}
	abortPendingCheckpointSession(session) {
		const sessionId = String(session.id);
		const pending = this.pendingCheckpointWaits.get(sessionId);
		if (pending === void 0 || pending.session !== session) return;
		const { controller } = pending;
		const state = this.pendingActivities.get(controller);
		if (state !== void 0) state.reason = "session-aborted";
		controller.abort(new LearningWaitAbort("session-aborted"));
		this.pendingCheckpointWaits.delete(sessionId);
		this.pendingCheckpointSessions.delete(sessionId);
		this.pendingActivities.delete(controller);
	}
	appendLearnerState(agent, state, reason) {
		const session = agent.session;
		session.append(LEARNER_STATE_SESSION_EVENT_TYPE, createLearnerStateSnapshotEvent(state, reason));
		this.learnerStates.set(String(session.id), {
			session,
			eventCount: session.events.length,
			state
		});
	}
	recordAutomaticEvents(agent, events) {
		try {
			let state = this.learnerState(agent);
			for (const event of events) state = reduceLearnerState(state, event);
			if (state !== this.learnerState(agent)) this.appendLearnerState(agent, state, "update");
		} catch (cause) {
			this.ctx.logger.warn(`learning state observation was not recorded: ${String(cause)}`);
		}
	}
	/** Record the concrete assistant move without adding another user wait. */
	recordVisual(agent, callId) {
		if (agent === void 0) return;
		const stableCallId = boundedIdentity(callId, "callId");
		this.recordAutomaticEvents(agent, [{
			type: "assistant_move_observed",
			move: "visual",
			observation: {
				id: learnerObservationId("visual", String(agent.session.id), stableCallId),
				source: "assistant-output",
				summary: "The assistant rendered one non-blocking semantic visual."
			}
		}]);
	}
	recordCheckpointOutcome(request, result, fence) {
		const agent = request.agent;
		if (agent === void 0 || fence === void 0 || this.disposed) return;
		try {
			if (this.ctx.get("agents")?.get(agent.id) !== agent || agent.session !== fence.session) return;
			if (this.learnerState(agent).revision !== fence.revision) return;
		} catch (cause) {
			this.ctx.logger.warn(`learning checkpoint state fence could not be verified: ${String(cause)}`);
			return;
		}
		const observationBase = learnerObservationId("checkpoint", String(agent.session.id), request.callId, result.status);
		const events = [];
		if (result.status === "submitted") events.push({
			type: "learner_evidence_observed",
			evidence: request.checkpoint.expectedEvidence === "transfer" ? {
				kind: "transfer",
				transferContext: "unknown",
				summary: "Submitted a transfer response to the optional checkpoint.",
				confidence: "low",
				correctness: "unknown",
				independence: "unknown"
			} : {
				kind: request.checkpoint.expectedEvidence,
				summary: `Submitted a ${request.checkpoint.expectedEvidence} response to the optional checkpoint.`,
				confidence: "low",
				correctness: "unknown",
				independence: "unknown"
			},
			observation: {
				id: `${observationBase}:evidence`,
				source: "learner-action",
				summary: `The learner submitted the requested ${request.checkpoint.expectedEvidence} response.`
			}
		});
		events.push({
			type: "assistant_move_observed",
			move: "checkpoint",
			observation: {
				id: `${observationBase}:move`,
				source: "assistant-output",
				summary: `The optional checkpoint ended ${result.status}; continue in ordinary conversation.`
			}
		});
		this.recordAutomaticEvents(agent, events);
	}
	/** Optional V4.1 path: one answer-free checkpoint, independent of V2 lessons. */
	async presentCheckpoint(request) {
		const checkpoint = snapshotCheckpoint(request.checkpoint);
		const sessionId = request.agent === void 0 ? "" : String(request.agent.session.id);
		const callId = boundedIdentity(request.callId, "callId");
		const callKey = sessionId === "" ? void 0 : JSON.stringify([sessionId, callId]);
		const fingerprint = JSON.stringify(checkpoint);
		let prior = callKey === void 0 ? void 0 : this.checkpointCalls.get(callKey);
		if (prior !== void 0 && prior.session !== request.agent?.session) {
			this.checkpointCalls.delete(callKey);
			prior = void 0;
		}
		if (prior !== void 0) {
			if (prior.fingerprint !== fingerprint) throw new LearningProtocolError(["checkpoint callId was replayed with different content"]);
			return prior.result;
		}
		const normalizedRequest = {
			...request,
			checkpoint,
			callId
		};
		const stateFence = request.agent === void 0 ? void 0 : {
			session: request.agent.session,
			revision: this.learnerState(request.agent).revision
		};
		const result = this.presentCheckpointOnce(normalizedRequest, sessionId, callKey).then((outcome) => {
			this.recordCheckpointOutcome(normalizedRequest, outcome, stateFence);
			return outcome;
		});
		if (callKey !== void 0) {
			this.checkpointCalls.set(callKey, {
				fingerprint,
				session: request.agent.session,
				result
			});
			trimOldest(this.checkpointCalls);
		}
		try {
			return await result;
		} catch (cause) {
			if (callKey !== void 0 && this.checkpointCalls.get(callKey)?.result === result) this.checkpointCalls.delete(callKey);
			throw cause;
		}
	}
	async presentCheckpointOnce(request, sessionId, callKey) {
		const checkpointId = randomUUID();
		const fallback = (status) => ({
			protocol: CHECKPOINT_RESULT_PROTOCOL,
			checkpointId,
			status,
			receiptId: randomUUID()
		});
		if (!this.hasRichClient()) return fallback("skipped");
		if (request.agent === void 0 || sessionId === "" || callKey === void 0) return fallback("skipped");
		const timeoutMs = request.timeoutMs ?? 3e5;
		if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return fallback("skipped");
		const activeCall = this.pendingCheckpointSessions.get(sessionId);
		if (activeCall !== void 0 && activeCall !== callKey) throw new LearningProtocolError(["a session may have at most one pending learning checkpoint"]);
		this.pendingCheckpointSessions.set(sessionId, callKey);
		try {
			return await this.waitForCheckpoint({
				request,
				checkpointId,
				sessionId,
				timeoutMs
			});
		} finally {
			if (this.pendingCheckpointSessions.get(sessionId) === callKey) this.pendingCheckpointSessions.delete(sessionId);
		}
	}
	async waitForCheckpoint(input) {
		const { request, checkpointId, sessionId, timeoutMs } = input;
		const checkpoint = request.checkpoint;
		const waitId = randomUUID();
		const controller = new AbortController();
		const state = {};
		this.pendingActivities.set(controller, state);
		this.pendingCheckpointWaits.set(sessionId, {
			session: request.agent.session,
			controller
		});
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
		const fallback = (status) => ({
			protocol: CHECKPOINT_RESULT_PROTOCOL,
			checkpointId,
			status,
			receiptId: randomUUID()
		});
		try {
			const ask = this.ctx.userQuestions.ask({
				questions: [{
					id: learningCheckpointQuestionId(waitId),
					question: checkpoint.prompt,
					detail: encodeLearningCheckpointDetail({
						sessionId,
						callId: request.callId,
						waitId,
						checkpointId,
						checkpoint
					}),
					...checkpoint.kind === "single_choice" ? { options: checkpoint.options?.map((option) => ({ label: option.label })) } : {}
				}],
				agent: request.agent,
				signal: controller.signal
			});
			const aborted = new Promise((_resolve, reject) => {
				if (controller.signal.aborted) reject(controller.signal.reason);
				else controller.signal.addEventListener("abort", () => reject(controller.signal.reason), { once: true });
			});
			const custom = (await Promise.race([ask, aborted])).answers[0]?.custom?.trim();
			let result;
			if (custom !== void 0 && custom !== "") {
				let decoded;
				try {
					decoded = JSON.parse(custom);
				} catch {
					decoded = void 0;
				}
				if (typeof decoded === "object" && decoded !== null && decoded.protocol === "dsh-learning/checkpoint-result@1") result = normalizeCheckpointResult(parseLearningCheckpointResultV1(decoded, {
					checkpointId,
					checkpoint
				}));
				else result = checkpointFallbackSubmission(checkpoint, checkpointId, custom) ?? fallback("skipped");
			} else result = fallback("skipped");
			return this.acceptCheckpointReceipt(request.agent.session, result);
		} catch (cause) {
			if (cause instanceof LearningProtocolError) throw cause;
			if (cause instanceof LearningWaitAbort) return fallback(cause.reason === "client-response-timeout" ? "skipped" : "cancelled");
			const code = cause instanceof UserQuestionError ? cause.code : void 0;
			if (code === "ASK_CANCELLED") return fallback("cancelled");
			if (code === "ASK_ABORTED") return fallback((state.reason ?? "session-aborted") === "client-response-timeout" ? "skipped" : "cancelled");
			if (code === "NO_PROVIDER" || code === "DELEGATED_CALLER" || code === "CALLER_NOT_LIVE") return fallback("skipped");
			this.ctx.logger.warn(`learning checkpoint provider failed; continuing ordinary conversation: ${String(cause)}`);
			return fallback("skipped");
		} finally {
			clearTimeout(timer);
			request.signal?.removeEventListener("abort", abortFromSession);
			this.pendingActivities.delete(controller);
			if (this.pendingCheckpointWaits.get(sessionId)?.controller === controller) this.pendingCheckpointWaits.delete(sessionId);
		}
	}
	acceptCheckpointReceipt(session, result) {
		const key = JSON.stringify([String(session.id), result.receiptId]);
		let prior = this.checkpointReceipts.get(key);
		if (prior !== void 0 && prior.session !== session) {
			this.checkpointReceipts.delete(key);
			prior = void 0;
		}
		if (prior !== void 0) {
			if (JSON.stringify(prior.result) !== JSON.stringify(result)) throw new LearningProtocolError(["checkpointResult.receiptId was reused for different content"]);
			return prior.result;
		}
		this.checkpointReceipts.set(key, {
			session,
			result
		});
		trimOldest(this.checkpointReceipts);
		return result;
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
//#region lib/types/index.js
/** Host entry: one non-model-facing Learning Activity broker service. */
registerInteractiveLearningSessionCompatibility();
//#endregion
export { DEFAULT_TRANSCRIPT_TOKEN_BUDGET, LEARNER_STATE_EVENT_PROTOCOL, LEARNER_STATE_PROTOCOL, LEARNER_STATE_SESSION_EVENT_TYPE, LearningActivityBroker, LearningActivityBroker as default, createInitialLearnerState, createLearnerStateSnapshotEvent, foldLearnerStateSession, hydrateLearnerStateSnapshot, parseLearnerStateSnapshotEvent, reduceLearnerState, registerInteractiveLearningSessionCompatibility, registerLearningSessionEventType, renderLearnerStateTranscript, resetLearnerState, serializeLearnerStateSnapshot };
