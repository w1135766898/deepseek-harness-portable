import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  INTERACTIVE_LEARNING_APP_FILES,
  INTERACTIVE_LEARNING_PACKAGE_FILES,
} from '../../packages/release-manifest/src/index.js'
import {
  assertInteractiveLearningContainerInventory,
  assertMaterializedInteractiveLearningPreset,
  inspectInteractiveLearningApp,
  inspectInteractiveLearningPackage,
  pruneInteractiveLearningPackageToPublishedFiles,
} from './interactive-learning-contract.js'

const packageRelativeRoot = join('node_modules', '@dsh-portable', 'interactive-learning')

async function write(path: string, content: string): Promise<void> {
  await mkdir(join(path, '..'), { recursive: true })
  await writeFile(path, content)
}

function sourceBetween(source: string, start: string, end: string): string {
  const startIndex = source.indexOf(start)
  assert.notEqual(startIndex, -1, `missing source boundary: ${start}`)
  const endIndex = source.indexOf(end, startIndex + start.length)
  assert.notEqual(endIndex, -1, `missing source boundary: ${end}`)
  return source.slice(startIndex, endIndex)
}

async function appFixture(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'dsh-learning-contract-'))
  const packageRoot = join(root, packageRelativeRoot)
  await write(join(root, 'lib', 'packaged-bin.js'), [
    'const overlays = [{ insert: [{',
    "  id: 'interactive-learning',",
    "  name: '@dsh-portable/interactive-learning',",
    '}]}]',
  ].join('\n'))
  await write(join(packageRoot, 'package.json'), `${JSON.stringify({
    name: '@dsh-portable/interactive-learning',
    main: 'lib/index.js',
    exports: {
      '.': { default: './lib/index.js' },
      './bootstrap': { default: './lib/bootstrap.js' },
      './agent': { default: './lib/agent.js' },
      './client': { default: './lib/client.js' },
      './preset': { default: './lib/preset.js' },
    },
    bin: { 'learning-fixture': './lib/fixture-cli.js' },
    files: ['lib/*.js', 'preset/**/*'],
    dsh: { client: { platform: 'web', inject: ['@deepseek-ai/dsh-client-runtime'] } },
  }, null, 2)}\n`)
  await write(join(packageRoot, 'LICENSE'), 'Fixture license\n')
  await write(join(packageRoot, 'lib', 'index.js'), 'export { marker } from "./shared-fixture.js"\n')
  await write(join(packageRoot, 'lib', 'bootstrap.js'), 'export const register = true\n')
  await write(join(packageRoot, 'lib', 'agent.js'), 'export { marker } from "./shared-fixture.js"\n')
  await write(join(packageRoot, 'lib', 'client.js'), 'export const client = true\n')
  await write(join(packageRoot, 'lib', 'preset.js'), 'export const preset = true\n')
  await write(join(packageRoot, 'lib', 'fixture-cli.js'), 'export { marker } from "./shared-fixture.js"\n')
  await write(join(packageRoot, 'lib', 'shared-fixture.js'), 'export const marker = true\n')
  await write(join(packageRoot, 'preset', 'learning', 'preset.yml'), [
    'name: Learning',
    'description: A healthy selectable learning preset.',
    'order: 3.5',
    '',
  ].join('\n'))
  await write(join(packageRoot, 'preset', 'learning', 'agent.cordis.yml'), [
    '- id: persona',
    "  name: '@deepseek-ai/dsh-persona'",
    '  config:',
    '    value: !!js "process.version"',
    '- id: learning-agent',
    "  name: '@dsh-portable/interactive-learning/agent'",
    '',
  ].join('\n'))
  return root
}

test('Interactive Learning app contract proves Host, selector, composition, Agent, and Client', async () => {
  const root = await appFixture()
  try {
    const evidence = await inspectInteractiveLearningApp(root)
    assert.equal(evidence.host.id, 'interactive-learning')
    assert.equal(evidence.host.bundle, 'lib/index.js')
    assert.equal(evidence.host.bootstrapBundle, 'lib/bootstrap.js')
    assert.equal(evidence.preset.selectable, true)
    assert.equal(evidence.preset.description, 'A healthy selectable learning preset.')
    assert.deepEqual(evidence.preset.compositionRows.map(row => row.id), ['persona', 'learning-agent'])
    assert.equal(evidence.agent.bundle, 'lib/agent.js')
    assert.equal(evidence.client.bundle, 'lib/client.js')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('Interactive Learning app contract rejects every missing stable required file', async () => {
  const root = await appFixture()
  try {
    const required = [
      ...INTERACTIVE_LEARNING_APP_FILES,
      ...INTERACTIVE_LEARNING_PACKAGE_FILES.map(path => `${packageRelativeRoot.replaceAll('\\', '/')}/${path}`),
    ]
    for (const relativePath of required) {
      const path = join(root, ...relativePath.split('/'))
      const content = await readFile(path)
      await rm(path)
      await assert.rejects(inspectInteractiveLearningApp(root), /incomplete|missing/i, relativePath)
      await writeFile(path, content)
    }
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('Interactive Learning app contract rejects semantic drift and missing generated imports', async () => {
  const root = await appFixture()
  const packageRoot = join(root, packageRelativeRoot)
  try {
    await writeFile(join(root, 'lib', 'packaged-bin.js'), 'export const unrelated = true\n')
    await assert.rejects(inspectInteractiveLearningApp(root), /missing the interactive-learning Host row/)

    await writeFile(join(root, 'lib', 'packaged-bin.js'), "const row = { id: 'interactive-learning', name: '@dsh-portable/interactive-learning' }\n")
    await writeFile(join(packageRoot, 'preset', 'learning', 'preset.yml'), 'name: Learning\ndescription: ""\n')
    await assert.rejects(inspectInteractiveLearningApp(root), /non-empty name and description/)

    await writeFile(join(packageRoot, 'preset', 'learning', 'preset.yml'), 'name: Learning\ndescription: Healthy\n')
    await writeFile(join(packageRoot, 'preset', 'learning', 'agent.cordis.yml'), "- id: other\n  name: '@fixture/other'\n")
    await assert.rejects(inspectInteractiveLearningApp(root), /exactly one learning-agent/)

    await writeFile(join(packageRoot, 'preset', 'learning', 'agent.cordis.yml'), "- id: learning-agent\n  name: '@dsh-portable/interactive-learning/agent'\n")
    await rm(join(packageRoot, 'lib', 'shared-fixture.js'))
    await assert.rejects(inspectInteractiveLearningApp(root), /JavaScript closure is missing.*shared-fixture\.js/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('Interactive Learning package rejects JavaScript and maps outside its public entry closure', async () => {
  const root = await appFixture()
  const packageRoot = join(root, packageRelativeRoot)
  try {
    const cliPath = join(packageRoot, 'lib', 'fixture-cli.js')
    const cli = await readFile(cliPath)
    await rm(cliPath)
    await assert.rejects(inspectInteractiveLearningApp(root), /JavaScript closure is missing.*fixture-cli\.js/)
    await writeFile(cliPath, cli)

    await write(join(packageRoot, 'lib', 'retired-OldHash01.js'), 'export const retired = true\n')
    await assert.rejects(
      inspectInteractiveLearningApp(root),
      /unreachable JavaScript:.*retired-OldHash01\.js/,
    )
    await rm(join(packageRoot, 'lib', 'retired-OldHash01.js'))

    await write(join(packageRoot, 'lib', 'types', 'retired.js'), 'export const retired = true\n')
    await assert.rejects(inspectInteractiveLearningApp(root), /unreachable JavaScript:.*lib\/types\/retired\.js/)
    await rm(join(packageRoot, 'lib', 'types', 'retired.js'))

    await write(join(packageRoot, 'lib', 'retired-OldHash01.js.map'), '{}\n')
    await assert.rejects(
      inspectInteractiveLearningApp(root),
      /source maps without reachable JavaScript:.*retired-OldHash01\.js\.map/,
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('Learning source permits workspace inputs while staging is pruned to its exact published inventory', async () => {
  const root = await appFixture()
  const packageRoot = join(root, packageRelativeRoot)
  try {
    await write(join(packageRoot, 'output', 'stale-package.tgz'), 'retired package bytes\n')
    await write(join(packageRoot, 'src', 'workspace-only.ts'), 'export const source = true\n')
    await write(join(packageRoot, 'tests', 'workspace-only.spec.ts'), 'export const test = true\n')
    await write(join(packageRoot, 'scripts', 'workspace-only.mjs'), 'export const script = true\n')
    await mkdir(join(packageRoot, 'empty-workspace-directory'), { recursive: true })

    const sourceEvidence = await inspectInteractiveLearningPackage(packageRoot)
    assert.equal(sourceEvidence.host.id, 'interactive-learning')
    await assert.rejects(
      inspectInteractiveLearningApp(root),
      /outside its published allowlist:.*empty-workspace-directory|outside its published allowlist:.*output\/stale-package\.tgz/,
    )

    const retained = await pruneInteractiveLearningPackageToPublishedFiles(packageRoot)
    assert.equal(retained, sourceEvidence.publishedFiles.length)
    assert.deepEqual((await inspectInteractiveLearningApp(root)).publishedFiles, sourceEvidence.publishedFiles)
    await assert.rejects(readFile(join(packageRoot, 'output', 'stale-package.tgz')), /ENOENT/)
    await assert.rejects(readFile(join(packageRoot, 'src', 'workspace-only.ts')), /ENOENT/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('final Learning inventory rejects each workspace-only file class', async t => {
  for (const relativePath of [
    'output/stale-package.tgz',
    'src/workspace-only.ts',
    'tests/workspace-only.spec.ts',
    'scripts/workspace-only.mjs',
    'lib/secret.txt',
    'tsconfig.json',
  ]) {
    await t.test(relativePath, async () => {
      const root = await appFixture()
      try {
        await write(join(root, packageRelativeRoot, ...relativePath.split('/')), 'workspace-only bytes\n')
        await inspectInteractiveLearningPackage(join(root, packageRelativeRoot))
        await assert.rejects(
          inspectInteractiveLearningApp(root),
          error => error instanceof Error
            && error.message.includes('outside its published allowlist')
            && error.message.includes(relativePath),
        )
      } finally {
        await rm(root, { recursive: true, force: true })
      }
    })
  }
})

test('Learning publication rejects selected nested archives and malformed files patterns', async () => {
  const root = await appFixture()
  const packageRoot = join(root, packageRelativeRoot)
  const manifestPath = join(packageRoot, 'package.json')
  try {
    for (const archive of ['nested.zip', 'nested.tar.bz2', 'nested.asar']) {
      const archivePath = join(packageRoot, 'preset', 'learning', archive)
      await write(archivePath, 'archive bytes\n')
      await assert.rejects(
        inspectInteractiveLearningPackage(packageRoot),
        error => error instanceof Error
          && error.message.includes('select forbidden nested archives')
          && error.message.includes(`preset/learning/${archive}`),
      )
      await rm(archivePath)
    }

    const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as { files: string[] }
    manifest.files.push('../outside.js')
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
    await assert.rejects(inspectInteractiveLearningPackage(packageRoot), /pattern escapes the package/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('package files cannot self-authorize workspace or non-public runtime paths', async t => {
  for (const [relativePath, pattern] of [
    ['src/authorized.ts', 'src/**/*'],
    ['tests/authorized.txt', 'tests/**/*'],
    ['scripts/authorized.mjs', 'scripts/**/*'],
    ['output/authorized.txt', 'output/**/*'],
    ['lib/types/private.d.ts', 'lib/types/private.d.ts'],
    ['lib/types/private.js', 'lib/types/private.js'],
    ['lib/nested/private.js', 'lib/nested/*.js'],
    ['node_modules/embedded/index.js', 'node_modules/**/*'],
  ] as const) {
    await t.test(relativePath, async () => {
      const root = await appFixture()
      const packageRoot = join(root, packageRelativeRoot)
      const manifestPath = join(packageRoot, 'package.json')
      try {
        await write(join(packageRoot, ...relativePath.split('/')), 'not publishable\n')
        const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as { files: string[] }
        manifest.files.push(pattern)
        await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
        await assert.rejects(
          inspectInteractiveLearningPackage(packageRoot),
          /fixed distribution policy|patterns match no outputs/,
        )
      } finally {
        await rm(root, { recursive: true, force: true })
      }
    })
  }
})

test('container inventory accepts only published files and their directory ancestors', () => {
  const prefix = 'DeepSeek Harness-win32-x64/runtime/resources/app/node_modules/@dsh-portable/interactive-learning'
  const publishedFiles = ['lib/index.js', 'package.json', 'preset/learning/preset.yml']
  const valid = [
    `${prefix}/`,
    `${prefix}/lib/`,
    `${prefix}/preset/`,
    `${prefix}/preset/learning/`,
    ...publishedFiles.map(path => `${prefix}/${path}`),
  ]
  assert.doesNotThrow(() => assertInteractiveLearningContainerInventory(valid, prefix, publishedFiles))
  assert.throws(
    () => assertInteractiveLearningContainerInventory([...valid, `${prefix}/output/stale.tgz`], prefix, publishedFiles),
    /unexpected=.*output\/stale\.tgz/,
  )
  assert.throws(
    () => assertInteractiveLearningContainerInventory(valid.filter(path => !path.endsWith('/lib/index.js')), prefix, publishedFiles),
    /missing=.*lib\/index\.js/,
  )
  assert.throws(
    () => assertInteractiveLearningContainerInventory([...valid, `${prefix}/tests/`], prefix, publishedFiles),
    /directories=.*tests\//,
  )
  assert.throws(
    () => assertInteractiveLearningContainerInventory([...valid, `${prefix}/lib/index.js`], prefix, publishedFiles),
    /duplicate=.*lib\/index\.js/,
  )
  assert.throws(
    () => assertInteractiveLearningContainerInventory([prefix, ...valid], prefix, publishedFiles),
    /package root must be a directory entry/,
  )
})

test('runtime materialization must retain both Learning preset files in its source manifest', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-learning-materialized-'))
  const dshHome = join(root, '.dsh')
  const presetRoot = join(dshHome, '.system-agent-presets')
  try {
    await write(join(presetRoot, 'learning', 'preset.yml'), 'name: Learning\n')
    await write(join(presetRoot, 'learning', 'agent.cordis.yml'), '- id: learning-agent\n')
    await write(join(presetRoot, '.manifest.json'), JSON.stringify({
      sources: [{
        id: 'interactive-learning',
        entries: [{ path: 'learning/preset.yml' }, { path: 'learning/agent.cordis.yml' }],
      }],
    }))
    await assertMaterializedInteractiveLearningPreset(dshHome)
    await rm(join(presetRoot, 'learning', 'agent.cordis.yml'))
    await assert.rejects(assertMaterializedInteractiveLearningPreset(dshHome), /materialized Learning preset is missing/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('desktop packaging keeps semantic Learning inspection on every reusable boundary', async () => {
  const source = await readFile(join(import.meta.dirname, '..', 'build-desktop-web-exe.ts'), 'utf8')
  assert.match(source, /BUILD_INPUT_PATHS[\s\S]*?'apps\/interactive-learning\/scripts'/)
  assert.match(source, /BUILD_INPUT_PATHS[\s\S]*?'apps\/interactive-learning\/README\.md'[\s\S]*?'apps\/interactive-learning\/README\.zh\.md'/)
  assert.match(source, /STAGING_INPUT_PATHS[\s\S]*?'LICENSE'/)
  const skipBuild = sourceBetween(
    source,
    'if (this.cli.skipBuild) {',
    'if (!this.cli.noCache && cacheLayerMatches(this.cacheState.build',
  )
  const buildCache = sourceBetween(
    source,
    'if (!this.cli.noCache && cacheLayerMatches(this.cacheState.build',
    'console.log(`build-desktop-web-exe: build cache miss',
  )
  const freshBuild = sourceBetween(
    source,
    'console.log(`build-desktop-web-exe: build cache miss',
    '/** Reuse a complete deployed closure, or rebuild and cache it as one layer. */',
  )
  const stagingCache = sourceBetween(
    source,
    'if (!this.cli.noCache && cacheLayerMatches(this.cacheState.staging',
    'console.log(`build-desktop-web-exe: staging cache miss',
  )
  const freshStaging = sourceBetween(
    source,
    'console.log(`build-desktop-web-exe: staging cache miss',
    '/** Clear and deploy the runtime closure into the staging directory. */',
  )
  const artifactCache = sourceBetween(
    source,
    'if (!this.cli.noCache && cacheLayerMatches(this.cacheState.electron',
    'console.log(`build-desktop-web-exe: artifact cache miss',
  )
  const artifactMiss = sourceBetween(
    source,
    "await this.timed('package artifact', async () => {",
    'if (!this.cli.dryRun) {',
  )
  assert.match(skipBuild, /await inspectInteractiveLearningPackage\(learningPackage\)/)
  assert.match(buildCache, /await inspectInteractiveLearningPackage\(learningPackage\)/)
  assert.match(freshBuild, /await inspectInteractiveLearningPackage\(learningPackage\)/)
  assert.match(stagingCache, /await this\.validateInteractiveLearningStaging\(\)/)
  assert.doesNotMatch(stagingCache, /pruneInteractiveLearningStaging/)
  assert.match(freshStaging, /await this\.pruneInteractiveLearningStaging\(\)[\s\S]*?await this\.validateInteractiveLearningStaging\(\)/)
  assert.match(source, /const licenseSource = join\(root, 'LICENSE'\)[\s\S]*?await copyFile\(licenseSource, licenseDestination\)[\s\S]*?pruneInteractiveLearningPackageToPublishedFiles/)
  assert.match(freshStaging, /await this\.validateInteractiveLearningStaging\(\)/)
  assert.match(artifactCache, /await inspectInteractiveLearningApp\(this\.appResourcesDir\(product\)\)/)
  assert.match(artifactMiss, /if \(this\.cli\.reuseUnpacked\)/)
  assert.match(artifactMiss, /await inspectInteractiveLearningApp\(this\.appResourcesDir\(product\)\)/)
  assert.match(source, /const interactiveLearning = await inspectInteractiveLearningApp\(resources\)[\s\S]*?experiencePacks: \{ interactiveLearning \}/)
  assert.match(source, /const publishedLearningFile = path\.startsWith\(learningPackage \+ sep\)[\s\S]*?!publishedLearningFile && lower\.endsWith\('\.map'\)[\s\S]*?!publishedLearningFile && lower\.endsWith\('\.d\.ts'\)[\s\S]*?!publishedLearningFile && this\.cli\.pruneSources/)
  assert.equal((source.match(/interactiveLearningAppRequiredPaths\(/g) ?? []).length, 2)
  assert.match(source, /verifyPlatformContainers\(current\.finalPackages, current\.verified\)/)
  assert.match(source, /async attestArtifacts\([\s\S]*?await this\.verifyPlatformContainers\(artifacts, evidence\)[\s\S]*?writeArtifactVerification/)
  assert.match(source, /assertInteractiveLearningContainerInventory\([\s\S]*?evidence\.interactiveLearning\.publishedFiles/)
  assert.match(source, /setupBytes\.indexOf\(zipBytes[\s\S]*?exact verified portable ZIP bytes exactly once/)
})
