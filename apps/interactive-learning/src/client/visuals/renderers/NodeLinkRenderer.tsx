/**
 * `node_link`: topologies, trees, dependency and process graphs.
 *
 * Three things changed relative to the first implementation, all of them
 * visible in the five-node decision tree that prompted them.
 *
 * 1. Geometry comes from the content (see `layout/graph-layout.ts`) instead of
 *    a fixed 560×390 canvas with 29px circles, so a small tree is compact and a
 *    long Chinese label gets a box that fits it.
 * 2. Emphasis is ranked (see `state/graph-state.ts`) instead of binary, and is
 *    applied once per mark, so the branch a frame is not about stays readable
 *    rather than being drawn at a tenth of full strength.
 * 3. The layer headings, edge labels and node labels are real type at 12–13px,
 *    not 10px furniture.
 */
import { useId, useMemo, useState } from 'react'
import { labelTemplate, useVisualLabels } from '../core/labels.ts'
import { FigureViewport, SelectionSurface, StateLegend } from '../core/shell-parts.tsx'
import { toneAt } from '../core/format.ts'
import { DEFAULT_TONES, type NodeLinkContent, type RendererProps, type SelectedItem } from '../core/types.ts'
import { graphEmphasis } from '../state/graph-state.ts'
import { useContainerWidth, useRovingFocus } from '../state/hooks.ts'
import {
  EDGE_LABEL_FONT_SIZE,
  edgeGeometry,
  edgeLabelWidth,
  graphLayout,
  NODE_FONT_SIZE,
} from '../layout/graph-layout.ts'
import shell from '../styles/shell.module.css'
import css from '../styles/graph.module.css'

/** Above this, drawing every edge label at once turns the figure into noise. */
const DENSE_EDGE_COUNT = 12
const NODE_LINE_HEIGHT = 17

export function NodeLinkRenderer({ content, focus }: RendererProps<NodeLinkContent>) {
  const labels = useVisualLabels()
  const id = useId()
  const [viewportRef, containerWidth] = useContainerWidth()
  const layout = useMemo(() => graphLayout(content, containerWidth), [containerWidth, content])
  const emphasis = useMemo(() => graphEmphasis(content, focus), [content, focus])
  const [selected, setSelected] = useState<SelectedItem | undefined>()
  const nodeById = useMemo(() => new Map(content.nodes.map(node => [node.id, node])), [content.nodes])

  const selectNode = (node: NodeLinkContent['nodes'][number], tone: string): void => setSelected({
    id: node.id,
    label: node.label,
    detail: node.detail,
    kind: 'node',
    tone: toneAt(tone),
  })
  const selectEdge = (edge: NodeLinkContent['edges'][number], tone: string): void => setSelected({
    id: edge.id,
    label: edge.label ?? `${nodeById.get(edge.from)?.label ?? edge.from} → ${nodeById.get(edge.to)?.label ?? edge.to}`,
    detail: edge.detail,
    kind: 'edge',
    tone: toneAt(tone),
  })

  const summary = labelTemplate(labels.nodeLinkSummary, { nodes: content.nodes.length, edges: content.edges.length })
  // Nodes first, then edges: the traversal order a learner expects when
  // exploring a topology, and independent of SVG paint order.
  const rovingIds = useMemo(
    () => [...content.nodes.map(node => node.id), ...content.edges.map(edge => edge.id)],
    [content.edges, content.nodes],
  )
  const roving = useRovingFocus(rovingIds)
  const denseEdges = content.edges.length > DENSE_EDGE_COUNT
  const legendStates = useMemo(
    () => emphasis.active
      ? [...new Set([...content.nodes, ...content.edges].map(item => emphasis.state(item.id)))]
      : [],
    [content.edges, content.nodes, emphasis],
  )

  return (
    <div className={shell.rendererStack}>
      <FigureViewport viewportRef={viewportRef}>
        <svg
          ref={roving.containerRef}
          className={css.graphSvg}
          width={layout.renderWidth}
          height={layout.renderHeight}
          viewBox={`0 0 ${layout.width} ${layout.height}`}
          role="group"
          aria-label={summary}
          data-dense-edges={denseEdges || undefined}
        >
          <defs>
            {DEFAULT_TONES.map(tone => (
              <marker key={tone} id={`${id}-arrow-${tone}`} className={css.arrowMarker} data-tone={tone} markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto" markerUnits="strokeWidth">
                <path d="M0,0 L7,3.5 L0,7 z" />
              </marker>
            ))}
          </defs>

          {!layout.showHeaders ? null : layout.layers.map((layer, index) => (
            <g key={layer.id} className={css.layerBand} data-visual-id={layer.id} data-visual-state={emphasis.state(layer.id)}>
              <rect x={layer.band.x} y={layer.band.y} width={layer.band.width} height={layer.band.height} rx="12" />
              <text
                className={css.layerLabel}
                x={layer.headerX}
                y={layer.headerY}
                textAnchor={layer.headerAnchor}
                dominantBaseline="middle"
              >{layer.label ?? labelTemplate(labels.layerLabel, { index: index + 1 })}</text>
            </g>
          ))}

          <g>
            {content.edges.map((edge, edgeIndex) => {
              const from = layout.nodes.get(edge.from)
              const to = layout.nodes.get(edge.to)
              if (from === undefined || to === undefined) return null
              const tone = toneAt(edge.tone, edgeIndex)
              const state = emphasis.state(edge.id)
              const geometry = edgeGeometry(from, to, layout.orientation)
              const chipWidth = edge.label === undefined ? 0 : edgeLabelWidth(edge.label)
              return (
                <g
                  key={edge.id}
                  className={css.edgeGroup}
                  data-tone={tone}
                  data-stroke={edge.stroke ?? 'solid'}
                  data-visual-state={selected?.id === edge.id ? 'selected' : state}
                  data-selected={selected?.id === edge.id || undefined}
                  data-visual-id={edge.id}
                  role="button"
                  aria-label={`${edge.label ?? labels.edgeKind}: ${labelTemplate(labels.connection, { from: nodeById.get(edge.from)?.label ?? edge.from, to: nodeById.get(edge.to)?.label ?? edge.to })}${edge.detail === undefined ? '' : `. ${edge.detail}`}`}
                  onClick={() => selectEdge(edge, tone)}
                  {...roving.itemProps(edge.id, () => selectEdge(edge, tone))}
                >
                  <path className={css.edgeVisible} d={geometry.path} markerEnd={edge.directed === true ? `url(#${id}-arrow-${tone})` : undefined} />
                  <path className={css.edgeHit} d={geometry.path} />
                  {edge.label === undefined ? null : (
                    <g className={css.edgeLabel}>
                      <rect
                        x={geometry.label.x - chipWidth / 2}
                        y={geometry.label.y - 10}
                        width={chipWidth}
                        height="20"
                        rx="10"
                      />
                      <text x={geometry.label.x} y={geometry.label.y} textAnchor="middle" dominantBaseline="middle" fontSize={EDGE_LABEL_FONT_SIZE}>{edge.label}</text>
                    </g>
                  )}
                </g>
              )
            })}
          </g>

          <g>
            {content.nodes.map((node, nodeIndex) => {
              const box = layout.nodes.get(node.id)
              if (box === undefined) return null
              const tone = toneAt(node.tone, nodeIndex)
              const state = emphasis.state(node.id)
              const firstLineOffset = -((box.lines.length - 1) * NODE_LINE_HEIGHT) / 2
              return (
                <g
                  key={node.id}
                  className={css.nodeGroup}
                  data-tone={tone}
                  data-visual-state={selected?.id === node.id ? 'selected' : state}
                  data-selected={selected?.id === node.id || undefined}
                  data-visual-id={node.id}
                  role="button"
                  aria-label={`${node.label}${node.detail === undefined ? '' : `。${node.detail}`}`}
                  transform={`translate(${box.x} ${box.y})`}
                  onClick={() => selectNode(node, tone)}
                  {...roving.itemProps(node.id, () => selectNode(node, tone))}
                >
                  {/* The ring is what raises the current node, so the rest of the
                      graph never has to be faded away to make it stand out. */}
                  <rect
                    className={css.nodeRing}
                    x={-box.width / 2 - 5}
                    y={-box.height / 2 - 5}
                    width={box.width + 10}
                    height={box.height + 10}
                    rx={box.cornerRadius + 5}
                  />
                  <rect
                    className={css.nodeShape}
                    x={-box.width / 2}
                    y={-box.height / 2}
                    width={box.width}
                    height={box.height}
                    rx={box.cornerRadius}
                  />
                  <text className={css.nodeLabel} textAnchor="middle" dominantBaseline="middle" fontSize={NODE_FONT_SIZE}>
                    {box.lines.map((line, lineIndex) => (
                      <tspan key={line + String(lineIndex)} x="0" y={firstLineOffset + lineIndex * NODE_LINE_HEIGHT}>{line}</tspan>
                    ))}
                  </text>
                  {!box.truncated ? null : <title>{node.label}</title>}
                </g>
              )
            })}
          </g>
        </svg>
      </FigureViewport>

      <StateLegend states={legendStates} />

      <div className={shell.srOnly}>
        <p>{summary}</p>
        <ul>
          {content.nodes.map(node => (
            <li key={node.id}>{node.detail === undefined ? node.label : `${node.label}: ${node.detail}`}</li>
          ))}
          {content.edges.map(edge => {
            const connection = labelTemplate(labels.connection, {
              from: nodeById.get(edge.from)?.label ?? edge.from,
              to: nodeById.get(edge.to)?.label ?? edge.to,
            })
            return <li key={edge.id}>{edge.label === undefined ? connection : `${connection}, ${edge.label}`}</li>
          })}
        </ul>
      </div>

      <SelectionSurface
        hint={labels.nodeLinkInteractionHint}
        selected={selected}
        kindLabel={selected?.kind === 'edge' ? labels.edgeKind : labels.nodeKind}
        onClose={() => setSelected(undefined)}
      />
    </div>
  )
}
