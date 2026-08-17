import assert from 'node:assert/strict'
import { test } from 'node:test'
import { join } from 'node:path'
import { resolveSourceIdentity } from './source-identity.js'

const PORTABLE = '1111111111111111111111111111111111111111'
const UPSTREAM = '2222222222222222222222222222222222222222'

test('GITHUB_SHA identifies the portable repository, never the upstream kernel', () => {
  const calls: string[] = []
  const identity = resolveSourceIdentity('C:\\repo', {
    env: { GITHUB_SHA: PORTABLE },
    gitRevParse: cwd => {
      calls.push(cwd)
      return cwd === join('C:\\repo', 'vendor', 'deepseek-harness') ? UPSTREAM : undefined
    },
  })
  assert.deepEqual(identity, { portableCommit: PORTABLE, upstreamCommit: UPSTREAM })
  assert.deepEqual(calls, [join('C:\\repo', 'vendor', 'deepseek-harness')])
})

test('explicit upstream identity wins over the submodule checkout and legacy override remains supported', () => {
  assert.deepEqual(resolveSourceIdentity('/repo', {
    env: { GITHUB_SHA: PORTABLE, UPSTREAM_GIT_COMMIT: UPSTREAM, KERNEL_GIT_COMMIT: '3333333' },
    gitRevParse: () => { throw new Error('must not be called') },
  }), { portableCommit: PORTABLE, upstreamCommit: UPSTREAM })
})

test('source archives report unknown independently for each missing repository', () => {
  assert.deepEqual(resolveSourceIdentity('/repo', {
    env: {},
    gitRevParse: () => undefined,
  }), { portableCommit: 'unknown', upstreamCommit: 'unknown' })
})
