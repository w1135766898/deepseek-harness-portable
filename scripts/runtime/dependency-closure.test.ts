import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  collectPackageReferences,
  generatedDependencyMap,
  resolveWorkspaceDependencyClosure,
  type WorkspacePackage,
} from './dependency-closure.js'

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
