import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..', '..')
const approvedReleaseVersion = '1.5.2'
const dependencyManifestSnapshot = '473c0ce368618e5d207cda8bd19f2470112ecd2add795122e8c44d633b7b5c06'
const lockfileSnapshot = '4c2afce804f396e3c41595d8eedfb96249a0c9fa660108d16a56f5b3f48057ff'

const packageVersions = {
  'package.json': '0.1.0',
  'apps/desktop/package.json': '0.1.0-shell.2',
  'apps/runtime/package.json': '0.1.0',
  'apps/interactive-learning/package.json': '0.1.0',
  'apps/vision-bridge/package.json': '0.1.0',
  'packages/platform-contract/package.json': '0.1.0',
  'packages/release-manifest/package.json': '0.1.0',
  'packages/desktop-protocol/package.json': '1.0.0',
} as const

const dependencySections = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'] as const

function readText(path: string): string {
  return readFileSync(resolve(root, path), 'utf8')
}

function readJson(path: string): Record<string, unknown> {
  return JSON.parse(readText(path)) as Record<string, unknown>
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

function sortedRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {}
  return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)))
}

test('the approved product version is synchronized across release metadata and documentation', () => {
  const desktop = readJson('apps/desktop/package.json')
  assert.equal(desktop.distributionVersion, approvedReleaseVersion)
  assert.match(String(desktop.distributionVersion), /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/)

  const notes = readJson('apps/desktop/src/release-notes.json')
  assert.equal(notes.version, approvedReleaseVersion)
  assert.equal(notes.name, `DeepSeek Harness Desktop v${approvedReleaseVersion}`)

  const requiredText = new Map<string, readonly string[]>([
    ['README.md', [`v${approvedReleaseVersion}`, `/releases/tag/v${approvedReleaseVersion}`, `| Distribution | ${approvedReleaseVersion} |`]],
    ['README.zh.md', [`v${approvedReleaseVersion}`, `/releases/tag/v${approvedReleaseVersion}`, `| 分发版本 | ${approvedReleaseVersion} |`]],
    ['apps/desktop/README.md', [`DeepSeek Harness Desktop v${approvedReleaseVersion}`, `Distribution: ${approvedReleaseVersion}`]],
    ['apps/desktop/README.zh.md', [`DeepSeek Harness Desktop v${approvedReleaseVersion}`, `分发：${approvedReleaseVersion}`]],
    ['apps/desktop/使用说明.txt', [`DeepSeek Harness for Win v${approvedReleaseVersion}`]],
    ['apps/desktop/使用说明.en.txt', [`DeepSeek Harness for Win v${approvedReleaseVersion}`]],
    ['RELEASE_NOTES.md', [`DeepSeek Harness Desktop v${approvedReleaseVersion}`, `Distribution: ${approvedReleaseVersion}`, `Tag: v${approvedReleaseVersion}`]],
    ['RELEASE_NOTES.zh.md', [`DeepSeek Harness Desktop v${approvedReleaseVersion}`, `分发：${approvedReleaseVersion}`, `标签：v${approvedReleaseVersion}`]],
    ['RELEASE_NOTES.bilingual.md', [`DeepSeek Harness Desktop v${approvedReleaseVersion}`, `分发：${approvedReleaseVersion}`, `Distribution: ${approvedReleaseVersion}`, `DeepSeek-Harness-${approvedReleaseVersion}-win32-x64.zip`, `DeepSeek-Harness-Setup-${approvedReleaseVersion}-win32-x64.exe`]],
    ['SHA256SUMS.txt', [`DeepSeek-Harness-${approvedReleaseVersion}-win32-x64.zip`, `DeepSeek-Harness-Setup-${approvedReleaseVersion}-win32-x64.exe`]],
  ])
  for (const [path, needles] of requiredText) {
    const content = readText(path)
    for (const needle of needles) assert.ok(content.includes(needle), `${path} must contain ${needle}`)
  }
  const checksumLines = readText('SHA256SUMS.txt').trim().split(/\r?\n/)
  assert.equal(checksumLines.length, 2)
  for (const line of checksumLines) assert.match(line, /^[A-F0-9]{64} \*DeepSeek-Harness-(?:Setup-)?\d+\.\d+\.\d+-win32-x64\.(?:zip|exe)$/)
})

test('Setup and packaging derive release identity from distributionVersion', () => {
  const build = readText('scripts/build-desktop-web-exe.ts')
  const setup = readText('scripts/setup.iss')
  assert.ok(build.includes('const version = distributionVersion()'))
  assert.ok(build.includes('`DeepSeek-Harness-${version}-win32-x64.zip`'))
  assert.ok(build.includes('`DeepSeek-Harness-Setup-${version}-win32-x64.exe`'))
  assert.ok(build.includes('`/DMyAppVersion=${version}`'))
  assert.ok(setup.includes('AppVersion={#MyAppVersion}'))
  assert.ok(setup.includes('OutputBaseFilename=DeepSeek-Harness-Setup-{#MyAppVersion}-win32-x64'))
})

test('product version changes do not rewrite package or dependency versions', () => {
  const dependencyState: Record<string, Record<string, unknown>> = {}
  for (const [path, expectedVersion] of Object.entries(packageVersions).sort(([left], [right]) => left.localeCompare(right))) {
    const manifest = readJson(path)
    assert.equal(manifest.version, expectedVersion, `${path} package version is independent of the product release`)
    assert.notEqual(manifest.version, approvedReleaseVersion, `${path} must not inherit the product release version`)
    dependencyState[path] = {}
    for (const section of dependencySections) {
      if (manifest[section] !== undefined) dependencyState[path][section] = sortedRecord(manifest[section])
    }
  }
  assert.equal(
    sha256(JSON.stringify(dependencyState)),
    dependencyManifestSnapshot,
    'dependency manifests changed; review the dependency change and deliberately refresh this gate',
  )
  assert.equal(
    sha256(readText('pnpm-lock.yaml').replace(/\r\n/g, '\n')),
    lockfileSnapshot,
    'pnpm-lock.yaml changed; a product release version bump must not rewrite dependency resolution',
  )
})
