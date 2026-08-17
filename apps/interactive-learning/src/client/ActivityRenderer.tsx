import type { ComponentType } from 'react'
import type { LearningActivityKind } from '../protocol.ts'
import type { ActivityRendererProps } from './types.ts'
import { ParameterExplorer } from './ParameterExplorer.tsx'
import { ProcessStepper } from './ProcessStepper.tsx'
import { StructureCompare } from './StructureCompare.tsx'

type TrustedActivityRenderer = ComponentType<ActivityRendererProps>

/**
 * Dispatch table for trusted, package-supplied React components. Extending the
 * protocol means registering another compiled component here, never accepting
 * model-provided HTML or JavaScript.
 */
export class ActivityRendererRegistry {
  readonly #renderers = new Map<LearningActivityKind, TrustedActivityRenderer>()

  register(kind: LearningActivityKind, renderer: TrustedActivityRenderer): () => void {
    if (this.#renderers.has(kind)) throw new Error(`learning renderer already registered: ${kind}`)
    this.#renderers.set(kind, renderer)
    return () => {
      if (this.#renderers.get(kind) === renderer) this.#renderers.delete(kind)
    }
  }

  resolve(kind: LearningActivityKind): TrustedActivityRenderer | undefined {
    return this.#renderers.get(kind)
  }

  kinds(): LearningActivityKind[] {
    return [...this.#renderers.keys()]
  }
}

export const activityRendererRegistry = new ActivityRendererRegistry()
activityRendererRegistry.register('parameter_explorer', ParameterExplorer as TrustedActivityRenderer)
activityRendererRegistry.register('process_stepper', ProcessStepper as TrustedActivityRenderer)
activityRendererRegistry.register('structure_compare', StructureCompare as TrustedActivityRenderer)

export function ActivityRenderer(props: ActivityRendererProps) {
  const Renderer = activityRendererRegistry.resolve(props.activity.kind)
  return Renderer === undefined ? null : <Renderer {...props} />
}
