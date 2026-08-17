import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { basename, dirname, join, relative, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'

const packageRoot = resolve(dirname(new URL(import.meta.url).pathname.replace(/^\/(?:[A-Za-z]:)/, value => value.slice(1))), '..')
const repositoryRoot = resolve(packageRoot, '..', '..')
const dependencyAnchor = join(repositoryRoot, 'dist-desktop', 'node')
const tarballArgument = process.argv[2]

assert.ok(tarballArgument, 'Usage: node tests/package-lifecycle.mjs <clean-package.tgz>')
const tarball = resolve(tarballArgument)

function assertInside(root, target) {
  const offset = relative(resolve(root), resolve(target))
  assert.ok(offset !== '' && offset !== '..' && !offset.startsWith(`..${sep}`) && !resolve(offset).startsWith(sep),
    `refusing to manage a path outside the smoke root: ${target}`)
}

async function importFrom(path) {
  return import(`${pathToFileURL(path).href}?acceptance=${Date.now().toString()}`)
}

await readFile(join(dependencyAnchor, 'package.json'), 'utf8')
const smokeRoot = await mkdtemp(join(dependencyAnchor, '.learning-package-smoke-'))
assertInside(dependencyAnchor, smokeRoot)

try {
  const extractionRoot = join(smokeRoot, 'tar-stage')
  await mkdir(extractionRoot, { recursive: true })
  const extracted = spawnSync('tar', ['-xf', tarball, '-C', extractionRoot], {
    cwd: repositoryRoot,
    encoding: 'utf8',
  })
  assert.equal(extracted.status, 0, `tar extraction failed:\n${extracted.stderr}`)

  const externalApp = join(smokeRoot, 'external-app')
  const installedPackage = join(externalApp, 'node_modules', '@dsh-portable', 'interactive-learning')
  await mkdir(dirname(installedPackage), { recursive: true })
  await cp(join(extractionRoot, 'package'), installedPackage, { recursive: true })
  const manifest = JSON.parse(await readFile(join(installedPackage, 'package.json'), 'utf8'))
  assert.equal(manifest.name, '@dsh-portable/interactive-learning')
  for (const exportName of ['.', './agent', './client', './protocol', './installer', './preset', './eval']) {
    assert.ok(manifest.exports[exportName], `missing export ${exportName}`)
  }
  assert.equal(manifest.dsh.client.platform, 'web')
  assert.ok(manifest.dsh.client.inject.includes('@deepseek-ai/dsh-client-ui-conversation'))
  await readFile(join(installedPackage, 'README.md'), 'utf8')
  await readFile(join(installedPackage, 'README.zh.md'), 'utf8')
  await readFile(join(installedPackage, 'preset', 'learning', 'agent.cordis.yml'), 'utf8')

  const host = await importFrom(join(installedPackage, 'lib', 'index.js'))
  const agent = await importFrom(join(installedPackage, 'lib', 'agent.js'))
  const protocol = await importFrom(join(installedPackage, 'lib', 'protocol.js'))
  const preset = await importFrom(join(installedPackage, 'lib', 'preset.js'))
  const evaluation = await importFrom(join(installedPackage, 'lib', 'eval.js'))
  assert.equal(typeof host.default, 'function')
  assert.equal(typeof agent.apply, 'function')
  assert.equal(protocol.ACTIVITY_PROTOCOL, 'dsh-learning/activity@1')
  assert.equal(protocol.TRANSPORT_PROTOCOL, 'dsh-learning/transport@1')
  assert.equal(basename(preset.interactiveLearningPresetSource), 'learning')
  assert.ok(evaluation.TEACHING_EVAL_CASES.length >= 6)

  let clientRegistration
  globalThis.window = {
    __ModuleLoader__: {
      load(registration) {
        clientRegistration = registration
      },
    },
  }
  await importFrom(join(installedPackage, 'lib', 'client.js'))
  delete globalThis.window
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

  const report = {
    tarball,
    installationMode: 'clean-tarball-node_modules',
    package: `${manifest.name}@${manifest.version}`,
    hostEnabled: true,
    clientEnabled: clientRegistration.id,
    agentEntryEnabled: typeof agent.apply === 'function',
    installedFiles: first.installed.length,
    upgradedFiles: upgraded.updated,
    uninstallPreservedUserChanges: uninstalled.preserved,
  }
  console.log(JSON.stringify(report, null, 2))
} finally {
  assertInside(dependencyAnchor, smokeRoot)
  await rm(smokeRoot, { recursive: true, force: true })
}
