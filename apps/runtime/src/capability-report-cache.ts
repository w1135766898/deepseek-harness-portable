import { createHash } from 'node:crypto'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import type { CapabilityReport } from './mode-resolver.js'

export const CAPABILITY_CACHE_SCHEMA_VERSION = 1
export const CAPABILITY_PROBE_REVISION = 1

type CapabilityCacheEnvelope = {
  schemaVersion: number
  probeRevision: number
  writtenAt: string
  runtime: {
    platform: NodeJS.Platform
    arch: NodeJS.Architecture
    nodeModules: string
    electron: string
    upstreamVersion: string
    probeImplementationHash: string
  }
  report: CapabilityReport
}

export type CapabilityCacheIdentity = CapabilityCacheEnvelope['runtime']

export function currentCapabilityCacheIdentity(
  platform: NodeJS.Platform = process.platform,
  arch: NodeJS.Architecture = process.arch,
  upstreamVersion = 'development',
  probeImplementationHash = '',
): CapabilityCacheIdentity {
  return {
    platform,
    arch,
    nodeModules: process.versions.modules ?? '',
    electron: process.versions.electron ?? '',
    upstreamVersion,
    probeImplementationHash,
  }
}

function sameIdentity(left: CapabilityCacheIdentity, right: CapabilityCacheIdentity): boolean {
  return left.platform === right.platform
    && left.arch === right.arch
    && left.nodeModules === right.nodeModules
    && left.electron === right.electron
    && left.upstreamVersion === right.upstreamVersion
    && left.probeImplementationHash === right.probeImplementationHash
}

export async function readCapabilityReportCache(
  path: string,
  identity: CapabilityCacheIdentity,
  maxAgeMs = 24 * 60 * 60 * 1000,
): Promise<CapabilityReport | undefined> {
  try {
    const cached = JSON.parse(await readFile(path, 'utf8')) as CapabilityCacheEnvelope
    if (cached.schemaVersion !== CAPABILITY_CACHE_SCHEMA_VERSION
      || cached.probeRevision !== CAPABILITY_PROBE_REVISION
      || !sameIdentity(cached.runtime, identity)
      || cached.report?.target.platform !== identity.platform
      || cached.report.target.arch !== identity.arch
      || !Number.isFinite(Date.parse(cached.writtenAt))
      || Date.now() - Date.parse(cached.writtenAt) > maxAgeMs
      || cached.report.snapshotHash !== createHash('sha256').update(JSON.stringify({
        target: cached.report.target,
        capabilities: cached.report.capabilities,
      })).digest('hex')) return undefined
    return cached.report
  } catch {
    return undefined
  }
}

export async function writeCapabilityReportCache(
  path: string,
  identity: CapabilityCacheIdentity,
  report: CapabilityReport,
): Promise<void> {
  const temporary = `${path}.${process.pid}.${Date.now()}.tmp`
  await mkdir(dirname(path), { recursive: true })
  try {
    await writeFile(temporary, `${JSON.stringify({
      schemaVersion: CAPABILITY_CACHE_SCHEMA_VERSION,
      probeRevision: CAPABILITY_PROBE_REVISION,
      writtenAt: new Date().toISOString(),
      runtime: identity,
      report,
    } satisfies CapabilityCacheEnvelope, null, 2)}\n`, 'utf8')
    await rename(temporary, path)
  } finally {
    await rm(temporary, { force: true })
  }
}
