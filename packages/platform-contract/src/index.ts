/** Static build platforms supported by the portable distribution. */
export type BuildPlatform = 'win32' | 'linux' | 'darwin'

/** CPU architectures supported by at least one build target. */
export type BuildArchitecture = 'x64' | 'arm64'

/** Product-level support advertised for a mode on a target. */
export type ModeSupportLevel = 'native' | 'compatible' | 'alternative' | 'unavailable'

/** Release formats produced from an unpacked Electron application. */
export type PackageFormat =
  | 'portable-zip'
  | 'inno-setup'
  | 'app-image'
  | 'deb'
  | 'dmg'

/** A native payload that must be present in the target runtime closure. */
export type NativeAssetRule = {
  readonly package: string
  readonly source: string
  readonly storePrefix?: string
  readonly strategy: 'copy-directory' | 'copy-file' | 'electron-rebuild' | 'generated-package'
}

/** Minimum mode support that a packaged target must publish. */
export interface ModeExpectation {
  readonly mode: string
  readonly minimum: ModeSupportLevel
  readonly variant?: string
  readonly runtimeRequirements?: readonly string[]
  readonly limitations?: readonly string[]
}

/** Runtime evidence captured from the packaged application, never inferred from the build host. */
export interface MeasuredModeSupport {
  readonly level: ModeSupportLevel
  readonly variant?: string
  readonly presetHash?: string
  readonly upstreamCommit?: string
  readonly capabilitySnapshotHash?: string
  readonly limitations?: readonly string[]
  readonly reason?: string
  readonly remediation?: readonly string[]
  readonly missing?: readonly Record<string, unknown>[]
}

export interface SigningPolicy {
  readonly adapter: 'authenticode' | 'codesign-notarization' | 'external-package-signing'
  /** An official release is impossible until evidence from this adapter is attached. */
  readonly officialReleaseRequiresEvidence: true
  readonly credentialEnvironment: readonly string[]
}

/**
 * All target-specific build facts. Pipeline steps consume this contract and
 * must not infer a target by independently combining platform and arch flags.
 */
export interface TargetSpec {
  readonly id: `${BuildPlatform}-${BuildArchitecture}`
  readonly platform: BuildPlatform
  readonly arch: BuildArchitecture
  readonly electron: {
    readonly platform: BuildPlatform
    readonly arch: BuildArchitecture
  }
  readonly nativeAssets: readonly NativeAssetRule[]
  readonly launchers: readonly string[]
  readonly formats: readonly PackageFormat[]
  readonly updaterAdapter: string
  readonly signing: SigningPolicy
  readonly requiredModeSupport: readonly ModeExpectation[]
}

const SUPPORT_RANK: Readonly<Record<ModeSupportLevel, number>> = {
  unavailable: 0,
  alternative: 1,
  compatible: 2,
  native: 3,
}

/** Whether an actual support level satisfies a target's declared minimum. */
export function satisfiesModeSupport(actual: ModeSupportLevel, minimum: ModeSupportLevel): boolean {
  return SUPPORT_RANK[actual] >= SUPPORT_RANK[minimum]
}

/** Validate invariants once, next to target registration. */
export function defineTarget(spec: TargetSpec): Readonly<TargetSpec> {
  if (spec.id !== `${spec.platform}-${spec.arch}`) {
    throw new Error(`target id ${spec.id} does not match ${spec.platform}-${spec.arch}`)
  }
  if (spec.electron.platform !== spec.platform || spec.electron.arch !== spec.arch) {
    throw new Error(`target ${spec.id} has a mismatched Electron target`)
  }
  if (!spec.signing.officialReleaseRequiresEvidence || spec.signing.credentialEnvironment.length === 0) {
    throw new Error(`target ${spec.id} must fail closed on missing official-release signing evidence`)
  }
  const modes = new Set<string>()
  for (const expectation of spec.requiredModeSupport) {
    if (modes.has(expectation.mode)) throw new Error(`target ${spec.id} declares mode ${expectation.mode} more than once`)
    modes.add(expectation.mode)
  }
  return Object.freeze(spec)
}
