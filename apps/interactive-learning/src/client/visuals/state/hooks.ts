/** Interaction hooks shared by the figure renderers. */
import { useEffect, useRef, useState, type KeyboardEvent, type RefObject } from 'react'
import { activateWithKeyboard } from '../core/format.ts'

/**
 * Roving tabindex over the interactive items of one figure.
 *
 * A node_link visual may declare 48 nodes and 160 edges, and a scene_2d up to
 * 64 elements. Leaving every item in the tab order turns one inline diagram
 * into a 200-stop detour that a keyboard user has to walk through to reach the
 * rest of the conversation. The figure is a single tab stop instead: arrow
 * keys, Home and End move between its items, Enter and Space select one.
 */
export function useRovingFocus(ids: readonly string[]) {
  const containerRef = useRef<SVGSVGElement>(null)
  const [focusedId, setFocusedId] = useState<string>()
  const active = focusedId !== undefined && ids.includes(focusedId) ? focusedId : ids[0]

  const focusAt = (index: number): void => {
    const next = ids[Math.max(0, Math.min(ids.length - 1, index))]
    if (next === undefined) return
    setFocusedId(next)
    // Resolved by attribute rather than a ref map: a ref callback would be a
    // new identity on every render and detach/reattach every item each time.
    for (const item of containerRef.current?.querySelectorAll<SVGGElement>('[data-roving-id]') ?? []) {
      if (item.dataset.rovingId === next) {
        item.focus()
        return
      }
    }
  }

  const itemProps = (id: string, activate: () => void) => ({
    tabIndex: id === active ? 0 : -1,
    'data-roving-id': id,
    onFocus: () => setFocusedId(id),
    onKeyDown: (event: KeyboardEvent): void => {
      const index = ids.indexOf(id)
      if (event.key === 'ArrowRight' || event.key === 'ArrowDown') { event.preventDefault(); focusAt(index + 1) }
      else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') { event.preventDefault(); focusAt(index - 1) }
      else if (event.key === 'Home') { event.preventDefault(); focusAt(0) }
      else if (event.key === 'End') { event.preventDefault(); focusAt(ids.length - 1) }
      else activateWithKeyboard(event, activate)
    },
  })

  return { containerRef, itemProps }
}

/**
 * Track the usable inline size of a figure's viewport.
 *
 * Layout is derived from the measured width, so the default has to be a
 * plausible conversation column rather than zero: a zero reading means "not
 * laid out yet" and must not collapse the figure before the observer fires.
 */
export function useContainerWidth(minimum = 260): [RefObject<HTMLDivElement>, number] {
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(680)
  useEffect(() => {
    const element = ref.current
    if (element === null) return
    const update = (measured: number): void => {
      if (measured <= 0) return
      const next = Math.max(minimum, measured)
      setWidth(current => Math.abs(current - next) < 1 ? current : next)
    }
    update(element.getBoundingClientRect().width)
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(entries => {
      const entry = entries[0]
      if (entry !== undefined) update(entry.contentRect.width)
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [minimum])
  return [ref, width]
}
