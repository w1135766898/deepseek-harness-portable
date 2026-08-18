import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdir, readFile, readdir, rm } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { assertPackageOutput } from './assert-package-output.mjs'
import {
  assertManifestDeclarationFiles,
  declarationMapClosure,
  publicDeclarationClosure,
} from './declaration-closure.mjs'

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const libRoot = resolve(packageRoot, 'lib')
const typesRoot = resolve(libRoot, 'types')

function assertExactPackageLib(target) {
  const offset = relative(packageRoot, resolve(target))
  assert.equal(offset, 'lib', `refusing to clean anything except this package's lib: ${target}`)
  assert.ok(!isAbsolute(offset) && offset !== '..' && !offset.startsWith(`..${sep}`))
}

function runPnpm(args) {
  const pnpmEntrypoint = process.env.npm_execpath
  const result = pnpmEntrypoint?.toLowerCase().includes('pnpm')
    ? spawnSync(
        pnpmEntrypoint.toLowerCase().endsWith('.exe') ? pnpmEntrypoint : process.execPath,
        pnpmEntrypoint.toLowerCase().endsWith('.exe') ? args : [pnpmEntrypoint, ...args],
        { cwd: packageRoot, encoding: 'utf8' },
      )
    : spawnSync(process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm', args, {
        cwd: packageRoot,
        encoding: 'utf8',
        shell: process.platform === 'win32',
      })
  assert.equal(
    result.status,
    0,
    `pnpm ${args.join(' ')} failed:\n${result.error?.stack || `${result.stderr}\n${result.stdout}`}`,
  )
  if (result.stdout) process.stdout.write(result.stdout)
  if (result.stderr) process.stderr.write(result.stderr)
}

async function collectFiles(root) {
  const files = []
  async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name)
      if (entry.isDirectory()) await visit(path)
      else if (entry.isFile()) files.push(path)
    }
  }
  await visit(root)
  return files
}

assertExactPackageLib(libRoot)
await rm(libRoot, { recursive: true, force: true })
await mkdir(libRoot, { recursive: true })

runPnpm(['exec', 'tsc', '-b'])
const manifest = JSON.parse(await readFile(join(packageRoot, 'package.json'), 'utf8'))
const declarationClosure = await publicDeclarationClosure(packageRoot, manifest)
assertManifestDeclarationFiles(manifest, declarationClosure)
const keepTypeArtifacts = new Set([
  ...declarationClosure,
  ...declarationMapClosure(declarationClosure),
].map(path => resolve(packageRoot, ...path.split('/'))))

runPnpm(['exec', 'tsdown'])
for (const path of await collectFiles(typesRoot)) {
  if (!keepTypeArtifacts.has(path)) await rm(path)
}
await rm(join(libRoot, 'tsconfig.tsbuildinfo'), { force: true })

console.log(JSON.stringify({
  output: relative(packageRoot, libRoot).replaceAll('\\', '/'),
  ...await assertPackageOutput(packageRoot),
}, null, 2))
