/**
 * Heal installation-owned fallback links before the first profile compose.
 * Dependency injection makes this executable-entry ordering contract directly
 * testable without importing the entry and starting the runtime.
 */
export declare function composeAfterManagedFallback<T>(options: {
    readonly virtualRuntime: boolean;
    readonly installAnchor: string;
    readonly heal: (installAnchor: string) => void;
    readonly compose: () => T;
}): T;
//# sourceMappingURL=profile-startup.d.ts.map