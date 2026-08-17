function missingRequirements(variant, report) {
    return variant.requires.filter(id => {
        const state = report.capabilities[id]?.state;
        return state !== 'available' && !(state === 'degraded' && variant.acceptsDegraded?.includes(id));
    });
}
/** Resolve the first variant whose complete capability contract is available. */
export function resolveVariant(mode, report) {
    for (const variant of mode.variants) {
        if (missingRequirements(variant, report).length === 0) {
            const degradedLimitations = variant.requires.flatMap(id => (report.capabilities[id]?.state === 'degraded'
                ? (report.capabilities[id]?.limitations ?? [`${id}:degraded`])
                : []));
            return {
                modeId: mode.id,
                variantId: variant.id,
                supportLevel: variant.supportLevel,
                limitations: [...new Set([...(variant.limitations ?? []), ...degradedLimitations])],
            };
        }
    }
    return {
        modeId: mode.id,
        supportLevel: 'unavailable',
        missingCapabilities: [...new Set(mode.variants.flatMap(variant => missingRequirements(variant, report)))],
        missing: [...new Set(mode.variants.flatMap(variant => missingRequirements(variant, report)))].map(id => ({
            id,
            reason: report.capabilities[id]?.reason ?? `capability ${id} did not report available`,
            remediation: report.capabilities[id]?.remediation
                ?? `Install or enable ${id}, then restart the runtime so it can be measured again.`,
        })),
        reason: `no ${mode.id} runtime variant satisfies all required capabilities`,
        remediation: [...new Set(mode.variants.flatMap(variant => missingRequirements(variant, report))
                .map(id => report.capabilities[id]?.remediation
                ?? `Install or enable ${id}, then restart the runtime so it can be measured again.`))],
    };
}
/**
 * Pick the closest platform implementation for diagnostics and fail-loud tool
 * startup when no variant is fully usable. Product support remains
 * `unavailable`; this fallback never upgrades the resolver result.
 */
export function closestVariant(mode, report) {
    if (mode.variants.length === 0)
        throw new Error(`mode ${mode.id} declares no variants`);
    return [...mode.variants].sort((left, right) => (missingRequirements(left, report).length - missingRequirements(right, report).length))[0];
}
//# sourceMappingURL=mode-resolver.js.map