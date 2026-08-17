import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { MarkdownText } from '@deepseek-ai/dsh-client-ui-primitives';
import { useId, useState } from 'react';
import css from './LearningActivity.module.css';
export function ProcessStepper({ activity, busy, onSubmit, t }) {
    const { steps } = activity.payload;
    const headingId = useId();
    const [index, setIndex] = useState(0);
    const [furthest, setFurthest] = useState(0);
    const [answers, setAnswers] = useState({});
    const [revealed, setRevealed] = useState(() => new Set(steps.filter(step => step.checkpoint === undefined).map(step => step.id)));
    const step = steps[index];
    const isRevealed = revealed.has(step.id);
    const prediction = answers[step.id] ?? '';
    const canReveal = step.checkpoint === undefined || prediction.trim() !== '';
    const reveal = () => setRevealed(current => new Set([...current, step.id]));
    const restart = () => {
        setIndex(0);
        setFurthest(0);
        setAnswers({});
        setRevealed(new Set(steps.filter(item => item.checkpoint === undefined).map(item => item.id)));
    };
    const advance = () => {
        const next = Math.min(index + 1, steps.length - 1);
        setIndex(next);
        setFurthest(current => Math.max(current, next));
    };
    const submit = () => {
        const checkpoints = steps
            .filter(item => item.checkpoint !== undefined)
            .map(item => ({ stepId: item.id, answer: answers[item.id] ?? '' }));
        onSubmit({
            answer: { checkpoints },
            interactionState: { currentStep: index, revealed: [...revealed] },
        });
    };
    return (_jsxs("div", { className: css.activityContent, children: [_jsx("p", { className: css.prompt, children: activity.payload.question ?? activity.prompt }), _jsxs("div", { className: css.stepMeta, children: [_jsx("span", { children: t('step', { current: index + 1, total: steps.length }) }), _jsx("button", { className: css.textButton, type: "button", disabled: busy, onClick: restart, children: t('restart') })] }), _jsx("ol", { className: `${css.processMap} ${steps.length > 6 ? css.processMapVertical : ''}`, style: { '--process-step-count': steps.length }, "aria-label": t('processMap'), "data-process-map": "true", children: steps.map((item, itemIndex) => {
                    const state = itemIndex === index ? 'current' : itemIndex <= furthest ? 'complete' : 'upcoming';
                    const connectorComplete = itemIndex < furthest || (itemIndex === index && revealed.has(item.id));
                    return (_jsx("li", { className: css.processStep, "data-state": state, "data-connector-complete": connectorComplete || undefined, children: _jsxs("button", { className: css.processStepButton, type: "button", disabled: busy || itemIndex > furthest, "aria-current": itemIndex === index ? 'step' : undefined, onClick: () => setIndex(itemIndex), children: [_jsx("span", { className: css.processNode, "aria-hidden": "true", children: state === 'complete' ? '✓' : itemIndex + 1 }), _jsx("span", { className: css.processTitle, children: item.title })] }) }, item.id));
                }) }), _jsxs("section", { className: css.stepFocus, "aria-labelledby": headingId, children: [_jsx("h3", { id: headingId, children: step.title }), step.checkpoint === undefined ? null : (_jsxs("fieldset", { className: css.prediction, disabled: busy || isRevealed, children: [_jsx("legend", { children: t('predict') }), _jsx("p", { children: step.checkpoint.question }), step.checkpoint.options === undefined ? (_jsx("textarea", { "aria-label": step.checkpoint.question, value: prediction, onChange: event => setAnswers(current => ({ ...current, [step.id]: event.target.value })) })) : (_jsx("div", { className: css.predictionOptions, children: step.checkpoint.options.map(option => (_jsxs("label", { className: css.option, "data-selected": prediction === option || undefined, children: [_jsx("input", { type: "radio", name: `prediction-${step.id}`, value: option, checked: prediction === option, onChange: () => setAnswers(current => ({ ...current, [step.id]: option })) }), _jsx("span", { children: option })] }, option))) }))] })), !isRevealed ? (_jsx("button", { className: css.revealButton, type: "button", disabled: busy || !canReveal, onClick: reveal, children: t('reveal') })) : (_jsx("div", { className: css.revealed, children: _jsx(MarkdownText, { text: step.content }) }))] }), _jsxs("div", { className: css.navigation, children: [_jsx("button", { className: css.ghostButton, type: "button", disabled: busy || index === 0, onClick: () => setIndex(current => current - 1), children: t('previous') }), index < steps.length - 1 ? (_jsx("button", { className: css.primaryButton, type: "button", disabled: busy || !isRevealed, onClick: advance, children: t('next') })) : (_jsx("button", { className: css.primaryButton, type: "button", disabled: busy || !isRevealed, onClick: submit, children: busy ? t('submitting') : t('submit') }))] })] }));
}
//# sourceMappingURL=ProcessStepper.js.map