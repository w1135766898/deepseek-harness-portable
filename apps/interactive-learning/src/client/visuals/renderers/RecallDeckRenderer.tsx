/** `recall_deck`: retrieval practice, one card at a time. */
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { labelTemplate, useVisualLabels } from '../core/labels.ts'
import { EmptyFigure } from '../core/shell-parts.tsx'
import type { RecallDeckContent, RendererProps } from '../core/types.ts'
import { elementState } from '../state/visual-state.ts'
import shell from '../styles/shell.module.css'
import css from '../styles/recall.module.css'

type RecallStage = 'prompt' | 'hint' | 'answer'
type RecallStatus = 'mastered' | 'review'

function initialRecallState(content: RecallDeckContent, storageKey: string | undefined): {
  index: number
  stage: RecallStage
  statuses: Record<string, RecallStatus>
} {
  const initial = { index: 0, stage: 'prompt' as RecallStage, statuses: {} as Record<string, RecallStatus> }
  if (storageKey === undefined || typeof sessionStorage === 'undefined') return initial
  try {
    const stored = JSON.parse(sessionStorage.getItem(`dsh-learning/visual@4:recall:${storageKey}`) ?? '{}') as { index?: unknown; stage?: unknown; statuses?: unknown }
    if (typeof stored.index === 'number' && Number.isInteger(stored.index)) initial.index = Math.max(0, Math.min(content.cards.length - 1, stored.index))
    if (stored.stage === 'prompt' || stored.stage === 'hint' || stored.stage === 'answer') initial.stage = stored.stage
    if (typeof stored.statuses === 'object' && stored.statuses !== null && !Array.isArray(stored.statuses)) {
      for (const card of content.cards) {
        const status = (stored.statuses as Record<string, unknown>)[card.id]
        if (status === 'mastered' || status === 'review') initial.statuses[card.id] = status
      }
    }
    if (initial.stage === 'hint' && content.cards[initial.index]?.hint === undefined) initial.stage = 'answer'
  } catch {
    // Corrupt optional recall state should never prevent the canonical deck replay.
  }
  return initial
}

export function RecallDeckRenderer({ content, focus, storageKey }: RendererProps<RecallDeckContent>) {
  const labels = useVisualLabels()
  const initial = useMemo(() => initialRecallState(content, storageKey), [content, storageKey])
  const [cardIndex, setCardIndex] = useState(initial.index)
  const [stage, setStage] = useState<RecallStage>(initial.stage)
  const [statuses, setStatuses] = useState<Record<string, RecallStatus>>(initial.statuses)
  const current = content.cards[cardIndex]
  const followedFocus = useRef(-1)
  useEffect(() => {
    const focusedIndex = content.cards.findIndex(card => focus.currentIds.has(card.id))
    // Only a genuinely new focus target moves the deck; re-running with the
    // same target must not collapse a card the learner already revealed.
    if (focusedIndex < 0 || focusedIndex === followedFocus.current) return
    followedFocus.current = focusedIndex
    setCardIndex(focusedIndex)
    setStage('prompt')
  }, [content.cards, focus.currentIds])
  useEffect(() => {
    if (storageKey === undefined || typeof sessionStorage === 'undefined') return
    try { sessionStorage.setItem(`dsh-learning/visual@4:recall:${storageKey}`, JSON.stringify({ index: cardIndex, stage, statuses })) } catch {
      // Persistence is optional; the deck remains fully usable without it.
    }
  }, [cardIndex, stage, statuses, storageKey])
  if (current === undefined) return <EmptyFigure />
  const move = (delta: number): void => {
    setCardIndex(index => Math.max(0, Math.min(content.cards.length - 1, index + delta)))
    setStage('prompt')
  }
  const reset = (): void => { setCardIndex(0); setStage('prompt'); setStatuses({}) }
  const mark = (status: RecallStatus): void => setStatuses(value => ({ ...value, [current.id]: status }))
  const masteredCount = Object.values(statuses).filter(status => status === 'mastered').length
  const reviewCount = Object.values(statuses).filter(status => status === 'review').length
  const status = statuses[current.id]
  const revealNext = (): void => setStage(value => value === 'prompt' && current.hint !== undefined ? 'hint' : 'answer')
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.target !== event.currentTarget) return
    if (event.key === 'ArrowLeft') { event.preventDefault(); move(-1) }
    else if (event.key === 'ArrowRight') { event.preventDefault(); move(1) }
  }
  return (
    <div className={shell.rendererStack} role="group" tabIndex={0} onKeyDown={onKeyDown} aria-label={labels.recallDeckLabel}>
      <div className={css.recallToolbar}>
        <span>{labelTemplate(labels.recallProgress, { current: cardIndex + 1, total: content.cards.length })}</span>
        <output>{labelTemplate(labels.recallStatus, { mastered: masteredCount, review: reviewCount })}</output>
      </div>
      {content.instructions === undefined ? null : <p className={css.recallInstructions}>{content.instructions}</p>}
      <article className={css.recallCard} data-visual-id={current.id} data-visual-state={elementState(current.id, focus)} data-stage={stage}>
        <div className={css.recallCardHeader}>
          <span>{labels.recallPrompt}</span>
          <small data-status={status ?? 'unrated'}>{status === 'mastered' ? labels.mastered : status === 'review' ? labels.reviewAgain : labels.unrated}</small>
        </div>
        <h4>{current.prompt}</h4>
        {current.tags === undefined || current.tags.length === 0 ? null : <ul className={css.recallTags}>{current.tags.map(tag => <li key={tag}>{tag}</li>)}</ul>}
        {stage === 'prompt' || current.hint === undefined ? null : <section className={css.recallReveal} data-kind="hint" aria-live="polite"><span>{labels.recallHint}</span><p>{current.hint}</p></section>}
        {stage !== 'answer' ? null : <section className={css.recallReveal} data-kind="answer" aria-live="polite"><span>{labels.recallAnswer}</span><p>{current.answer}</p></section>}
        {stage === 'answer' ? (
          <div className={`${shell.controlRow} ${css.recallRating}`}>
            <button type="button" className={`${shell.control} ${css.ratingButton}`} aria-pressed={status === 'review'} onClick={() => mark('review')}>{labels.reviewAgain}</button>
            <button type="button" className={`${shell.control} ${css.ratingButton}`} aria-pressed={status === 'mastered'} onClick={() => mark('mastered')}>{labels.mastered}</button>
          </div>
        ) : (
          <button type="button" className={`${shell.control} ${shell.controlPrimary} ${css.recallRevealButton}`} onClick={revealNext}>
            {stage === 'prompt' && current.hint !== undefined ? labels.showHint : labels.showAnswer}
          </button>
        )}
      </article>
      <div className={`${shell.controlRow} ${css.recallNavigation}`}>
        <button type="button" className={shell.control} onClick={() => move(-1)} disabled={cardIndex === 0}>← {labels.previousCard}</button>
        <button type="button" className={shell.control} onClick={() => move(1)} disabled={cardIndex >= content.cards.length - 1}>{labels.nextCard} →</button>
        <button type="button" className={shell.control} onClick={reset} disabled={cardIndex === 0 && stage === 'prompt' && Object.keys(statuses).length === 0}>{labels.resetDeck}</button>
      </div>
      <div className={shell.selectionSlot}>
        <p className={shell.interactionHint}>{labels.recallInteractionHint}</p>
      </div>
    </div>
  )
}
