import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import test from 'node:test'
import {
  ensureMarketplacePreinstalled,
  materializeMarketplaceSeed,
  MARKETPLACE_PACKAGE,
  MARKETPLACE_RECOVERY_MARKER,
  MARKETPLACE_SEED_MARKER,
  MARKETPLACE_SOURCE_COMMIT,
} from './marketplace-bootstrap.js'

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(value, undefined, 2)}\n`, 'utf8')
}

function fileSpec(path: string): string {
  return `file:${path.replace(/\\/g, '/')}`
}

const installationRequire = createRequire(import.meta.url)
const pnpmCli = join(dirname(installationRequire.resolve('pnpm')), 'bin', 'pnpm.cjs')

function fixture(): {
  root: string
  profile: string
  source: string
  materialize: (enabled?: boolean, sourceSpec?: string) => void
} {
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
  const materialize = (enabled = true, sourceSpec = fileSpec(source)): void => {
    const packageSource = sourceSpec.replace(/^(?:file|link):/i, '')
    const packageRoot = join(profile, 'node_modules', MARKETPLACE_PACKAGE)
    mkdirSync(join(packageRoot, 'lib'), { recursive: true })
    for (const file of ['package.json', 'cordis.patch.yml']) {
      writeFileSync(join(packageRoot, file), readFileSync(join(packageSource, file)))
    }
    for (const file of ['index.js', 'client.js']) {
      writeFileSync(join(packageRoot, 'lib', file), readFileSync(join(packageSource, 'lib', file)))
    }
    const manifest = JSON.parse(readFileSync(join(profile, 'package.json'), 'utf8'))
    manifest.dependencies[MARKETPLACE_PACKAGE] = sourceSpec
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
        item.materialize(true, spec)
        return 0
      },
    })
    assert.deepEqual(result, { status: 'installed', enabled: true })
    assert.deepEqual(specs, [fileSpec(item.source)])
    const marker = JSON.parse(readFileSync(join(item.profile, MARKETPLACE_SEED_MARKER), 'utf8'))
    assert.equal(marker.sourceCommit, MARKETPLACE_SOURCE_COMMIT)

    const second = ensureMarketplacePreinstalled({
      profileDir: item.profile,
      sourceDir: item.source,
      install: () => { throw new Error('must not reinstall') },
    })
    assert.deepEqual(second, { status: 'already-seeded', enabled: true })

    writeFileSync(join(item.source, 'lib', 'index.js'), 'bundled-v0.3.1\n')
    const upgraded = ensureMarketplacePreinstalled({
      profileDir: item.profile,
      sourceDir: item.source,
      install: () => { throw new Error('managed upgrades must not invoke pnpm') },
    })
    assert.deepEqual(upgraded, { status: 'repaired', enabled: true })
    assert.equal(
      readFileSync(join(item.profile, 'node_modules', MARKETPLACE_PACKAGE, 'lib', 'index.js'), 'utf8'),
      'bundled-v0.3.1\n',
    )
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
    manifest.dependencies[MARKETPLACE_PACKAGE] = 'link:C:/old/runtime/resources/app/node_modules/dsh-plugin-marketplace'
    writeJson(join(item.profile, 'package.json'), manifest)
    writeJson(join(item.profile, MARKETPLACE_SEED_MARKER), { schemaVersion: 1 })
    const result = ensureMarketplacePreinstalled({
      profileDir: item.profile,
      sourceDir: item.source,
      install: () => { throw new Error('managed recovery must not traverse the full profile dependency graph') },
    })
    assert.deepEqual(result, { status: 'repaired', enabled: false })
    assert.equal(existsSync(join(item.profile, 'node_modules', MARKETPLACE_PACKAGE, 'package.json')), true)
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
    assert.equal(failed.diagnostic?.code, 'MARKETPLACE_INSTALL_FAILED')

    const incomplete = ensureMarketplacePreinstalled({
      profileDir: item.profile,
      sourceDir: item.source,
      install: () => 0,
    })
    assert.equal(incomplete.status, 'failed')
    assert.match(incomplete.error ?? '', /did not produce a loadable bundle/)
    assert.equal(incomplete.diagnostic?.code, 'MARKETPLACE_INSTALL_FAILED')
    assert.equal(existsSync(join(item.profile, MARKETPLACE_SEED_MARKER)), false)
  } finally {
    rmSync(item.root, { recursive: true, force: true })
  }
})

test('a broken user-selected marketplace version is quarantined instead of silently replaced', () => {
  const item = fixture()
  try {
    const manifest = JSON.parse(readFileSync(join(item.profile, 'package.json'), 'utf8'))
    manifest.dependencies[MARKETPLACE_PACKAGE] = 'github:owner/repo'
    writeJson(join(item.profile, 'package.json'), manifest)
    const result = ensureMarketplacePreinstalled({
      profileDir: item.profile,
      sourceDir: item.source,
      install: () => { throw new Error('a user-selected source must not be replaced') },
    })
    assert.equal(result.status, 'unavailable')
    assert.equal(result.enabled, false)
    assert.match(result.error ?? '', /user-selected marketplace source/)
    const preserved = JSON.parse(readFileSync(join(item.profile, 'package.json'), 'utf8'))
    assert.equal(preserved.dependencies[MARKETPLACE_PACKAGE], 'github:owner/repo')
  } finally {
    rmSync(item.root, { recursive: true, force: true })
  }
})

test('the persistent seed survives loss of the application marketplace copy', () => {
  const item = fixture()
  try {
    const seeded = materializeMarketplaceSeed({ homeDir: item.root, bundledSourceDir: item.source })
    assert.equal(seeded.status, 'created')
    assert.ok(seeded.sourceDir)
    assert.equal(existsSync(join(seeded.sourceDir, 'lib', 'index.js')), true)

    writeFileSync(join(item.source, 'lib', 'index.js'), 'patched-runtime-copy\n')
    const refreshed = materializeMarketplaceSeed({ homeDir: item.root, bundledSourceDir: item.source })
    assert.equal(refreshed.status, 'created')
    assert.equal(readFileSync(join(refreshed.sourceDir as string, 'lib', 'index.js'), 'utf8'), 'patched-runtime-copy\n')

    rmSync(item.source, { recursive: true, force: true })
    const recovered = materializeMarketplaceSeed({ homeDir: item.root })
    assert.deepEqual(recovered, { status: 'ready', sourceDir: seeded.sourceDir })

    const manifest = JSON.parse(readFileSync(join(item.profile, 'package.json'), 'utf8'))
    manifest.dependencies[MARKETPLACE_PACKAGE] = 'link:C:/old/runtime/resources/app/node_modules/dsh-plugin-marketplace'
    manifest.dsh.profile.bundles.push(MARKETPLACE_PACKAGE)
    writeJson(join(item.profile, 'package.json'), manifest)
    writeJson(join(item.profile, MARKETPLACE_SEED_MARKER), { schemaVersion: 1 })
    const result = ensureMarketplacePreinstalled({
      profileDir: item.profile,
      sourceDir: recovered.sourceDir,
      install: () => { throw new Error('managed recovery must not invoke pnpm') },
    })
    assert.deepEqual(result, { status: 'repaired', enabled: true })
    const repaired = JSON.parse(readFileSync(join(item.profile, 'package.json'), 'utf8'))
    assert.equal(repaired.dependencies[MARKETPLACE_PACKAGE], fileSpec(recovered.sourceDir as string))
  } finally {
    rmSync(item.root, { recursive: true, force: true })
  }
})

test('a missing bundled copy and seed quarantine the broken bundle and preserve recovery intent', () => {
  const item = fixture()
  try {
    rmSync(item.source, { recursive: true, force: true })
    const seed = materializeMarketplaceSeed({ homeDir: item.root })
    assert.equal(seed.status, 'failed')
    assert.match(seed.error ?? '', /bundled marketplace package and persistent seed are missing or invalid/)

    const manifest = JSON.parse(readFileSync(join(item.profile, 'package.json'), 'utf8'))
    manifest.dependencies[MARKETPLACE_PACKAGE] = 'link:C:/old/runtime/resources/app/node_modules/dsh-plugin-marketplace'
    manifest.dsh.profile.bundles.push(MARKETPLACE_PACKAGE)
    writeJson(join(item.profile, 'package.json'), manifest)
    const result = ensureMarketplacePreinstalled({
      profileDir: item.profile,
      sourceDir: seed.sourceDir,
      install: () => { throw new Error('an unavailable seed must not start the installer') },
    })
    assert.equal(result.status, 'unavailable')
    assert.equal(result.enabled, false)
    assert.equal(result.diagnostic?.code, 'MARKETPLACE_UNAVAILABLE')
    assert.match(result.diagnostic?.message ?? '', /^Marketplace unavailable:/)
    const quarantined = JSON.parse(readFileSync(join(item.profile, 'package.json'), 'utf8'))
    assert.equal(quarantined.dsh.profile.bundles.includes(MARKETPLACE_PACKAGE), false)
    const recovery = JSON.parse(readFileSync(join(item.profile, MARKETPLACE_RECOVERY_MARKER), 'utf8'))
    assert.equal(recovery.enabled, true)

    mkdirSync(join(item.source, 'lib'), { recursive: true })
    writeJson(join(item.source, 'package.json'), {
      name: MARKETPLACE_PACKAGE,
      main: 'lib/index.js',
      dsh: { bundle: { patch: './cordis.patch.yml' }, client: { platform: 'web' } },
    })
    writeFileSync(join(item.source, 'cordis.patch.yml'), '[]\n')
    writeFileSync(join(item.source, 'lib', 'index.js'), '')
    writeFileSync(join(item.source, 'lib', 'client.js'), '')
    const repaired = ensureMarketplacePreinstalled({
      profileDir: item.profile,
      sourceDir: item.source,
      install: () => { throw new Error('managed recovery must not invoke pnpm') },
    })
    assert.deepEqual(repaired, { status: 'repaired', enabled: true })
    assert.equal(existsSync(join(item.profile, MARKETPLACE_RECOVERY_MARKER)), false)
  } finally {
    rmSync(item.root, { recursive: true, force: true })
  }
})

test('legacy links into the application runtime migrate to a profile-owned file install', () => {
  const item = fixture()
  try {
    const legacySource = item.source
    item.materialize(true, `link:${legacySource}`)
    const result = ensureMarketplacePreinstalled({
      profileDir: item.profile,
      sourceDir: item.source,
      legacySourceDirs: [legacySource],
      install: () => { throw new Error('legacy migration must not invoke pnpm') },
    })
    assert.deepEqual(result, { status: 'repaired', enabled: true })
    const manifest = JSON.parse(readFileSync(join(item.profile, 'package.json'), 'utf8'))
    assert.equal(manifest.dependencies[MARKETPLACE_PACKAGE], fileSpec(item.source))
    assert.equal(existsSync(join(item.profile, 'node_modules', MARKETPLACE_PACKAGE, 'package.json')), true)
  } finally {
    rmSync(item.root, { recursive: true, force: true })
  }
})

test('an upgrade from a broken 1.2.5 profile repairs only Marketplace without pnpm', () => {
  const item = fixture()
  try {
    const seed = materializeMarketplaceSeed({ homeDir: item.root, bundledSourceDir: item.source })
    assert.ok(seed.sourceDir)
    const manifest = JSON.parse(readFileSync(join(item.profile, 'package.json'), 'utf8'))
    manifest.dependencies = {
      DeepSeek: 'link:C:/removed-1.2.5/runtime/resources/app/node_modules/DeepSeek',
      [MARKETPLACE_PACKAGE]: fileSpec(seed.sourceDir as string),
    }
    manifest.dsh.profile.bundles.push(MARKETPLACE_PACKAGE)
    writeJson(join(item.profile, 'package.json'), manifest)
    writeFileSync(join(item.profile, 'pnpm-lock.yaml'), 'unchanged-old-lockfile\n')
    const packageRoot = join(item.profile, 'node_modules', MARKETPLACE_PACKAGE)
    mkdirSync(join(item.profile, 'node_modules'), { recursive: true })
    symlinkSync(join(item.root, 'removed-runtime-marketplace'), packageRoot, 'junction')

    const result = ensureMarketplacePreinstalled({
      profileDir: item.profile,
      sourceDir: seed.sourceDir,
      install: () => { throw new Error('upgrade repair must not invoke pnpm') },
    })
    assert.deepEqual(result, { status: 'repaired', enabled: true })
    assert.equal(lstatSync(packageRoot).isSymbolicLink(), false)
    assert.equal(existsSync(join(packageRoot, 'lib', 'index.js')), true)
    assert.equal(readFileSync(join(item.profile, 'pnpm-lock.yaml'), 'utf8'), 'unchanged-old-lockfile\n')
    const repaired = JSON.parse(readFileSync(join(item.profile, 'package.json'), 'utf8'))
    assert.equal(repaired.dependencies.DeepSeek, manifest.dependencies.DeepSeek)
    assert.equal(repaired.dependencies[MARKETPLACE_PACKAGE], fileSpec(seed.sourceDir as string))
    assert.equal(repaired.dsh.profile.bundles.includes(MARKETPLACE_PACKAGE), true)
  } finally {
    rmSync(item.root, { recursive: true, force: true })
  }
})

test('pnpm file installs remain loadable after their seed directory disappears', () => {
  const item = fixture()
  try {
    writeFileSync(join(item.profile, 'pnpm-workspace.yaml'), [
      'packages:',
      '  - .',
      '',
      'nodeLinker: hoisted',
      'autoInstallPeers: false',
      '',
    ].join('\n'))
    const installed = spawnSync(process.execPath, [pnpmCli, 'add', '-w', fileSpec(item.source)], {
      cwd: item.profile,
      env: { ...process.env, CI: 'true' },
      encoding: 'utf8',
      windowsHide: true,
    })
    assert.equal(installed.status, 0, `${installed.stdout}\n${installed.stderr}`)
    const installedManifest = join(item.profile, 'node_modules', MARKETPLACE_PACKAGE, 'package.json')
    assert.equal(existsSync(installedManifest), true)

    rmSync(item.source, { recursive: true, force: true })
    assert.equal(existsSync(installedManifest), true)
    const adopted = ensureMarketplacePreinstalled({
      profileDir: item.profile,
      install: () => { throw new Error('a complete profile copy must not need its missing seed') },
    })
    assert.deepEqual(adopted, { status: 'adopted', enabled: false })
  } finally {
    rmSync(item.root, { recursive: true, force: true })
  }
})
