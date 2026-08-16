/** Content-addressed cache helpers for the Windows packaging pipeline. */

import { createHash } from 'node:crypto'
import { createReadStream, existsSync } from 'node:fs'
import { lstat, mkdir, readFile, readdir, readlink, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, relative, resolve, sep } from 'node:path'

export const PACKAGING_CACHE_VERSION = 1

export type CacheLayer = {
  key: string
  completedAt: string
}

export type PackagingCacheState = {
  version: typeof PACKAGING_CACHE_VERSION
  build?: CacheLayer
  staging?: CacheLayer
  electron?: CacheLayer
}

export type FingerprintOptions = {
  baseDir: string
  paths: string[]
  excludedDirectoryNames?: ReadonlySet<string>
  salt?: string[]
}

function hashFile(path: string): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    const hash = createHash('sha256')
    const stream = createReadStream(path)
    stream.on('data', chunk => hash.update(chunk))
    stream.once('error', reject)
    stream.once('end', () => resolvePromise(hash.digest('hex')))
  })
}

async function collectFiles(
  baseDir: string,
  path: string,
  excludedDirectoryNames: ReadonlySet<string>,
  files: string[],
  links: Array<{ path: string; target: string }>,
): Promise<void> {
  if (!existsSync(path)) return
  const metadata = await lstat(path)
  if (metadata.isSymbolicLink()) {
    links.push({ path: relative(baseDir, path), target: await readlink(path) })
    return
  }
  if (metadata.isFile()) {
    files.push(path)
    return
  }
  if (!metadata.isDirectory()) return

  const entries = await readdir(path, { withFileTypes: true })
  for (const entry of entries) {
    if (entry.isDirectory() && excludedDirectoryNames.has(entry.name)) continue
    await collectFiles(baseDir, resolve(path, entry.name), excludedDirectoryNames, files, links)
  }
}

/**
 * Hash a stable, sorted projection of files and symbolic-link targets.
 *
 * @param options - roots, exclusions, and non-file inputs for the fingerprint.
 * @returns a lowercase SHA-256 digest.
 */
export async function fingerprintPaths(options: FingerprintOptions): Promise<string> {
  const baseDir = resolve(options.baseDir)
  const excluded = options.excludedDirectoryNames ?? new Set<string>()
  const files: string[] = []
  const links: Array<{ path: string; target: string }> = []
  for (const input of options.paths) {
    await collectFiles(baseDir, resolve(baseDir, input), excluded, files, links)
  }
  files.sort((left, right) => relative(baseDir, left).localeCompare(relative(baseDir, right), 'en'))
  links.sort((left, right) => left.path.localeCompare(right.path, 'en'))

  const perFile = new Map<string, string>()
  let cursor = 0
  const workers = Array.from({ length: Math.min(8, files.length) }, async () => {
    while (cursor < files.length) {
      const index = cursor
      cursor += 1
      const path = files[index]
      perFile.set(path, await hashFile(path))
    }
  })
  await Promise.all(workers)

  const aggregate = createHash('sha256')
  for (const value of options.salt ?? []) aggregate.update(`salt\0${value}\0`)
  for (const path of files) {
    const normalized = relative(baseDir, path).split(sep).join('/')
    aggregate.update(`file\0${normalized}\0${perFile.get(path)}\0`)
  }
  for (const link of links) {
    aggregate.update(`link\0${link.path.split(sep).join('/')}\0${link.target}\0`)
  }
  return aggregate.digest('hex')
}

/** Read a valid cache state, treating missing or malformed state as a cold cache. */
export async function readPackagingCache(path: string): Promise<PackagingCacheState> {
  try {
    const parsed = JSON.parse(await readFile(path, 'utf8')) as Partial<PackagingCacheState>
    if (parsed.version !== PACKAGING_CACHE_VERSION) throw new Error('cache schema mismatch')
    return parsed as PackagingCacheState
  } catch {
    return { version: PACKAGING_CACHE_VERSION }
  }
}

/** Atomically replace the cache state after a successful packaging layer. */
export async function writePackagingCache(path: string, state: PackagingCacheState): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  const temporary = `${path}.${process.pid}.tmp`
  await writeFile(temporary, `${JSON.stringify(state, null, 2)}\n`)
  await rm(path, { force: true })
  await rename(temporary, path)
}

/** Return whether a layer key matches and every required artifact exists. */
export function cacheLayerMatches(layer: CacheLayer | undefined, key: string, requiredPaths: string[]): boolean {
  return layer?.key === key && requiredPaths.every(path => existsSync(path))
}

/** Return a cache state with one completed layer and all dependent layers invalidated. */
export function completeCacheLayer(
  state: PackagingCacheState,
  layer: 'build' | 'staging' | 'electron',
  key: string,
): PackagingCacheState {
  const completed = { key, completedAt: new Date().toISOString() }
  if (layer === 'build') return { version: PACKAGING_CACHE_VERSION, build: completed }
  if (layer === 'staging') return { version: PACKAGING_CACHE_VERSION, build: state.build, staging: completed }
  return { ...state, electron: completed }
}

/**
 * Restore installer-owned metadata even when an isolated packaging command fails.
 *
 * @param paths - files whose exact contents and existence must be preserved.
 * @param action - isolated operation that may rewrite those files.
 * @returns the action result.
 */
export async function preserveFiles<T>(paths: string[], action: () => Promise<T>): Promise<T> {
  const snapshots = await Promise.all(paths.map(async path => ({
    path,
    content: existsSync(path) ? await readFile(path) : undefined,
  })))
  try {
    return await action()
  } finally {
    await Promise.all(snapshots.map(snapshot => (
      snapshot.content === undefined
        ? rm(snapshot.path, { force: true })
        : writeFile(snapshot.path, snapshot.content)
    )))
  }
}
