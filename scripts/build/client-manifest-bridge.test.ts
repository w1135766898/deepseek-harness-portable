import assert from 'node:assert/strict'
import { test } from 'node:test'
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import {
  BRIDGE_GROUP,
  bridgeDirectory,
  discoverBridgedPackages,
  usesKernelClientPreset,
  writeManifestBridge,
} from './client-manifest-bridge.js'

const root = resolve(import.meta.dirname, '..', '..')

test('only packages delegating to the kernel preset are bridged', () => {
  assert.equal(
    usesKernelClientPreset("import { clientBundle } from '../../vendor/deepseek-harness/packages/client/tsdown.client.ts'"),
    true,
  )
  assert.equal(usesKernelClientPreset("import { defineConfig } from 'tsdown'"), false)
})

test('every out-of-tree client plugin in this repository is discovered', () => {
  const names = discoverBridgedPackages(root).map(item => item.name)
  assert.deepEqual(names, ['@dsh-portable/interactive-learning', '@dsh-portable/vision-bridge'])
})

test('the bridge lands where the kernel preset scans and mirrors the resolved contract fields', () => {
  const packages = writeManifestBridge(root)
  const directory = bridgeDirectory(root)
  assert.ok(directory.endsWith(join('vendor', 'deepseek-harness', 'packages', BRIDGE_GROUP)))
  for (const bridged of packages) {
    const source = JSON.parse(readFileSync(join(bridged.source, 'package.json'), 'utf8')) as Record<string, unknown>
    const slug = bridged.name.replace(/^@/, '').replaceAll('/', '__')
    const mirrored = JSON.parse(readFileSync(join(directory, slug, 'package.json'), 'utf8')) as Record<string, unknown>
    assert.equal(mirrored.name, source.name, 'the preset matches a package by name')
    assert.deepEqual(mirrored.dependencies, source.dependencies, 'node-half externals come from the dependency sections')
    assert.deepEqual(mirrored.dsh, source.dsh, 'client externals come from the dsh.client declaration')
  }
})

test('the mirrored group ignores itself so the pinned kernel checkout stays clean', () => {
  writeManifestBridge(root)
  const ignore = join(bridgeDirectory(root), '.gitignore')
  assert.ok(existsSync(ignore))
  assert.ok(readFileSync(ignore, 'utf8').split(/\r?\n/).includes('*'))
})
