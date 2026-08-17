/** Build and checksum the unsigned Apple Silicon macOS DMG release. */

import { createHash } from 'node:crypto'
import { spawn } from 'node:child_process'
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const releaseDir = join(root, 'release')
const desktopManifest = join(root, 'apps', 'desktop', 'package.json')
const buildScript = join(root, 'scripts', 'build-desktop-web-exe.ts')

function distributionVersion(): string {
  const manifest = JSON.parse(readFileSync(desktopManifest, 'utf8')) as { distributionVersion?: unknown }
  if (typeof manifest.distributionVersion !== 'string' || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(manifest.distributionVersion)) {
    throw new Error(`Invalid distributionVersion in ${desktopManifest}`)
  }
  return manifest.distributionVersion
}

function run(command: string, args: string[]): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      cwd: root,
      stdio: 'inherit',
      env: {
        ...process.env,
        CI: 'true',
        HUSKY: '0',
        LEFTHOOK: '0',
      },
    })
    child.once('error', reject)
    child.once('exit', (code, signal) => {
      if (code === 0) resolvePromise()
      else reject(new Error(`${command} failed (${code === null ? signal ?? 'signal' : `exit ${code}`})`))
    })
  })
}

async function sha256(path: string): Promise<string> {
  const hash = createHash('sha256')
  hash.update(await readFile(path))
  return hash.digest('hex').toUpperCase()
}

async function main(): Promise<void> {
  if (process.platform !== 'darwin') {
    throw new Error('The macOS release must be built on macOS; hdiutil and the arm64 Electron runtime are host tools.')
  }

  const argv = new Set(process.argv.slice(2))
  const version = distributionVersion()
  const dmgName = `DeepSeek-Harness-${version}-darwin-arm64.dmg`
  const builtDmg = join(root, 'dist-desktop', 'electron', dmgName)
  const releaseDmg = join(releaseDir, dmgName)

  await run('pnpm', ['run', 'desktop:test'])
  const buildArgs = [buildScript, '--electron', '--platform', 'darwin', '--arch', 'arm64', '--dmg']
  if (argv.has('--skip-build')) buildArgs.push('--skip-build')
  if (argv.has('--no-cache')) buildArgs.push('--no-cache')
  await run(process.execPath, [join(root, 'node_modules', '.pnpm', 'node_modules', '.bin', 'tsx'), ...buildArgs])

  if (!existsSync(builtDmg)) throw new Error(`Built DMG is missing: ${builtDmg}`)
  await mkdir(releaseDir, { recursive: true })
  await copyFile(builtDmg, releaseDmg)
  const digest = await sha256(releaseDmg)
  await writeFile(join(releaseDir, 'SHA256SUMS-darwin-arm64.txt'), `${digest} *${dmgName}\n`)
  console.log(`macOS release complete: ${releaseDmg}`)
  console.log(`SHA-256: ${digest}`)
  console.log('The DMG is intentionally unsigned and not notarized in this release lane.')
}

await main()
