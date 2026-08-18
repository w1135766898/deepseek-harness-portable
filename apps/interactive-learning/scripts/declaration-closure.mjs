import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'

// This deliberately recognizes every quoted relative declaration reference.
// It covers import/export/from/import() and triple-slash path references while
// remaining fail-closed if a future declaration form also uses a relative path.
const RELATIVE_DECLARATION_REFERENCE = /["'](\.{1,2}\/[^"'?#]+)["']/g

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

function declarationTarget(value, label) {
  assert.equal(typeof value, 'string', `${label} must be a string`)
  const normalized = value.replace(/^\.\//, '').replaceAll('\\', '/')
  assert.ok(
    normalized.startsWith('lib/types/')
      && normalized.endsWith('.d.ts')
      && !normalized.includes('../'),
    `${label} must name a declaration under lib/types: ${value}`,
  )
  return normalized
}

export function publicDeclarationEntries(manifest) {
  const targets = [declarationTarget(manifest.types, 'package.types')]
  for (const [name, entry] of Object.entries(manifest.exports ?? {})) {
    if (typeof entry !== 'object' || entry === null || !Object.hasOwn(entry, 'types')) continue
    targets.push(declarationTarget(entry.types, `package.exports[${JSON.stringify(name)}].types`))
  }
  return [...new Set(targets)].sort()
}

export async function publicDeclarationClosure(root, manifest) {
  const packageRoot = resolve(root)
  const declarationRoot = join(packageRoot, 'lib', 'types')
  const known = new Map((await collectRelativeFiles(declarationRoot))
    .filter(path => path.endsWith('.d.ts'))
    .map(path => [`lib/types/${path}`, join(declarationRoot, ...path.split('/'))]))
  const knownPaths = new Set(known.values())
  const roots = publicDeclarationEntries(manifest)
  const missing = roots.filter(path => !known.has(path))
  assert.deepEqual(missing, [], `missing public declaration entries:\n${missing.join('\n')}`)

  const pending = roots.map(path => known.get(path))
  const reachable = new Set()
  while (pending.length > 0) {
    const path = pending.pop()
    if (path === undefined || reachable.has(path)) continue
    reachable.add(path)
    const contents = await readFile(path, 'utf8')
    for (const match of contents.matchAll(RELATIVE_DECLARATION_REFERENCE)) {
      const specifier = match[1]
      const unresolved = resolve(dirname(path), specifier)
      const offset = relative(declarationRoot, unresolved)
      assert.ok(
        offset !== '..' && !offset.startsWith(`..${sep}`) && !isAbsolute(offset),
        `public declaration ${relative(packageRoot, path)} escapes lib/types via ${specifier}`,
      )
      const candidates = /\.(?:d\.ts|ts|tsx|js|jsx)$/.test(specifier)
        ? [unresolved.replace(/(?:\.d)?\.(?:ts|tsx|js|jsx)$/, '.d.ts')]
        : [`${unresolved}.d.ts`, join(unresolved, 'index.d.ts')]
      const target = candidates.find(candidate => knownPaths.has(candidate))
      assert.ok(
        target !== undefined,
        `public declaration ${relative(packageRoot, path)} imports missing ${specifier}`,
      )
      if (!reachable.has(target)) pending.push(target)
    }
  }
  return [...reachable]
    .map(path => relative(packageRoot, path).replaceAll('\\', '/'))
    .sort()
}

export function declarationMapClosure(declarations) {
  return declarations.map(path => `${path}.map`).sort()
}

export function assertManifestDeclarationFiles(manifest, declarations) {
  const listedDeclarations = (manifest.files ?? [])
    .filter(path => path.startsWith('lib/types/') && path.endsWith('.d.ts'))
    .sort()
  const listedMaps = (manifest.files ?? [])
    .filter(path => path.startsWith('lib/types/') && path.endsWith('.d.ts.map'))
    .sort()
  assert.deepEqual(
    listedDeclarations,
    [...declarations].sort(),
    'package.files declarations must exactly match the manifest-derived public declaration closure',
  )
  assert.deepEqual(
    listedMaps,
    declarationMapClosure(declarations),
    'package.files declaration maps must exactly match the public declaration closure',
  )
}
