const assert = require('node:assert/strict')
const { mkdtempSync, writeFileSync, readFileSync, existsSync, readdirSync, rmSync } = require('node:fs')
const { join } = require('node:path')
const { tmpdir } = require('node:os')
const test = require('node:test')
const {
  CURRENT_SCHEMA_VERSION,
  DEFAULT_CONFIG,
  migrateConfig,
  writeAtomic,
  readConfigStore,
  updateConfigStore,
} = require('./config-store.cjs')

test('migrateConfig upgrades v0 to v1 schema with defaults', () => {
  const v0 = { workspace: 'C:\\test', zoomFactor: 1.2 }
  const migrated = migrateConfig(v0)
  assert.equal(migrated.schemaVersion, 1)
  assert.equal(migrated.workspace, 'C:\\test')
  assert.equal(migrated.zoomFactor, 1.2)
  assert.deepEqual(migrated.recentWorkspaces, [])
  assert.deepEqual(migrated.windowBounds, {})
})

test('readConfigStore returns defaults when no file exists', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-cfg-'))
  try {
    const configPath = join(dir, 'config.json')
    const config = readConfigStore(configPath)
    assert.equal(config.schemaVersion, CURRENT_SCHEMA_VERSION)
    assert.deepEqual(config.recentWorkspaces, [])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('readConfigStore persists a v0-to-v1 schema upgrade', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-cfg-'))
  try {
    const configPath = join(dir, 'config.json')
    writeFileSync(configPath, JSON.stringify({ workspace: 'C:\\legacy' }), 'utf8')
    const config = readConfigStore(configPath)
    assert.equal(config.schemaVersion, CURRENT_SCHEMA_VERSION)
    assert.equal(JSON.parse(readFileSync(configPath, 'utf8')).schemaVersion, CURRENT_SCHEMA_VERSION)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('updateConfigStore atomically writes configuration and creates backup', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-cfg-'))
  try {
    const configPath = join(dir, 'config.json')
    updateConfigStore(configPath, { workspace: 'C:\\workspace-1', zoomFactor: 1.1 })

    const read1 = readConfigStore(configPath)
    assert.equal(read1.workspace, 'C:\\workspace-1')
    assert.equal(read1.zoomFactor, 1.1)
    assert.equal(read1.schemaVersion, 1)

    // Second update should create .bak containing first update
    updateConfigStore(configPath, { workspace: 'C:\\workspace-2' })
    const read2 = readConfigStore(configPath)
    assert.equal(read2.workspace, 'C:\\workspace-2')
    assert.equal(read2.zoomFactor, 1.1)

    assert.equal(existsSync(`${configPath}.bak`), true)
    const bakContent = JSON.parse(readFileSync(`${configPath}.bak`, 'utf8'))
    assert.equal(bakContent.workspace, 'C:\\workspace-1')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('readConfigStore recovers from .bak and preserves corrupt file when config.json is invalid JSON', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-cfg-'))
  try {
    const configPath = join(dir, 'config.json')
    const bakPath = `${configPath}.bak`

    // Write a valid backup
    writeFileSync(bakPath, JSON.stringify({ schemaVersion: 1, workspace: 'C:\\saved-good' }), 'utf8')
    // Write corrupted main file
    writeFileSync(configPath, '{ invalid json corrupted truncation...', 'utf8')

    const config = readConfigStore(configPath, { logger: { warn: () => {}, info: () => {} } })
    assert.equal(config.workspace, 'C:\\saved-good')

    // Verify corrupt file was preserved
    const files = readdirSync(dir)
    const corruptFile = files.find(f => f.startsWith('config.json.corrupt-'))
    assert.ok(corruptFile, 'Corrupted config file should be preserved')
    assert.equal(readFileSync(join(dir, corruptFile), 'utf8'), '{ invalid json corrupted truncation...')
    const restoredBackup = JSON.parse(readFileSync(bakPath, 'utf8'))
    assert.equal(restoredBackup.workspace, 'C:\\saved-good', 'Known-good backup must remain intact after recovery')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
