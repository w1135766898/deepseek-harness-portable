/**
 * Client-only description of which model Vision Bridge will use.
 *
 * Image bytes now travel the same providers the deployment already uses for
 * conversations, so the interesting question is no longer "where does this
 * endpoint point" but "which configured model answers, and did the operator
 * choose it or is it discovered". Capability resolution is the host's job; this
 * summary only reports the selection as configured.
 * @module @dsh-portable/vision-bridge/client/vision-route
 */
/**
 * Summarize the configured vision selection.
 * @param enabled - whether the capability is offered at all.
 * @param model - configured model id; empty means discover an image-capable one.
 */
export function describeVisionRoute(enabled, model) {
    if (!enabled)
        return { kind: 'disabled' };
    const pinnedModel = model.trim();
    if (pinnedModel === '')
        return { kind: 'auto' };
    return {
        kind: 'pinned',
        model: pinnedModel,
    };
}
//# sourceMappingURL=vision-route.js.map