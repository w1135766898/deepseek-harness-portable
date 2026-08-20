/** `formula_steps`: a derivation revealed one justified transformation at a time. */
import { useEffect, useState, type KeyboardEvent } from 'react'
import { MarkdownText } from '@deepseek-ai/dsh-client-ui-primitives'
import { labelTemplate, useVisualLabels } from '../core/labels.ts'
import { displayMath, toneAt } from '../core/format.ts'
import type { FormulaStepsContent, RendererProps } from '../core/types.ts'
import { elementState } from '../state/visual-state.ts'
import shell from '../styles/shell.module.css'
import css from '../styles/formula.module.css'

export function FormulaStepsRenderer({ content, focus }: RendererProps<FormulaStepsContent>) {
  const labels = useVisualLabels()
  const [revealedIndex, setRevealedIndex] = useState(0)
  const lastIndex = content.steps.length - 1
  useEffect(() => {
    const focusedIndex = content.steps.findIndex(step => focus.currentIds.has(step.id))
    if (focusedIndex >= 0) setRevealedIndex(current => Math.max(current, focusedIndex))
  }, [content.steps, focus.currentIds])
  const move = (delta: number): void => setRevealedIndex(current => Math.max(0, Math.min(lastIndex, current + delta)))
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.target !== event.currentTarget) return
    if (event.key === 'ArrowLeft') { event.preventDefault(); move(-1) }
    else if (event.key === 'ArrowRight') { event.preventDefault(); move(1) }
    else if (event.key === 'Home') { event.preventDefault(); setRevealedIndex(0) }
    else if (event.key === 'End') { event.preventDefault(); setRevealedIndex(lastIndex) }
  }
  return (
    <div className={shell.rendererStack} role="group" tabIndex={0} onKeyDown={onKeyDown} aria-label={labels.formulaLabel}>
      <div className={css.formulaMeta}>
        <span>{labelTemplate(labels.formulaProgress, { current: revealedIndex + 1, total: content.steps.length })}</span>
        {content.notation === undefined ? null : <code>{content.notation}</code>}
      </div>
      <ol className={css.formulaSteps} aria-live="polite">
        {content.steps.slice(0, revealedIndex + 1).map((step, index) => (
          <li key={step.id} data-tone={toneAt(step.tone, index)} data-visual-state={elementState(step.id, focus)} data-visual-id={step.id}>
            {index === 0 || step.rule === undefined ? null : (
              <div className={css.formulaRule}><span aria-hidden="true">↓</span><strong>{labels.formulaRule}</strong><span>{step.rule}</span></div>
            )}
            <div className={css.formulaStepCard}>
              <span>{index + 1}</span>
              <div>
                <div className={css.formulaExpression} aria-label={step.expression}><MarkdownText text={displayMath(step.expression)} /></div>
                {step.label === undefined ? null : <strong>{step.label}</strong>}
                {step.detail === undefined ? null : <p>{step.detail}</p>}
              </div>
            </div>
          </li>
        ))}
      </ol>
      {revealedIndex >= lastIndex ? (
        <div className={css.formulaConclusion} aria-live="polite">
          <span>{labels.formulaConclusion}</span><strong>{content.conclusion ?? labels.formulaComplete}</strong>
        </div>
      ) : <div className={css.formulaUnknown} aria-hidden="true"><span>↓</span><code>?</code></div>}
      <div className={shell.controlRow}>
        <button type="button" className={shell.control} onClick={() => move(-1)} disabled={revealedIndex === 0}>{labels.previousStep}</button>
        <button type="button" className={`${shell.control} ${shell.controlPrimary}`} onClick={() => move(1)} disabled={revealedIndex >= lastIndex}>{labels.revealNextFormulaStep}</button>
        <button type="button" className={shell.control} onClick={() => setRevealedIndex(0)} disabled={revealedIndex === 0}>{labels.reset}</button>
      </div>
      <div className={shell.selectionSlot}>
        <p className={shell.interactionHint}>{labels.formulaInteractionHint}</p>
      </div>
    </div>
  )
}
