import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { collectArtifactInventory } from './artifact-inventory.js'

test('artifact inventory is sorted, hashed, and excludes its recursive manifest', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-inventory-'))
  try {
    await mkdir(join(root, 'z'))
    await writeFile(join(root, 'z', 'b.txt'), 'b')
    await writeFile(join(root, 'a.txt'), 'a')
    await writeFile(join(root, 'release-manifest.json'), 'old')
    if (process.platform !== 'win32') await symlink('a.txt', join(root, 'link'))
    const files = await collectArtifactInventory(root)
    assert.deepEqual(files.map(file => file.path), process.platform === 'win32'
      ? ['a.txt', 'z/b.txt']
      : ['a.txt', 'link', 'z/b.txt'])
    assert.equal(files.every(file => /^[a-f0-9]{64}$/.test(file.sha256)), true)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
