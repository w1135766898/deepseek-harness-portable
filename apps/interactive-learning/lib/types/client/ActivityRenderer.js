import { jsx as _jsx } from "react/jsx-runtime";
import { ParameterExplorer } from "./ParameterExplorer.js";
import { ProcessStepper } from "./ProcessStepper.js";
import { StructureCompare } from "./StructureCompare.js";
/**
 * Dispatch table for trusted, package-supplied React components. Extending the
 * protocol means registering another compiled component here, never accepting
 * model-provided HTML or JavaScript.
 */
export class ActivityRendererRegistry {
    #renderers = new Map();
    register(kind, renderer) {
        if (this.#renderers.has(kind))
            throw new Error(`learning renderer already registered: ${kind}`);
        this.#renderers.set(kind, renderer);
        return () => {
            if (this.#renderers.get(kind) === renderer)
                this.#renderers.delete(kind);
        };
    }
    resolve(kind) {
        return this.#renderers.get(kind);
    }
    kinds() {
        return [...this.#renderers.keys()];
    }
}
export const activityRendererRegistry = new ActivityRendererRegistry();
activityRendererRegistry.register('parameter_explorer', ParameterExplorer);
activityRendererRegistry.register('process_stepper', ProcessStepper);
activityRendererRegistry.register('structure_compare', StructureCompare);
export function ActivityRenderer(props) {
    const Renderer = activityRendererRegistry.resolve(props.activity.kind);
    return Renderer === undefined ? null : _jsx(Renderer, { ...props });
}
//# sourceMappingURL=ActivityRenderer.js.map