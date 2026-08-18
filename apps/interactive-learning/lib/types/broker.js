import { randomUUID } from 'node:crypto';
import { Service } from '@deepseek-ai/cordis';
import { UserQuestionError, } from '@deepseek-ai/dsh-user-questions';
import { RESPONSE_PROTOCOL_V2, RESPONSE_PROTOCOL, LearningProtocolError, parseLearningActivity, parseLearningActivityV2, parseLearningResponseV2, } from "./protocol.js";
import { encodeLearningWaitDetail, learningWaitQuestionId, } from "./transport.js";
export const INTERACTIVE_LEARNING_PACKAGE = '@dsh-portable/interactive-learning';
export const DEFAULT_LEARNING_WAIT_TIMEOUT_MS = 5 * 60_000;
class LearningWaitAbort extends Error {
    reason;
    constructor(reason) {
        super(reason);
        this.reason = reason;
        this.name = 'LearningWaitAbort';
    }
}
function fallback(activityId, activity, reason) {
    return {
        protocol: RESPONSE_PROTOCOL,
        activityId,
        action: 'skip',
        interactionState: { reason, fallbackMarkdown: activity.fallbackMarkdown },
    };
}
/** Host-side V2 Question/Reveal coordinator; V1 is replay-only. */
export class LearningActivityBroker extends Service {
    static inject = ['userQuestions'];
    pendingActivities = new Map();
    lessons = new Map();
    receipts = new Map();
    gateCalls = new Map();
    observers = new Set();
    constructor(ctx) {
        super(ctx, 'learningActivities');
        ctx.effect(() => () => {
            for (const [controller, state] of this.pendingActivities) {
                state.reason = 'plugin-disposed';
                controller.abort(new LearningWaitAbort(state.reason));
            }
            this.pendingActivities.clear();
            this.lessons.clear();
            this.receipts.clear();
            this.gateCalls.clear();
        }, 'interactive-learning: abort pending activities');
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
        const observed = { ...event, at: Date.now() };
        for (const listener of this.observers) {
            try {
                listener(observed);
            }
            catch { /* diagnostics must not break the learning gate */ }
        }
    }
    /** Whether this Web composition advertises the matching Client bundle. */
    hasRichClient() {
        return this.ctx.get('clientModules')?.graph().entries
            .some((entry) => entry.id === INTERACTIVE_LEARNING_PACKAGE) === true;
    }
    async presentQuestion(request) {
        return this.presentGate(request);
    }
    async presentReveal(request) {
        return this.presentGate(request);
    }
    /** V2 live path: one call owns exactly one durable Question or Reveal wait. */
    async presentGate(request) {
        const callKey = request.callId === undefined || request.agent === undefined
            ? undefined : `${String(request.agent.session.id)}:${request.callId}`;
        const prior = callKey === undefined ? undefined : this.gateCalls.get(callKey);
        if (prior !== undefined)
            return prior;
        const pending = this.presentGateOnce(request);
        if (callKey !== undefined) {
            this.gateCalls.set(callKey, pending);
            if (this.gateCalls.size > 1_024) {
                const oldest = this.gateCalls.keys().next().value;
                if (oldest !== undefined)
                    this.gateCalls.delete(oldest);
            }
        }
        try {
            return await pending;
        }
        catch (cause) {
            if (callKey !== undefined)
                this.gateCalls.delete(callKey);
            throw cause;
        }
    }
    async presentGateOnce(request) {
        const activity = parseLearningActivityV2(request.activity);
        const activityId = randomUUID();
        const waitId = randomUUID();
        const sessionId = request.agent === undefined ? '' : String(request.agent.session.id);
        let lessonToken;
        let roundToken;
        let lesson;
        if (activity.phase === 'question') {
            if (activity.lessonToken === undefined) {
                if (activity.seq !== 0)
                    throw new LearningProtocolError(['a new lesson must start with activity.seq 0']);
                for (const [tokenValue, active] of this.lessons) {
                    if (active.sessionId === sessionId)
                        this.lessons.delete(tokenValue);
                }
                lessonToken = randomUUID();
                roundToken = randomUUID();
                if (sessionId !== '') {
                    lesson = { sessionId, lessonToken, roundToken, seq: activity.seq, status: 'question-pending' };
                    this.lessons.set(lessonToken, lesson);
                }
            }
            else {
                lessonToken = activity.lessonToken;
                lesson = this.lessons.get(lessonToken);
                if (lesson === undefined)
                    throw new LearningProtocolError(['activity.lessonToken is not active']);
                if (lesson.sessionId !== sessionId)
                    throw new LearningProtocolError(['activity.lessonToken belongs to another session']);
                if (lesson.status !== 'ready-question')
                    throw new LearningProtocolError(['the previous reveal must resolve before the next question']);
                if (activity.seq !== lesson.seq + 1)
                    throw new LearningProtocolError(['activity.seq must advance by exactly one']);
                roundToken = randomUUID();
                lesson.seq = activity.seq;
                lesson.roundToken = roundToken;
                lesson.status = 'question-pending';
            }
        }
        else {
            lessonToken = activity.lessonToken;
            roundToken = activity.roundToken;
            lesson = this.lessons.get(lessonToken);
            if (lesson === undefined)
                throw new LearningProtocolError(['activity.lessonToken is not active']);
            if (lesson.sessionId !== sessionId)
                throw new LearningProtocolError(['activity.lessonToken belongs to another session']);
            if (lesson.status !== 'awaiting-reveal')
                throw new LearningProtocolError(['reveal is not valid in the current lesson state']);
            if (lesson.seq !== activity.seq)
                throw new LearningProtocolError(['activity.seq does not match the answered question']);
            if (lesson.roundToken !== roundToken)
                throw new LearningProtocolError(['activity.roundToken does not match the answered question']);
            lesson.status = 'reveal-pending';
        }
        const eventBase = {
            phase: activity.phase,
            activityId,
            lessonToken,
            roundToken,
            seq: activity.seq,
            ...(request.callId === undefined ? {} : { callId: request.callId }),
        };
        if (activity.phase === 'reveal' || activity.lessonToken !== undefined) {
            this.emit({ name: 'learning.model.next_step_started', ...eventBase });
        }
        this.emit({ name: 'learning.call.args_completed', ...eventBase });
        this.emit({ name: 'learning.protocol.validated', ...eventBase });
        const fallbackV2 = (reason, action = 'skip') => activity.phase === 'question'
            ? {
                protocol: RESPONSE_PROTOCOL_V2, phase: 'question', activityId, lessonToken, roundToken,
                seq: activity.seq, action, receiptId: randomUUID(),
                interactionState: { reason, fallbackMarkdown: activity.fallbackMarkdown },
            }
            : {
                protocol: RESPONSE_PROTOCOL_V2, phase: 'reveal', activityId, lessonToken, roundToken,
                seq: activity.seq, action, animation: { completed: false }, receiptId: randomUUID(),
                interactionState: { reason, fallbackMarkdown: activity.fallbackMarkdown },
            };
        let result;
        if (!this.hasRichClient())
            result = fallbackV2('client-capability-unavailable');
        else if (request.agent === undefined)
            result = fallbackV2('agent-context-unavailable');
        else {
            const timeoutMs = request.timeoutMs ?? DEFAULT_LEARNING_WAIT_TIMEOUT_MS;
            if (!Number.isFinite(timeoutMs) || timeoutMs <= 0)
                result = fallbackV2('client-response-timeout');
            else {
                try {
                    result = await this.waitForV2({ request, activity, activityId, waitId, lessonToken, roundToken, eventBase, timeoutMs });
                }
                catch (cause) {
                    this.lessons.delete(lessonToken);
                    throw cause;
                }
            }
        }
        if (lesson !== undefined) {
            if (result.action === 'cancel' || result.action === 'skip')
                this.lessons.delete(lessonToken);
            else if (activity.phase === 'question')
                lesson.status = 'awaiting-reveal';
            else
                lesson.status = 'ready-question';
        }
        this.emit({ name: 'learning.wait.resolved', ...eventBase });
        return result;
    }
    async waitForV2(input) {
        const { request, activity, activityId, waitId, lessonToken, roundToken, eventBase, timeoutMs } = input;
        const controller = new AbortController();
        const state = {};
        this.pendingActivities.set(controller, state);
        const abortFromSession = () => {
            state.reason = 'session-aborted';
            controller.abort(new LearningWaitAbort(state.reason));
        };
        if (request.signal?.aborted === true)
            abortFromSession();
        else
            request.signal?.addEventListener('abort', abortFromSession, { once: true });
        const timer = setTimeout(() => {
            state.reason = 'client-response-timeout';
            controller.abort(new LearningWaitAbort(state.reason));
        }, timeoutMs);
        timer.unref?.();
        const fallbackV2 = (reason, action = 'skip') => activity.phase === 'question'
            ? { protocol: RESPONSE_PROTOCOL_V2, phase: 'question', activityId, lessonToken, roundToken, seq: activity.seq, action, receiptId: randomUUID(), interactionState: { reason, fallbackMarkdown: activity.fallbackMarkdown } }
            : { protocol: RESPONSE_PROTOCOL_V2, phase: 'reveal', activityId, lessonToken, roundToken, seq: activity.seq, action, animation: { completed: false }, receiptId: randomUUID(), interactionState: { reason, fallbackMarkdown: activity.fallbackMarkdown } };
        try {
            const questions = this.ctx.userQuestions;
            const ask = questions.ask({
                questions: [{
                        id: learningWaitQuestionId(waitId),
                        question: activity.phase === 'question' ? activity.prompt : 'Review this reveal, then continue.',
                        detail: encodeLearningWaitDetail({
                            waitId, activityId, lessonToken, roundToken, seq: activity.seq, phase: activity.phase, activity,
                            ...(request.callId === undefined ? {} : { callId: request.callId }),
                        }),
                    }],
                agent: request.agent,
                signal: controller.signal,
            });
            this.emit({ name: 'learning.wait.registered', ...eventBase });
            if (activity.phase === 'reveal')
                this.emit({ name: 'learning.reveal.received', ...eventBase });
            const aborted = new Promise((_resolve, reject) => {
                if (controller.signal.aborted)
                    reject(controller.signal.reason);
                else
                    controller.signal.addEventListener('abort', () => reject(controller.signal.reason), { once: true });
            });
            const answer = await Promise.race([ask, aborted]);
            const item = answer.answers[0];
            const custom = item?.custom?.trim();
            let response;
            if (custom === undefined || custom === '')
                response = fallbackV2('user-skipped');
            else {
                let decoded;
                try {
                    decoded = JSON.parse(custom);
                }
                catch {
                    decoded = undefined;
                }
                if (typeof decoded === 'object' && decoded !== null
                    && decoded.protocol === RESPONSE_PROTOCOL_V2) {
                    response = parseLearningResponseV2(decoded, { activityId, phase: activity.phase, lessonToken, roundToken, seq: activity.seq });
                }
                else if (activity.phase === 'question') {
                    response = {
                        protocol: RESPONSE_PROTOCOL_V2, phase: 'question', activityId, lessonToken, roundToken,
                        seq: activity.seq, action: 'submit', answer: { text: custom }, receiptId: randomUUID(),
                        interactionState: { renderer: 'markdown-fallback' },
                    };
                }
                else
                    response = fallbackV2('rich-client-required');
            }
            const prior = this.receipts.get(response.receiptId);
            if (prior !== undefined) {
                if (JSON.stringify(prior) !== JSON.stringify(response))
                    throw new LearningProtocolError(['response.receiptId was reused for different content']);
                response = prior;
            }
            else {
                this.receipts.set(response.receiptId, response);
                if (this.receipts.size > 1_024) {
                    const oldest = this.receipts.keys().next().value;
                    if (oldest !== undefined)
                        this.receipts.delete(oldest);
                }
            }
            if (activity.phase === 'question' && response.action === 'submit') {
                this.emit({ name: 'learning.answer.accepted', ...eventBase });
            }
            else if (activity.phase === 'reveal' && response.action === 'continue') {
                this.emit({ name: 'learning.continue.accepted', ...eventBase });
            }
            return response;
        }
        catch (cause) {
            if (cause instanceof LearningProtocolError)
                throw cause;
            if (cause instanceof LearningWaitAbort)
                return fallbackV2(cause.reason, cause.reason === 'client-response-timeout' ? 'skip' : 'cancel');
            const code = cause instanceof UserQuestionError ? cause.code : undefined;
            if (code === 'ASK_CANCELLED')
                return fallbackV2('user-cancelled', 'cancel');
            if (code === 'ASK_ABORTED') {
                const reason = state.reason ?? 'session-aborted';
                return fallbackV2(reason, reason === 'client-response-timeout' ? 'skip' : 'cancel');
            }
            if (code === 'NO_PROVIDER' || code === 'DELEGATED_CALLER' || code === 'CALLER_NOT_LIVE')
                return fallbackV2(code.toLowerCase());
            throw cause;
        }
        finally {
            clearTimeout(timer);
            request.signal?.removeEventListener('abort', abortFromSession);
            this.pendingActivities.delete(controller);
        }
    }
    /** @deprecated V1 is accepted only for static legacy replay/fallback. */
    async present(request) {
        const activity = parseLearningActivity(request.activity);
        return fallback(randomUUID(), activity, 'legacy-replay-only');
    }
}
export default LearningActivityBroker;
//# sourceMappingURL=broker.js.map