/**
 * One-time, profile-owned bootstrap for the marketplace bundled with the
 * portable distribution. The marker deliberately lives inside the web
 * profile: uninstalling the marketplace keeps the marker (so it stays
 * uninstalled), while deleting the profile restores the shipped default.
 * @module @dsh-portable/runtime/marketplace-bootstrap
 */
export declare const MARKETPLACE_PACKAGE = "dsh-plugin-marketplace";
export declare const MARKETPLACE_SOURCE_COMMIT = "c8adea1a41c7d1037aa33f44ad6a9b986399a354";
export declare const MARKETPLACE_SEED_MARKER = ".dsh-portable-marketplace-v1.json";
export declare const MARKETPLACE_RECOVERY_MARKER = ".dsh-portable-marketplace-recovery-v1.json";
export declare const MARKETPLACE_RUNTIME_FILES: readonly ["package.json", "cordis.patch.yml", "lib/index.js", "lib/client.js"];
export type MarketplaceBootstrapResult = {
    status: 'already-seeded' | 'adopted' | 'installed' | 'repaired' | 'unavailable' | 'failed';
    enabled: boolean;
    error?: string;
    diagnostic?: MarketplaceBootstrapDiagnostic;
};
export type MarketplaceBootstrapDiagnostic = {
    code: 'MARKETPLACE_UNAVAILABLE' | 'MARKETPLACE_INSTALL_FAILED';
    component: 'marketplace';
    severity: 'warning';
    message: string;
    recoverable: true;
};
export type MarketplaceBootstrapOptions = {
    profileDir: string;
    sourceDir?: string;
    legacySourceDirs?: readonly string[];
    install: (sourceSpec: string, enabled: boolean) => number;
};
export type MarketplaceSeedResult = {
    status: 'created' | 'ready' | 'failed';
    sourceDir?: string;
    error?: string;
};
/**
 * Materialize the distribution-owned marketplace outside the application
 * install. Profiles install a private `file:` copy from this seed, so pnpm
 * can never mutate or leave a dangling link into `resources/app/node_modules`.
 * A complete seed remains usable when the application copy is later damaged.
 */
export declare function materializeMarketplaceSeed(options: {
    homeDir: string;
    bundledSourceDir?: string;
}): MarketplaceSeedResult;
/**
 * Seed the bundled marketplace exactly once for a profile.
 *
 * Existing, loadable dependencies are adopted without changing their version
 * or enabled state. Incomplete dependencies are rebuilt from the bundled
 * source while preserving enabled state. A marker with no dependency is an
 * intentional uninstall and is never repaired automatically.
 */
export declare function ensureMarketplacePreinstalled(options: MarketplaceBootstrapOptions): MarketplaceBootstrapResult;
//# sourceMappingURL=marketplace-bootstrap.d.ts.map