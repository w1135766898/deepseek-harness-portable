import { type MeasuredModeSupport, type TargetSpec } from '../../platform-contract/src/index.js';
import { type InteractiveLearningReleaseEvidence } from './learning-contract.js';
export { assertInteractiveLearningReleaseContract, INTERACTIVE_LEARNING_APP_FILES, INTERACTIVE_LEARNING_DISTRIBUTION_FILES, INTERACTIVE_LEARNING_PACKAGE_FILES, INTERACTIVE_LEARNING_PUBLIC_DECLARATION_FILES, assertInteractiveLearningPublishedPathPolicy, interactiveLearningInventoryPaths, type InteractiveLearningCompositionRow, type InteractiveLearningReleaseEvidence, } from './learning-contract.js';
export interface ReleaseSourceIdentity {
    readonly portableCommit: string;
    readonly upstreamCommit: string;
}
export interface ReleaseFile {
    readonly path: string;
    readonly type: 'file' | 'symlink';
    readonly size: number;
    readonly sha256: string;
}
export interface ReleasePatchFile {
    readonly path: string;
    readonly inputSha256: string;
    readonly outputSha256: string;
}
export interface ReleasePatch {
    readonly id: string;
    readonly status: 'applied' | 'not-applicable' | 'already-upstream';
    readonly files: readonly ReleasePatchFile[];
}
export interface ReleaseSigningEvidence {
    readonly adapter: TargetSpec['signing']['adapter'];
    readonly status: 'signed' | 'signed-and-notarized' | 'externally-signed';
    readonly identity: string;
    readonly verification: string;
}
export interface ReleaseManifestInput {
    readonly distributionVersion: string;
    readonly shellVersion: string;
    readonly kernelVersion: string;
    readonly source: ReleaseSourceIdentity;
    readonly target: TargetSpec;
    readonly formats?: readonly string[];
    readonly electronVersion: string;
    readonly nodeVersion: string;
    readonly runtimeClosureHash: string;
    readonly modeCatalogHash: string;
    readonly measuredModeSupport: Readonly<Record<string, MeasuredModeSupport>>;
    readonly experiencePacks: {
        readonly interactiveLearning: InteractiveLearningReleaseEvidence;
    };
    readonly files: readonly ReleaseFile[];
    readonly patches: readonly ReleasePatch[];
    readonly signingEvidence?: ReleaseSigningEvidence;
    readonly releaseNotes?: Record<string, unknown>;
}
export interface ReleaseManifest {
    readonly schemaVersion: 3;
    readonly distributionVersion: string;
    readonly shellVersion: string;
    readonly desktopVersion: string;
    readonly kernelVersion: string;
    readonly kernelCommit: string;
    readonly kernelPackage: '@deepseek-ai/dsh-web-app';
    readonly kernelRepository: 'https://github.com/deepseek-ai/deepseek-harness';
    readonly source: ReleaseSourceIdentity;
    readonly target: {
        readonly id: string;
        readonly platform: string;
        readonly arch: string;
        readonly formats: readonly string[];
        readonly updaterAdapter: string;
    };
    readonly distribution: {
        readonly classification: 'non-official-unsigned' | 'official';
        readonly signingPolicy: TargetSpec['signing'];
        readonly signingEvidence?: ReleaseSigningEvidence;
    };
    readonly runtime: {
        readonly electronVersion: string;
        readonly nodeVersion: string;
        readonly runtimeClosureHash: string;
    };
    readonly modeCatalog: {
        readonly hash: string;
        readonly support: Readonly<Record<string, MeasuredModeSupport>>;
    };
    readonly experiencePacks: {
        readonly interactiveLearning: InteractiveLearningReleaseEvidence;
    };
    readonly files: readonly ReleaseFile[];
    readonly fileInventory: {
        readonly algorithm: 'sha256';
        readonly excludes: readonly ['release-manifest.json'];
    };
    readonly patches: readonly ReleasePatch[];
    readonly releaseNotes?: Record<string, unknown>;
}
/** Build the one manifest schema used by unpacked apps and release archives. */
export declare function createReleaseManifest(input: ReleaseManifestInput): ReleaseManifest;
/** Stable ASCII JSON for tools that consume manifests through legacy shells. */
export declare function serializeReleaseManifest(manifest: ReleaseManifest): string;
//# sourceMappingURL=index.d.ts.map