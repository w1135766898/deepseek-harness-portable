/**
 * Make this distribution's out-of-tree client plugins visible to the pinned
 * kernel's browser bundling preset.
 *
 * The kernel's `packages/client/tsdown.client.ts` resolves a package's
 * production externals and its `dsh.client.external` requests by scanning
 * `packages/<group>/<name>/package.json` under its OWN repository root, keyed
 * by package name. Every consumer inside the kernel satisfies that shape; this
 * distribution's plugins live in `apps/` and `packages/` of the outer
 * repository and are therefore invisible to it.
 *
 * Rather than fork a ~700-line bundling contract that changes every kernel
 * release, this module mirrors each plugin's manifest into the location the
 * preset scans. The mirror carries no sources and is never installed — the
 * workspace globs exclude it and its directory ignores itself — so the kernel
 * checkout stays effectively pristine while the bundling contract keeps a
 * single upstream source of truth.
 * @module scripts/build/client-manifest-bridge
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

/** Directory group under the kernel's packages tree that holds every mirrored manifest. */
export const BRIDGE_GROUP = 'portable'

/** Preset import that marks a package as a consumer of the kernel's browser bundling contract. */
const KERNEL_PRESET_SPECIFIER = 'vendor/deepseek-harness/packages/client/tsdown.client.ts'

/** Outer-repository directories that may hold client plugin packages. */
const SEARCH_ROOTS = ['apps', 'packages'] as const

/**
 * Marker recorded on every mirrored manifest. It both explains the file in
 * place and lets workspace scanners recognize a mirror as something other than
 * a real package, so a mirrored name never collides with its source.
 */
export const BRIDGE_MARKER = '_portableManifestBridge'

/**
 * Whether a parsed manifest is a mirror written by this module rather than a
 * real workspace package.
 * @param manifest - parsed `package.json` contents.
 */
export function isManifestBridge(manifest: object): boolean {
  return BRIDGE_MARKER in manifest
}

/** One out-of-tree package that the kernel's bundling preset must be able to resolve. */
export interface BridgedPackage {
  /** Package name, the key the preset matches on. */
  readonly name: string
  /** Absolute path of the real package directory in the outer repository. */
  readonly source: string
}

/**
 * Whether a tsdown config delegates to the kernel's browser bundling preset.
 * @param configText - contents of a package's `tsdown.config.ts`.
 */
export function usesKernelClientPreset(configText: string): boolean {
  return configText.includes(KERNEL_PRESET_SPECIFIER)
}

/**
 * Absolute path of the mirrored-manifest group inside the pinned kernel.
 * @param root - outer repository root.
 */
export function bridgeDirectory(root: string): string {
  return resolve(root, 'vendor', 'deepseek-harness', 'packages', BRIDGE_GROUP)
}

/**
 * Discover every outer-repository package that builds through the kernel preset.
 * @param root - outer repository root.
 * @returns the packages to mirror, name-sorted so the bridge is reproducible.
 */
export function discoverBridgedPackages(root: string): BridgedPackage[] {
  const found: BridgedPackage[] = []
  for (const searchRoot of SEARCH_ROOTS) {
    const base = resolve(root, searchRoot)
    if (!existsSync(base)) continue
    for (const entry of readdirSync(base, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      const source = join(base, entry.name)
      const config = join(source, 'tsdown.config.ts')
      const manifest = join(source, 'package.json')
      if (!existsSync(config) || !existsSync(manifest)) continue
      if (!usesKernelClientPreset(readFileSync(config, 'utf8'))) continue
      const name = (JSON.parse(readFileSync(manifest, 'utf8')) as { name?: unknown }).name
      if (typeof name !== 'string' || name.length === 0) {
        throw new Error(`client manifest bridge: ${manifest} declares no package name`)
      }
      found.push({ name, source })
    }
  }
  return found.sort((left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0))
}

/** Directory name a mirrored package occupies inside the bridge group. */
function bridgeSlug(name: string): string {
  return name.replace(/^@/, '').replaceAll('/', '__')
}

/**
 * Rebuild the mirrored manifests from scratch.
 *
 * The whole group is dropped first so a renamed or removed plugin cannot leave
 * a stale manifest behind that the preset would keep resolving.
 * @param root - outer repository root.
 * @returns the mirrored packages, in the order they were written.
 */
export function writeManifestBridge(root: string): BridgedPackage[] {
  const directory = bridgeDirectory(root)
  rmSync(directory, { recursive: true, force: true })
  const packages = discoverBridgedPackages(root)
  if (packages.length === 0) return packages
  mkdirSync(directory, { recursive: true })
  // A self-ignoring directory keeps the generated mirror out of the pinned
  // kernel's git status without writing to its git configuration.
  writeFileSync(
    join(directory, '.gitignore'),
    '# Generated by the portable distribution; see scripts/build/client-manifest-bridge.ts\n*\n',
  )
  for (const bridged of packages) {
    const manifest = JSON.parse(readFileSync(join(bridged.source, 'package.json'), 'utf8')) as Record<string, unknown>
    const target = join(directory, bridgeSlug(bridged.name))
    mkdirSync(target, { recursive: true })
    // Mirrored verbatim: the preset reads the dependency sections and the
    // `dsh.client` declaration today, and a faithful copy keeps a kernel that
    // starts reading another field working without a change here.
    writeFileSync(
      join(target, 'package.json'),
      `${JSON.stringify({ ...manifest, [BRIDGE_MARKER]: bridged.source }, undefined, 2)}\n`,
    )
    // The shape the preset scans is also the kernel's own tsdown workspace
    // glob, so a bare mirror would be picked up as a build target that has no
    // sources to build. A falsey entry is the kernel's documented way to drop a
    // workspace member before entry resolution.
    writeFileSync(
      join(target, 'tsdown.config.ts'),
      `/** Generated manifest mirror for ${bridged.name}; never a build target. */\nexport default { entry: '' }\n`,
    )
  }
  return packages
}

function main(): void {
  const root = resolve(import.meta.dirname, '..', '..')
  const packages = writeManifestBridge(root)
  console.log(
    packages.length === 0
      ? 'client manifest bridge: no out-of-tree client plugins found'
      : `client manifest bridge: mirrored ${String(packages.length)} manifest(s) — ${packages.map(item => item.name).join(', ')}`,
  )
}

if (import.meta.main) main()
