import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { cp, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath, pathToFileURL } from 'node:url'
import {
  assertPublishedChunkReachability,
  assertPublishedPathPurity,
  assertWebClientInjectRoster,
  publicJsEntriesFromManifest,
} from './package-purity.mjs'
import { assertPackageOutput } from '../scripts/assert-package-output.mjs'
import { publicDeclarationClosure } from '../scripts/declaration-closure.mjs'

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const repositoryRoot = resolve(packageRoot, '..', '..')
const suppliedTarball = process.argv[2] === undefined ? undefined : resolve(process.argv[2])

function assertInside(root, target) {
  const offset = relative(resolve(root), resolve(target))
  assert.ok(
    offset !== '' && offset !== '..' && !offset.startsWith(`..${sep}`) && !isAbsolute(offset),
    `refusing to manage a path outside the smoke root: ${target}`,
  )
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: 'utf8', ...options })
  assert.equal(
    result.status,
    0,
    `${command} ${args.join(' ')} failed:\n${result.error?.stack || `${result.stderr}\n${result.stdout}`}`,
  )
  return result.stdout.trim()
}

function runPnpm(args, cwd) {
  const pnpmEntrypoint = process.env.npm_execpath
  if (pnpmEntrypoint?.toLowerCase().includes('pnpm')) {
    if (pnpmEntrypoint.toLowerCase().endsWith('.exe')) return run(pnpmEntrypoint, args, { cwd })
    return run(process.execPath, [pnpmEntrypoint, ...args], { cwd })
  }
  return run(process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm', args, {
    cwd,
    // Node cannot CreateProcess a .cmd shim directly. All arguments on this
    // fallback path are script-owned temp paths/options (no user input).
    shell: process.platform === 'win32',
  })
}

async function collectRelativeFiles(root) {
  const files = []
  async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name)
      if (entry.isDirectory()) await visit(path)
      else if (entry.isFile()) files.push(relative(root, path).replaceAll('\\', '/'))
    }
  }
  await visit(root)
  return files.sort()
}

async function expectedPackedInventory(manifest) {
  const runtimeRoot = join(packageRoot, 'lib')
  const runtimeFiles = (await readdir(runtimeRoot, { withFileTypes: true }))
    .filter(entry => entry.isFile() && (entry.name.endsWith('.js') || entry.name.endsWith('.js.map')))
    .map(entry => `lib/${entry.name}`)
  const runtimeJs = new Set(runtimeFiles.filter(path => path.endsWith('.js')))
  for (const map of runtimeFiles.filter(path => path.endsWith('.js.map'))) {
    assert.ok(runtimeJs.has(map.slice(0, -'.map'.length)), `runtime map has no matching JS entry: ${map}`)
  }
  const publicRuntime = publicJsEntriesFromManifest(manifest).map(path => `lib/${path}`)
  for (const entry of publicRuntime) {
    assert.ok(runtimeJs.has(entry), `missing public runtime entry: ${entry}`)
  }
  const presetFiles = (await collectRelativeFiles(join(packageRoot, 'preset')))
    .map(path => `preset/${path}`)
  const declarations = await publicDeclarationClosure(packageRoot, manifest)
  return [...new Set([
    'LICENSE',
    'README.md',
    'README.zh.md',
    'package.json',
    ...runtimeFiles,
    ...declarations,
    ...declarations.map(path => `${path}.map`),
    ...presetFiles,
  ])].sort()
}

async function importFrom(path) {
  return import(`${pathToFileURL(path).href}?acceptance=${Date.now().toString()}`)
}

function assertConsumerImportRegistersKnown(consumerRoot, entry, repeatRegistration = false) {
  const script = [
    "import assert from 'node:assert/strict'",
    "import { createRequire } from 'node:module'",
    "import { pathToFileURL } from 'node:url'",
    "const learningManifest = import.meta.resolve('@dsh-portable/interactive-learning/package.json')",
    "const dependencyRequire = createRequire(learningManifest)",
    "const sessionEntry = dependencyRequire.resolve('@deepseek-ai/dsh-session')",
    "const { KNOWN_SESSION_EVENT_TYPES } = await import(pathToFileURL(sessionEntry).href)",
    "KNOWN_SESSION_EVENT_TYPES.delete('learning/state')",
    `const loaded = await import(${JSON.stringify(entry)})`,
    "assert.equal(KNOWN_SESSION_EVENT_TYPES.has('learning/state'), true)",
    repeatRegistration ? 'loaded.registerInteractiveLearningSessionCompatibility()' : '',
    repeatRegistration ? "assert.equal(KNOWN_SESSION_EVENT_TYPES.has('learning/state'), true)" : '',
  ].join(';')
  run(process.execPath, ['--input-type=module', '--eval', script], { cwd: consumerRoot })
}

async function collectWorkspaceOverrides() {
  const overrides = {}
  const roots = [
    join(repositoryRoot, 'vendor', 'deepseek-harness', 'packages'),
    join(repositoryRoot, 'vendor', 'deepseek-harness', 'vendor'),
    join(repositoryRoot, 'packages'),
  ]
  const ignored = new Set(['.git', 'dist', 'lib', 'node_modules'])

  async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (ignored.has(entry.name)) continue
      const path = join(directory, entry.name)
      if (entry.isDirectory()) {
        await visit(path)
        continue
      }
      if (entry.name !== 'package.json') continue
      const manifest = JSON.parse(await readFile(path, 'utf8'))
      if (typeof manifest.name !== 'string') continue
      // The portable distribution mirrors this package's manifest into the
      // pinned kernel tree so the kernel's browser bundling preset can resolve
      // an out-of-tree package by name (scripts/build/client-manifest-bridge.ts).
      // A mirror carries no sources, so an override onto it would shadow the
      // packed tarball this smoke test exists to exercise.
      if ('_portableManifestBridge' in manifest) continue
      overrides[manifest.name] = `link:${dirname(path).replaceAll('\\', '/')}`
    }
  }

  for (const root of roots) await visit(root)
  return overrides
}

const temporaryParent = resolve(tmpdir())
const smokeRoot = await mkdtemp(join(temporaryParent, 'dsh-learning-package-'))

try {
  assertInside(temporaryParent, smokeRoot)
  assert.ok(!resolve(smokeRoot).includes(`${sep}dist-desktop${sep}`), 'smoke root must not use dist-desktop')
  const sourceManifest = JSON.parse(await readFile(join(packageRoot, 'package.json'), 'utf8'))
  assertWebClientInjectRoster(sourceManifest)
  const sourcePurity = await assertPublishedPathPurity(join(packageRoot, 'lib'), { checkoutRoot: repositoryRoot })
  const sourceReachability = await assertPublishedChunkReachability(join(packageRoot, 'lib'), {
    manifest: sourceManifest,
    typeFiles: [],
  })
  const sourceOutput = await assertPackageOutput(packageRoot)
  const sourceTypeFiles = await collectRelativeFiles(join(packageRoot, 'lib', 'types'))
  assert.deepEqual(
    sourceTypeFiles.filter(path => path.endsWith('.js') || path.endsWith('.js.map')),
    [],
    'source lib/types must not retain runtime JavaScript or source maps after build pruning',
  )
  const sourceDeclarations = sourceTypeFiles
    .filter(path => path.endsWith('.d.ts'))
    .map(path => `lib/types/${path}`)
    .sort()
  const sourceDeclarationMaps = sourceTypeFiles
    .filter(path => path.endsWith('.d.ts.map'))
    .map(path => `lib/types/${path}`)
    .sort()
  const sourceDeclarationClosure = await publicDeclarationClosure(packageRoot, sourceManifest)
  const sourceTypeClosure = [
    ...sourceDeclarationClosure,
    ...sourceDeclarationClosure.map(path => `${path}.map`),
  ].sort()
  assert.deepEqual(
    sourceTypeFiles.map(path => `lib/types/${path}`).sort(),
    sourceTypeClosure,
    'source lib/types must contain exactly the public declaration and map closure',
  )
  assert.equal(sourceDeclarations.length, 13, 'source build must retain exactly 13 public declarations')
  assert.equal(sourceDeclarationMaps.length, 13, 'source build must retain exactly 13 public declaration maps')

  const packRoot = join(smokeRoot, 'pack')
  await mkdir(packRoot, { recursive: true })
  let tarball = suppliedTarball
  if (tarball === undefined) {
    runPnpm(['pack', '--pack-destination', packRoot], packageRoot)
    const packedFiles = (await readdir(packRoot)).filter(name => name.endsWith('.tgz'))
    assert.equal(packedFiles.length, 1, 'pnpm pack must emit exactly one tarball')
    tarball = join(packRoot, packedFiles[0])
  } else {
    // Stage an externally supplied tarball beside a packed one so the
    // extraction below can address it relative to the smoke root, whichever
    // drive or directory the caller passed.
    await readFile(tarball)
    const staged = join(packRoot, basename(tarball))
    await cp(tarball, staged)
    tarball = staged
  }

  const extractionRoot = join(smokeRoot, 'tar-stage')
  await mkdir(extractionRoot, { recursive: true })
  // GNU tar reads an operand containing a colon as `host:path`, so a Windows
  // absolute path such as C:\Users\... is taken as the remote host "C" and the
  // extraction fails before it starts. `--force-local` would fix that for GNU
  // tar but is rejected by the bsdtar that ships with macOS and Windows, so
  // both operands are addressed relative to a shared root instead: no colon
  // reaches tar, and every implementation reads them as local paths.
  const localOperand = path => relative(smokeRoot, path).split(sep).join('/')
  run('tar', ['-xf', localOperand(tarball), '-C', localOperand(extractionRoot)], { cwd: smokeRoot })
  const packedPackage = join(extractionRoot, 'package')
  const tarballPurity = await assertPublishedPathPurity(join(packedPackage, 'lib'), { checkoutRoot: repositoryRoot })

  const manifest = JSON.parse(await readFile(join(packedPackage, 'package.json'), 'utf8'))
  assertWebClientInjectRoster(manifest)
  const packedOutput = await assertPackageOutput(packedPackage)
  const tarballReachability = await assertPublishedChunkReachability(join(packedPackage, 'lib'), {
    manifest,
    typeFiles: [],
  })
  assert.equal(manifest.name, '@dsh-portable/interactive-learning')
  const packedDeclarations = await publicDeclarationClosure(packedPackage, manifest)
  const expectedInventory = await expectedPackedInventory(sourceManifest)
  const actualInventory = await collectRelativeFiles(packedPackage)
  assert.deepEqual(
    actualInventory.filter(path => !expectedInventory.includes(path)),
    [],
    'tarball contains files outside the package inventory allowlist',
  )
  assert.deepEqual(
    expectedInventory.filter(path => !actualInventory.includes(path)),
    [],
    'tarball is missing files required by the package inventory allowlist',
  )
  for (const exportName of ['.', './agent', './bootstrap', './client', './protocol', './installer', './preset', './eval']) {
    assert.ok(manifest.exports[exportName], `missing export ${exportName}`)
  }
  await readFile(join(packedPackage, 'README.md'), 'utf8')
  await readFile(join(packedPackage, 'README.zh.md'), 'utf8')
  await readFile(join(packedPackage, 'preset', 'learning', 'agent.cordis.yml'), 'utf8')

  // Install the actual pnpm tarball into an isolated consumer. Workspace
  // overrides point at this checkout's installed dependency graph; the
  // package under test itself is never copied into node_modules by hand.
  const consumerRoot = join(smokeRoot, 'consumer')
  await mkdir(consumerRoot, { recursive: true })
  const workspaceOverrides = await collectWorkspaceOverrides()
  await writeFile(join(consumerRoot, 'package.json'), `${JSON.stringify({
    name: 'interactive-learning-package-consumer',
    private: true,
    type: 'module',
    dependencies: {
      '@dsh-portable/interactive-learning': `file:${tarball.replaceAll('\\', '/')}`,
    },
  }, null, 2)}\n`)
  // pnpm v11 reads overrides from pnpm-workspace.yaml. JSON is valid YAML and
  // avoids a test-only YAML serializer dependency.
  await writeFile(join(consumerRoot, 'pnpm-workspace.yaml'), `${JSON.stringify({
    packages: ['.'],
    overrides: workspaceOverrides,
  }, null, 2)}\n`)
  runPnpm([
    'install',
    '--ignore-scripts',
    '--offline',
    '--prod',
    '--config.package-import-method=clone-or-copy',
  ], consumerRoot)

  // Exercise the installed package's public type routes in addition to the
  // declaration graph check above. This catches export-map/type entry drift in
  // a clean consumer without depending on any generated staging directory.
  await writeFile(join(consumerRoot, 'types-smoke.ts'), [
    "import type { LearnerStateSnapshot, LearningCheckpointV1 } from '@dsh-portable/interactive-learning'",
    "import type { ActivityRendererRegistry, LearningUiLifecycleEvent } from '@dsh-portable/interactive-learning/client'",
    'declare const checkpoint: LearningCheckpointV1',
    'declare const snapshot: LearnerStateSnapshot',
    'declare const registry: ActivityRendererRegistry',
    'declare const lifecycle: LearningUiLifecycleEvent',
    'void [checkpoint, snapshot, registry, lifecycle]',
  ].join('\n'))
  const packageRequire = createRequire(import.meta.url)
  run(process.execPath, [
    packageRequire.resolve('typescript/bin/tsc'),
    '--noEmit',
    '--target', 'ES2022',
    '--module', 'ESNext',
    '--moduleResolution', 'Bundler',
    '--allowImportingTsExtensions',
    '--skipLibCheck',
    'types-smoke.ts',
  ], { cwd: consumerRoot })

  const resolveScript = [
    "import { fileURLToPath } from 'node:url'",
    "console.log(fileURLToPath(new URL(import.meta.resolve('@dsh-portable/interactive-learning/package.json'))))",
  ].join(';')
  const installedManifest = run(process.execPath, ['--input-type=module', '--eval', resolveScript], {
    cwd: consumerRoot,
  })
  const installedPackage = dirname(installedManifest.split(/\r?\n/).at(-1))
  assertInside(consumerRoot, installedPackage)

  // Each probe runs in a fresh process to prove both public startup routes
  // perform registration themselves instead of inheriting module-cache state.
  assertConsumerImportRegistersKnown(consumerRoot, '@dsh-portable/interactive-learning/bootstrap', true)
  assertConsumerImportRegistersKnown(consumerRoot, '@dsh-portable/interactive-learning/preset')

  const host = await importFrom(join(installedPackage, 'lib', 'index.js'))
  const agent = await importFrom(join(installedPackage, 'lib', 'agent.js'))
  const bootstrap = await importFrom(join(installedPackage, 'lib', 'bootstrap.js'))
  const protocol = await importFrom(join(installedPackage, 'lib', 'protocol.js'))
  const preset = await importFrom(join(installedPackage, 'lib', 'preset.js'))
  const evaluation = await importFrom(join(installedPackage, 'lib', 'eval.js'))
  assert.equal(typeof host.default, 'function')
  assert.equal(typeof agent.apply, 'function')
  assert.equal(typeof bootstrap.registerInteractiveLearningSessionCompatibility, 'function')
  assert.equal(protocol.ACTIVITY_PROTOCOL, 'dsh-learning/activity@1')
  assert.equal(protocol.TRANSPORT_PROTOCOL, 'dsh-learning/transport@1')
  assert.equal(basename(preset.interactiveLearningPresetSource), 'learning')
  assert.ok(evaluation.TEACHING_EVAL_CASES.length >= 6)
  assert.equal(typeof evaluation.gradeLegacyV2ReplayTranscript, 'function')
  assert.equal(
    Object.hasOwn(evaluation, 'gradeLearningTranscript'),
    false,
    'the generic retired V2 transcript grader must not remain publicly exported',
  )

  let clientRegistration
  globalThis.window = {
    __ModuleLoader__: {
      load(registration) {
        clientRegistration = registration
      },
    },
  }
  try {
    await importFrom(join(installedPackage, 'lib', 'client.js'))
  } finally {
    delete globalThis.window
  }
  assert.equal(clientRegistration?.id, '@dsh-portable/interactive-learning')
  assert.equal(typeof clientRegistration?.factory, 'function')

  const installer = await importFrom(join(installedPackage, 'lib', 'installer.js'))
  const dshHome = join(smokeRoot, 'external-dsh-home')
  const first = await installer.installLearningPreset({ dshHome })
  assert.ok(first.installed.includes('agent.cordis.yml'))
  const target = join(dshHome, '.agent-presets', 'learning')
  const ownership = JSON.parse(await readFile(join(target, '.dsh-managed.json'), 'utf8'))
  assert.equal(ownership.package, '@dsh-portable/interactive-learning')
  assert.equal(ownership.userModified, false)

  const upgradedSource = join(smokeRoot, 'upgraded-preset')
  await cp(join(installedPackage, 'preset', 'learning'), upgradedSource, { recursive: true })
  const upgradedAgent = join(upgradedSource, 'agent.cordis.yml')
  await writeFile(upgradedAgent, `${await readFile(upgradedAgent, 'utf8')}\n# package upgrade fixture\n`)
  const upgraded = await installer.installLearningPreset({ dshHome, source: upgradedSource })
  assert.ok(upgraded.updated.includes('agent.cordis.yml'))

  const userOwned = join(target, 'agent.cordis.yml')
  await writeFile(userOwned, `${await readFile(userOwned, 'utf8')}# user customization\n`)
  const uninstalled = await installer.uninstallLearningPreset({ dshHome })
  assert.equal(uninstalled.manifestFound, true)
  assert.ok(uninstalled.preserved.includes('agent.cordis.yml'))
  await readFile(userOwned, 'utf8')

  console.log(JSON.stringify({
    tarball,
    installationMode: 'pnpm-pack-isolated-consumer-install',
    package: `${manifest.name}@${manifest.version}`,
    pathPurity: 'source-lib-and-tarball-pass',
    pathPurityFiles: { source: sourcePurity.filesScanned, tarball: tarballPurity.filesScanned },
    chunkReachability: { source: sourceReachability, tarball: tarballReachability },
    inventory: {
      files: actualInventory.length,
      publicJsEntries: publicJsEntriesFromManifest(manifest).length,
      publicDeclarations: packedDeclarations.length,
      publicDeclarationMaps: packedOutput.publicDeclarationMaps,
      typeRuntimeFiles: 0,
      tarballBytes: (await stat(tarball)).size,
      unpackedBytes: (await Promise.all(actualInventory.map(async path =>
        (await stat(join(packedPackage, ...path.split('/')))).size,
      ))).reduce((total, size) => total + size, 0),
    },
    distDesktopDependency: false,
    bootstrapKnownTypeRegistered: true,
    presetImportKnownTypeRegistered: true,
    hostEnabled: true,
    clientEnabled: clientRegistration.id,
    agentEntryEnabled: typeof agent.apply === 'function',
    installedFiles: first.installed.length,
    upgradedFiles: upgraded.updated,
    uninstallPreservedUserChanges: uninstalled.preserved,
  }, null, 2))
} finally {
  assertInside(temporaryParent, smokeRoot)
  await rm(smokeRoot, { recursive: true, force: true })
}
