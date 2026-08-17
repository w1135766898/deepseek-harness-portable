import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, readlink, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getTargetSpec } from './targets.js'
import {
  electronExecutable,
  RuntimeHandshake,
  STALE_MANAGED_FALLBACK_PACKAGES,
  stageStaleManagedFallback,
} from './packaged-smoke.js'

test('packaged smoke resolves the native Electron executable for each layout', () => {
  assert.equal(
    electronExecutable('C:\\release\\runtime\\DeepSeek Harness.exe', getTargetSpec('win32-x64')),
    'C:\\release\\runtime\\DeepSeek Harness.exe',
  )
  assert.equal(
    electronExecutable('/release/runtime/DeepSeek Harness', getTargetSpec('linux-x64')),
    '/release/runtime/DeepSeek Harness',
  )
  assert.equal(
    electronExecutable('/release/DeepSeek Harness.app', getTargetSpec('darwin-arm64')),
    join('/release/DeepSeek Harness.app', 'Contents', 'MacOS', 'DeepSeek Harness'),
  )
})

test('packaged handshake requires matching hello before one listening event', () => {
  const handshake = new RuntimeHandshake()
  assert.equal(handshake.accept({ type: 'hello', pid: 42 }, 42), undefined)
  assert.equal(handshake.accept({ type: 'listening', url: 'http://127.0.0.1:1/' }, 42), 'http://127.0.0.1:1/')
  assert.throws(
    () => new RuntimeHandshake().accept({ type: 'listening', url: 'http://127.0.0.1:1/' }, 42),
    /before hello/,
  )
  assert.throws(() => new RuntimeHandshake().accept({ type: 'hello', pid: 41 }, 42), /does not match/)
  assert.throws(() => handshake.accept({ type: 'hello', pid: 42 }, 42), /duplicate hello/)
})

test('packaged smoke stages dangling managed UI fallbacks for the first process', async () => {
  const home = await mkdtemp(join(tmpdir(), 'dsh-stale-fallback-test-'))
  try {
    await stageStaleManagedFallback(home)
    for (const packageName of STALE_MANAGED_FALLBACK_PACKAGES) {
      assert.match(await readlink(join(home, 'profiles', 'node_modules', packageName)), /\.removed-previous-runtime/)
    }
  } finally {
    await rm(home, { recursive: true, force: true })
  }
})
