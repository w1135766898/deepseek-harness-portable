const assert = require('node:assert/strict')
const { mkdtempSync, rmSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join } = require('node:path')
const test = require('node:test')
const { compareVersions } = require('./update-client.cjs')
const {
  clearUpdateStatus,
  isSupersededByCurrentVersion,
  normalizeUpdateStatus,
  readUpdateStatus,
  reconcileUpdateStatus,
  statusNeedsNotice,
  updateStatusKey,
  writeUpdateStatus,
} = require('./update-status.cjs')

test('persists and reads a terminal update status in user data', () => {
  const userData = mkdtempSync(join(tmpdir(), 'dsh-update-status-'))
  try {
    const written = writeUpdateStatus(userData, {
      state: 'completed',
      fromVersion: '1.0.0',
      targetVersion: '1.0.1',
      stage: 'completed',
      message: 'Update complete',
      updatedAt: '2026-08-14T12:00:00.000Z',
      startedAt: '2026-08-14T11:58:00.000Z',
      processId: 1234,
    })
    assert.deepEqual(readUpdateStatus(userData), written)
    assert.equal(statusNeedsNotice(written, ''), true)
    assert.equal(statusNeedsNotice(written, updateStatusKey(written)), false)
  } finally {
    rmSync(userData, { recursive: true, force: true })
  }
})

test('accepts the legacy version field and rejects malformed status', () => {
  assert.equal(normalizeUpdateStatus(undefined), undefined)
  assert.equal(normalizeUpdateStatus({ message: 'missing state' }), undefined)
  assert.deepEqual(normalizeUpdateStatus({ state: 'failed', version: 1 }), {
    state: 'failed',
    fromVersion: '',
    targetVersion: '',
    stage: 'failed',
    message: '',
    updatedAt: '',
    startedAt: '',
    processId: 0,
    packagePath: '',
    stagingPath: '',
    sha256: '',
  })
})

test('clears an obsolete status after a direct replacement reaches its target', () => {
  const userData = mkdtempSync(join(tmpdir(), 'dsh-update-status-'))
  try {
    const written = writeUpdateStatus(userData, {
      state: 'interrupted',
      fromVersion: '1.0.3',
      targetVersion: '1.0.4',
      stage: 'interrupted',
      message: 'Portable updater is starting.',
    })
    assert.equal(isSupersededByCurrentVersion(written, '1.0.5', compareVersions), true)
    assert.equal(isSupersededByCurrentVersion({ ...written, state: 'completed' }, '1.0.5', compareVersions), false)
    assert.equal(isSupersededByCurrentVersion({ ...written, state: 'rolled-back' }, '1.0.5', compareVersions), false)
    assert.equal(clearUpdateStatus(userData), true)
    assert.equal(readUpdateStatus(userData), undefined)
  } finally {
    rmSync(userData, { recursive: true, force: true })
  }
})

test('reconciles an active status when its updater process has stopped', () => {
  const active = normalizeUpdateStatus({
    state: 'downloading',
    fromVersion: '1.0.0',
    targetVersion: '1.0.1',
    stage: 'download',
    updatedAt: '2026-08-14T12:00:00.000Z',
    processId: 4321,
  })
  const reconciled = reconcileUpdateStatus(active, {
    now: Date.parse('2026-08-14T12:00:05.000Z'),
    processIsAlive: () => false,
  })
  assert.equal(reconciled.state, 'interrupted')
  assert.equal(reconciled.stage, 'interrupted')
  assert.match(reconciled.message, /download/)
})

test('reconciles a launch status without a process after its grace period', () => {
  const active = normalizeUpdateStatus({
    state: 'starting',
    targetVersion: '1.0.5',
    stage: 'launch',
    message: 'Portable updater is starting.',
    updatedAt: '2026-08-14T12:00:00.000Z',
    processId: 0,
  })
  const reconciled = reconcileUpdateStatus(active, {
    now: Date.parse('2026-08-14T12:00:31.000Z'),
  })
  assert.equal(reconciled.state, 'interrupted')
  assert.equal(reconciled.stage, 'interrupted')
  assert.equal(reconciled.message, 'The updater stopped before it could start. The current installation was kept.')
})

test('keeps a recent active status while its updater process is alive', () => {
  const active = normalizeUpdateStatus({
    state: 'replacing',
    updatedAt: '2026-08-14T12:00:00.000Z',
    processId: 4321,
  })
  assert.deepEqual(reconcileUpdateStatus(active, {
    now: Date.parse('2026-08-14T12:00:05.000Z'),
    processIsAlive: () => true,
  }), active)
})

test('treats a prepared package as active until the app restarts', () => {
  const active = normalizeUpdateStatus({
    state: 'ready',
    targetVersion: '1.0.1',
    stage: 'ready',
    updatedAt: '2026-08-14T12:00:00.000Z',
    processId: 4321,
  })
  assert.deepEqual(reconcileUpdateStatus(active, {
    now: Date.parse('2026-08-14T12:00:05.000Z'),
    processIsAlive: () => true,
  }), active)
})

test('normalizes and preserves packagePath, stagingPath and sha256 across read and write', () => {
  const userData = mkdtempSync(join(tmpdir(), 'dsh-update-status-'))
  try {
    const written = writeUpdateStatus(userData, {
      state: 'ready',
      fromVersion: '1.0.0',
      targetVersion: '1.0.1',
      stage: 'ready',
      message: 'Verified and waiting',
      packagePath: 'C:\\temp\\DeepSeek-Harness-1.0.1.zip',
      stagingPath: 'C:\\temp\\staging-1.0.1',
      sha256: 'deadbeef1234',
      processId: 5678,
    })
    const read = readUpdateStatus(userData)
    assert.equal(read.packagePath, 'C:\\temp\\DeepSeek-Harness-1.0.1.zip')
    assert.equal(read.stagingPath, 'C:\\temp\\staging-1.0.1')
    assert.equal(read.sha256, 'deadbeef1234')
    assert.deepEqual(read, written)
  } finally {
    rmSync(userData, { recursive: true, force: true })
  }
})

