/**
 * Resolve which configured model performs image analysis.
 *
 * The kernel's model catalog is the single source of truth: a route is chosen
 * from the providers the deployment already configured, and capability comes
 * from each entry's declared input modalities rather than from a hand-kept
 * list of model names.
 * @module @dsh-portable/vision-bridge/model-selection
 */
/**
 * Whether a catalog entry declares that it accepts image input.
 * @param model - one catalog entry.
 */
export function declaresImageInput(model) {
    return model.inputModalities?.includes('image') === true;
}
/**
 * Whether a catalog entry declares input modalities that exclude images.
 *
 * An absent `inputModalities` is unknown capability rather than a denial: it
 * never earns an automatic selection, but it must not veto a route the operator
 * pinned deliberately.
 * @param model - one catalog entry.
 */
export function deniesImageInput(model) {
    return model.inputModalities !== undefined && !model.inputModalities.includes('image');
}
/**
 * Choose the route that will analyze images.
 *
 * A pinned model is resolved back to its configured provider and honored unless
 * the catalog positively denies image input. Otherwise the first entry
 * declaring image input wins, in catalog order.
 * @param config - the resolved enable/model configuration.
 * @param catalog - every model the configured providers report.
 * @returns the chosen route, or the reason none could be chosen.
 */
export function selectVisionRoute(config, catalog) {
    if (!config.enabled) {
        return {
            ok: false,
            reason: 'VISION_BRIDGE_DISABLED',
            message: 'Vision Bridge is disabled. Enable it in Settings → Plugins before using view_image.',
        };
    }
    if (config.model !== '') {
        const pinned = catalog.find(entry => entry.id === config.model);
        if (pinned === undefined) {
            return {
                ok: false,
                reason: 'VISION_MODEL_UNAVAILABLE',
                message: `Model ${config.model} is not available from a configured provider. Choose a model from Settings → Models.`,
            };
        }
        if (deniesImageInput(pinned)) {
            return {
                ok: false,
                reason: 'VISION_MODEL_NOT_IMAGE_CAPABLE',
                message: `Model ${config.model} does not accept image input. Choose an image-capable model in Settings → Plugins.`,
            };
        }
        return { ok: true, route: { provider: pinned.provider, model: config.model } };
    }
    const discovered = catalog.find(entry => declaresImageInput(entry));
    if (discovered === undefined) {
        return {
            ok: false,
            reason: 'VISION_MODEL_UNAVAILABLE',
            message: 'No configured provider reports an image-capable model. Add one in Settings → Models.',
        };
    }
    return { ok: true, route: { provider: discovered.provider, model: discovered.id } };
}
/** Catalog entries an operator can reasonably pin as the vision route. */
export function imageCapableModels(catalog) {
    return catalog.filter(entry => !deniesImageInput(entry));
}
//# sourceMappingURL=model-selection.js.map