/**
 * One-time, profile-owned bootstrap for the marketplace bundled with the
 * portable distribution. The marker deliberately lives inside the web
 * profile: uninstalling the marketplace keeps the marker (so it stays
 * uninstalled), while deleting the profile restores the shipped default.
 * @module @dsh-portable/runtime/marketplace-bootstrap
 */

import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { dirname, isAbsolute, join, resolve } from 'node:path'

export const MARKETPLACE_PACKAGE = 'dsh-plugin-marketplace'
export const MARKETPLACE_SOURCE_COMMIT = 'c8adea1a41c7d1037aa33f44ad6a9b986399a354'
export const MARKETPLACE_SEED_MARKER = '.dsh-portable-marketplace-v1.json'
export const MARKETPLACE_RECOVERY_MARKER = '.dsh-portable-marketplace-recovery-v1.json'
export const MARKETPLACE_RUNTIME_FILES = [
  'package.json',
  'cordis.patch.yml',
  'lib/index.js',
  'lib/client.js',
] as const
const MARKETPLACE_SEED_ROOT = '.system-plugins'

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
  status: 'already-seeded' | 'adopted' | 'installed' | 'repaired' | 'unavailable' | 'failed'
  enabled: boolean
  error?: string
  diagnostic?: MarketplaceBootstrapDiagnostic
}

export type MarketplaceBootstrapDiagnostic = {
  code: 'MARKETPLACE_UNAVAILABLE' | 'MARKETPLACE_INSTALL_FAILED'
  component: 'marketplace'
  severity: 'warning'
  message: string
  recoverable: true
}

export type MarketplaceBootstrapOptions = {
  profileDir: string
  sourceDir?: string
  legacySourceDirs?: readonly string[]
  install: (sourceSpec: string, enabled: boolean) => number
}

export type MarketplaceSeedResult = {
  status: 'created' | 'ready' | 'failed'
  sourceDir?: string
  error?: string
}

function readJson<T>(path: string): T | undefined {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as T
  } catch {
    return undefined
  }
}

function writeJsonAtomic(path: string, value: unknown): void {
  const temporary = `${path}.${process.pid}.${Date.now()}.tmp`
  try {
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(temporary, `${JSON.stringify(value, undefined, 2)}\n`, 'utf8')
    renameSync(temporary, path)
  } finally {
    rmSync(temporary, { force: true })
  }
}

function marketplacePackageReady(packageRoot: string): boolean {
  const manifest = readJson<PackageManifest>(join(packageRoot, 'package.json'))
  const patch = manifest?.dsh?.bundle?.patch
  const main = manifest?.main
  return manifest?.name === MARKETPLACE_PACKAGE
    && typeof patch === 'string'
    && existsSync(join(packageRoot, patch))
    && typeof main === 'string'
    && existsSync(join(packageRoot, main))
    && existsSync(join(packageRoot, 'lib', 'client.js'))
}

function marketplaceRuntimeFilesEqual(left: string, right: string): boolean {
  try {
    return MARKETPLACE_RUNTIME_FILES.every(relative => (
      readFileSync(join(left, relative)).equals(readFileSync(join(right, relative)))
    ))
  } catch {
    return false
  }
}

function profileState(profileDir: string): {
  dependency: boolean
  dependencySpec?: string
  enabled: boolean
  packageReady: boolean
} | undefined {
  const profile = readJson<ProfileManifest>(join(profileDir, 'package.json'))
  if (profile === undefined) return undefined
  const dependency = Object.prototype.hasOwnProperty.call(profile.dependencies ?? {}, MARKETPLACE_PACKAGE)
  const dependencySpec = profile.dependencies?.[MARKETPLACE_PACKAGE]
  const enabled = profile.dsh?.profile?.bundles?.includes(MARKETPLACE_PACKAGE) ?? false
  const packageRoot = join(profileDir, 'node_modules', MARKETPLACE_PACKAGE)
  return { dependency, dependencySpec, enabled, packageReady: marketplacePackageReady(packageRoot) }
}

function normalizedPath(path: string): string {
  const normalized = resolve(path)
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized
}

function linkTarget(profileDir: string, spec: string | undefined): string | undefined {
  if (spec === undefined || !spec.toLowerCase().startsWith('link:')) return undefined
  const value = spec.slice('link:'.length)
  if (value === '') return undefined
  return normalizedPath(isAbsolute(value) ? value : resolve(profileDir, value))
}

function isLegacyRuntimeLink(
  profileDir: string,
  spec: string | undefined,
  legacySourceDirs: readonly string[],
): boolean {
  const target = linkTarget(profileDir, spec)
  return target !== undefined && legacySourceDirs.some(source => normalizedPath(source) === target)
}

function isManagedMarketplaceSpec(
  profileDir: string,
  spec: string | undefined,
  sourceDir: string,
  legacySourceDirs: readonly string[],
): boolean {
  if (spec === undefined || !/^(?:file|link):/i.test(spec)) return false
  const value = spec.slice(spec.indexOf(':') + 1)
  if (value === '') return false
  const target = normalizedPath(isAbsolute(value) ? value : resolve(profileDir, value))
  if (target === normalizedPath(sourceDir)) return true
  if (legacySourceDirs.some(source => normalizedPath(source) === target)) return true
  const portable = target.replace(/\\/g, '/')
  return portable.endsWith(`/resources/app/node_modules/${MARKETPLACE_PACKAGE}`)
    || portable.includes(`/.system-plugins/${MARKETPLACE_PACKAGE}/`)
}

function removeManagedPath(path: string): void {
  let metadata
  try {
    metadata = lstatSync(path)
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code === 'ENOENT') return
    throw cause
  }
  if (metadata.isSymbolicLink()) unlinkSync(path)
  else rmSync(path, { recursive: true, force: true })
}

function copyTreeSync(source: string, target: string): void {
  if (statSync(source).isDirectory()) {
    mkdirSync(target, { recursive: true })
    for (const name of readdirSync(source)) copyTreeSync(join(source, name), join(target, name))
    return
  }
  mkdirSync(dirname(target), { recursive: true })
  writeFileSync(target, readFileSync(source))
}

/**
 * Repair only the marketplace mapping of an old managed profile. This avoids
 * invoking pnpm across the rest of an upgraded profile: old releases can leave
 * hundreds of unrelated junctions pointing at a removed application runtime.
 */
function repairManagedMarketplace(
  profileDir: string,
  sourceDir: string,
  enabled: boolean,
): void {
  const manifestPath = join(profileDir, 'package.json')
  const manifest = readJson<ProfileManifest>(manifestPath)
  if (manifest === undefined) throw new Error('web profile manifest is missing or invalid')

  const packageRoot = join(profileDir, 'node_modules', MARKETPLACE_PACKAGE)
  const staging = join(
    profileDir,
    'node_modules',
    `.${MARKETPLACE_PACKAGE}.${process.pid}.${Date.now()}.tmp`,
  )
  try {
    removeManagedPath(staging)
    mkdirSync(staging, { recursive: true })
    for (const relative of MARKETPLACE_RUNTIME_FILES) {
      copyTreeSync(join(sourceDir, relative), join(staging, relative))
    }
    if (!marketplacePackageReady(staging)) throw new Error('private marketplace copy is incomplete')
    mkdirSync(dirname(packageRoot), { recursive: true })
    removeManagedPath(packageRoot)
    renameSync(staging, packageRoot)

    manifest.dependencies = {
      ...manifest.dependencies,
      [MARKETPLACE_PACKAGE]: `file:${sourceDir.replace(/\\/g, '/')}`,
    }
    const bundles = manifest.dsh?.profile?.bundles ?? []
    manifest.dsh = {
      ...manifest.dsh,
      profile: {
        ...manifest.dsh?.profile,
        bundles: enabled
          ? bundles.includes(MARKETPLACE_PACKAGE) ? bundles : [...bundles, MARKETPLACE_PACKAGE]
          : bundles.filter(bundle => bundle !== MARKETPLACE_PACKAGE),
      },
    }
    writeJsonAtomic(manifestPath, manifest)
  } finally {
    removeManagedPath(staging)
  }
}

/**
 * Materialize the distribution-owned marketplace outside the application
 * install. Profiles install a private `file:` copy from this seed, so pnpm
 * can never mutate or leave a dangling link into `resources/app/node_modules`.
 * A complete seed remains usable when the application copy is later damaged.
 */
export function materializeMarketplaceSeed(options: {
  homeDir: string
  bundledSourceDir?: string
}): MarketplaceSeedResult {
  const target = join(
    options.homeDir,
    MARKETPLACE_SEED_ROOT,
    MARKETPLACE_PACKAGE,
    MARKETPLACE_SOURCE_COMMIT,
  )
  const bundledSource = options.bundledSourceDir
  const bundledReady = bundledSource !== undefined && marketplacePackageReady(bundledSource)
  if (marketplacePackageReady(target)
    && (!bundledReady || marketplaceRuntimeFilesEqual(target, bundledSource as string))) {
    return { status: 'ready', sourceDir: target }
  }
  if (!bundledReady || bundledSource === undefined) {
    return { status: 'failed', error: 'bundled marketplace package and persistent seed are missing or invalid' }
  }

  const staging = `${target}.${process.pid}.${Date.now()}.tmp`
  try {
    removeManagedPath(staging)
    mkdirSync(staging, { recursive: true })
    for (const relative of MARKETPLACE_RUNTIME_FILES) {
      copyTreeSync(join(bundledSource, relative), join(staging, relative))
    }
    if (!marketplacePackageReady(staging)) throw new Error('materialized marketplace seed is incomplete')
    mkdirSync(dirname(target), { recursive: true })
    if (marketplacePackageReady(target)
      && marketplaceRuntimeFilesEqual(target, bundledSource)) {
      return { status: 'ready', sourceDir: target }
    }
    removeManagedPath(target)
    renameSync(staging, target)
    return { status: 'created', sourceDir: target }
  } catch (cause) {
    if (marketplacePackageReady(target)) return { status: 'ready', sourceDir: target }
    return { status: 'failed', error: cause instanceof Error ? cause.message : String(cause) }
  } finally {
    removeManagedPath(staging)
  }
}

function writeSeedMarker(profileDir: string): void {
  const marker = join(profileDir, MARKETPLACE_SEED_MARKER)
  const payload = {
    schemaVersion: 1,
    package: MARKETPLACE_PACKAGE,
    sourceCommit: MARKETPLACE_SOURCE_COMMIT,
  }
  writeJsonAtomic(marker, payload)
}

type MarketplaceRecoveryState = {
  schemaVersion: 1
  package: typeof MARKETPLACE_PACKAGE
  enabled: boolean
}

function readRecoveryState(profileDir: string): MarketplaceRecoveryState | undefined {
  const state = readJson<MarketplaceRecoveryState>(join(profileDir, MARKETPLACE_RECOVERY_MARKER))
  if (state?.schemaVersion !== 1 || state.package !== MARKETPLACE_PACKAGE || typeof state.enabled !== 'boolean') {
    return undefined
  }
  return state
}

function clearRecoveryState(profileDir: string): void {
  rmSync(join(profileDir, MARKETPLACE_RECOVERY_MARKER), { force: true })
}

/**
 * Keep a broken marketplace dependency out of the active bundle list so the
 * rest of the profile can boot. The recovery marker records the pre-failure
 * enabled state before the manifest changes, making a later repair restore
 * the user's previous selection rather than silently changing it.
 */
function quarantineUnavailableMarketplace(
  profileDir: string,
  initial: NonNullable<ReturnType<typeof profileState>>,
  code: MarketplaceBootstrapDiagnostic['code'],
  reason: string,
): MarketplaceBootstrapResult {
  const previousRecovery = readRecoveryState(profileDir)
  const restoreEnabled = previousRecovery?.enabled ?? initial.enabled
  try {
    if (restoreEnabled) {
      writeJsonAtomic(join(profileDir, MARKETPLACE_RECOVERY_MARKER), {
        schemaVersion: 1,
        package: MARKETPLACE_PACKAGE,
        enabled: true,
      } satisfies MarketplaceRecoveryState)
    }
    if (initial.enabled) {
      const manifestPath = join(profileDir, 'package.json')
      const manifest = readJson<ProfileManifest>(manifestPath)
      if (manifest === undefined) throw new Error('web profile manifest became invalid during marketplace recovery')
      const bundles = manifest.dsh?.profile?.bundles ?? []
      manifest.dsh = {
        ...manifest.dsh,
        profile: {
          ...manifest.dsh?.profile,
          bundles: bundles.filter(bundle => bundle !== MARKETPLACE_PACKAGE),
        },
      }
      writeJsonAtomic(manifestPath, manifest)
    }
  } catch (cause) {
    const recoveryError = cause instanceof Error ? cause.message : String(cause)
    return {
      status: 'failed',
      enabled: initial.enabled,
      error: `${reason}; failed to quarantine the broken marketplace bundle: ${recoveryError}`,
      diagnostic: {
        code: 'MARKETPLACE_INSTALL_FAILED',
        component: 'marketplace',
        severity: 'warning',
        message: `Marketplace recovery failed: ${recoveryError}`,
        recoverable: true,
      },
    }
  }
  const message = code === 'MARKETPLACE_UNAVAILABLE'
    ? `Marketplace unavailable: ${reason}`
    : `Marketplace install failed: ${reason}`
  return {
    status: code === 'MARKETPLACE_UNAVAILABLE' ? 'unavailable' : 'failed',
    enabled: false,
    error: reason,
    diagnostic: {
      code,
      component: 'marketplace',
      severity: 'warning',
      message,
      recoverable: true,
    },
  }
}

/**
 * Seed the bundled marketplace exactly once for a profile.
 *
 * Existing, loadable dependencies are adopted without changing their version
 * or enabled state. Incomplete dependencies are rebuilt from the bundled
 * source while preserving enabled state. A marker with no dependency is an
 * intentional uninstall and is never repaired automatically.
 */
export function ensureMarketplacePreinstalled(
  options: MarketplaceBootstrapOptions,
): MarketplaceBootstrapResult {
  const marker = join(options.profileDir, MARKETPLACE_SEED_MARKER)
  const initial = profileState(options.profileDir)
  if (initial === undefined) {
    return { status: 'failed', enabled: false, error: 'web profile manifest is missing or invalid' }
  }
  const seeded = existsSync(marker)
  if (seeded && !initial.dependency && !initial.enabled) {
    clearRecoveryState(options.profileDir)
    return { status: 'already-seeded', enabled: false }
  }
  const recovery = readRecoveryState(options.profileDir)
  const legacySourceDirs = options.legacySourceDirs ?? []
  const legacyRuntimeLink = initial.dependency && initial.packageReady && isLegacyRuntimeLink(
    options.profileDir,
    initial.dependencySpec,
    legacySourceDirs,
  )
  if (initial.dependency) {
    if (initial.packageReady && !legacyRuntimeLink) {
      clearRecoveryState(options.profileDir)
      if (!seeded) writeSeedMarker(options.profileDir)
      return { status: seeded ? 'already-seeded' : 'adopted', enabled: initial.enabled }
    }
  }
  if (options.sourceDir === undefined) {
    return quarantineUnavailableMarketplace(
      options.profileDir,
      initial,
      'MARKETPLACE_UNAVAILABLE',
      'bundled marketplace package and persistent seed are missing or invalid',
    )
  }
  const sourceManifest = readJson<PackageManifest>(join(options.sourceDir, 'package.json'))
  if (sourceManifest?.name !== MARKETPLACE_PACKAGE) {
    return quarantineUnavailableMarketplace(
      options.profileDir,
      initial,
      'MARKETPLACE_UNAVAILABLE',
      'persistent marketplace seed is missing or invalid',
    )
  }
  const desiredEnabled = recovery?.enabled ?? (initial.dependency || initial.enabled ? initial.enabled : true)
  const managedDependency = initial.dependency && isManagedMarketplaceSpec(
    options.profileDir,
    initial.dependencySpec,
    options.sourceDir,
    legacySourceDirs,
  )
  if (managedDependency) {
    try {
      repairManagedMarketplace(options.profileDir, options.sourceDir, desiredEnabled)
      clearRecoveryState(options.profileDir)
      writeSeedMarker(options.profileDir)
      return { status: 'repaired', enabled: desiredEnabled }
    } catch (cause) {
      return quarantineUnavailableMarketplace(
        options.profileDir,
        profileState(options.profileDir) ?? initial,
        'MARKETPLACE_INSTALL_FAILED',
        `targeted marketplace repair failed: ${cause instanceof Error ? cause.message : String(cause)}`,
      )
    }
  }
  if (initial.dependency) {
    return quarantineUnavailableMarketplace(
      options.profileDir,
      initial,
      'MARKETPLACE_UNAVAILABLE',
      `the user-selected marketplace source ${JSON.stringify(initial.dependencySpec)} is not loadable and was not replaced`,
    )
  }
  const portableSource = options.sourceDir.replace(/\\/g, '/')
  const exitCode = options.install(`file:${portableSource}`, desiredEnabled)
  if (exitCode !== 0) {
    return quarantineUnavailableMarketplace(
      options.profileDir,
      profileState(options.profileDir) ?? initial,
      'MARKETPLACE_INSTALL_FAILED',
      `embedded dsh plugin install exited with code ${exitCode}`,
    )
  }
  const installed = profileState(options.profileDir)
  if (installed?.dependency !== true || installed.enabled !== desiredEnabled || installed.packageReady !== true) {
    return quarantineUnavailableMarketplace(
      options.profileDir,
      installed ?? initial,
      'MARKETPLACE_INSTALL_FAILED',
      'marketplace install did not produce a loadable bundle with the expected enabled state',
    )
  }
  clearRecoveryState(options.profileDir)
  writeSeedMarker(options.profileDir)
  return { status: initial.dependency ? 'repaired' : 'installed', enabled: desiredEnabled }
}
