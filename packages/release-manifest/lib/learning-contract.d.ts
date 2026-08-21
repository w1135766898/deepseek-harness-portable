import type { TargetSpec } from '../../platform-contract/src/index.js';
/** Package-relative files that make the Interactive Learning experience usable. */
export declare const INTERACTIVE_LEARNING_PACKAGE_FILES: readonly ["package.json", "lib/index.js", "lib/bootstrap.js", "lib/preset.js", "preset/learning/preset.yml", "preset/learning/agent.cordis.yml", "lib/agent.js", "lib/client.js"];
/** Stable final-distribution additions materialized by the desktop packager. */
export declare const INTERACTIVE_LEARNING_DISTRIBUTION_FILES: readonly ["package.json", "lib/index.js", "lib/bootstrap.js", "lib/preset.js", "preset/learning/preset.yml", "preset/learning/agent.cordis.yml", "lib/agent.js", "lib/client.js", "LICENSE"];
/** App-relative runtime files that register packaged experience-pack hosts. */
export declare const INTERACTIVE_LEARNING_APP_FILES: readonly ["lib/packaged-bin.js"];
/** Public declarations intentionally shipped by the Learning package. */
export declare const INTERACTIVE_LEARNING_PUBLIC_DECLARATION_FILES: readonly ["lib/types/agent.d.ts", "lib/types/bootstrap.d.ts", "lib/types/broker.d.ts", "lib/types/client/ActivityRenderer.d.ts", "lib/types/client/index.d.ts", "lib/types/client/lifecycle.d.ts", "lib/types/client/types.d.ts", "lib/types/eval.d.ts", "lib/types/index.d.ts", "lib/types/installer.d.ts", "lib/types/learn-intent.d.ts", "lib/types/learner-state.d.ts", "lib/types/preset.d.ts", "lib/types/protocol.d.ts", "lib/types/teaching-route.d.ts"];
export interface InteractiveLearningCompositionRow {
    readonly id: string;
    readonly module: string;
}
/** Semantic evidence captured from the exact staged runtime used for packaging. */
export interface InteractiveLearningReleaseEvidence {
    readonly schemaVersion: 1;
    /** Sorted package-relative exact inventory selected by the package manifest. */
    readonly publishedFiles: readonly string[];
    readonly host: {
        readonly id: 'interactive-learning';
        readonly module: '@dsh-portable/interactive-learning';
        readonly runtimeBundle: 'lib/packaged-bin.js';
        readonly bundle: 'lib/index.js';
        readonly bootstrapBundle: 'lib/bootstrap.js';
    };
    readonly preset: {
        readonly id: 'learning';
        readonly selectable: true;
        readonly name: string;
        readonly description: string;
        readonly bundle: 'lib/preset.js';
        readonly descriptor: 'preset/learning/preset.yml';
        readonly composition: 'preset/learning/agent.cordis.yml';
        /** Top-level preset rows, in their authored composition order. */
        readonly compositionRows: readonly InteractiveLearningCompositionRow[];
    };
    readonly agent: {
        readonly module: '@dsh-portable/interactive-learning/agent';
        readonly bundle: 'lib/agent.js';
    };
    readonly client: {
        readonly module: '@dsh-portable/interactive-learning/client';
        readonly bundle: 'lib/client.js';
    };
}
/** Resolve every Interactive Learning path as it must appear in a target manifest. */
export declare function interactiveLearningInventoryPaths(target: TargetSpec): readonly string[];
/** A package manifest may narrow, but can never broaden, this release policy. */
export declare function assertInteractiveLearningPublishedPathPolicy(paths: readonly string[]): void;
/**
 * Fail closed unless both the semantic evidence and every target-specific
 * inventory member prove that Interactive Learning landed in the final app.
 */
export declare function assertInteractiveLearningReleaseContract(target: TargetSpec, files: readonly {
    readonly path: string;
}[], evidence: unknown): asserts evidence is InteractiveLearningReleaseEvidence;
//# sourceMappingURL=learning-contract.d.ts.map