const listeners = new Set();
const emittedCallEvents = new Set();
export function subscribeLearningUiLifecycle(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
}
export function emitLearningUiLifecycle(event) {
    const projected = { ...event, at: Date.now() };
    for (const listener of listeners)
        listener(projected);
}
export function emitLearningCallLifecycle(name, projection) {
    if (projection.callId === undefined)
        return;
    const key = `${name}:${projection.callId}`;
    if (emittedCallEvents.has(key))
        return;
    emittedCallEvents.add(key);
    emitLearningUiLifecycle({ name, ...projection });
}
//# sourceMappingURL=lifecycle.js.map