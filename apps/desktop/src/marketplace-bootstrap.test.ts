import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import {
  ensureMarketplacePreinstalled,
  MARKETPLACE_PACKAGE,
  MARKETPLACE_SEED_MARKER,
  MARKETPLACE_SOURCE_COMMIT,
} from './marketplace-bootstrap.js'

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(value, undefined, 2)}\n`, 'utf8')
}

function fixture(): { root: string; profile: string; source: string; materialize: (enabled?: boolean) => void } {
  const root = mkdtempSync(join(tmpdir(), 'dsh-marketplace-bootstrap-'))
  const profile = join(root, 'profiles', 'web')
  const source = join(root, 'bundled-marketplace')
  mkdirSync(profile, { recursive: true })
  mkdirSync(join(source, 'lib'), { recursive: true })
  writeJson(join(profile, 'package.json'), {
    private: true,
    dependencies: {},
    dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app'] } },
  })
  writeJson(join(source, 'package.json'), {
    name: MARKETPLACE_PACKAGE,
    main: 'lib/index.js',
    dsh: { bundle: { patch: './cordis.patch.yml' }, client: { platform: 'web' } },
  })
  writeFileSync(join(source, 'cordis.patch.yml'), '[]\n')
  writeFileSync(join(source, 'lib', 'index.js'), '')
  writeFileSync(join(source, 'lib', 'client.js'), '')
  const materialize = (enabled = true): void => {
    const packageRoot = join(profile, 'node_modules', MARKETPLACE_PACKAGE)
    mkdirSync(join(packageRoot, 'lib'), { recursive: true })
    for (const file of ['package.json', 'cordis.patch.yml']) {
      writeFileSync(join(packageRoot, file), readFileSync(join(source, file)))
    }
    for (const file of ['index.js', 'client.js']) {
      writeFileSync(join(packageRoot, 'lib', file), readFileSync(join(source, 'lib', file)))
    }
    const manifest = JSON.parse(readFileSync(join(profile, 'package.json'), 'utf8'))
    manifest.dependencies[MARKETPLACE_PACKAGE] = `link:${source}`
    if (enabled && !manifest.dsh.profile.bundles.includes(MARKETPLACE_PACKAGE)) {
      manifest.dsh.profile.bundles.push(MARKETPLACE_PACKAGE)
    }
    writeJson(join(profile, 'package.json'), manifest)
  }
  return { root, profile, source, materialize }
}

test('fresh and upgraded profiles install the bundled marketplace once', () => {
  const item = fixture()
  try {
    const specs: string[] = []
    const result = ensureMarketplacePreinstalled({
      profileDir: item.profile,
      sourceDir: item.source,
      install: spec => {
        specs.push(spec)
        item.materialize()
        return 0
      },
    })
    assert.deepEqual(result, { status: 'installed', enabled: true })
    assert.deepEqual(specs, [`link:${item.source}`])
    const marker = JSON.parse(readFileSync(join(item.profile, MARKETPLACE_SEED_MARKER), 'utf8'))
    assert.equal(marker.sourceCommit, MARKETPLACE_SOURCE_COMMIT)

    const second = ensureMarketplacePreinstalled({
      profileDir: item.profile,
      sourceDir: item.source,
      install: () => { throw new Error('must not reinstall') },
    })
    assert.deepEqual(second, { status: 'already-seeded', enabled: true })
  } finally {
    rmSync(item.root, { recursive: true, force: true })
  }
})

test('an existing disabled marketplace is adopted without being re-enabled', () => {
  const item = fixture()
  try {
    item.materialize(false)
    const result = ensureMarketplacePreinstalled({
      profileDir: item.profile,
      sourceDir: item.source,
      install: () => { throw new Error('must not replace an existing dependency') },
    })
    assert.deepEqual(result, { status: 'adopted', enabled: false })
  } finally {
    rmSync(item.root, { recursive: true, force: true })
  }
})

test('the marker preserves an intentional uninstall', () => {
  const item = fixture()
  try {
    writeJson(join(item.profile, MARKETPLACE_SEED_MARKER), { schemaVersion: 1 })
    const result = ensureMarketplacePreinstalled({
      profileDir: item.profile,
      sourceDir: item.source,
      install: () => { throw new Error('must not reinstall after uninstall') },
    })
    assert.deepEqual(result, { status: 'already-seeded', enabled: false })
  } finally {
    rmSync(item.root, { recursive: true, force: true })
  }
})

test('a broken dependency is rebuilt even after seeding and keeps its enabled state', () => {
  const item = fixture()
  try {
    const manifest = JSON.parse(readFileSync(join(item.profile, 'package.json'), 'utf8'))
    manifest.dependencies[MARKETPLACE_PACKAGE] = 'link:missing-marketplace'
    writeJson(join(item.profile, 'package.json'), manifest)
    writeJson(join(item.profile, MARKETPLACE_SEED_MARKER), { schemaVersion: 1 })
    const specs: string[] = []
    const result = ensureMarketplacePreinstalled({
      profileDir: item.profile,
      sourceDir: item.source,
      install: (spec, enabled) => {
        specs.push(spec)
        assert.equal(enabled, false)
        item.materialize(enabled)
        return 0
      },
    })
    assert.deepEqual(result, { status: 'repaired', enabled: false })
    assert.deepEqual(specs, [`link:${item.source}`])
  } finally {
    rmSync(item.root, { recursive: true, force: true })
  }
})

test('failed or incomplete installs remain retryable and never write the marker', () => {
  const item = fixture()
  try {
    const failed = ensureMarketplacePreinstalled({
      profileDir: item.profile,
      sourceDir: item.source,
      install: () => 9,
    })
    assert.equal(failed.status, 'failed')
    assert.equal(failed.error, 'embedded dsh plugin install exited with code 9')

    const incomplete = ensureMarketplacePreinstalled({
      profileDir: item.profile,
      sourceDir: item.source,
      install: () => 0,
    })
    assert.equal(incomplete.status, 'failed')
    assert.match(incomplete.error ?? '', /did not produce a loadable bundle/)
    assert.equal(existsSync(join(item.profile, MARKETPLACE_SEED_MARKER)), false)
  } finally {
    rmSync(item.root, { recursive: true, force: true })
  }
})

test('a broken pre-existing dependency is repaired from the bundled package', () => {
  const item = fixture()
  try {
    const manifest = JSON.parse(readFileSync(join(item.profile, 'package.json'), 'utf8'))
    manifest.dependencies[MARKETPLACE_PACKAGE] = 'github:owner/repo'
    writeJson(join(item.profile, 'package.json'), manifest)
    const result = ensureMarketplacePreinstalled({
      profileDir: item.profile,
      sourceDir: item.source,
      install: (_spec, enabled) => {
        item.materialize(enabled)
        return 0
      },
    })
    assert.deepEqual(result, { status: 'repaired', enabled: false })
  } finally {
    rmSync(item.root, { recursive: true, force: true })
  }
})
