/**
 * Edge label boxes for node_link.
 *
 * A label used to be measured as one unwrapped line and drawn on a 20px chip
 * centred on the edge's midpoint. “算出每个候选词的概率” is 134px of chip in a
 * 78px column gap, so the chip covered the node at each end of the edge, and
 * the chip in the next gap covered it back. Wrapping the label into a bounded
 * box gives the layout a real size: the column gap is opened to fit the widest
 * label that crosses it, and what is left over is resolved against the boxes
 * and the other labels when the edge is routed.
 */
import { wrapLabel } from './text-metrics.ts'

export const EDGE_LABEL_FONT_SIZE = 12
export const EDGE_LABEL_LINE_HEIGHT = 15
/** Two lines of this width read faster than one long line across a diagram. */
const EDGE_LABEL_MAX_WIDTH = 118
const EDGE_LABEL_MAX_LINES = 2
const EDGE_LABEL_PADDING_X = 7
const EDGE_LABEL_PADDING_Y = 3

export interface EdgeLabelBox {
  lines: string[]
  /** Chip size, text plus padding. */
  width: number
  height: number
  truncated: boolean
}

export function edgeLabelBox(label: string): EdgeLabelBox {
  const wrapped = wrapLabel(label, {
    fontSize: EDGE_LABEL_FONT_SIZE,
    maxWidth: EDGE_LABEL_MAX_WIDTH,
    maxLines: EDGE_LABEL_MAX_LINES,
  })
  return {
    lines: wrapped.lines,
    width: Math.round(wrapped.width + EDGE_LABEL_PADDING_X * 2),
    height: wrapped.lines.length * EDGE_LABEL_LINE_HEIGHT + EDGE_LABEL_PADDING_Y * 2,
    truncated: wrapped.truncated,
  }
}

/** Corner radius that reads as a capsule for one line and a chip for two. */
export function edgeLabelRadius(box: EdgeLabelBox): number {
  return box.lines.length === 1 ? box.height / 2 : 8
}
