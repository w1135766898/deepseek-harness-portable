import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import {
  collectPackageReferences,
  generatedDependencyMap,
  resolveWorkspaceDependencyClosure,
  type WorkspacePackage,
} from './dependency-closure.js'
import {
  auditRuntimeWorkspaceLinks,
  preserveWorkspaceNodeModules,
  repairRuntimeWorkspaceLinks,
} from './workspace-links.js'

test('runtime closure follows workspace dependencies, peers, and optional providers', () => {
  const manifests = new Map<string, WorkspacePackage>([
    ['@deepseek-ai/root', {
      name: '@deepseek-ai/root', version: '1.0.0', path: 'root',
      dependencies: { '@deepseek-ai/child': 'workspace:^', external: '^1' },
      peerDependencies: { '@deepseek-ai/peer': 'workspace:^' },
    }],
    ['@deepseek-ai/child', {
      name: '@deepseek-ai/child', version: '1.0.0', path: 'child',
      optionalDependencies: { '@deepseek-ai/native': 'workspace:^' },
    }],
    ['@deepseek-ai/peer', { name: '@deepseek-ai/peer', version: '1.0.0', path: 'peer' }],
    ['@deepseek-ai/native', { name: '@deepseek-ai/native', version: '1.0.0', path: 'native' }],
  ])
  assert.deepEqual(
    resolveWorkspaceDependencyClosure(manifests, ['@deepseek-ai/root']).map(pkg => pkg.name),
    ['@deepseek-ai/child', '@deepseek-ai/native', '@deepseek-ai/peer', '@deepseek-ai/root'],
  )
})

test('config references and generated dependency maps are stable and deduplicated', () => {
  assert.deepEqual(collectPackageReferences([
    "name: '@deepseek-ai/tool-a'",
    "again: '@deepseek-ai/tool-a'\nname: '@dsh-portable/bridge'",
  ]), ['@deepseek-ai/tool-a', '@dsh-portable/bridge'])
  assert.deepEqual(generatedDependencyMap([
    { name: '@deepseek-ai/tool-a', version: '1', path: 'a' },
  ], { 'js-yaml': '^4.2.0' }), {
    '@deepseek-ai/tool-a': 'workspace:^',
    'js-yaml': '^4.2.0',
  })
})

test('unknown workspace roots fail closed', () => {
  assert.throws(
    () => resolveWorkspaceDependencyClosure(new Map(), ['@deepseek-ai/missing']),
    /not a workspace package/,
  )
})

test('runtime workspace link repair replaces deploy copies and stale ignored entries', async (context) => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-runtime-links-'))
  context.after(() => rm(root, { recursive: true, force: true }))
  const runtimeRoot = join(root, 'apps', 'runtime')
  const source = join(root, 'packages', 'example')
  const destination = join(runtimeRoot, 'node_modules', '@example', 'package')
  const ignored = join(runtimeRoot, 'node_modules', '@example', '.ignored_package')
  await Promise.all([
    mkdir(source, { recursive: true }),
    mkdir(destination, { recursive: true }),
    mkdir(ignored, { recursive: true }),
  ])
  await writeFile(join(source, 'value.txt'), 'workspace')
  await writeFile(join(destination, 'value.txt'), 'stale deploy copy')
  const packages = [{ name: '@example/package', path: 'packages/example' }]

  assert.deepEqual(await auditRuntimeWorkspaceLinks(root, runtimeRoot, packages), [
    '@example/package: runtime dependency is a stale materialized copy',
    '@example/package: stale pnpm .ignored entry exists',
  ])
  assert.deepEqual(await repairRuntimeWorkspaceLinks(root, runtimeRoot, packages), ['@example/package'])
  assert.equal(await realpath(destination), await realpath(source))
  assert.equal(await readFile(join(destination, 'value.txt'), 'utf8'), 'workspace')
  assert.equal(existsSync(ignored), false)
  assert.deepEqual(await auditRuntimeWorkspaceLinks(root, runtimeRoot, packages), [])
})

test('workspace node_modules survive a failing legacy deploy action exactly', async (context) => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-workspace-install-'))
  context.after(() => rm(root, { recursive: true, force: true }))
  const existing = join(root, 'packages', 'existing', 'node_modules')
  const initiallyAbsent = join(root, 'packages', 'absent', 'node_modules')
  await mkdir(existing, { recursive: true })
  await mkdir(join(root, 'packages', 'absent'), { recursive: true })
  await writeFile(join(existing, 'marker.txt'), 'original install')
  const packages = [
    { name: '@example/existing', path: 'packages/existing' },
    { name: '@example/absent', path: 'packages/absent' },
  ]

  await assert.rejects(preserveWorkspaceNodeModules(root, packages, async () => {
    assert.equal(existsSync(existing), false)
    await mkdir(existing, { recursive: true })
    await mkdir(initiallyAbsent, { recursive: true })
    await writeFile(join(existing, 'marker.txt'), 'deploy mutation')
    throw new Error('legacy deploy failed')
  }), /legacy deploy failed/)

  assert.equal(await readFile(join(existing, 'marker.txt'), 'utf8'), 'original install')
  assert.equal(existsSync(initiallyAbsent), false)
})
