/** Number, scale and tone helpers shared by every visual@4 renderer. */
import type { KeyboardEvent } from 'react'
import { DEFAULT_TONES, type VisualTone } from './types.ts'

export function formatNumber(value: number, digits?: number): string {
  if (!Number.isFinite(value)) return '—'
  if (digits !== undefined) return value.toFixed(digits)
  if (Number.isInteger(value)) return String(value)
  return String(Number(value.toPrecision(6)))
}

export function normalizedPosition(value: number, min: number, max: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(min) || !Number.isFinite(max) || max <= min) return 0
  return Math.max(0, Math.min(1, (value - min) / (max - min)))
}

export function interpolate(min: number, max: number, ratio: number): number {
  return min + (max - min) * Math.max(0, Math.min(1, ratio))
}

function niceStep(rawStep: number): number {
  if (!Number.isFinite(rawStep) || rawStep <= 0) return 1
  const power = 10 ** Math.floor(Math.log10(rawStep))
  const normalized = rawStep / power
  return (normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10) * power
}

export function ticks(min: number, max: number, target = 6): number[] {
  const step = niceStep((max - min) / target)
  const first = Math.ceil(min / step) * step
  const values: number[] = []
  for (let value = first, index = 0; value <= max && index < target * 4; value += step, index += 1) {
    values.push(Number(value.toPrecision(12)))
  }
  return values.length > 0 ? values : [min, max]
}

export function toneAt(tone: string | undefined, index = 0): VisualTone {
  if (tone === 'blue' || tone === 'green' || tone === 'red' || tone === 'orange'
    || tone === 'purple' || tone === 'gray') return tone
  return DEFAULT_TONES[index % DEFAULT_TONES.length] ?? 'blue'
}

export function activateWithKeyboard(event: KeyboardEvent, action: () => void): void {
  if (event.key !== 'Enter' && event.key !== ' ') return
  event.preventDefault()
  action()
}

/**
 * Normalise a model-written expression into display math.
 *
 * The payload carries LaTeX without delimiters, but models routinely emit the
 * Unicode form of the same symbols; rewriting them keeps a valid derivation
 * from rendering as literal text.
 */
export function displayMath(expression: string): string {
  const value = expression.trim()
    .replaceAll('′', "'")
    .replaceAll('−', '-')
    .replaceAll('²', '^{2}')
    .replaceAll('³', '^{3}')
    .replaceAll('→', '\\to ')
    .replaceAll('≤', '\\le ')
    .replaceAll('≥', '\\ge ')
    .replaceAll('≠', '\\ne ')
    .replaceAll('×', '\\times ')
    .replaceAll('÷', '\\div ')
    .replaceAll('∞', '\\infty ')
    .replace(/\blim\s*\[([^\]]+)\]/g, '\\lim_{$1}')
  if ((value.startsWith('$$') && value.endsWith('$$')) || (value.startsWith('\\[') && value.endsWith('\\]'))) return value
  return `$$\n${value}\n$$`
}
