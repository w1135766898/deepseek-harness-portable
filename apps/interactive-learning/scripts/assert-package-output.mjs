import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { basename, dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import {
  assertManifestDeclarationFiles,
  declarationMapClosure,
  publicDeclarationClosure,
} from './declaration-closure.mjs'

const defaultPackageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')

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

export async function assertPackageOutput(packageRoot = defaultPackageRoot) {
  const root = resolve(packageRoot)
  const manifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
  const declarationClosure = await publicDeclarationClosure(root, manifest)
  assertManifestDeclarationFiles(manifest, declarationClosure)
  const expectedDeclarations = declarationClosure.map(path => resolve(root, ...path.split('/')))
  const expectedDeclarationMaps = declarationMapClosure(declarationClosure)
    .map(path => resolve(root, ...path.split('/')))

  const typeFiles = (await collectFiles(join(root, 'lib', 'types'))).sort()
  const runtimeTypeFiles = typeFiles.filter(path => path.endsWith('.js') || path.endsWith('.js.map'))
  const expectedTypeFiles = [...expectedDeclarations, ...expectedDeclarationMaps].sort()
  const unexpectedTypeFiles = typeFiles.filter(path => !expectedTypeFiles.includes(path))
  const missingTypeFiles = expectedTypeFiles.filter(path => !typeFiles.includes(path))
  const display = paths => paths.map(path => relative(root, path).replaceAll('\\', '/'))

  assert.deepEqual(
    display(runtimeTypeFiles),
    [],
    `lib/types must not contain runtime JS or maps:\n${display(runtimeTypeFiles).join('\n')}`,
  )
  assert.deepEqual(
    display(unexpectedTypeFiles),
    [],
    `lib/types contains files outside the public declaration closure:\n${display(unexpectedTypeFiles).join('\n')}`,
  )
  assert.deepEqual(
    display(missingTypeFiles),
    [],
    `lib/types is missing public declaration artifacts:\n${display(missingTypeFiles).join('\n')}`,
  )
  for (const declaration of expectedDeclarations) {
    const map = `${declaration}.map`
    const contents = await readFile(declaration, 'utf8')
    const references = [...contents.matchAll(/\/\/# sourceMappingURL=([^\s]+)/g)].map(match => match[1])
    assert.deepEqual(
      references,
      [`${basename(declaration)}.map`],
      `${display([declaration])[0]} must reference exactly its packaged declaration map`,
    )
    const parsedMap = JSON.parse(await readFile(map, 'utf8'))
    assert.equal(parsedMap.file, basename(declaration), `${display([map])[0]} must identify its declaration owner`)
  }
  return {
    publicDeclarations: expectedDeclarations.length,
    publicDeclarationMaps: expectedDeclarationMaps.length,
    typeRuntimeFiles: runtimeTypeFiles.length,
  }
}

const invokedPath = process.argv[1] === undefined ? undefined : pathToFileURL(resolve(process.argv[1])).href
if (invokedPath === import.meta.url) {
  console.log(JSON.stringify(await assertPackageOutput(), null, 2))
}
