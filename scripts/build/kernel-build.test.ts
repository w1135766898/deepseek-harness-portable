import assert from 'node:assert/strict'
import { test } from 'node:test'
import { resolve } from 'node:path'
import { kernelBuildArguments, kernelBuildEnvironment, resolvePackageManagerEntry } from './kernel-build.js'

const root = resolve(import.meta.dirname, '..', '..')

test('the kernel build resolves a JavaScript package-manager entry Node can load', () => {
  const entry = resolvePackageManagerEntry(root)
  assert.ok(entry.endsWith('.cjs'), 'a native launcher cannot be spawned as node <npm_execpath>')
  assert.ok(entry.includes(resolve(root, 'apps', 'runtime')), 'the entry must come from the pinned runtime workspace')
})

test('a missing package-manager entry fails loud instead of falling back to a native launcher', () => {
  assert.throws(
    () => resolvePackageManagerEntry(resolve(root, 'scripts', 'build', 'no-such-root')),
    /pnpm JavaScript entry/,
  )
})

test('the kernel build targets the vendored kernel package', () => {
  assert.deepEqual(
    kernelBuildArguments('/entry/pnpm.cjs'),
    ['/entry/pnpm.cjs', '--filter', '@deepseek-ai/dsh-root', 'run', 'build'],
  )
})

test('the kernel client build uses the official DeepSeek brand profile', () => {
  assert.deepEqual(kernelBuildEnvironment({ KEEP: 'yes', DSH_BUILD_CLIENT_PROFILE: 'local' }), {
    KEEP: 'yes',
    DSH_BUILD_CLIENT_PROFILE: 'official',
  })
})
