/** `scene_2d`: geometry, vectors, fields and annotated schematics on axes. */
import { useId, useMemo, useState } from 'react'
import { labelTemplate, useVisualLabels } from '../core/labels.ts'
import { FigureViewport, SelectionSurface } from '../core/shell-parts.tsx'
import { formatNumber, ticks, toneAt } from '../core/format.ts'
import { DEFAULT_TONES, type RendererProps, type Scene2DContent, type SelectedItem } from '../core/types.ts'
import { elementState } from '../state/visual-state.ts'
import { useContainerWidth, useRovingFocus } from '../state/hooks.ts'
import { chartGeometry, scaleX, scaleY } from '../layout/chart-geometry.ts'
import shell from '../styles/shell.module.css'
import css from '../styles/plot.module.css'

/**
 * Place a segment or arrow label clear of its own line.
 *
 * A flat vertical offset drops the label onto whatever else crosses the middle
 * of the figure — in a parallelogram construction the resultant's label, the
 * shape's label and a declared text anchor all landed on the same few pixels.
 * Offsetting along the segment's normal separates them by construction.
 */
function segmentLabelAnchor(x1: number, y1: number, x2: number, y2: number): { x: number; y: number } {
  const length = Math.hypot(x2 - x1, y2 - y1) || 1
  const normalX = -(y2 - y1) / length
  const normalY = (x2 - x1) / length
  // Prefer the side that reads as "above" the line.
  const direction = normalY > 0 ? -1 : 1
  return {
    x: (x1 + x2) / 2 + normalX * 13 * direction,
    y: (y1 + y2) / 2 + normalY * 13 * direction,
  }
}

export function Scene2DRenderer({ content, focus }: RendererProps<Scene2DContent>) {
  const labels = useVisualLabels()
  const id = useId()
  const [viewportRef, containerWidth] = useContainerWidth()
  const geometry = useMemo(() => chartGeometry(containerWidth), [containerWidth])
  const [selected, setSelected] = useState<SelectedItem | undefined>()
  const xTicks = useMemo(() => ticks(content.xAxis.min, content.xAxis.max), [content.xAxis.max, content.xAxis.min])
  const yTicks = useMemo(() => ticks(content.yAxis.min, content.yAxis.max), [content.yAxis.max, content.yAxis.min])
  const zeroX = content.xAxis.min <= 0 && content.xAxis.max >= 0 ? scaleX(0, content.xAxis, geometry) : undefined
  const zeroY = content.yAxis.min <= 0 && content.yAxis.max >= 0 ? scaleY(0, content.yAxis, geometry) : undefined

  const rovingIds = useMemo(() => content.elements.map(element => element.id), [content.elements])
  const roving = useRovingFocus(rovingIds)

  const selectElement = (element: Scene2DContent['elements'][number], tone: string): void => setSelected({
    id: element.id,
    label: element.type === 'label' ? element.text : element.label ?? labelTemplate(labels.elementFallback, { id: element.id }),
    detail: element.detail,
    kind: 'element',
    tone: toneAt(tone),
  })

  return (
    <div className={shell.rendererStack}>
      <FigureViewport viewportRef={viewportRef}>
        <svg
          ref={roving.containerRef}
          className={css.sceneSvg}
          width={geometry.width}
          height={geometry.height}
          viewBox={`0 0 ${geometry.width} ${geometry.height}`}
          role="group"
          aria-label={labelTemplate(labels.sceneSummary, {
            elements: content.elements.length,
            labels: content.elements.map(element => element.type === 'label' ? element.text : element.label).filter(Boolean).join(', '),
          })}
        >
          <defs>
            <clipPath id={`${id}-scene-clip`}>
              <rect x={geometry.left} y={geometry.top} width={geometry.plotWidth} height={geometry.plotHeight} />
            </clipPath>
            {DEFAULT_TONES.map(tone => (
              <marker key={tone} id={`${id}-scene-arrow-${tone}`} className={css.arrowMarker} data-tone={tone} markerWidth="9" markerHeight="9" refX="8" refY="4.5" orient="auto" markerUnits="strokeWidth">
                <path d="M0,0 L9,4.5 L0,9 z" />
              </marker>
            ))}
          </defs>
          <rect className={css.plotFrame} x={geometry.left} y={geometry.top} width={geometry.plotWidth} height={geometry.plotHeight} />
          {content.grid !== true ? null : yTicks.map(value => <line key={`gy-${String(value)}`} className={css.gridLine} x1={geometry.left} x2={geometry.left + geometry.plotWidth} y1={scaleY(value, content.yAxis, geometry)} y2={scaleY(value, content.yAxis, geometry)} />)}
          {content.grid !== true ? null : xTicks.map(value => <line key={`gx-${String(value)}`} className={css.gridLine} x1={scaleX(value, content.xAxis, geometry)} x2={scaleX(value, content.xAxis, geometry)} y1={geometry.top} y2={geometry.top + geometry.plotHeight} />)}
          {zeroX === undefined ? null : <line className={css.zeroAxis} x1={zeroX} x2={zeroX} y1={geometry.top} y2={geometry.top + geometry.plotHeight} />}
          {zeroY === undefined ? null : <line className={css.zeroAxis} x1={geometry.left} x2={geometry.left + geometry.plotWidth} y1={zeroY} y2={zeroY} />}
          {yTicks.map(value => <text key={`yt-${String(value)}`} className={css.tickLabel} x={geometry.left - 9} y={scaleY(value, content.yAxis, geometry)} textAnchor="end" dominantBaseline="middle">{formatNumber(value)}</text>)}
          {xTicks.map(value => <text key={`xt-${String(value)}`} className={css.tickLabel} x={scaleX(value, content.xAxis, geometry)} y={geometry.top + geometry.plotHeight + 19} textAnchor="middle">{formatNumber(value)}</text>)}
          <g clipPath={`url(#${id}-scene-clip)`}>
            {content.elements.map((element, index) => {
              const tone = toneAt(element.tone, index)
              const common = {
                className: css.sceneElement,
                'data-tone': tone,
                'data-visual-state': selected?.id === element.id ? 'selected' : elementState(element.id, focus),
                'data-selected': selected?.id === element.id || undefined,
                'data-visual-id': element.id,
                role: 'button',
                'aria-label': `${element.type === 'label' ? element.text : element.label ?? element.type}${element.detail === undefined ? '' : `。${element.detail}`}`,
                onClick: () => selectElement(element, tone),
                ...roving.itemProps(element.id, () => selectElement(element, tone)),
              } as const
              if (element.type === 'point') {
                const x = scaleX(element.x, content.xAxis, geometry)
                const y = scaleY(element.y, content.yAxis, geometry)
                return <g key={element.id} {...common}><circle className={css.scenePoint} cx={x} cy={y} r={element.size ?? 6} />{element.label === undefined ? null : <text className={css.shapeLabel} x={x + 10} y={y - 10}>{element.label}</text>}</g>
              }
              if (element.type === 'segment' || element.type === 'arrow') {
                const x1 = scaleX(element.x1, content.xAxis, geometry)
                const y1 = scaleY(element.y1, content.yAxis, geometry)
                const x2 = scaleX(element.x2, content.xAxis, geometry)
                const y2 = scaleY(element.y2, content.yAxis, geometry)
                return <g key={element.id} {...common} data-stroke={element.stroke ?? 'solid'}><line className={css.sceneLine} x1={x1} y1={y1} x2={x2} y2={y2} markerEnd={element.type === 'arrow' ? `url(#${id}-scene-arrow-${tone})` : undefined} /><line className={css.sceneHit} x1={x1} y1={y1} x2={x2} y2={y2} />{element.label === undefined ? null : (() => {
                  const anchor = segmentLabelAnchor(x1, y1, x2, y2)
                  return <text className={css.shapeLabel} x={anchor.x} y={anchor.y} textAnchor="middle" dominantBaseline="middle">{element.label}</text>
                })()}</g>
              }
              if (element.type === 'circle') {
                const cx = scaleX(element.cx, content.xAxis, geometry)
                const cy = scaleY(element.cy, content.yAxis, geometry)
                const rx = Math.abs(scaleX(element.cx + element.r, content.xAxis, geometry) - cx)
                const ry = Math.abs(scaleY(element.cy + element.r, content.yAxis, geometry) - cy)
                return <g key={element.id} {...common}><ellipse className={css.sceneShape} cx={cx} cy={cy} rx={rx} ry={ry} />{element.label === undefined ? null : <text className={css.shapeLabel} x={cx} y={cy} textAnchor="middle" dominantBaseline="middle">{element.label}</text>}</g>
              }
              if (element.type === 'rect') {
                const x = scaleX(element.x, content.xAxis, geometry)
                const y = scaleY(element.y + element.height, content.yAxis, geometry)
                const width = Math.abs(scaleX(element.x + element.width, content.xAxis, geometry) - x)
                const height = Math.abs(scaleY(element.y, content.yAxis, geometry) - y)
                return <g key={element.id} {...common}><rect className={css.sceneShape} x={x} y={y} width={width} height={height} rx="3" />{element.label === undefined ? null : <text className={css.shapeLabel} x={x + width / 2} y={y + height / 2} textAnchor="middle" dominantBaseline="middle">{element.label}</text>}</g>
              }
              if (element.type === 'polygon') {
                const points = element.points.map(point => `${scaleX(point.x, content.xAxis, geometry)},${scaleY(point.y, content.yAxis, geometry)}`).join(' ')
                const center = element.points.reduce((total, point) => ({ x: total.x + point.x / element.points.length, y: total.y + point.y / element.points.length }), { x: 0, y: 0 })
                // Below the centroid: any diagonal drawn through the shape passes
                // straight across it, and its own label would sit on top.
                return <g key={element.id} {...common}><polygon className={css.sceneShape} points={points} />{element.label === undefined ? null : <text className={css.shapeLabel} x={scaleX(center.x, content.xAxis, geometry)} y={scaleY(center.y, content.yAxis, geometry) + 18} textAnchor="middle" dominantBaseline="middle">{element.label}</text>}</g>
              }
              if (element.type === 'label') return <g key={element.id} {...common}><text className={css.sceneText} x={scaleX(element.x, content.xAxis, geometry)} y={scaleY(element.y, content.yAxis, geometry)} textAnchor="middle" dominantBaseline="middle">{element.text}</text></g>
              return null
            })}
          </g>
          <text className={css.axisLabel} x={geometry.left + geometry.plotWidth / 2} y={geometry.height - 6} textAnchor="middle">{content.xAxis.label ?? 'x'}</text>
          <text className={css.axisLabel} x="14" y={geometry.top + geometry.plotHeight / 2} textAnchor="middle" transform={`rotate(-90 14 ${geometry.top + geometry.plotHeight / 2})`}>{content.yAxis.label ?? 'y'}</text>
        </svg>
      </FigureViewport>
      <SelectionSurface
        hint={labels.sceneInteractionHint}
        selected={selected}
        kindLabel={labels.elementKind}
        onClose={() => setSelected(undefined)}
      />
    </div>
  )
}
