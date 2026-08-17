export declare const LEARNING_PACK_VERSION = "0.1.0";
export declare const LEARNING_MANIFEST_FILE = ".dsh-managed.json";
interface ManagedFile {
    path: string;
    ownedHash: string;
}
interface PreservedFile {
    path: string;
    observedHash: string;
    desiredHash: string;
    stagedPath: string;
}
export interface LearningInstallManifest {
    schema: 1;
    presetSchema: 1;
    package: '@dsh-portable/interactive-learning';
    packageVersion: string;
    preset: 'learning';
    source: 'package';
    installedAt: string;
    userModified: boolean;
    files: ManagedFile[];
    preservedFiles: PreservedFile[];
}
export interface LearningInstallResult {
    target: string;
    installed: string[];
    updated: string[];
    preserved: string[];
    staged: string[];
}
export interface LearningUninstallResult {
    target: string;
    removed: string[];
    preserved: string[];
    manifestFound: boolean;
}
export interface LearningInstallerOptions {
    dshHome?: string;
    source?: string;
}
/** Install or safely upgrade the independently owned user preset. */
export declare function installLearningPreset(options?: LearningInstallerOptions): Promise<LearningInstallResult>;
/** Uninstall only files whose current content still matches the package-owned hash. */
export declare function uninstallLearningPreset(options?: Pick<LearningInstallerOptions, 'dshHome'>): Promise<LearningUninstallResult>;
export {};
//# sourceMappingURL=installer.d.ts.map