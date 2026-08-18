import {
  satisfiesModeSupport,
  type MeasuredModeSupport,
  type TargetSpec,
} from '../../platform-contract/src/index.js'
import {
  assertInteractiveLearningReleaseContract,
  type InteractiveLearningReleaseEvidence,
} from './learning-contract.js'

export {
  assertInteractiveLearningReleaseContract,
  INTERACTIVE_LEARNING_APP_FILES,
  INTERACTIVE_LEARNING_DISTRIBUTION_FILES,
  INTERACTIVE_LEARNING_PACKAGE_FILES,
  INTERACTIVE_LEARNING_PUBLIC_DECLARATION_FILES,
  assertInteractiveLearningPublishedPathPolicy,
  interactiveLearningInventoryPaths,
  type InteractiveLearningCompositionRow,
  type InteractiveLearningReleaseEvidence,
} from './learning-contract.js'

export interface ReleaseSourceIdentity {
  readonly portableCommit: string
  readonly upstreamCommit: string
}

export interface ReleaseFile {
  readonly path: string
  readonly type: 'file' | 'symlink'
  readonly size: number
  readonly sha256: string
}

export interface ReleasePatchFile {
  readonly path: string
  readonly inputSha256: string
  readonly outputSha256: string
}

export interface ReleasePatch {
  readonly id: string
  readonly status: 'applied' | 'not-applicable' | 'already-upstream'
  readonly files: readonly ReleasePatchFile[]
}

export interface ReleaseSigningEvidence {
  readonly adapter: TargetSpec['signing']['adapter']
  readonly status: 'signed' | 'signed-and-notarized' | 'externally-signed'
  readonly identity: string
  readonly verification: string
}

export interface ReleaseManifestInput {
  readonly distributionVersion: string
  readonly shellVersion: string
  readonly kernelVersion: string
  readonly source: ReleaseSourceIdentity
  readonly target: TargetSpec
  readonly formats?: readonly string[]
  readonly electronVersion: string
  readonly nodeVersion: string
  readonly runtimeClosureHash: string
  readonly modeCatalogHash: string
  readonly measuredModeSupport: Readonly<Record<string, MeasuredModeSupport>>
  readonly experiencePacks: {
    readonly interactiveLearning: InteractiveLearningReleaseEvidence
  }
  readonly files: readonly ReleaseFile[]
  readonly patches: readonly ReleasePatch[]
  readonly signingEvidence?: ReleaseSigningEvidence
  readonly releaseNotes?: Record<string, unknown>
}

export interface ReleaseManifest {
  readonly schemaVersion: 3
  readonly distributionVersion: string
  readonly shellVersion: string
  readonly desktopVersion: string
  readonly kernelVersion: string
  readonly kernelCommit: string
  readonly kernelPackage: '@deepseek-ai/dsh-web-app'
  readonly kernelRepository: 'https://github.com/deepseek-ai/deepseek-harness'
  readonly source: ReleaseSourceIdentity
  readonly target: {
    readonly id: string
    readonly platform: string
    readonly arch: string
    readonly formats: readonly string[]
    readonly updaterAdapter: string
  }
  readonly distribution: {
    readonly classification: 'non-official-unsigned' | 'official'
    readonly signingPolicy: TargetSpec['signing']
    readonly signingEvidence?: ReleaseSigningEvidence
  }
  readonly runtime: {
    readonly electronVersion: string
    readonly nodeVersion: string
    readonly runtimeClosureHash: string
  }
  readonly modeCatalog: {
    readonly hash: string
    readonly support: Readonly<Record<string, MeasuredModeSupport>>
  }
  readonly experiencePacks: {
    readonly interactiveLearning: InteractiveLearningReleaseEvidence
  }
  readonly files: readonly ReleaseFile[]
  readonly fileInventory: {
    readonly algorithm: 'sha256'
    readonly excludes: readonly ['release-manifest.json']
  }
  readonly patches: readonly ReleasePatch[]
  readonly releaseNotes?: Record<string, unknown>
}

function validateHash(value: string, label: string): void {
  if (!/^[a-f0-9]{64}$/.test(value)) throw new Error(`${label} must be a lowercase SHA-256 digest`)
}

function validateFiles(files: readonly ReleaseFile[]): void {
  if (files.length === 0) throw new Error('release manifest requires a non-empty files[] inventory')
  const paths = new Set<string>()
  let previous = ''
  for (const file of files) {
    if (file.path.length === 0 || file.path.includes('\\') || file.path.startsWith('/') || file.path.includes('../')) {
      throw new Error(`release file has an unsafe path: ${JSON.stringify(file.path)}`)
    }
    if (paths.has(file.path)) throw new Error(`release file is duplicated: ${file.path}`)
    if (previous.localeCompare(file.path) > 0) throw new Error('release files[] must be sorted by path')
    if (!Number.isSafeInteger(file.size) || file.size < 0) throw new Error(`release file ${file.path} has an invalid size`)
    validateHash(file.sha256, `release file ${file.path}`)
    paths.add(file.path)
    previous = file.path
  }
}

function validateMeasuredSupport(
  target: TargetSpec,
  support: Readonly<Record<string, MeasuredModeSupport>>,
  upstreamCommit: string,
): void {
  for (const expectation of target.requiredModeSupport) {
    const actual = support[expectation.mode]
    if (actual === undefined) throw new Error(`packaged runtime did not measure required mode ${expectation.mode}`)
    if (!satisfiesModeSupport(actual.level, expectation.minimum)) {
      throw new Error(`packaged runtime measured ${expectation.mode}=${actual.level}; target ${target.id} requires ${expectation.minimum}`)
    }
    if (expectation.variant !== undefined && actual.variant !== expectation.variant) {
      throw new Error(`packaged runtime measured ${expectation.mode} variant ${String(actual.variant)}; target ${target.id} requires ${expectation.variant}`)
    }
  }
  for (const [mode, actual] of Object.entries(support)) {
    if (actual.level === 'unavailable' && (
      typeof actual.reason !== 'string'
      || actual.reason.length === 0
      || !Array.isArray(actual.remediation)
      || actual.remediation.length === 0
    )) {
      throw new Error(`unavailable mode ${mode} requires reason and remediation evidence`)
    }
    if (actual.level !== 'unavailable') {
      if (actual.variant === undefined || actual.upstreamCommit !== upstreamCommit) {
        throw new Error(`selectable mode ${mode} is missing its variant/upstream trace`)
      }
      validateHash(actual.presetHash ?? '', `mode ${mode} preset`)
      validateHash(actual.capabilitySnapshotHash ?? '', `mode ${mode} capability snapshot`)
    }
  }
}

function validatePatches(patches: readonly ReleasePatch[]): void {
  if (patches.length === 0) throw new Error('release manifest requires the reviewed patch inventory')
  const ids = new Set<string>()
  for (const patch of patches) {
    if (ids.has(patch.id)) throw new Error(`release patch is duplicated: ${patch.id}`)
    ids.add(patch.id)
    if (patch.status === 'not-applicable' && patch.files.length !== 0) {
      throw new Error(`not-applicable patch ${patch.id} cannot attest files`)
    }
    if (patch.status !== 'not-applicable' && patch.files.length === 0) {
      throw new Error(`${patch.status} patch ${patch.id} requires input/output file hashes`)
    }
    for (const file of patch.files) {
      validateHash(file.inputSha256, `patch ${patch.id} input`)
      validateHash(file.outputSha256, `patch ${patch.id} output`)
    }
  }
}

/** Build the one manifest schema used by unpacked apps and release archives. */
export function createReleaseManifest(input: ReleaseManifestInput): ReleaseManifest {
  validateFiles(input.files)
  validateMeasuredSupport(input.target, input.measuredModeSupport, input.source.upstreamCommit)
  validatePatches(input.patches)
  assertInteractiveLearningReleaseContract(
    input.target,
    input.files,
    (input.experiencePacks as ReleaseManifestInput['experiencePacks'] | undefined)?.interactiveLearning,
  )
  if (input.signingEvidence !== undefined && input.signingEvidence.adapter !== input.target.signing.adapter) {
    throw new Error(`signing evidence uses ${input.signingEvidence.adapter}; target requires ${input.target.signing.adapter}`)
  }
  return {
    schemaVersion: 3,
    distributionVersion: input.distributionVersion,
    shellVersion: input.shellVersion,
    desktopVersion: input.shellVersion,
    kernelVersion: input.kernelVersion,
    kernelCommit: input.source.upstreamCommit,
    kernelPackage: '@deepseek-ai/dsh-web-app',
    kernelRepository: 'https://github.com/deepseek-ai/deepseek-harness',
    source: input.source,
    target: {
      id: input.target.id,
      platform: input.target.platform,
      arch: input.target.arch,
      formats: input.formats ?? input.target.formats,
      updaterAdapter: input.target.updaterAdapter,
    },
    distribution: {
      classification: input.signingEvidence === undefined ? 'non-official-unsigned' : 'official',
      signingPolicy: input.target.signing,
      ...(input.signingEvidence === undefined ? {} : { signingEvidence: input.signingEvidence }),
    },
    runtime: {
      electronVersion: input.electronVersion,
      nodeVersion: input.nodeVersion,
      runtimeClosureHash: input.runtimeClosureHash,
    },
    modeCatalog: { hash: input.modeCatalogHash, support: input.measuredModeSupport },
    experiencePacks: input.experiencePacks,
    files: input.files,
    fileInventory: { algorithm: 'sha256', excludes: ['release-manifest.json'] },
    patches: input.patches,
    ...(input.releaseNotes === undefined ? {} : { releaseNotes: input.releaseNotes }),
  }
}

/** Stable ASCII JSON for tools that consume manifests through legacy shells. */
export function serializeReleaseManifest(manifest: ReleaseManifest): string {
  return `${JSON.stringify(manifest, null, 2).replace(/[^\x00-\x7F]/g, character => (
    `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`
  ))}\n`
}
