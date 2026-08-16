import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import {
  cacheLayerMatches,
  completeCacheLayer,
  fingerprintPaths,
  preserveFiles,
  readPackagingCache,
  writePackagingCache,
  type PackagingCacheState,
} from './packaging-cache.ts'

async function fixture(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'dsh-packaging-cache-'))
}

test('fingerprintPaths is stable and changes with included content', async (context) => {
  const root = await fixture()
  context.after(() => rm(root, { recursive: true, force: true }))
  await mkdir(join(root, 'src'), { recursive: true })
  await writeFile(join(root, 'src', 'b.ts'), 'export const b = 2\n')
  await writeFile(join(root, 'src', 'a.ts'), 'export const a = 1\n')

  const first = await fingerprintPaths({ baseDir: root, paths: ['src'], salt: ['node24'] })
  const reordered = await fingerprintPaths({ baseDir: root, paths: ['src/a.ts', 'src/b.ts'], salt: ['node24'] })
  assert.equal(first, reordered)
  assert.notEqual(await fingerprintPaths({ baseDir: root, paths: ['src'], salt: ['node26'] }), first)

  await writeFile(join(root, 'src', 'a.ts'), 'export const a = 3\n')
  const changed = await fingerprintPaths({ baseDir: root, paths: ['src'], salt: ['node24'] })
  assert.notEqual(changed, first)
})

test('fingerprintPaths ignores generated directories explicitly', async (context) => {
  const root = await fixture()
  context.after(() => rm(root, { recursive: true, force: true }))
  await mkdir(join(root, 'package', 'lib'), { recursive: true })
  await writeFile(join(root, 'package', 'source.ts'), 'source\n')
  await writeFile(join(root, 'package', 'lib', 'output.js'), 'first output\n')
  const options = {
    baseDir: root,
    paths: ['package'],
    excludedDirectoryNames: new Set(['lib']),
  }
  const before = await fingerprintPaths(options)
  await writeFile(join(root, 'package', 'lib', 'output.js'), 'second output\n')
  assert.equal(await fingerprintPaths(options), before)
})

test('cache state is atomic, layered, and validates required artifacts', async (context) => {
  const root = await fixture()
  context.after(() => rm(root, { recursive: true, force: true }))
  const cachePath = join(root, 'cache', 'state.json')
  const artifact = join(root, 'artifact.exe')
  const cold: PackagingCacheState = { version: 1 }

  const built = completeCacheLayer(cold, 'build', 'build-key')
  const staged = completeCacheLayer(built, 'staging', 'staging-key')
  const packaged = completeCacheLayer(staged, 'electron', 'electron-key')
  await writePackagingCache(cachePath, packaged)
  assert.deepEqual(await readPackagingCache(cachePath), packaged)
  assert.equal(cacheLayerMatches(packaged.electron, 'electron-key', [artifact]), false)

  await writeFile(artifact, 'binary')
  assert.equal(cacheLayerMatches(packaged.electron, 'electron-key', [artifact]), true)
  assert.equal(cacheLayerMatches(packaged.electron, 'different-key', [artifact]), false)

  const rebuilt = completeCacheLayer(packaged, 'build', 'new-build-key')
  assert.equal(rebuilt.staging, undefined)
  assert.equal(rebuilt.electron, undefined)
})

test('malformed and obsolete cache files fall back to a cold cache', async (context) => {
  const root = await fixture()
  context.after(() => rm(root, { recursive: true, force: true }))
  const cachePath = join(root, 'state.json')
  await writeFile(cachePath, '{broken')
  assert.deepEqual(await readPackagingCache(cachePath), { version: 1 })
  await writeFile(cachePath, '{"version":0}')
  assert.deepEqual(await readPackagingCache(cachePath), { version: 1 })
})

test('preserveFiles restores existing and absent metadata after failure', async (context) => {
  const root = await fixture()
  context.after(() => rm(root, { recursive: true, force: true }))
  const existing = join(root, 'existing.json')
  const absent = join(root, 'absent.json')
  await writeFile(existing, '{"devDependencies":true}\n')

  await assert.rejects(preserveFiles([existing, absent], async () => {
    await writeFile(existing, '{"devDependencies":false}\n')
    await writeFile(absent, '{}\n')
    throw new Error('deploy failed')
  }), /deploy failed/)

  assert.equal(await readFile(existing, 'utf8'), '{"devDependencies":true}\n')
  assert.equal(existsSync(absent), false)
})
