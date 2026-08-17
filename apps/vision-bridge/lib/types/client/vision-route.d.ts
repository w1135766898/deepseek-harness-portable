/** Compact, client-only description of where Vision Bridge sends image bytes. */
export type VisionRouteKind = 'disabled' | 'local' | 'remote' | 'invalid';
export interface VisionRouteSummary {
    kind: VisionRouteKind;
    endpoint?: string;
}
/**
 * Classify the configured endpoint without probing it or exposing credentials.
 * The summary is deliberately descriptive rather than a readiness claim.
 */
export declare function describeVisionRoute(enabled: boolean, baseURL: string): VisionRouteSummary;
//# sourceMappingURL=vision-route.d.ts.map