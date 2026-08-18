import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, expect, it } from 'vitest'
import {
  assertGuardedPackageScripts,
  assertPublishedChunkReachability,
  assertPublishedPathPurity,
  assertWebClientInjectRoster,
  EXPECTED_WEB_CLIENT_INJECT,
} from './package-purity.mjs'
import {
  assertManifestDeclarationFiles,
  publicDeclarationClosure,
} from '../scripts/declaration-closure.mjs'

async function withFixture(contents: string, run: (lib: string, root: string) => Promise<void>): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), 'learning-purity-'))
  try {
    const lib = join(root, 'lib')
    await mkdir(lib)
    await writeFile(join(lib, 'client.js'), contents)
    await run(lib, root)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

describe('published package path purity', () => {
  it('keeps readiness injection limited to the audited web client module roster', async () => {
    const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
    expect(() => assertWebClientInjectRoster(manifest)).not.toThrow()
    expect(manifest.dsh.client.inject).toEqual(EXPECTED_WEB_CLIENT_INJECT)
    expect(manifest.dsh.client.inject).not.toContain('@deepseek-ai/dsh-client-ui-slots')

    expect(() => assertWebClientInjectRoster({
      dsh: {
        client: {
          platform: 'web',
          inject: [...EXPECTED_WEB_CLIENT_INJECT, '@deepseek-ai/dsh-client-ui-slots'],
        },
      },
    })).toThrow(/audited web client module roster/)
  })

  it('accepts package-relative virtual ids without mistaking CSS content for a drive path', async () => {
    await withFixture('//#region \\0dsh-css:src/client/View.module.css.mjs\nconst css="content:\\\"\\\""', async (lib, root) => {
      await expect(assertPublishedPathPurity(lib, { checkoutRoot: root })).resolves.toEqual({ filesScanned: 1 })
    })
  })

  it('rejects Windows build-machine paths', async () => {
    const emittedMap = JSON.stringify({ sources: ['C:\\Users\\builder\\checkout\\View.module.css.mjs'] })
    await withFixture(emittedMap, async (lib, root) => {
      await expect(assertPublishedPathPurity(lib, { checkoutRoot: root })).rejects.toThrow('Windows drive path')
    })
  })

  it('rejects the active checkout absolute path on every platform', async () => {
    await withFixture('', async (lib, root) => {
      await writeFile(join(lib, 'client.js.map'), JSON.stringify({ sources: [`${root.replaceAll('\\', '/')}/src/client.ts`] }))
      await expect(assertPublishedPathPurity(lib, { checkoutRoot: root })).rejects.toThrow()
    })
  })

  it('accepts reachable build chunks and rejects a stale hashed implementation', async () => {
    await withFixture('export { value } from "./eval-ABCDEFGH.js"', async (lib) => {
      await writeFile(join(lib, 'eval-ABCDEFGH.js'), 'export const value = 1')
      const fixtureOptions = {
        manifest: { main: 'lib/client.js', exports: {}, bin: {} },
        typeFiles: [],
      }
      await expect(assertPublishedChunkReachability(lib, fixtureOptions)).resolves.toEqual({
        publicEntries: 1,
        stableFiles: 1,
        hashedChunks: 1,
        sourceMaps: 0,
      })

      await writeFile(join(lib, 'eval-IJKLMNOP.js'), 'export const retired = true')
      await expect(assertPublishedChunkReachability(lib, fixtureOptions)).rejects.toThrow(
        /published orphan hashed chunks[\s\S]*eval-IJKLMNOP\.js/,
      )
    })
  })

  it('rejects an unexpected stable JavaScript file outside the package allowlist', async () => {
    await withFixture('export const client = true', async (lib) => {
      await writeFile(join(lib, 'stable.js'), 'export const unexpected = true')
      await expect(assertPublishedChunkReachability(lib, {
        manifest: { main: 'lib/client.js', exports: {}, bin: {} },
        typeFiles: [],
      })).rejects.toThrow(/published unexpected stable JS files[\s\S]*stable\.js/)
    })
  })

  it('rejects a missing manifest entry and a missing relative import', async () => {
    await withFixture('export const client = true', async (lib) => {
      await expect(assertPublishedChunkReachability(lib, {
        manifest: {
          main: 'lib/client.js',
          exports: { './agent': { default: './lib/agent.js' } },
          bin: {},
        },
        typeFiles: [],
      })).rejects.toThrow(/published JS is missing expected files[\s\S]*agent\.js/)

      await writeFile(join(lib, 'client.js'), 'export { missing } from "./missing.js"')
      await expect(assertPublishedChunkReachability(lib, {
        manifest: { main: 'lib/client.js', exports: {}, bin: {} },
        typeFiles: [],
      })).rejects.toThrow(/published JS has missing relative imports[\s\S]*missing\.js/)
    })
  })

  it('rejects package scripts that bypass the guarded build or prepack checks', () => {
    const guarded = {
      scripts: {
        build: 'node scripts/build-package.mjs',
        bundle: 'pnpm run build',
        'package:prepare': 'pnpm run build && pnpm run test:package:purity && node scripts/assert-package-output.mjs',
        prepack: 'pnpm run package:prepare',
        prepublishOnly: 'pnpm run package:prepare',
      },
    }
    expect(() => assertGuardedPackageScripts(guarded)).not.toThrow()
    expect(() => assertGuardedPackageScripts({
      scripts: { ...guarded.scripts, bundle: 'tsdown' },
    })).toThrow()
    expect(() => assertGuardedPackageScripts({
      scripts: { ...guarded.scripts, prepack: 'echo unchecked' },
    })).toThrow()
    expect(() => assertGuardedPackageScripts({
      scripts: { ...guarded.scripts, 'package:prepare': 'pnpm run test:package:purity' },
    })).toThrow()
    expect(() => assertGuardedPackageScripts({
      scripts: { ...guarded.scripts, prepublishOnly: 'echo unchecked' },
    })).toThrow()
  })

  it('rejects an orphan source map even when its matching stable JS exists', async () => {
    await withFixture('export const client = true', async (lib) => {
      await writeFile(join(lib, 'client.js.map'), JSON.stringify({ version: 3, sources: [] }))
      await expect(assertPublishedChunkReachability(lib, {
        manifest: { main: 'lib/client.js', exports: {}, bin: {} },
        typeFiles: [],
      })).rejects.toThrow(/published orphan source maps[\s\S]*client\.js\.map/)
    })
  })

  it('rejects an unlisted relative declaration dependency discovered from the emitted graph', async () => {
    const root = await mkdtemp(join(tmpdir(), 'learning-declarations-'))
    try {
      const types = join(root, 'lib', 'types')
      await mkdir(types, { recursive: true })
      await writeFile(join(types, 'index.d.ts'), [
        "import type { A } from './a.ts'",
        "export type { B } from './b.js'",
        "export type C = import('./c.tsx').C",
        '/// <reference path="./d.d.ts" />',
      ].join('\n'))
      for (const name of ['a', 'b', 'c', 'd']) {
        await writeFile(join(types, `${name}.d.ts`), `export interface ${name.toUpperCase()} { value: string }`)
      }
      const manifest = {
        types: 'lib/types/index.d.ts',
        exports: {},
        files: ['lib/types/index.d.ts', 'lib/types/index.d.ts.map'],
      }
      const closure = await publicDeclarationClosure(root, manifest)
      expect(closure).toEqual([
        'lib/types/a.d.ts',
        'lib/types/b.d.ts',
        'lib/types/c.d.ts',
        'lib/types/d.d.ts',
        'lib/types/index.d.ts',
      ])
      expect(() => assertManifestDeclarationFiles(manifest, closure)).toThrow(
        /package\.files declarations must exactly match.*closure/,
      )
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
