import { createHash } from 'node:crypto'
import { lstat, readFile, readdir, readlink } from 'node:fs/promises'
import { join, relative, sep } from 'node:path'
import type { ReleaseFile } from '../../packages/release-manifest/src/index.js'

function sha256(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex')
}

function portablePath(root: string, path: string): string {
  return relative(root, path).split(sep).join('/')
}

function isGitBundle(bytes: Buffer): boolean {
  return bytes.subarray(0, 16).toString('ascii').startsWith('# v2 git bundle\n')
    || bytes.subarray(0, 16).toString('ascii').startsWith('# v3 git bundle\n')
}

/** Inventory final artifact bytes. The manifest itself is excluded to avoid a recursive digest. */
export async function collectArtifactInventory(root: string): Promise<readonly ReleaseFile[]> {
  const files: ReleaseFile[] = []
  const visit = async (directory: string): Promise<void> => {
    const entries = await readdir(directory, { withFileTypes: true })
    entries.sort((left, right) => left.name.localeCompare(right.name))
    for (const entry of entries) {
      const path = join(directory, entry.name)
      const releasePath = portablePath(root, path)
      if (entry.isDirectory()) {
        if (entry.name === '.git') {
          throw new Error(`Release artifact contains forbidden Git metadata: ${releasePath}/`)
        }
        await visit(path)
        continue
      }
      if (entry.name === 'release-manifest.json') continue
      const metadata = await lstat(path)
      if (entry.isSymbolicLink()) {
        const target = await readlink(path)
        files.push({ path: releasePath, type: 'symlink', size: Buffer.byteLength(target), sha256: sha256(target) })
      } else if (entry.isFile()) {
        const bytes = await readFile(path)
        if (isGitBundle(bytes)) {
          throw new Error(`Release artifact contains forbidden Git bundle: ${releasePath}`)
        }
        files.push({ path: releasePath, type: 'file', size: metadata.size, sha256: sha256(bytes) })
      }
    }
  }
  await visit(root)
  return files.sort((left, right) => left.path.localeCompare(right.path))
}
