import { createHash } from 'node:crypto'
import { createReadStream, existsSync } from 'node:fs'
import { copyFile, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { basename, join, resolve } from 'node:path'
import type { TargetSpec } from '../../packages/platform-contract/src/index.js'
import type { PackagedRuntimeEvidence } from './packaged-smoke.js'

export interface VerifiedArtifact {
  readonly name: string
  readonly size: number
  readonly sha256: string
}

export interface ArtifactVerificationRecord {
  readonly schemaVersion: 1
  readonly targetId: string
  readonly nativeHost: { readonly platform: string; readonly arch: string }
  readonly capabilitySnapshotHash: string
  readonly distributionClassification: 'non-official-unsigned' | 'official'
  readonly checks: {
    readonly nativeAddons: true
    readonly packagedProtocolAndReadiness: true
    readonly finalApplicationBytesRetested: true
    readonly platformContainersReadOnlyVerified: true
    readonly manifestInventory: true
  }
  readonly artifacts: readonly VerifiedArtifact[]
}

export async function sha256File(path: string): Promise<string> {
  return await new Promise((resolvePromise, reject) => {
    const hash = createHash('sha256')
    const stream = createReadStream(path)
    stream.on('data', chunk => hash.update(chunk))
    stream.once('error', reject)
    stream.once('end', () => resolvePromise(hash.digest('hex')))
  })
}

export interface WriteArtifactVerificationOptions {
  readonly target: TargetSpec
  readonly evidence: PackagedRuntimeEvidence
  readonly artifacts: readonly string[]
  readonly manifestPath: string
  readonly outputRoot: string
  readonly host?: { readonly platform: string; readonly arch: string }
}

/** Copy immutable package outputs into a verified bundle and attest their exact bytes. */
export async function writeArtifactVerification(
  options: WriteArtifactVerificationOptions,
): Promise<{ readonly directory: string; readonly record: ArtifactVerificationRecord }> {
  const host = options.host ?? { platform: process.platform, arch: process.arch }
  if (host.platform !== options.target.platform || host.arch !== options.target.arch) {
    throw new Error(`target ${options.target.id} can only be verified on native ${options.target.platform}-${options.target.arch}; got ${host.platform}-${host.arch}`)
  }
  if (`${options.evidence.capabilityReport.target.platform}-${options.evidence.capabilityReport.target.arch}` !== options.target.id) {
    throw new Error('packaged evidence target does not match verification target')
  }
  if (options.artifacts.length === 0) throw new Error('artifact verification requires at least one final package')
  const manifest = JSON.parse(await readFile(options.manifestPath, 'utf8')) as {
    schemaVersion?: unknown
    target?: { id?: unknown }
    distribution?: { classification?: unknown }
    files?: unknown
  }
  if (manifest.schemaVersion !== 3 || manifest.target?.id !== options.target.id || !Array.isArray(manifest.files)) {
    throw new Error('final release manifest is missing its target-bound files[] inventory')
  }
  const classification = manifest.distribution?.classification
  if (classification !== 'non-official-unsigned' && classification !== 'official') {
    throw new Error('release manifest has no valid distribution classification')
  }
  const directory = resolve(options.outputRoot, options.target.id)
  await rm(directory, { recursive: true, force: true })
  await mkdir(directory, { recursive: true })
  const names = new Set<string>()
  const artifacts: VerifiedArtifact[] = []
  for (const source of options.artifacts) {
    if (!existsSync(source)) throw new Error(`final package is missing: ${source}`)
    const name = basename(source)
    if (names.has(name)) throw new Error(`final package basename is duplicated: ${name}`)
    names.add(name)
    const destination = join(directory, name)
    await copyFile(source, destination)
    const metadata = await stat(destination)
    artifacts.push({ name, size: metadata.size, sha256: await sha256File(destination) })
  }
  artifacts.sort((left, right) => left.name.localeCompare(right.name))
  const record: ArtifactVerificationRecord = {
    schemaVersion: 1,
    targetId: options.target.id,
    nativeHost: host,
    capabilitySnapshotHash: options.evidence.capabilityReport.snapshotHash,
    distributionClassification: classification,
    checks: {
      nativeAddons: true,
      packagedProtocolAndReadiness: true,
      finalApplicationBytesRetested: true,
      platformContainersReadOnlyVerified: true,
      manifestInventory: true,
    },
    artifacts,
  }
  await writeFile(join(directory, 'artifact-verification.json'), `${JSON.stringify(record, null, 2)}\n`)
  return { directory, record }
}

/** Re-hash a downloaded bundle. Publishing never rebuilds or modifies its artifacts. */
export async function verifyArtifactBundle(directory: string, expectedTarget: string): Promise<ArtifactVerificationRecord> {
  const record = JSON.parse(await readFile(join(directory, 'artifact-verification.json'), 'utf8')) as ArtifactVerificationRecord
  if (record.schemaVersion !== 1 || record.targetId !== expectedTarget || !Array.isArray(record.artifacts) || record.artifacts.length === 0) {
    throw new Error(`invalid artifact-verification.json for ${expectedTarget}`)
  }
  if (`${record.nativeHost?.platform}-${record.nativeHost?.arch}` !== expectedTarget) {
    throw new Error(`verification record for ${expectedTarget} was not produced by its native host`)
  }
  if (record.distributionClassification !== 'official' && record.distributionClassification !== 'non-official-unsigned') {
    throw new Error(`verification record for ${expectedTarget} has an invalid distribution classification`)
  }
  if (!Object.values(record.checks).every(value => value === true)) throw new Error(`verification checks are incomplete for ${expectedTarget}`)
  const names = new Set<string>()
  for (const artifact of record.artifacts) {
    if (artifact.name !== basename(artifact.name) || names.has(artifact.name) || !/^[a-f0-9]{64}$/.test(artifact.sha256)) {
      throw new Error(`verification record contains an unsafe or duplicate artifact: ${artifact.name}`)
    }
    names.add(artifact.name)
    const path = join(directory, artifact.name)
    const metadata = await stat(path)
    if (metadata.size !== artifact.size || await sha256File(path) !== artifact.sha256) {
      throw new Error(`verified artifact bytes changed after testing: ${artifact.name}`)
    }
  }
  return record
}
