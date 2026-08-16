/**
 * One-time, profile-owned bootstrap for the marketplace bundled with the
 * portable distribution. The marker deliberately lives inside the web
 * profile: uninstalling the marketplace keeps the marker (so it stays
 * uninstalled), while deleting the profile restores the shipped default.
 * @module dsh-desktop-web-pkg/marketplace-bootstrap
 */

import {
  existsSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { join } from 'node:path'

export const MARKETPLACE_PACKAGE = 'dsh-plugin-marketplace'
export const MARKETPLACE_SOURCE_COMMIT = 'c8adea1a41c7d1037aa33f44ad6a9b986399a354'
export const MARKETPLACE_SEED_MARKER = '.dsh-portable-marketplace-v1.json'

type ProfileManifest = {
  dependencies?: Record<string, string>
  dsh?: { profile?: { bundles?: string[] } }
}

type PackageManifest = {
  name?: string
  main?: string
  dsh?: { bundle?: { patch?: string }; client?: unknown }
}

export type MarketplaceBootstrapResult = {
  status: 'already-seeded' | 'adopted' | 'installed' | 'failed'
  enabled: boolean
  error?: string
}

export type MarketplaceBootstrapOptions = {
  profileDir: string
  sourceDir: string
  install: (sourceSpec: string) => number
}

function readJson<T>(path: string): T | undefined {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as T
  } catch {
    return undefined
  }
}

function profileState(profileDir: string): {
  dependency: boolean
  enabled: boolean
  packageReady: boolean
} | undefined {
  const profile = readJson<ProfileManifest>(join(profileDir, 'package.json'))
  if (profile === undefined) return undefined
  const dependency = Object.prototype.hasOwnProperty.call(profile.dependencies ?? {}, MARKETPLACE_PACKAGE)
  const enabled = profile.dsh?.profile?.bundles?.includes(MARKETPLACE_PACKAGE) ?? false
  const packageRoot = join(profileDir, 'node_modules', MARKETPLACE_PACKAGE)
  const manifest = readJson<PackageManifest>(join(packageRoot, 'package.json'))
  const patch = manifest?.dsh?.bundle?.patch
  const main = manifest?.main
  const packageReady = manifest?.name === MARKETPLACE_PACKAGE
    && typeof patch === 'string'
    && existsSync(join(packageRoot, patch))
    && typeof main === 'string'
    && existsSync(join(packageRoot, main))
    && existsSync(join(packageRoot, 'lib', 'client.js'))
  return { dependency, enabled, packageReady }
}

function writeSeedMarker(profileDir: string): void {
  const marker = join(profileDir, MARKETPLACE_SEED_MARKER)
  const temporary = `${marker}.${process.pid}.${Date.now()}.tmp`
  const payload = {
    schemaVersion: 1,
    package: MARKETPLACE_PACKAGE,
    sourceCommit: MARKETPLACE_SOURCE_COMMIT,
  }
  try {
    writeFileSync(temporary, `${JSON.stringify(payload, undefined, 2)}\n`, 'utf8')
    renameSync(temporary, marker)
  } finally {
    rmSync(temporary, { force: true })
  }
}

/**
 * Seed the bundled marketplace exactly once for a profile.
 *
 * Existing, loadable dependencies are adopted without changing their version
 * or enabled state. A marker with no dependency is an intentional uninstall
 * and is never repaired automatically.
 */
export function ensureMarketplacePreinstalled(
  options: MarketplaceBootstrapOptions,
): MarketplaceBootstrapResult {
  const marker = join(options.profileDir, MARKETPLACE_SEED_MARKER)
  const initial = profileState(options.profileDir)
  if (existsSync(marker)) {
    return { status: 'already-seeded', enabled: initial?.enabled ?? false }
  }
  if (initial === undefined) {
    return { status: 'failed', enabled: false, error: 'web profile manifest is missing or invalid' }
  }
  if (initial.dependency) {
    if (!initial.packageReady) {
      return {
        status: 'failed',
        enabled: initial.enabled,
        error: 'existing marketplace dependency is incomplete; leaving it untouched',
      }
    }
    writeSeedMarker(options.profileDir)
    return { status: 'adopted', enabled: initial.enabled }
  }
  const sourceManifest = readJson<PackageManifest>(join(options.sourceDir, 'package.json'))
  if (sourceManifest?.name !== MARKETPLACE_PACKAGE) {
    return { status: 'failed', enabled: false, error: 'bundled marketplace package is missing or invalid' }
  }
  const exitCode = options.install(`link:${options.sourceDir}`)
  if (exitCode !== 0) {
    return { status: 'failed', enabled: false, error: `embedded dsh plugin install exited with code ${exitCode}` }
  }
  const installed = profileState(options.profileDir)
  if (installed?.dependency !== true || installed.enabled !== true || installed.packageReady !== true) {
    return { status: 'failed', enabled: installed?.enabled ?? false, error: 'marketplace install did not produce a loadable enabled bundle' }
  }
  writeSeedMarker(options.profileDir)
  return { status: 'installed', enabled: true }
}
