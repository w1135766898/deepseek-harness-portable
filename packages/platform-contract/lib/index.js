const SUPPORT_RANK = {
    unavailable: 0,
    alternative: 1,
    compatible: 2,
    native: 3,
};
/** Whether an actual support level satisfies a target's declared minimum. */
export function satisfiesModeSupport(actual, minimum) {
    return SUPPORT_RANK[actual] >= SUPPORT_RANK[minimum];
}
/** Validate invariants once, next to target registration. */
export function defineTarget(spec) {
    if (spec.id !== `${spec.platform}-${spec.arch}`) {
        throw new Error(`target id ${spec.id} does not match ${spec.platform}-${spec.arch}`);
    }
    if (spec.electron.platform !== spec.platform || spec.electron.arch !== spec.arch) {
        throw new Error(`target ${spec.id} has a mismatched Electron target`);
    }
    if (!spec.signing.officialReleaseRequiresEvidence || spec.signing.credentialEnvironment.length === 0) {
        throw new Error(`target ${spec.id} must fail closed on missing official-release signing evidence`);
    }
    const modes = new Set();
    for (const expectation of spec.requiredModeSupport) {
        if (modes.has(expectation.mode))
            throw new Error(`target ${spec.id} declares mode ${expectation.mode} more than once`);
        modes.add(expectation.mode);
    }
    return Object.freeze(spec);
}
//# sourceMappingURL=index.js.map