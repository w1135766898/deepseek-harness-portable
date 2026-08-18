import { createHash } from "node:crypto";
import { KNOWN_SESSION_EVENT_TYPES } from "@deepseek-ai/dsh-session";
//#region lib/types/learner-state.js
/**
* Session-local, tentative teaching state for the Learning preset.
*
* A caller owns the in-memory store and feeds it explicit observable events.
* Strict identity-free snapshots may be written to the owning session log for
* resume/fork replay, but are never a cross-session learner profile.
*/
const LEARNER_STATE_PROTOCOL = "dsh-learning/learner-state@1";
const LEARNER_STATE_EVENT_PROTOCOL = "dsh-learning/state-event@1";
const LEARNER_STATE_SESSION_EVENT_TYPE = "learning/state";
const DEFAULT_TRANSCRIPT_TOKEN_BUDGET = 300;
const MAX_STORED_TEXT = 240;
/**
* Registers the required (non-ignorable) log event with persistence readers.
* Startup owns calling this function; it is idempotent and does not append.
*/
function registerLearningSessionEventType() {
	KNOWN_SESSION_EVENT_TYPES.add(LEARNER_STATE_SESSION_EVENT_TYPE);
}
const REQUEST_KINDS = /* @__PURE__ */ new Set([
	"concept",
	"procedure",
	"topic",
	"source-study",
	"practice",
	"resource",
	"direct-task",
	"unknown"
]);
const LEVELS = /* @__PURE__ */ new Set([
	"novice",
	"intermediate",
	"advanced",
	"unknown"
]);
const GAPS = /* @__PURE__ */ new Set([
	"concept",
	"procedure",
	"notation",
	"task-model",
	"prerequisite",
	"unknown"
]);
const READINESS_VALUES = /* @__PURE__ */ new Set([
	"can-reason",
	"needs-foothold",
	"unknown"
]);
const PROGRESS_SIGNALS = /* @__PURE__ */ new Set([
	"progressing",
	"impatient",
	"stuck",
	"shutdown-risk",
	"unknown"
]);
const URGENCY_VALUES = /* @__PURE__ */ new Set([
	"none",
	"initial-blocker",
	"later-pressure",
	"unknown"
]);
const ASSESSMENT_CONTEXTS = /* @__PURE__ */ new Set([
	"self-study",
	"graded",
	"unknown"
]);
const MASTERY_VALUES = /* @__PURE__ */ new Set([
	"unseen",
	"emerging",
	"transfer"
]);
const TEACHING_MOVES = /* @__PURE__ */ new Set([
	"none",
	"visual",
	"checkpoint"
]);
const EVIDENCE_KINDS = /* @__PURE__ */ new Set([
	"attempt",
	"prediction",
	"explanation",
	"contrast",
	"transfer",
	"error"
]);
const EVIDENCE_CONFIDENCE = /* @__PURE__ */ new Set([
	"low",
	"medium",
	"high"
]);
const EVIDENCE_CORRECTNESS = /* @__PURE__ */ new Set([
	"correct",
	"incorrect",
	"unknown"
]);
const EVIDENCE_INDEPENDENCE = /* @__PURE__ */ new Set([
	"independent",
	"guided",
	"unknown"
]);
const TRANSFER_CONTEXTS = /* @__PURE__ */ new Set([
	"same",
	"fresh",
	"unknown"
]);
const OBSERVABLE_SOURCES = /* @__PURE__ */ new Set([
	"learner-message",
	"learner-action",
	"assistant-output",
	"source-material",
	"user-correction"
]);
function assertEnum(value, values, label) {
	if (!values.has(value)) throw new TypeError(`Invalid ${label}: ${String(value)}`);
	return value;
}
function normalizeRequiredText(value, label) {
	if (typeof value !== "string") throw new TypeError(`${label} must be a string`);
	const normalized = value.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim();
	if (!normalized) throw new TypeError(`${label} must not be empty`);
	return [...normalized].slice(0, MAX_STORED_TEXT).join("");
}
function normalizeSessionId(sessionId) {
	return normalizeRequiredText(sessionId, "sessionId");
}
function normalizeStringList(values, limit, label) {
	if (!Array.isArray(values)) throw new TypeError(`${label} must be an array`);
	const normalized = [];
	for (const value of values) {
		const item = normalizeRequiredText(value, `${label} item`);
		if (!normalized.includes(item)) normalized.push(item);
	}
	return Object.freeze(normalized.slice(-limit));
}
function appendBoundedUnique(current, additions, limit, label) {
	return normalizeStringList([...current, ...additions], limit, label);
}
function normalizeSupportLevel(value) {
	if (!Number.isInteger(value) || value < 0 || value > 5) throw new TypeError("supportLevel must be an integer from 0 through 5");
	return value;
}
function maxSupportLevel(current, minimum) {
	return Math.max(current, minimum);
}
function lowerSupportLevel(current) {
	return Math.max(0, current - 1);
}
function trailingIncorrectEvidence(evidence) {
	let count = 0;
	for (let index = evidence.length - 1; index >= 0; index -= 1) {
		if (evidence[index]?.correctness !== "incorrect") break;
		count += 1;
	}
	return count;
}
function normalizeCount(value, label) {
	if (!Number.isSafeInteger(value) || value < 0) throw new TypeError(`${label} must be a non-negative integer`);
	return value;
}
function normalizeObservation(observation) {
	if (!observation || typeof observation !== "object") throw new TypeError("An explicit observable event is required");
	const turn = observation.turn;
	if (turn !== void 0 && (!Number.isSafeInteger(turn) || turn < 0)) throw new TypeError("observation.turn must be a non-negative integer");
	return Object.freeze({
		id: normalizeRequiredText(observation.id, "observation.id"),
		source: assertEnum(observation.source, OBSERVABLE_SOURCES, "observation.source"),
		summary: normalizeRequiredText(observation.summary, "observation.summary"),
		...turn === void 0 ? {} : { turn }
	});
}
function normalizeEvidence(input, observation) {
	if (![
		"learner-message",
		"learner-action",
		"user-correction"
	].includes(observation.source)) throw new TypeError("Learner evidence must come from a learner action, learner message, or user correction");
	const kind = assertEnum(input.kind, EVIDENCE_KINDS, "evidence.kind");
	const base = {
		summary: normalizeRequiredText(input.summary, "evidence.summary"),
		confidence: assertEnum(input.confidence ?? "medium", EVIDENCE_CONFIDENCE, "evidence.confidence"),
		correctness: assertEnum(input.correctness ?? "unknown", EVIDENCE_CORRECTNESS, "evidence.correctness"),
		independence: assertEnum(input.independence ?? "unknown", EVIDENCE_INDEPENDENCE, "evidence.independence"),
		source: observation.source,
		...observation.turn === void 0 ? {} : { turn: observation.turn }
	};
	if (kind === "transfer") return Object.freeze({
		...base,
		kind,
		transferContext: assertEnum(strictString(input.transferContext, "evidence.transferContext"), TRANSFER_CONTEXTS, "evidence.transferContext")
	});
	if (Object.hasOwn(input, "transferContext")) throw new TypeError("evidence.transferContext is only allowed for transfer evidence");
	return Object.freeze({
		...base,
		kind
	});
}
function freezeEvidence(evidence) {
	return Object.freeze(evidence.map((item) => Object.freeze({ ...item })));
}
function freezeState(state) {
	return Object.freeze({
		...state,
		priorKnowledge: Object.freeze([...state.priorKnowledge]),
		misconceptions: Object.freeze([...state.misconceptions]),
		evidence: freezeEvidence(state.evidence),
		sourceAnchors: Object.freeze([...state.sourceAnchors]),
		appliedEventIds: Object.freeze(state.appliedEventIds.map((item) => Object.freeze({ ...item })))
	});
}
function canonicalJson(value, ancestors = /* @__PURE__ */ new Set()) {
	if (value === null) return "null";
	if (typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
	if (typeof value === "number") {
		if (!Number.isFinite(value)) throw new TypeError("learner state events must contain finite JSON numbers");
		return JSON.stringify(value);
	}
	if (Array.isArray(value)) {
		if (ancestors.has(value)) throw new TypeError("learner state events must not contain cycles");
		ancestors.add(value);
		const encoded = `[${value.map((item) => item === void 0 ? "null" : canonicalJson(item, ancestors)).join(",")}]`;
		ancestors.delete(value);
		return encoded;
	}
	if (typeof value === "object") {
		if (ancestors.has(value)) throw new TypeError("learner state events must not contain cycles");
		ancestors.add(value);
		const record = value;
		const encoded = `{${Object.keys(record).filter((key) => record[key] !== void 0).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key], ancestors)}`).join(",")}}`;
		ancestors.delete(value);
		return encoded;
	}
	throw new TypeError("learner state events must be JSON-serializable");
}
function learnerStateEventFingerprint(event) {
	return createHash("sha256").update(canonicalJson(event), "utf8").digest("hex");
}
function assertEventSourceMatrix(event, observation) {
	if (event.type === "assistant_move_observed") {
		if (observation.source !== "assistant-output") throw new TypeError("assistant_move_observed requires source assistant-output");
		return;
	}
	if (event.type === "source_anchors_observed") {
		if (observation.source !== "source-material") throw new TypeError("source_anchors_observed requires source source-material");
		return;
	}
	if (event.type === "state_corrected") {
		if (observation.source !== "user-correction") throw new TypeError("state_corrected requires source user-correction");
		return;
	}
	if (observation.source !== "learner-message" && observation.source !== "learner-action") throw new TypeError(`${event.type} requires source learner-message or learner-action`);
}
function isIndependentlyCorrectEvidence(evidence) {
	return (evidence.source === "learner-message" || evidence.source === "learner-action") && evidence.correctness === "correct" && evidence.independence === "independent" && evidence.kind !== "error";
}
function evidenceMastery(evidence) {
	const independentlyCorrect = evidence.filter(isIndependentlyCorrectEvidence);
	if (independentlyCorrect.some((item) => item.kind === "transfer" && item.transferContext === "fresh")) return "transfer";
	if (independentlyCorrect.length > 0) return "emerging";
	return "unseen";
}
function masteryFromEvidence(current, evidence) {
	const observed = evidenceMastery(evidence);
	if (observed === "transfer") return "transfer";
	if (observed === "emerging" && current === "unseen") return "emerging";
	return current;
}
function evidenceSupportsMastery(evidence, mastery) {
	if (!isIndependentlyCorrectEvidence(evidence)) return false;
	return mastery === "transfer" ? evidence.kind === "transfer" && evidence.transferContext === "fresh" : mastery === "emerging";
}
function boundEvidence(evidence, mastery) {
	const recent = evidence.slice(-8);
	if (mastery === "unseen" || recent.some((item) => evidenceSupportsMastery(item, mastery))) return freezeEvidence(recent);
	const support = [...evidence].reverse().find((item) => evidenceSupportsMastery(item, mastery));
	if (!support) return freezeEvidence(recent);
	return freezeEvidence([support, ...recent.slice(-7)]);
}
function assertMasteryEvidenceConsistency(state) {
	const supported = evidenceMastery(state.evidence);
	if (state.mastery === "transfer" && supported !== "transfer") throw new TypeError("transfer mastery requires correct, independent learner transfer evidence");
	if (state.mastery === "emerging" && supported === "unseen") throw new TypeError("emerging mastery requires correct, independent learner evidence");
}
function createInitialLearnerState(sessionId) {
	return freezeState({
		protocol: LEARNER_STATE_PROTOCOL,
		tentative: true,
		sessionId: normalizeSessionId(sessionId),
		revision: 0,
		goal: null,
		requestKind: "unknown",
		level: "unknown",
		priorKnowledge: [],
		gap: "unknown",
		misconceptions: [],
		readiness: "unknown",
		progressSignal: "unknown",
		urgency: "unknown",
		supportLevel: 0,
		assessmentContext: "unknown",
		mastery: "unseen",
		evidence: [],
		lastMove: "none",
		sourceAnchors: [],
		appliedEventIds: []
	});
}
function applyCorrection(state, correction, observation) {
	if (observation.source !== "user-correction") throw new TypeError("State corrections must come from an explicit user correction");
	const next = { ...state };
	if (Object.hasOwn(correction, "goal")) next.goal = correction.goal === null ? null : normalizeRequiredText(correction.goal, "goal");
	if (correction.requestKind !== void 0) next.requestKind = assertEnum(correction.requestKind, REQUEST_KINDS, "requestKind");
	if (correction.level !== void 0) next.level = assertEnum(correction.level, LEVELS, "level");
	if (correction.priorKnowledge !== void 0) next.priorKnowledge = normalizeStringList(correction.priorKnowledge, 8, "priorKnowledge");
	if (correction.gap !== void 0) next.gap = assertEnum(correction.gap, GAPS, "gap");
	if (correction.misconceptions !== void 0) next.misconceptions = normalizeStringList(correction.misconceptions, 6, "misconceptions");
	if (correction.readiness !== void 0) next.readiness = assertEnum(correction.readiness, READINESS_VALUES, "readiness");
	if (correction.progressSignal !== void 0) next.progressSignal = assertEnum(correction.progressSignal, PROGRESS_SIGNALS, "progressSignal");
	if (correction.urgency !== void 0) next.urgency = assertEnum(correction.urgency, URGENCY_VALUES, "urgency");
	if (correction.supportLevel !== void 0) next.supportLevel = normalizeSupportLevel(correction.supportLevel);
	if (correction.assessmentContext !== void 0) next.assessmentContext = assertEnum(correction.assessmentContext, ASSESSMENT_CONTEXTS, "assessmentContext");
	if (correction.mastery !== void 0) {
		const requested = assertEnum(correction.mastery, MASTERY_VALUES, "mastery");
		const ranks = {
			unseen: 0,
			emerging: 1,
			transfer: 2
		};
		if (ranks[requested] > ranks[state.mastery]) throw new TypeError("A user correction cannot upgrade mastery without evaluated independent evidence");
		next.mastery = requested;
	}
	if (correction.evidence !== void 0) {
		const normalized = correction.evidence.map((item) => normalizeEvidence(item, observation));
		if (correction.mastery === void 0) next.mastery = evidenceMastery(normalized);
		next.evidence = boundEvidence(normalized, next.mastery);
	}
	if (correction.lastMove !== void 0) next.lastMove = assertEnum(correction.lastMove, TEACHING_MOVES, "lastMove");
	if (correction.sourceAnchors !== void 0) next.sourceAnchors = normalizeStringList(correction.sourceAnchors, 8, "sourceAnchors");
	return next;
}
function reduceLearnerState(state, event) {
	const observation = normalizeObservation(event.observation);
	assertEventSourceMatrix(event, observation);
	const fingerprint = learnerStateEventFingerprint(event);
	const applied = state.appliedEventIds.find((item) => item.id === observation.id);
	if (applied) {
		if (applied.fingerprint === fingerprint) return state;
		throw new TypeError(`observation id ${observation.id} was replayed with different content (conflicting event payload)`);
	}
	let next = { ...state };
	switch (event.type) {
		case "goal_observed":
			next.goal = normalizeRequiredText(event.goal, "goal");
			break;
		case "request_kind_observed":
			next.requestKind = assertEnum(event.requestKind, REQUEST_KINDS, "requestKind");
			break;
		case "prior_knowledge_observed":
			if (event.level === void 0 && event.items === void 0) throw new TypeError("prior_knowledge_observed requires level or items");
			if (event.level !== void 0) next.level = assertEnum(event.level, LEVELS, "level");
			if (event.items !== void 0) next.priorKnowledge = event.mode === "replace" ? normalizeStringList(event.items, 8, "priorKnowledge") : appendBoundedUnique(state.priorKnowledge, event.items, 8, "priorKnowledge");
			break;
		case "gap_observed":
			next.gap = assertEnum(event.gap, GAPS, "gap");
			if (event.misconceptions !== void 0) next.misconceptions = event.misconceptionMode === "replace" ? normalizeStringList(event.misconceptions, 6, "misconceptions") : appendBoundedUnique(state.misconceptions, event.misconceptions, 6, "misconceptions");
			break;
		case "readiness_observed":
			next.readiness = assertEnum(event.readiness, READINESS_VALUES, "readiness");
			if (next.readiness === "needs-foothold") next.supportLevel = maxSupportLevel(state.supportLevel, 4);
			else if (next.readiness === "can-reason") next.supportLevel = lowerSupportLevel(state.supportLevel);
			break;
		case "progress_observed":
			next.progressSignal = assertEnum(event.progressSignal, PROGRESS_SIGNALS, "progressSignal");
			if (next.progressSignal === "stuck") next.supportLevel = maxSupportLevel(state.supportLevel, 4);
			else if (next.progressSignal === "shutdown-risk") next.supportLevel = 5;
			else if (next.progressSignal === "progressing") next.supportLevel = lowerSupportLevel(state.supportLevel);
			break;
		case "urgency_observed":
			next.urgency = assertEnum(event.urgency, URGENCY_VALUES, "urgency");
			break;
		case "assessment_context_observed":
			next.assessmentContext = assertEnum(event.assessmentContext, ASSESSMENT_CONTEXTS, "assessmentContext");
			break;
		case "learner_evidence_observed": {
			const evidence = normalizeEvidence(event.evidence, observation);
			next.mastery = masteryFromEvidence(state.mastery, [evidence]);
			next.evidence = boundEvidence([...state.evidence, evidence], next.mastery);
			if (isIndependentlyCorrectEvidence(evidence)) next.supportLevel = evidence.kind === "transfer" && evidence.transferContext === "fresh" ? 0 : lowerSupportLevel(state.supportLevel);
			else {
				const incorrectStreak = trailingIncorrectEvidence(next.evidence);
				if (incorrectStreak >= 2) next.supportLevel = maxSupportLevel(state.supportLevel, Math.min(5, incorrectStreak));
			}
			break;
		}
		case "assistant_move_observed":
			if (observation.source !== "assistant-output") throw new TypeError("An assistant move must be observed from assistant output");
			next.lastMove = assertEnum(event.move, TEACHING_MOVES, "lastMove");
			break;
		case "source_anchors_observed":
			next.sourceAnchors = event.mode === "replace" ? normalizeStringList(event.anchors, 8, "sourceAnchors") : appendBoundedUnique(state.sourceAnchors, event.anchors, 8, "sourceAnchors");
			break;
		case "state_corrected":
			next = applyCorrection(state, event.correction, observation);
			break;
		default: throw new TypeError(`Unknown learner state event: ${String(event)}`);
	}
	assertMasteryEvidenceConsistency(next);
	return freezeState({
		...next,
		revision: state.revision + 1,
		appliedEventIds: [...state.appliedEventIds, {
			id: observation.id,
			fingerprint
		}].slice(-64)
	});
}
/**
* Clears pedagogical hypotheses without forgetting replay ids. Keeping those
* ids prevents an async event from before Reset from restoring stale state.
*/
function resetLearnerState(state) {
	return freezeState({
		...createInitialLearnerState(state.sessionId),
		revision: state.revision + 1,
		appliedEventIds: state.appliedEventIds
	});
}
const SNAPSHOT_KEYS = [
	"protocol",
	"tentative",
	"revision",
	"goal",
	"requestKind",
	"level",
	"priorKnowledge",
	"gap",
	"misconceptions",
	"readiness",
	"progressSignal",
	"urgency",
	"supportLevel",
	"assessmentContext",
	"mastery",
	"evidence",
	"lastMove",
	"sourceAnchors",
	"appliedEventIds"
];
function asRecord(value, label) {
	if (value === null || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`${label} must be an object`);
	return value;
}
function assertExactKeys(value, required, optional, label) {
	const allowed = /* @__PURE__ */ new Set([...required, ...optional]);
	for (const key of Object.keys(value)) if (!allowed.has(key)) throw new TypeError(`${label} contains unknown field: ${key}`);
	for (const key of required) if (!Object.hasOwn(value, key)) throw new TypeError(`${label} is missing required field: ${key}`);
}
function strictString(value, label) {
	if (typeof value !== "string") throw new TypeError(`${label} must be a string`);
	if (normalizeRequiredText(value, label) !== value) throw new TypeError(`${label} must be normalized and at most ${MAX_STORED_TEXT} characters`);
	return value;
}
function strictStringList(value, limit, label) {
	if (!Array.isArray(value)) throw new TypeError(`${label} must be an array`);
	if (limit !== void 0 && value.length > limit) throw new TypeError(`${label} exceeds its item limit of ${limit}`);
	const result = value.map((item, index) => strictString(item, `${label}[${index}]`));
	if (new Set(result).size !== result.length) throw new TypeError(`${label} must not contain duplicates`);
	return Object.freeze(result);
}
function strictNonNegativeInteger(value, label) {
	if (typeof value !== "number") throw new TypeError(`${label} must be a number`);
	return normalizeCount(value, label);
}
function parseSnapshotInput(value, label) {
	if (typeof value !== "string") return asRecord(value, label);
	let parsed;
	try {
		parsed = JSON.parse(value);
	} catch (error) {
		throw new TypeError(`${label} must be valid JSON`, { cause: error });
	}
	return asRecord(parsed, label);
}
function parseSnapshotEvidence(value) {
	if (!Array.isArray(value)) throw new TypeError("learner state snapshot evidence must be an array");
	if (value.length > 8) throw new TypeError(`learner state snapshot evidence exceeds its item limit of 8`);
	return freezeEvidence(value.map((item, index) => {
		const record = asRecord(item, `learner state snapshot evidence[${index}]`);
		const kind = assertEnum(strictString(record.kind, `learner state snapshot evidence[${index}].kind`), EVIDENCE_KINDS, `learner state snapshot evidence[${index}].kind`);
		assertExactKeys(record, [
			"kind",
			"summary",
			"confidence",
			"correctness",
			"independence",
			"source",
			...kind === "transfer" ? ["transferContext"] : []
		], ["turn"], `learner state snapshot evidence[${index}]`);
		const source = assertEnum(strictString(record.source, `learner state snapshot evidence[${index}].source`), /* @__PURE__ */ new Set([
			"learner-message",
			"learner-action",
			"user-correction"
		]), `learner state snapshot evidence[${index}].source`);
		const turn = record.turn === void 0 ? void 0 : strictNonNegativeInteger(record.turn, `learner state snapshot evidence[${index}].turn`);
		const base = {
			summary: strictString(record.summary, `learner state snapshot evidence[${index}].summary`),
			confidence: assertEnum(strictString(record.confidence, `learner state snapshot evidence[${index}].confidence`), EVIDENCE_CONFIDENCE, `learner state snapshot evidence[${index}].confidence`),
			correctness: assertEnum(strictString(record.correctness, `learner state snapshot evidence[${index}].correctness`), EVIDENCE_CORRECTNESS, `learner state snapshot evidence[${index}].correctness`),
			independence: assertEnum(strictString(record.independence, `learner state snapshot evidence[${index}].independence`), EVIDENCE_INDEPENDENCE, `learner state snapshot evidence[${index}].independence`),
			source,
			...turn === void 0 ? {} : { turn }
		};
		if (kind === "transfer") return {
			...base,
			kind,
			transferContext: assertEnum(strictString(record.transferContext, `learner state snapshot evidence[${index}].transferContext`), TRANSFER_CONTEXTS, `learner state snapshot evidence[${index}].transferContext`)
		};
		return {
			...base,
			kind
		};
	}));
}
function parseAppliedEventFence(value) {
	if (!Array.isArray(value)) throw new TypeError("learner state snapshot appliedEventIds must be an array");
	if (value.length > 64) throw new TypeError(`learner state snapshot appliedEventIds exceeds its item limit of 64`);
	const parsed = value.map((item, index) => {
		const record = asRecord(item, `learner state snapshot appliedEventIds[${index}]`);
		assertExactKeys(record, ["id", "fingerprint"], [], `learner state snapshot appliedEventIds[${index}]`);
		const id = strictString(record.id, `learner state snapshot appliedEventIds[${index}].id`);
		const fingerprint = strictString(record.fingerprint, `learner state snapshot appliedEventIds[${index}].fingerprint`);
		if (!/^[a-f0-9]{64}$/.test(fingerprint)) throw new TypeError(`learner state snapshot appliedEventIds[${index}].fingerprint must be SHA-256 hex`);
		return Object.freeze({
			id,
			fingerprint
		});
	});
	if (new Set(parsed.map((item) => item.id)).size !== parsed.length) throw new TypeError("learner state snapshot appliedEventIds must not contain duplicate ids");
	return Object.freeze(parsed);
}
/**
* Strictly parses a full learner-state snapshot and binds it to the current
* session supplied by the caller. Persisted data never owns lifecycle identity.
* Unknown fields (including personality/style profiles) are rejected.
*/
function parseLearnerStateSnapshot(value, expectedSessionId) {
	const record = parseSnapshotInput(value, "learner state snapshot");
	assertExactKeys(record, SNAPSHOT_KEYS, [], "learner state snapshot");
	if (record.protocol !== "dsh-learning/learner-state@1") throw new TypeError(`learner state snapshot protocol must be ${LEARNER_STATE_PROTOCOL}`);
	if (record.tentative !== true) throw new TypeError("learner state snapshot tentative must be true");
	const sessionId = normalizeSessionId(expectedSessionId);
	const goal = record.goal === null ? null : strictString(record.goal, "learner state snapshot goal");
	const supportLevel = strictNonNegativeInteger(record.supportLevel, "learner state snapshot supportLevel");
	const parsed = {
		protocol: LEARNER_STATE_PROTOCOL,
		tentative: true,
		sessionId,
		revision: strictNonNegativeInteger(record.revision, "learner state snapshot revision"),
		goal,
		requestKind: assertEnum(strictString(record.requestKind, "learner state snapshot requestKind"), REQUEST_KINDS, "learner state snapshot requestKind"),
		level: assertEnum(strictString(record.level, "learner state snapshot level"), LEVELS, "learner state snapshot level"),
		priorKnowledge: strictStringList(record.priorKnowledge, 8, "learner state snapshot priorKnowledge"),
		gap: assertEnum(strictString(record.gap, "learner state snapshot gap"), GAPS, "learner state snapshot gap"),
		misconceptions: strictStringList(record.misconceptions, 6, "learner state snapshot misconceptions"),
		readiness: assertEnum(strictString(record.readiness, "learner state snapshot readiness"), READINESS_VALUES, "learner state snapshot readiness"),
		progressSignal: assertEnum(strictString(record.progressSignal, "learner state snapshot progressSignal"), PROGRESS_SIGNALS, "learner state snapshot progressSignal"),
		urgency: assertEnum(strictString(record.urgency, "learner state snapshot urgency"), URGENCY_VALUES, "learner state snapshot urgency"),
		supportLevel: normalizeSupportLevel(supportLevel),
		assessmentContext: assertEnum(strictString(record.assessmentContext, "learner state snapshot assessmentContext"), ASSESSMENT_CONTEXTS, "learner state snapshot assessmentContext"),
		mastery: assertEnum(strictString(record.mastery, "learner state snapshot mastery"), MASTERY_VALUES, "learner state snapshot mastery"),
		evidence: parseSnapshotEvidence(record.evidence),
		lastMove: assertEnum(strictString(record.lastMove, "learner state snapshot lastMove"), TEACHING_MOVES, "learner state snapshot lastMove"),
		sourceAnchors: strictStringList(record.sourceAnchors, 8, "learner state snapshot sourceAnchors"),
		appliedEventIds: parseAppliedEventFence(record.appliedEventIds)
	};
	assertMasteryEvidenceConsistency(parsed);
	return freezeState(parsed);
}
function omitSessionIdentity(state) {
	const { sessionId: _sessionId, ...snapshot } = state;
	return Object.freeze(snapshot);
}
/** Stable, lossless JSON encoding for a full snapshot with identity omitted. */
function serializeLearnerStateSnapshot(state) {
	const validated = parseLearnerStateSnapshot(omitSessionIdentity(state), state.sessionId);
	return JSON.stringify(omitSessionIdentity(validated));
}
/** Hydrates a persisted identity-free snapshot into exactly the current session. */
function hydrateLearnerStateSnapshot(value, sessionId) {
	return parseLearnerStateSnapshot(value, sessionId);
}
function normalizeSnapshotReason(value) {
	if (value !== "update" && value !== "correction" && value !== "reset") throw new TypeError("learner state snapshot reason must be update, correction, or reset");
	return value;
}
function assertResetSnapshot(snapshot) {
	const initial = createInitialLearnerState(snapshot.sessionId);
	for (const key of [
		"goal",
		"requestKind",
		"level",
		"priorKnowledge",
		"gap",
		"misconceptions",
		"readiness",
		"progressSignal",
		"urgency",
		"supportLevel",
		"assessmentContext",
		"mastery",
		"evidence",
		"lastMove",
		"sourceAnchors"
	]) if (JSON.stringify(snapshot[key]) !== JSON.stringify(initial[key])) throw new TypeError(`reset learner state snapshot must clear ${key}`);
}
function createLearnerStateSnapshotEvent(state, reason) {
	const hydrated = parseLearnerStateSnapshot(JSON.parse(serializeLearnerStateSnapshot(state)), state.sessionId);
	const snapshot = omitSessionIdentity(hydrated);
	const normalizedReason = normalizeSnapshotReason(reason);
	if (normalizedReason === "reset") assertResetSnapshot(hydrated);
	return Object.freeze({
		protocol: LEARNER_STATE_EVENT_PROTOCOL,
		reason: normalizedReason,
		snapshot
	});
}
function parseLearnerStateSnapshotEvent(value, expectedSessionId) {
	const record = parseSnapshotInput(value, "learner state snapshot event");
	assertExactKeys(record, [
		"protocol",
		"reason",
		"snapshot"
	], [], "learner state snapshot event");
	if (record.protocol !== "dsh-learning/state-event@1") throw new TypeError(`learner state event protocol must be ${LEARNER_STATE_EVENT_PROTOCOL}`);
	const reason = normalizeSnapshotReason(record.reason);
	const hydrated = parseLearnerStateSnapshot(record.snapshot, expectedSessionId);
	if (reason === "reset") assertResetSnapshot(hydrated);
	const snapshot = omitSessionIdentity(hydrated);
	return Object.freeze({
		protocol: LEARNER_STATE_EVENT_PROTOCOL,
		reason,
		snapshot
	});
}
/** Losslessly folds the latest valid full snapshot for exactly one session. */
function foldLearnerStateSession(sessionId, events) {
	let state = createInitialLearnerState(sessionId);
	for (const event of events) {
		if (event.type !== "learning/state") continue;
		const candidate = hydrateLearnerStateSnapshot(parseLearnerStateSnapshotEvent(event.data, state.sessionId).snapshot, state.sessionId);
		if (candidate.revision < state.revision) throw new TypeError(`learner state revision regressed from ${state.revision} to ${candidate.revision} at session event ${event.seq}`);
		if (candidate.revision === state.revision) {
			if (serializeLearnerStateSnapshot(candidate) !== serializeLearnerStateSnapshot(state)) throw new TypeError(`learner state revision ${candidate.revision} has conflicting snapshots`);
			continue;
		}
		state = candidate;
	}
	return state;
}
function safeQuoted(value, maxCodePoints = 120) {
	const shortened = [...value].slice(0, maxCodePoints).join("");
	return JSON.stringify(shortened).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026");
}
function safeList(values) {
	return `[${values.map((value) => safeQuoted(value, 80)).join(", ")}]`;
}
/** A conservative tokenizer-free estimate suitable for enforcing a prompt budget. */
function estimateLearnerStateTokens(text) {
	return (text.match(/[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\u3040-\u30ff\uac00-\ud7af]/gu)?.length ?? 0) + (text.replace(/[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\u3040-\u30ff\uac00-\ud7af]/gu, " ").match(/[A-Za-z0-9_/@.-]+|[^\sA-Za-z0-9_/@.-]/g) ?? []).reduce((total, piece) => {
		if (/^[A-Za-z0-9_/@.-]+$/.test(piece)) return total + Math.max(1, Math.ceil(piece.length / 4));
		return total + 1;
	}, 0);
}
function transcriptText(lines) {
	return [...lines].sort((left, right) => left.order - right.order).map((line) => line.text).join("\n");
}
/**
* Renders model-facing V4.1 state without lifecycle ids or raw event metadata.
* Optional evidence is admitted by priority until the 100-300 token budget is
* full; the XML-like envelope always remains closed and injection-safe.
*/
function renderLearnerStateTranscript(state, options = {}) {
	const requestedBudget = options.maxTokens ?? 300;
	if (!Number.isFinite(requestedBudget)) throw new TypeError("maxTokens must be finite");
	const maxTokens = Math.max(100, Math.min(300, Math.floor(requestedBudget)));
	const accepted = [...[{
		order: 0,
		priority: Infinity,
		text: `<learner_state protocol="${LEARNER_STATE_PROTOCOL}" tentative="true">`
	}, {
		order: 1e3,
		priority: Infinity,
		text: "</learner_state>"
	}]];
	const fits = (candidate) => estimateLearnerStateTokens(transcriptText([...accepted, candidate])) <= maxTokens;
	const admit = (candidate) => {
		if (!fits(candidate)) return false;
		accepted.push(candidate);
		return true;
	};
	const core = [
		{
			order: 20,
			priority: 100,
			text: `request_kind: ${state.requestKind}`
		},
		{
			order: 50,
			priority: 95,
			text: `gap: ${state.gap}`
		},
		{
			order: 80,
			priority: 100,
			text: `progress_signal: ${state.progressSignal}`
		},
		{
			order: 100,
			priority: 95,
			text: `support_need: ${state.supportLevel}/5`
		},
		{
			order: 120,
			priority: 100,
			text: `mastery: ${state.mastery}`
		}
	];
	for (const line of core.sort((left, right) => right.priority - left.priority)) admit(line);
	if (state.goal === null) admit({
		order: 10,
		priority: 100,
		text: "goal: unknown"
	});
	else {
		const goalLength = Math.min(96, [...state.goal].length);
		for (let length = goalLength; length >= 1; length -= 1) if (admit({
			order: 10,
			priority: 100,
			text: `goal: ${safeQuoted(state.goal, length)}`
		})) break;
	}
	const optional = [
		{
			order: 30,
			priority: 78,
			text: `level: ${state.level}`
		},
		{
			order: 70,
			priority: 82,
			text: `readiness: ${state.readiness}`
		},
		{
			order: 90,
			priority: 86,
			text: `urgency: ${state.urgency}`
		},
		{
			order: 110,
			priority: 76,
			text: `assessment_context: ${state.assessmentContext}`
		}
	];
	if (state.priorKnowledge.length) optional.push({
		order: 40,
		priority: 65,
		text: `prior_knowledge: ${safeList(state.priorKnowledge)}`
	});
	if (state.misconceptions.length) optional.push({
		order: 60,
		priority: 80,
		text: `misconceptions: ${safeList(state.misconceptions)}`
	});
	state.evidence.slice(-4).forEach((item, index) => {
		const transferContext = item.kind === "transfer" ? `/${item.transferContext}` : "";
		optional.push({
			order: 200 + index,
			priority: item.kind === "transfer" ? 100 : 90 + index,
			text: `evidence: ${item.kind}${transferContext}/${item.correctness}/${item.independence}/${item.confidence}: ${safeQuoted(item.summary, 40)}`
		});
	});
	if (state.sourceAnchors.length) optional.push({
		order: 300,
		priority: 60,
		text: `source_anchors: ${safeList(state.sourceAnchors)}`
	});
	for (const candidate of optional.sort((left, right) => right.priority - left.priority)) admit(candidate);
	const rendered = transcriptText(accepted);
	if (estimateLearnerStateTokens(rendered) > maxTokens) throw new Error("learner state transcript exceeded its hard token budget");
	return rendered;
}
//#endregion
//#region lib/types/bootstrap.js
/**
* Earliest-load compatibility hook for the installable Learning package.
*
* The portable runtime statically imports this package's preset entry before
* boot and before persistence can load a session. Keep required session-event
* registration here so every Host/preset entry uses the same idempotent seam.
*/
/** Register the exact required Learning session event before persistence load. */
function registerInteractiveLearningSessionCompatibility() {
	registerLearningSessionEventType();
}
registerInteractiveLearningSessionCompatibility();
//#endregion
export { LEARNER_STATE_SESSION_EVENT_TYPE as a, foldLearnerStateSession as c, reduceLearnerState as d, registerLearningSessionEventType as f, serializeLearnerStateSnapshot as h, LEARNER_STATE_PROTOCOL as i, hydrateLearnerStateSnapshot as l, resetLearnerState as m, DEFAULT_TRANSCRIPT_TOKEN_BUDGET as n, createInitialLearnerState as o, renderLearnerStateTranscript as p, LEARNER_STATE_EVENT_PROTOCOL as r, createLearnerStateSnapshotEvent as s, registerInteractiveLearningSessionCompatibility as t, parseLearnerStateSnapshotEvent as u };
