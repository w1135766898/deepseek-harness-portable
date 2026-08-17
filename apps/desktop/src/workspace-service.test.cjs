const assert = require('node:assert/strict')
const { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } = require('node:fs')
const { join } = require('node:path')
const { tmpdir } = require('node:os')
const test = require('node:test')
const {
  MIGRATION_MARKER,
  resolveTargetDshHome,
  migrateLegacySessions,
  ensureUnifiedDshHome,
} = require('./workspace-service.cjs')

test('resolveTargetDshHome respects DSH_HOME and falls back to userHome/.dsh', () => {
  const customHome = process.platform === 'win32' ? 'C:\\custom\\dsh' : '/tmp/custom/dsh'
  const userHome = process.platform === 'win32' ? 'C:\\Users\\test' : '/tmp/test-user'
  const custom = resolveTargetDshHome({ DSH_HOME: customHome }, userHome)
  assert.equal(custom.toLowerCase(), customHome.toLowerCase())

  const fallback = resolveTargetDshHome({}, userHome)
  const expected = process.platform === 'win32' ? 'c:\\users\\test\\.dsh' : '/tmp/test-user/.dsh'
  assert.equal(fallback.toLowerCase(), expected)
})

test('migrateLegacySessions migrates when target sessions directory does not exist', () => {
  const root = mkdtempSync(join(tmpdir(), 'dsh-test-mig-'))
  try {
    const userData = join(root, 'userData')
    const legacySessions = join(userData, 'dsh', 'sessions')
    mkdirSync(legacySessions, { recursive: true })
    writeFileSync(join(legacySessions, 'session-1.json'), '{"id":1}', 'utf8')

    const targetHome = join(root, 'targetHome')
    const result = migrateLegacySessions({ targetHome, legacyUserDataPath: userData })
    assert.equal(result, true)

    assert.equal(existsSync(join(targetHome, 'sessions', 'session-1.json')), true)
    assert.equal(readFileSync(join(targetHome, 'sessions', 'session-1.json'), 'utf8'), '{"id":1}')
    assert.equal(existsSync(join(targetHome, MIGRATION_MARKER)), true)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('migrateLegacySessions merges non-conflicting files when target sessions exists', () => {
  const root = mkdtempSync(join(tmpdir(), 'dsh-test-mig-'))
  try {
    const userData = join(root, 'userData')
    const legacySessions = join(userData, 'dsh', 'sessions')
    mkdirSync(legacySessions, { recursive: true })
    writeFileSync(join(legacySessions, 'legacy-only.json'), '{"legacy":true}', 'utf8')
    writeFileSync(join(legacySessions, 'conflict.json'), '{"version":"legacy"}', 'utf8')

    const targetHome = join(root, 'targetHome')
    const targetSessions = join(targetHome, 'sessions')
    mkdirSync(targetSessions, { recursive: true })
    writeFileSync(join(targetSessions, 'conflict.json'), '{"version":"target"}', 'utf8')

    const logs = []
    const result = migrateLegacySessions({
      targetHome,
      legacyUserDataPath: userData,
      logger: { info: message => logs.push(message) },
    })
    assert.equal(result, true)

    // Legacy file copied
    assert.equal(existsSync(join(targetSessions, 'legacy-only.json')), true)
    // Conflict preserved target version
    assert.equal(readFileSync(join(targetSessions, 'conflict.json'), 'utf8'), '{"version":"target"}')
    assert.equal(logs.length, 1)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('migrateLegacySessions is idempotent and respects marker file', () => {
  const root = mkdtempSync(join(tmpdir(), 'dsh-test-mig-'))
  try {
    const userData = join(root, 'userData')
    const legacySessions = join(userData, 'dsh', 'sessions')
    mkdirSync(legacySessions, { recursive: true })
    writeFileSync(join(legacySessions, 'session-1.json'), '{"id":1}', 'utf8')

    const targetHome = join(root, 'targetHome')
    // First run
    assert.equal(migrateLegacySessions({ targetHome, legacyUserDataPath: userData }), true)

    // Second run should return false (already migrated)
    assert.equal(migrateLegacySessions({ targetHome, legacyUserDataPath: userData }), false)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('migrateLegacySessions does not seal migration before the legacy source exists', () => {
  const root = mkdtempSync(join(tmpdir(), 'dsh-test-mig-'))
  try {
    const userData = join(root, 'userData')
    const targetHome = join(root, 'targetHome')
    assert.equal(migrateLegacySessions({ targetHome, legacyUserDataPath: userData }), false)
    assert.equal(existsSync(join(targetHome, MIGRATION_MARKER)), false)

    const legacySessions = join(userData, 'dsh', 'sessions')
    mkdirSync(legacySessions, { recursive: true })
    writeFileSync(join(legacySessions, 'session-late.json'), '{"late":true}', 'utf8')
    assert.equal(migrateLegacySessions({ targetHome, legacyUserDataPath: userData }), true)
    assert.equal(existsSync(join(targetHome, 'sessions', 'session-late.json')), true)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('ensureUnifiedDshHome orchestrates creation and migration in correct order', () => {
  const root = mkdtempSync(join(tmpdir(), 'dsh-test-mig-'))
  try {
    const userData = join(root, 'userData')
    const legacySessions = join(userData, 'dsh', 'sessions')
    mkdirSync(legacySessions, { recursive: true })
    writeFileSync(join(legacySessions, 'session-abc.json'), '{"name":"abc"}', 'utf8')

    const targetHome = join(root, 'targetHome')
    const resolved = ensureUnifiedDshHome({
      env: { DSH_HOME: targetHome },
      userDataPath: userData,
    })

    assert.equal(resolved.toLowerCase(), targetHome.toLowerCase())
    assert.equal(existsSync(join(targetHome, 'sessions', 'session-abc.json')), true)
    assert.equal(existsSync(join(targetHome, MIGRATION_MARKER)), true)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
