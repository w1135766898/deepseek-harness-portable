/** Compact, client-only description of where Vision Bridge sends image bytes. */
function isLoopbackHost(hostname) {
    const normalized = hostname.toLowerCase();
    return normalized === 'localhost'
        || normalized.endsWith('.localhost')
        || normalized === '127.0.0.1'
        || normalized === '::1'
        || normalized === '[::1]';
}
/**
 * Classify the configured endpoint without probing it or exposing credentials.
 * The summary is deliberately descriptive rather than a readiness claim.
 */
export function describeVisionRoute(enabled, baseURL) {
    if (!enabled)
        return { kind: 'disabled' };
    try {
        const url = new URL(baseURL.trim());
        if (url.protocol !== 'http:' && url.protocol !== 'https:')
            return { kind: 'invalid' };
        return {
            kind: isLoopbackHost(url.hostname) ? 'local' : 'remote',
            endpoint: url.host,
        };
    }
    catch {
        return { kind: 'invalid' };
    }
}
//# sourceMappingURL=vision-route.js.map