import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { basename, dirname, extname, relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

// Require the first path-segment character so CSS such as `content:\"\"`
// cannot be mistaken for a Windows drive path ending at an escaped quote.
const WINDOWS_ABSOLUTE_PATH = /[A-Za-z]:[\\/]+[A-Za-z0-9_.-]/
const WINDOWS_FILE_URL = /file:\/\/[A-Za-z]:[\\/]/i
const HASHED_CHUNK_NAME = /-[A-Za-z0-9_-]{8,16}\.js$/
const RELATIVE_JS_REFERENCE = /["'](\.{1,2}\/[^"']+\.js)["']/g
const SOURCE_MAP_REFERENCE = /\/\/# sourceMappingURL=([^\s]+)/g

export const EXPECTED_WEB_CLIENT_INJECT = Object.freeze([
  '@deepseek-ai/dsh-client-runtime',
  '@deepseek-ai/dsh-client-locale',
  '@deepseek-ai/dsh-client-ui-conversation',
  '@deepseek-ai/dsh-client-ui-tool',
  '@deepseek-ai/dsh-api-remotes',
])

function normalizePath(path) {
  return resolve(path).replaceAll('\\', '/')
}

function jsTargetUnderLib(value, label) {
  assert.equal(typeof value, 'string', `${label} must be a string`)
  const normalized = value.replace(/^\.\//, '').replaceAll('\\', '/')
  assert.ok(
    normalized.startsWith('lib/')
      && normalized.endsWith('.js')
      && !normalized.includes('../'),
    `${label} must name a JavaScript file under lib: ${value}`,
  )
  return normalized.slice('lib/'.length)
}

/** Derive the only runtime DFS roots from package.json public and bin entries. */
export function publicJsEntriesFromManifest(manifest) {
  assert.equal(typeof manifest, 'object')
  assert.ok(manifest !== null)
  const targets = [jsTargetUnderLib(manifest.main, 'package.main')]
  for (const [name, entry] of Object.entries(manifest.exports ?? {})) {
    if (typeof entry !== 'object' || entry === null || !Object.hasOwn(entry, 'default')) continue
    targets.push(jsTargetUnderLib(entry.default, `package.exports[${JSON.stringify(name)}].default`))
  }
  const bins = typeof manifest.bin === 'string' ? { default: manifest.bin } : manifest.bin ?? {}
  for (const [name, target] of Object.entries(bins)) {
    targets.push(jsTargetUnderLib(target, `package.bin[${JSON.stringify(name)}]`))
  }
  return [...new Set(targets)].sort()
}

/** Ensure no public package command can bypass the controlled build/prune path. */
export function assertGuardedPackageScripts(manifest) {
  assert.equal(manifest.scripts?.build, 'node scripts/build-package.mjs')
  assert.equal(manifest.scripts?.bundle, 'pnpm run build')
  assert.equal(
    manifest.scripts?.['package:prepare'],
    'pnpm run build && pnpm run test:package:purity && node scripts/assert-package-output.mjs',
  )
  assert.equal(manifest.scripts?.prepack, 'pnpm run package:prepare')
  assert.equal(
    manifest.scripts?.prepublishOnly,
    'pnpm run package:prepare',
  )
}

/** Keep readiness dependencies limited to concrete web client modules. */
export function assertWebClientInjectRoster(manifest) {
  assert.equal(manifest.dsh?.client?.platform, 'web')
  assert.deepEqual(
    manifest.dsh?.client?.inject,
    [...EXPECTED_WEB_CLIENT_INJECT],
    'dsh.client.inject must exactly match the audited web client module roster',
  )
}

async function publishedFiles(root) {
  const files = []
  async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = resolve(directory, entry.name)
      if (entry.isDirectory()) await visit(path)
      else if (entry.isFile() && ['.js', '.map'].includes(extname(entry.name))) files.push(path)
    }
  }
  await visit(resolve(root))
  return files
}

/**
 * Fail when a published hashed chunk is not reachable from a stable JS entry.
 * Without a clean build and this gate, a retired implementation can remain in
 * source lib or a tarball even though no current public entry imports it.
 */
export async function assertPublishedChunkReachability(root, options = {}) {
  const libRoot = resolve(root)
  const manifest = options.manifest
    ?? JSON.parse(await readFile(resolve(libRoot, '..', 'package.json'), 'utf8'))
  const published = await publishedFiles(libRoot)
  const files = published.filter(path => extname(path) === '.js')
  const sourceMaps = published.filter(path => path.endsWith('.js.map'))
  const known = new Set(files)
  const knownMaps = new Set(sourceMaps)
  const relativePath = path => relative(libRoot, path).replaceAll('\\', '/')
  const knownByRelativePath = new Map(files.map(path => [relativePath(path), path]))
  const isHashedChunk = path => dirname(path) === libRoot && HASHED_CHUNK_NAME.test(basename(path))
  const publicEntries = publicJsEntriesFromManifest(manifest)
  const typeFiles = options.typeFiles ?? []
  const expectedStable = new Set([...publicEntries, ...typeFiles])
  const stable = files.filter(path => !isHashedChunk(path)).map(relativePath).sort()
  const missingExpected = [...expectedStable].filter(path => !knownByRelativePath.has(path)).sort()
  const unexpectedStable = stable.filter(path => !expectedStable.has(path))
  const roots = publicEntries.flatMap(path => {
    const entry = knownByRelativePath.get(path)
    return entry === undefined ? [] : [entry]
  })
  const reachable = new Set()
  const pending = [...roots]
  const missing = []
  const orphanedMaps = []

  for (const map of sourceMaps) {
    const owner = map.slice(0, -'.map'.length)
    if (!known.has(owner)) {
      orphanedMaps.push(`${relativePath(map)} (missing ${relativePath(owner)})`)
      continue
    }
    const ownerContents = await readFile(owner, 'utf8')
    const references = [...ownerContents.matchAll(SOURCE_MAP_REFERENCE)].map(match => match[1])
    if (!references.includes(basename(map))) {
      orphanedMaps.push(`${relativePath(map)} (not referenced by ${relativePath(owner)})`)
    }
  }

  for (const path of files) {
    const contents = await readFile(path, 'utf8')
    for (const match of contents.matchAll(RELATIVE_JS_REFERENCE)) {
      const target = resolve(dirname(path), match[1])
      if (!known.has(target)) missing.push(`${relativePath(path)} -> ${match[1]}`)
    }
    for (const match of contents.matchAll(SOURCE_MAP_REFERENCE)) {
      const target = resolve(dirname(path), match[1])
      if (!knownMaps.has(target)) missing.push(`${relativePath(path)} -> ${match[1]}`)
    }
  }

  while (pending.length > 0) {
    const path = pending.pop()
    if (path === undefined || reachable.has(path)) continue
    reachable.add(path)
    const contents = await readFile(path, 'utf8')
    for (const match of contents.matchAll(RELATIVE_JS_REFERENCE)) {
      const target = resolve(dirname(path), match[1])
      if (!known.has(target)) continue
      if (!reachable.has(target)) pending.push(target)
    }
  }

  const orphaned = files
    .filter(path => isHashedChunk(path) && !reachable.has(path))
    .map(path => basename(path))
    .sort()
  assert.deepEqual(missingExpected, [], `published JS is missing expected files:\n${missingExpected.join('\n')}`)
  assert.deepEqual(unexpectedStable, [], `published unexpected stable JS files:\n${unexpectedStable.join('\n')}`)
  assert.deepEqual(missing, [], `published JS has missing relative imports:\n${missing.join('\n')}`)
  assert.deepEqual(orphaned, [], `published orphan hashed chunks:\n${orphaned.join('\n')}`)
  assert.deepEqual(orphanedMaps, [], `published orphan source maps:\n${orphanedMaps.join('\n')}`)
  return {
    publicEntries: roots.length,
    stableFiles: stable.length,
    hashedChunks: files.filter(isHashedChunk).length,
    sourceMaps: sourceMaps.length,
  }
}

export async function assertPublishedPathPurity(root, options = {}) {
  const checkoutRoot = options.checkoutRoot === undefined ? undefined : normalizePath(options.checkoutRoot)
  const checkoutWindows = checkoutRoot?.replaceAll('/', '\\')
  const failures = []
  const files = await publishedFiles(root)

  for (const path of files) {
    const contents = await readFile(path, 'utf8')
    const reason = WINDOWS_ABSOLUTE_PATH.test(contents)
      ? 'Windows drive path'
      : WINDOWS_FILE_URL.test(contents)
        ? 'Windows file URL'
        : checkoutRoot !== undefined && (contents.includes(checkoutRoot) || contents.includes(checkoutWindows))
          ? 'checkout absolute path'
          : undefined
    if (reason !== undefined) failures.push(`${path}: ${reason}`)
  }

  assert.deepEqual(failures, [], `published path-purity violations:\n${failures.join('\n')}`)
  return { filesScanned: files.length }
}

const invokedPath = process.argv[1] === undefined ? undefined : pathToFileURL(resolve(process.argv[1])).href
if (invokedPath === import.meta.url) {
  const target = process.argv[2]
  assert.ok(target, 'Usage: node tests/package-purity.mjs <lib-directory>')
  const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
  const manifest = JSON.parse(await readFile(resolve(packageRoot, 'package.json'), 'utf8'))
  assertGuardedPackageScripts(manifest)
  assertWebClientInjectRoster(manifest)
  const result = await assertPublishedPathPurity(target, {
    checkoutRoot: resolve(packageRoot, '..', '..'),
  })
  const reachability = await assertPublishedChunkReachability(target, { manifest })
  console.log(JSON.stringify({ pathPurity: 'pass', ...result, reachability }, null, 2))
}
