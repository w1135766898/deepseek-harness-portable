/**
 * Label measurement for SVG figures.
 *
 * Node boxes used to be fixed 29px-radius circles holding 10px text, which
 * meant a four-character Chinese label filled the circle edge to edge and a
 * longer one simply overflowed it. Sizing a node needs the label's real extent,
 * and `measureText` is not available during the first layout pass (or in the
 * test environment), so widths are estimated per script instead: CJK, fullwidth
 * punctuation and emoji occupy roughly one em, Latin roughly 0.55em, and digits
 * and spaces slightly less.
 */

const WIDE_CHARACTER = /[\u1100-\u115F\u2E80-\uA4CF\uA960-\uA97F\uAC00-\uD7A3\uF900-\uFAFF\uFE10-\uFE19\uFE30-\uFE6F\uFF00-\uFF60\uFFE0-\uFFE6]/
const THIN_CHARACTER = /[\s.,:;!|'`()[\]{}\-ilj]/

/** Estimated advance width of one character at the given font size. */
export function characterWidth(character: string, fontSize: number): number {
  if (WIDE_CHARACTER.test(character)) return fontSize
  if (THIN_CHARACTER.test(character)) return fontSize * 0.32
  if (/[0-9]/.test(character)) return fontSize * 0.56
  if (/[A-Z]/.test(character)) return fontSize * 0.66
  return fontSize * 0.55
}

/** Estimated rendered width of a whole string. */
export function measureText(text: string, fontSize: number): number {
  let width = 0
  for (const character of text) width += characterWidth(character, fontSize)
  return width
}

export interface WrappedLabel {
  lines: string[]
  width: number
  /** Whether the label had to be shortened to fit `maxLines`. */
  truncated: boolean
}

function greedyWrap(
  text: string,
  { fontSize, maxWidth, maxLines = 3 }: { fontSize: number; maxWidth: number; maxLines?: number },
): WrappedLabel {
  const source = text.trim()
  if (source === '') return { lines: [''], width: 0, truncated: false }
  if (measureText(source, fontSize) <= maxWidth) {
    return { lines: [source], width: measureText(source, fontSize), truncated: false }
  }

  const lines: string[] = []
  let line = ''
  let lineWidth = 0
  let lastBreak = -1
  const flush = (): void => {
    lines.push(line)
    line = ''
    lineWidth = 0
    lastBreak = -1
  }
  for (const character of source) {
    const width = characterWidth(character, fontSize)
    if (lineWidth + width > maxWidth && line !== '') {
      // Latin words break at the last space; CJK breaks anywhere.
      if (lastBreak > 0 && !WIDE_CHARACTER.test(character)) {
        const carry = line.slice(lastBreak).trimStart()
        line = line.slice(0, lastBreak).trimEnd()
        flush()
        line = carry
        lineWidth = measureText(carry, fontSize)
      } else {
        flush()
      }
      if (lines.length >= maxLines) break
    }
    if (/[\s-]/.test(character)) lastBreak = line.length
    line += character
    lineWidth += width
  }
  if (line !== '' && lines.length < maxLines) lines.push(line)

  const consumed = lines.join('')
  const truncated = consumed.length < source.length
  if (truncated) {
    const last = lines[lines.length - 1] ?? ''
    lines[lines.length - 1] = `${last.slice(0, Math.max(1, last.length - 1))}…`
  }
  return {
    lines,
    width: Math.max(...lines.map(entry => measureText(entry, fontSize))),
    truncated,
  }
}

/**
 * Wrap a label to at most `maxLines`, breaking between CJK characters and at
 * spaces or hyphens for Latin text. The final line is ellipsised rather than
 * clipped, and the untruncated text always remains the accessible name.
 *
 * Filling each line to the limit before starting the next one produces
 * “算出每个候选词的概” over “率”: a box as wide as the limit for a label that
 * would read better as two half lines, and — on an edge label — a column gap
 * opened to hold a width the text does not need. The greedy pass decides how
 * many lines the label takes; the same pass is then re-run against the average
 * line width to distribute the text evenly over them.
 */
export function wrapLabel(
  text: string,
  options: { fontSize: number; maxWidth: number; maxLines?: number },
): WrappedLabel {
  const greedy = greedyWrap(text, options)
  if (greedy.lines.length < 2 || greedy.truncated) return greedy
  const average = measureText(text.trim(), options.fontSize) / greedy.lines.length
  // Widen the target in steps: one indivisible character wider than the average
  // is enough to push a line onto the next one and undo the balance.
  for (const slack of [1, 1.08, 1.16, 1.24]) {
    const width = Math.min(options.maxWidth, average * slack + options.fontSize * 0.5)
    const balanced = greedyWrap(text, { ...options, maxWidth: width })
    if (!balanced.truncated && balanced.lines.length === greedy.lines.length) return balanced
  }
  return greedy
}
