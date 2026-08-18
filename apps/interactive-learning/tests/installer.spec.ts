import { afterEach, describe, expect, it } from 'vitest'
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  installLearningPreset,
  uninstallLearningPreset,
} from '../src/installer.ts'

const roots: string[] = []

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'dsh-learning-installer-'))
  roots.push(root)
  const source = join(root, 'source')
  const home = join(root, 'home')
  await mkdir(join(source, 'skills', 'teaching', 'references'), { recursive: true })
  await writeFile(join(source, 'agent.cordis.yml'), 'version: one\n')
  await writeFile(join(source, 'preset.yml'), 'name: Learning\n')
  await writeFile(join(source, 'skills', 'teaching', 'SKILL.md'), '# Teach\n')
  await writeFile(join(source, 'skills', 'teaching', 'references', 'visual-routing.md'), '# Visual routing\n')
  await writeFile(join(source, 'skills', 'teaching', 'references', 'visual-protocol.md'), '# Visual protocol\n')
  await writeFile(join(source, 'skills', 'teaching', 'references', 'reference-materials.md'), '# Reference materials\n')
  return { root, source, home, target: join(home, '.agent-presets', 'learning') }
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

describe('managed preset lifecycle', () => {
  it('installs progressive-disclosure Skill references as managed files', async () => {
    const fx = await fixture()
    const result = await installLearningPreset({ dshHome: fx.home, source: fx.source })
    for (const name of ['visual-routing.md', 'visual-protocol.md', 'reference-materials.md']) {
      const relative = `skills/teaching/references/${name}`
      expect(result.installed).toContain(relative)
      expect(await readFile(join(fx.target, relative), 'utf8')).toMatch(/^# /)
    }
  })

  it('updates unchanged owned files', async () => {
    const fx = await fixture()
    await installLearningPreset({ dshHome: fx.home, source: fx.source })
    await writeFile(join(fx.source, 'agent.cordis.yml'), 'version: two\n')
    const result = await installLearningPreset({ dshHome: fx.home, source: fx.source })
    expect(result.updated).toContain('agent.cordis.yml')
    expect(await readFile(join(fx.target, 'agent.cordis.yml'), 'utf8')).toBe('version: two\n')
  })

  it('preserves user edits, stages the new package copy, and removes only owned hashes', async () => {
    const fx = await fixture()
    await installLearningPreset({ dshHome: fx.home, source: fx.source })
    await writeFile(join(fx.target, 'agent.cordis.yml'), 'user: customized\n')
    await writeFile(join(fx.source, 'agent.cordis.yml'), 'version: two\n')

    const upgraded = await installLearningPreset({ dshHome: fx.home, source: fx.source })
    expect(upgraded.preserved).toContain('agent.cordis.yml')
    expect(upgraded.staged[0]).toMatch(/^agent\.cordis\.yml\.dsh-new-/)
    expect(await readFile(join(fx.target, 'agent.cordis.yml'), 'utf8')).toBe('user: customized\n')

    const manifest = JSON.parse(await readFile(join(fx.target, '.dsh-managed.json'), 'utf8')) as {
      presetSchema?: unknown
      userModified?: unknown
      preservedFiles?: Array<{ path: string; stagedPath: string }>
    }
    expect(manifest).toMatchObject({ presetSchema: 1, userModified: true })
    expect(manifest.preservedFiles?.[0]?.path).toBe('agent.cordis.yml')

    const repeated = await installLearningPreset({ dshHome: fx.home, source: fx.source })
    expect(repeated.staged).toEqual([])
    expect((await readdir(fx.target)).filter(name => name.startsWith('agent.cordis.yml.dsh-new-'))).toHaveLength(1)

    const removed = await uninstallLearningPreset({ dshHome: fx.home })
    expect(removed.manifestFound).toBe(true)
    expect(removed.removed).toContain('preset.yml')
    expect(removed.preserved).toContain('agent.cordis.yml')
    expect(await readFile(join(fx.target, 'agent.cordis.yml'), 'utf8')).toBe('user: customized\n')
  })

  it('does nothing without an ownership manifest', async () => {
    const fx = await fixture()
    await mkdir(fx.target, { recursive: true })
    await writeFile(join(fx.target, 'mine.yml'), 'user-owned\n')
    const result = await uninstallLearningPreset({ dshHome: fx.home })
    expect(result).toMatchObject({ manifestFound: false, removed: [] })
    expect(await readFile(join(fx.target, 'mine.yml'), 'utf8')).toBe('user-owned\n')
  })
})
