import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { MarkdownText } from '@deepseek-ai/dsh-client-ui-primitives';
import { useEffect, useReducer, useRef, useState } from 'react';
import { initialRoundState, roundReducer } from "./roundState.js";
import { emitLearningUiLifecycle } from "./lifecycle.js";
import { ParameterRoundVisual } from "./ParameterExplorer.js";
import css from './LearningActivity.module.css';
function readStoredRound(storageKey) {
    if (storageKey === undefined || typeof sessionStorage === 'undefined')
        return {};
    try {
        return JSON.parse(sessionStorage.getItem(`dsh-learning/round@2:${storageKey}`) ?? '{}');
    }
    catch {
        return {};
    }
}
function writeStoredRound(storageKey, update) {
    if (storageKey === undefined || typeof sessionStorage === 'undefined')
        return;
    const key = `dsh-learning/round@2:${storageKey}`;
    sessionStorage.setItem(key, JSON.stringify({ ...readStoredRound(storageKey), ...update }));
}
function ProcessVisual({ activity, final }) {
    if (activity.visual?.kind !== 'process')
        return null;
    const frame = activity.phase === 'question'
        ? activity.visual.frame
        : final ? activity.visual.after : activity.visual.before;
    return (_jsxs("section", { className: css.roundProcess, "data-final": final || undefined, children: [_jsx("span", { className: css.roundNode, children: activity.seq + 1 }), _jsxs("div", { children: [_jsx("h3", { children: frame.title }), frame.content === undefined ? null : _jsx(MarkdownText, { text: frame.content })] })] }));
}
function ParameterVisual({ activity, t }) {
    if (activity.visual?.kind !== 'parameter')
        return null;
    return _jsx(ParameterRoundVisual, { payload: activity.visual, disabled: activity.phase === 'reveal', t: t });
}
function StructureVisual({ activity }) {
    if (activity.visual?.kind !== 'structure')
        return null;
    const [selected, setSelected] = useState(() => new Set());
    const left = new Map(activity.visual.left.items.map(item => [item.id, item]));
    const right = new Map(activity.visual.right.items.map(item => [item.id, item]));
    return (_jsxs("section", { className: css.roundStructure, "aria-label": `${activity.visual.left.title} / ${activity.visual.right.title}`, children: [_jsx("h3", { children: activity.visual.left.title }), _jsx("h3", { children: activity.visual.right.title }), activity.visual.alignments.map(alignment => {
                const leftItem = alignment.leftId === undefined ? undefined : left.get(alignment.leftId);
                const rightItem = alignment.rightId === undefined ? undefined : right.get(alignment.rightId);
                const label = alignment.prompt ?? `${leftItem?.label ?? '—'} / ${rightItem?.label ?? '—'}`;
                return (_jsxs("label", { className: css.roundAlignment, "data-selected": selected.has(alignment.id) || undefined, children: [_jsx("input", { type: "checkbox", checked: selected.has(alignment.id), disabled: activity.phase === 'reveal', onChange: () => setSelected(current => {
                                const next = new Set(current);
                                if (next.has(alignment.id))
                                    next.delete(alignment.id);
                                else
                                    next.add(alignment.id);
                                return next;
                            }) }), _jsx("span", { children: leftItem?.label ?? '—' }), _jsx("span", { children: rightItem?.label ?? '—' }), alignment.prompt === undefined ? null : _jsx("small", { children: label })] }, alignment.id));
            })] }));
}
function CurrentVisual({ activity, final, t }) {
    if (activity.visual === undefined)
        return null;
    if (activity.visual.kind === 'process')
        return _jsx(ProcessVisual, { activity: activity, final: final });
    if (activity.visual.kind === 'parameter')
        return _jsx(ParameterVisual, { activity: activity, t: t });
    return _jsx(StructureVisual, { activity: activity });
}
function QuestionInput({ activity, disabled, answer, setAnswer, }) {
    if (activity.input.kind === 'single_choice') {
        return (_jsxs("fieldset", { className: css.prediction, disabled: disabled, children: [_jsx("legend", { children: activity.prompt }), activity.input.options.map(option => (_jsxs("label", { className: css.option, children: [_jsx("input", { type: "radio", name: `learning-round-${activity.seq}`, value: option.id, checked: answer === option.id, onChange: () => setAnswer(option.id) }), _jsx("span", { children: option.label })] }, option.id)))] }));
    }
    if (activity.input.kind === 'number') {
        return (_jsxs("label", { className: css.answerField, children: [_jsx("span", { children: activity.prompt }), _jsx("input", { type: "number", value: answer, min: activity.input.min, max: activity.input.max, step: activity.input.step, disabled: disabled, onChange: event => setAnswer(event.target.value) })] }));
    }
    return (_jsxs("label", { className: css.answerField, children: [_jsx("span", { children: activity.prompt }), _jsx("textarea", { value: answer, placeholder: activity.input.placeholder, maxLength: activity.input.maxLength, disabled: disabled, onChange: event => setAnswer(event.target.value) })] }));
}
export function RoundActivity({ activity, completed = false, initialAnswer, storageKey, t, onSubmitAnswer, onContinue, onCancel, }) {
    const stored = useRef(readStoredRound(storageKey)).current;
    const [state, dispatch] = useReducer(roundReducer, undefined, () => {
        if (completed || stored.completed === true)
            return initialRoundState(activity.phase, true);
        if (activity.phase === 'reveal' && stored.animationComplete === true) {
            return { status: 'ready_to_continue', error: null };
        }
        return initialRoundState(activity.phase);
    });
    const [answer, setAnswer] = useState(() => stored.draft
        ?? (typeof initialAnswer === 'string' || typeof initialAnswer === 'number' ? String(initialAnswer) : ''));
    const ackStarted = useRef(false);
    const cancelStarted = useRef(false);
    const lifecycleStarted = useRef(false);
    const revealElement = useRef(null);
    const reducedMotion = typeof window !== 'undefined'
        && typeof window.matchMedia === 'function'
        && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    useEffect(() => {
        emitLearningUiLifecycle({ name: 'learning.ui.presented', phase: activity.phase, seq: activity.seq, storageKey });
    }, [activity.phase, activity.seq, storageKey]);
    useEffect(() => {
        if (activity.phase === 'reveal' && state.status === 'animating' && !lifecycleStarted.current) {
            lifecycleStarted.current = true;
            emitLearningUiLifecycle({ name: 'learning.animation.started', phase: activity.phase, seq: activity.seq, storageKey });
        }
    }, [activity.phase, activity.seq, state.status, storageKey]);
    useEffect(() => {
        if (activity.phase === 'reveal' && state.status === 'animating' && reducedMotion) {
            emitLearningUiLifecycle({ name: 'learning.animation.finished', phase: activity.phase, seq: activity.seq, storageKey });
            writeStoredRound(storageKey, { animationComplete: true });
            dispatch({ type: 'ANIMATION_FINISHED' });
        }
    }, [activity.phase, activity.seq, reducedMotion, state.status, storageKey]);
    useEffect(() => {
        if (activity.phase === 'question' && state.status === 'awaiting_input')
            writeStoredRound(storageKey, { draft: answer });
    }, [activity.phase, answer, state.status, storageKey]);
    useEffect(() => {
        if (activity.phase === 'reveal' && state.status === 'ready_to_continue') {
            writeStoredRound(storageKey, { animationComplete: true });
        }
        if (state.status === 'completed')
            writeStoredRound(storageKey, { completed: true });
    }, [activity.phase, state.status, storageKey]);
    const finishAnimation = () => {
        if (state.status === 'animating') {
            emitLearningUiLifecycle({ name: 'learning.animation.finished', phase: activity.phase, seq: activity.seq, storageKey });
            writeStoredRound(storageKey, { animationComplete: true });
            dispatch({ type: 'ANIMATION_FINISHED' });
        }
    };
    useEffect(() => {
        const element = revealElement.current;
        if (element === null || activity.phase !== 'reveal' || state.status !== 'animating')
            return;
        element.addEventListener('animationend', finishAnimation);
        return () => element.removeEventListener('animationend', finishAnimation);
    }, [activity.phase, state.status, storageKey]);
    const submitAnswer = () => {
        if (activity.phase !== 'question' || onSubmitAnswer === undefined || answer.trim() === '')
            return;
        dispatch({ type: 'SUBMIT_ANSWER' });
        const value = activity.input.kind === 'number' ? Number(answer) : answer;
        void onSubmitAnswer(value, { answer: value }).then(() => {
            dispatch({ type: 'ANSWER_ACCEPTED' });
            dispatch({ type: 'WAIT_FOR_REVEAL' });
        }).catch((cause) => dispatch({
            type: 'SUBMISSION_FAILED',
            message: cause instanceof Error ? cause.message : String(cause),
        }));
    };
    const submitContinue = () => {
        if (activity.phase !== 'reveal' || onContinue === undefined
            || state.status !== 'ready_to_continue' || ackStarted.current)
            return;
        ackStarted.current = true;
        dispatch({ type: 'SUBMIT_CONTINUE' });
        void onContinue({ completed: true, reducedMotion: reducedMotion || undefined }).then(() => {
            dispatch({ type: 'ACK_ACCEPTED' });
            emitLearningUiLifecycle({ name: 'learning.continue.accepted', phase: activity.phase, seq: activity.seq, storageKey });
        }).catch((cause) => dispatch({
            type: 'SUBMISSION_FAILED',
            message: cause instanceof Error ? cause.message : String(cause),
        })).finally(() => { ackStarted.current = false; });
    };
    const final = activity.phase === 'reveal' && state.status !== 'animating';
    return (_jsxs("section", { className: css.round, "data-round-state": state.status, children: [_jsxs("header", { className: css.roundHeader, children: [activity.focus.progress === undefined ? null : (_jsx("span", { children: t('roundProgress', {
                            current: activity.focus.progress.current,
                            total: activity.focus.progress.total ?? '?',
                        }) })), _jsx("h2", { children: activity.focus.title })] }), _jsx("div", { ref: revealElement, className: activity.phase === 'reveal' ? css.revealTransition : undefined, "data-reveal-transition": activity.phase === 'reveal' || undefined, children: _jsx(CurrentVisual, { activity: activity, final: final, t: t }) }), activity.phase === 'question' ? (_jsxs(_Fragment, { children: [_jsx(QuestionInput, { activity: activity, disabled: state.status !== 'awaiting_input', answer: answer, setAnswer: setAnswer }), _jsx("button", { className: css.primaryButton, type: "button", disabled: state.status !== 'awaiting_input' || answer.trim() === '', onClick: submitAnswer, children: state.status === 'submitting_answer' ? t('submitting') : t('submitAnswer') }), state.status === 'awaiting_model_reveal' ? _jsx("p", { role: "status", children: t('awaitingReveal') }) : null] })) : (_jsxs(_Fragment, { children: [_jsxs("section", { className: css.roundFeedback, "data-verdict": activity.feedback.verdict, children: [activity.feedback.learnerEcho === undefined ? null : _jsx("p", { children: activity.feedback.learnerEcho }), _jsx(MarkdownText, { text: activity.feedback.explanation }), activity.feedback.answer === undefined ? null : _jsx("strong", { children: activity.feedback.answer })] }), state.status === 'completed' ? null : (_jsx("button", { className: css.primaryButton, type: "button", disabled: state.status !== 'ready_to_continue', onClick: submitContinue, children: activity.advance.label ?? t('continue') }))] })), state.error === null ? null : _jsx("p", { className: css.error, role: "alert", children: state.error }), state.status === 'completed' || onCancel === undefined ? null : (_jsx("button", { className: css.textButton, type: "button", disabled: cancelStarted.current || state.status === 'submitting_answer' || state.status === 'ack_submitting', onClick: () => {
                    if (cancelStarted.current)
                        return;
                    cancelStarted.current = true;
                    void onCancel().catch((cause) => dispatch({
                        type: 'SUBMISSION_FAILED',
                        message: cause instanceof Error ? cause.message : String(cause),
                    })).finally(() => { cancelStarted.current = false; });
                }, children: t('cancel') }))] }));
}
//# sourceMappingURL=RoundActivity.js.map