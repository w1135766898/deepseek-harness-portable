/**
 * Emphasis for a node_link figure.
 *
 * A frame that focuses one node used to leave every other node, edge and layer
 * heading at 20% opacity, which removed the parents, the branch labels and the
 * outline the learner needs in order to understand what is being pointed at.
 *
 * The path a learner must be able to read is derived here instead: the focused
 * elements, the chain of incoming edges and ancestors that reach them, the
 * edges leaving them (the choices the frame is asking about), and the endpoints
 * of any focused edge. Everything else stays as readable context.
 */
import type { NodeLinkContent } from '../core/types.ts'
import { elementState, type VisualFocus, type VisualState } from './visual-state.ts'

/** Above this node count a figure is dense enough for a fourth, quieter tier. */
const DENSE_GRAPH_NODES = 26

export interface GraphEmphasis {
  state: (id: string) => VisualState
  /** Whether any element is currently raised above the rest. */
  active: boolean
}

export function graphEmphasis(content: NodeLinkContent, focus: VisualFocus): GraphEmphasis {
  if (!focus.active) return { state: () => 'overview', active: false }

  const nodeIds = new Set(content.nodes.map(node => node.id))
  const incoming = new Map<string, Array<{ edgeId: string; from: string }>>()
  const outgoing = new Map<string, Array<{ edgeId: string; to: string }>>()
  for (const edge of content.edges) {
    incoming.set(edge.to, [...incoming.get(edge.to) ?? [], { edgeId: edge.id, from: edge.from }])
    outgoing.set(edge.from, [...outgoing.get(edge.from) ?? [], { edgeId: edge.id, to: edge.to }])
  }

  const related = new Set<string>()
  const seedNodes: string[] = []
  for (const id of focus.currentIds) {
    if (nodeIds.has(id)) seedNodes.push(id)
  }
  for (const edge of content.edges) {
    if (!focus.currentIds.has(edge.id)) continue
    // A focused edge is meaningless without both of the things it connects.
    related.add(edge.from)
    related.add(edge.to)
    seedNodes.push(edge.from)
  }
  // A focused group raises the nodes that belong to it.
  for (const node of content.nodes) {
    if (node.group !== undefined && focus.currentIds.has(node.group)) {
      related.add(node.id)
      seedNodes.push(node.id)
    }
    if (focus.currentIds.has(node.id) && node.group !== undefined) related.add(node.group)
  }

  // Walk back to the roots so the parents and the branch that reaches the
  // current node are never quieter than the node itself.
  const visitedAncestors = new Set<string>()
  const queue = [...seedNodes]
  while (queue.length > 0) {
    const current = queue.shift()
    if (current === undefined || visitedAncestors.has(current)) continue
    visitedAncestors.add(current)
    for (const step of incoming.get(current) ?? []) {
      related.add(step.edgeId)
      related.add(step.from)
      queue.push(step.from)
    }
  }
  // The edges leaving a focused node are the alternatives the frame is asking
  // the learner to compare, so they belong to the current story too.
  for (const id of focus.currentIds) {
    for (const step of outgoing.get(id) ?? []) {
      related.add(step.edgeId)
      related.add(step.to)
    }
  }

  const dense = content.nodes.length > DENSE_GRAPH_NODES
  return {
    active: true,
    state: (id: string): VisualState => {
      if (focus.currentIds.has(id)) return 'current'
      if (related.has(id)) return 'related'
      if (focus.visitedIds.has(id)) return 'visited'
      return dense ? 'inactive' : 'context'
    },
  }
}

/** The generic per-element resolution, re-exported so renderers import one module. */
export { elementState }
