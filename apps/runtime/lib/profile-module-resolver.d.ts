/** Profile-first package metadata resolution for downloadable client plugins. */
/**
 * Resolve client plugin manifests from the writable profile first, then from
 * the immutable runtime closure. This keeps downloaded host/client plugin
 * faces on the same version while retaining the in-box dependency fallback.
 */
export declare function createProfileFirstPackageJsonResolver(profileDir: string, installAnchor: string): (packageName: string) => string;
//# sourceMappingURL=profile-module-resolver.d.ts.map