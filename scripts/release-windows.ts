/** Build, archive, sign (when configured), and checksum the Windows release. */

import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { readFile, rm, writeFile } from 'node:fs/promises'
import { existsSync, readFileSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const releaseDir = join(root, 'release')
const desktopManifest = join(root, 'apps', 'desktop', 'package.json')
const defaultBuildRoot = join(root, 'dist-desktop', 'electron', 'DeepSeek Harness-win32-x64')

type Options = {
  input?: string
  skipBuild: boolean
  noSetup: boolean
  setupTemplate?: string
  pruneSources: boolean
}

function parseArgs(argv: string[]): Options {
  const options: Options = { skipBuild: false, noSetup: false, pruneSources: false }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--skip-build') options.skipBuild = true
    else if (arg === '--no-setup') options.noSetup = true
    else if (arg === '--prune-sources') options.pruneSources = true
    else if (arg === '--input') options.input = resolve(root, argv[++index] ?? '')
    else if (arg === '--setup-template') options.setupTemplate = resolve(root, argv[++index] ?? '')
    else if (arg === '--help') {
      console.log([
        'Usage: pnpm exec tsx scripts/release-windows.ts [options]',
        '',
        '  --input <dir>             package an existing portable root',
        '  --skip-build              do not run the Electron build first',
        '  --prune-sources           remove ordinary TypeScript sources during the build',
        '  --setup-template <exe>    replace the ZIP payload in an existing Setup.exe when ISCC is unavailable',
        '  --no-setup                emit only the ZIP and checksums',
      ].join('\n'))
      process.exit(0)
    } else {
      throw new Error(`Unknown option: ${arg}`)
    }
  }
  return options
}

function versionFromManifest(): string {
  const manifest = JSON.parse(readFileSync(desktopManifest, 'utf8')) as { version?: unknown }
  if (typeof manifest.version !== 'string' || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(manifest.version)) {
    throw new Error(`Invalid desktop package version in ${desktopManifest}`)
  }
  return manifest.version
}

async function run(command: string, args: string[]): Promise<void> {
  await new Promise<void>((resolvePromise, reject) => {
    const child = spawn(command, args, {
      cwd: root,
      stdio: 'inherit',
      shell: process.platform === 'win32' && command.toLowerCase().endsWith('.cmd'),
      env: { ...process.env, CI: 'true' },
    })
    child.once('error', reject)
    child.once('exit', (code, signal) => {
      if (code === 0) resolvePromise()
      else reject(new Error(`${command} failed (${code === null ? signal ?? 'signal' : `exit ${code}`})`))
    })
  })
}

function hashFile(path: string): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    const hash = createHash('sha256')
    const stream = createReadStream(path)
    stream.on('data', chunk => hash.update(chunk))
    stream.once('error', reject)
    stream.once('end', () => resolvePromise(hash.digest('hex').toUpperCase()))
  })
}

async function findIscc(): Promise<string | undefined> {
  const candidates = [
    process.env.ISCC_PATH,
    'C:\\Program Files (x86)\\Inno Setup 6\\ISCC.exe',
    'C:\\Program Files\\Inno Setup 6\\ISCC.exe',
  ].filter((candidate): candidate is string => Boolean(candidate))
  for (const candidate of candidates) if (existsSync(candidate)) return candidate
  return undefined
}

async function buildSetupFromTemplate(template: string, zipPath: string, output: string): Promise<void> {
  const [setup, zip] = await Promise.all([readFile(template), readFile(zipPath)])
  const offset = setup.indexOf(zip)
  if (offset < 0) throw new Error(`Setup template does not contain the exact ZIP payload: ${template}`)
  const secondOffset = setup.indexOf(zip, offset + 1)
  if (secondOffset >= 0) throw new Error(`Setup template contains multiple ZIP payloads: ${template}`)
  await writeFile(output, Buffer.concat([setup.subarray(0, offset), zip, setup.subarray(offset + zip.length)]))
}

async function writeChecksums(zipPath: string, setupPath?: string): Promise<void> {
  const files = [zipPath, setupPath].filter((path): path is string => Boolean(path && existsSync(path)))
  const lines: string[] = []
  for (const path of files) {
    const digest = await hashFile(path)
    const name = basename(path)
    lines.push(`${digest} *${name}`)
    await writeFile(`${path}.sha256`, `${digest} *${name}\n`)
  }
  const text = `${lines.join('\n')}\n`
  await writeFile(join(releaseDir, 'SHA256SUMS.txt'), text)
  await writeFile(join(root, 'SHA256SUMS.txt'), text)
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2))
  const version = versionFromManifest()
  const zipName = `DeepSeek-Harness-${version}-win32-x64.zip`
  const zipPath = join(releaseDir, zipName)
  await rm(zipPath, { force: true })

  if (!options.input && !options.skipBuild) {
    const buildArgs = ['exec', 'tsx', 'scripts/build-desktop-web-exe.ts', '--electron']
    if (options.pruneSources) buildArgs.push('--prune-sources')
    await run(process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm', buildArgs)
  }

  const buildRoot = options.input ?? defaultBuildRoot
  if (!existsSync(join(buildRoot, 'runtime', 'DeepSeek Harness.exe'))) {
    throw new Error(`Portable build root is missing runtime/DeepSeek Harness.exe: ${buildRoot}`)
  }
  await run('tar.exe', ['-a', '-c', '-f', zipPath, '-C', dirname(buildRoot), basename(buildRoot)])

  let setupPath: string | undefined
  if (!options.noSetup) {
    const iscc = await findIscc()
    setupPath = join(releaseDir, `DeepSeek-Harness-Setup-${version}-win32-x64.exe`)
    if (!options.setupTemplate || resolve(options.setupTemplate) !== resolve(setupPath)) {
      await rm(setupPath, { force: true })
    }
    if (iscc) {
      await run(iscc, [
        `/DMyAppVersion=${version}`,
        `/DMyZipName=${zipName}`,
        '/DMyReleaseDir=..\\release',
        '/DMyIconPath=..\\apps\\desktop\\assets\\deepseek.ico',
        join(root, 'scripts', 'setup.iss'),
      ])
    } else if (options.setupTemplate) {
      await buildSetupFromTemplate(options.setupTemplate, zipPath, setupPath)
    } else {
      throw new Error('ISCC.exe was not found. Install Inno Setup or pass --setup-template; use --no-setup for ZIP-only output.')
    }
  }

  await writeChecksums(zipPath, setupPath)
  console.log(`Release complete: ${zipPath}`)
  if (setupPath) console.log(`Setup complete: ${setupPath}`)
  console.log(`Checksums written last: ${join(root, 'SHA256SUMS.txt')}`)
}

await main()
