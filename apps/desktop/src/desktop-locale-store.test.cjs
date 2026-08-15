const { mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join } = require('node:path')
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { readLocalePreference } = require('./desktop-locale-store.cjs')

function withTempSettings(content, callback) {
  const directory = mkdtempSync(join(tmpdir(), 'dsh-locale-test-'))
  const settingsPath = join(directory, 'settings.yaml')
  try {
    writeFileSync(settingsPath, content, 'utf8')
    return callback(settingsPath, directory)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
}

test('reads locale.preference from the Host settings YAML', () => {
  withTempSettings('locale:\n  preference: zh\n', settingsPath => {
    assert.deepEqual(readLocalePreference(settingsPath), { preference: 'zh', invalidPreference: false })
  })
})

test('treats an unset preference and a missing settings file as fallback cases', () => {
  withTempSettings('locale:\n  other: true\n', (settingsPath, directory) => {
    assert.deepEqual(readLocalePreference(settingsPath), { preference: undefined, invalidPreference: false })
    const missingPath = join(directory, 'missing.yaml')
    assert.deepEqual(readLocalePreference(missingPath), { preference: undefined, missing: true })
  })
})

test('reports unsupported preferences and malformed YAML without throwing', () => {
  withTempSettings('locale:\n  preference: fr\n', settingsPath => {
    assert.deepEqual(readLocalePreference(settingsPath), { preference: 'fr', invalidPreference: true })
  })
  withTempSettings('locale: [\n', settingsPath => {
    const result = readLocalePreference(settingsPath)
    assert.equal(result.preference, undefined)
    assert.equal(result.error instanceof Error, true)
  })
})

test('supports atomic replacement of the settings file', () => {
  withTempSettings('locale:\n  preference: en\n', (settingsPath, directory) => {
    const temporaryPath = join(directory, 'settings.yaml.tmp')
    writeFileSync(temporaryPath, 'locale:\n  preference: zh\n', 'utf8')
    renameSync(temporaryPath, settingsPath)
    assert.equal(readFileSync(settingsPath, 'utf8').includes('preference: zh'), true)
    assert.equal(readLocalePreference(settingsPath).preference, 'zh')
  })
})
