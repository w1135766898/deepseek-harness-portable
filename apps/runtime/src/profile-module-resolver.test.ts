import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { createProfileFirstPackageJsonResolver } from './profile-module-resolver.js'

function writePackage(root: string, name: string, version: string): string {
  const directory = join(root, 'node_modules', name)
  mkdirSync(directory, { recursive: true })
  const manifest = join(directory, 'package.json')
  writeFileSync(manifest, `${JSON.stringify({ name, version })}\n`)
  return manifest
}

test('downloaded client plugins resolve from the profile before the runtime fallback', () => {
  const root = mkdtempSync(join(tmpdir(), 'dsh-profile-resolver-'))
  try {
    const profile = join(root, 'home', 'profiles', 'web')
    const runtime = join(root, 'runtime')
    mkdirSync(profile, { recursive: true })
    mkdirSync(runtime, { recursive: true })
    writeFileSync(join(profile, 'package.json'), '{}\n')
    writeFileSync(join(runtime, 'package.json'), '{}\n')
    const profileManifest = writePackage(profile, 'downloaded-plugin', '2.0.0')
    writePackage(runtime, 'downloaded-plugin', '1.0.0')
    const runtimeOnly = writePackage(runtime, '@dsh/runtime-only', '1.0.0')

    const resolvePackageJson = createProfileFirstPackageJsonResolver(profile, join(runtime, 'package.json'))
    assert.equal(resolvePackageJson('downloaded-plugin'), profileManifest)
    assert.equal(resolvePackageJson('@dsh/runtime-only'), runtimeOnly)
    assert.throws(() => resolvePackageJson('missing-plugin'), /cannot resolve package manifest/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
