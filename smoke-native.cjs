// Cross-platform native-addon smoke for the packaged desktop runtime. Run with
// the target Electron executable in Node mode. Exercises node-pty, koffi, and
// sharp against the exact Electron ABI shipped to users.
'use strict'

const { existsSync, readFileSync } = require('node:fs')
const { join, resolve } = require('node:path')

const APP = resolve(process.argv[2] || join(__dirname, 'resources', 'app'))
const results = []
const tasks = []

function check(name, fn) {
  const task = Promise.resolve()
    .then(() => fn())
    .then(
      value => results.push(`PASS ${name}: ${value}`),
      error => results.push(`FAIL ${name}: ${error instanceof Error ? error.message : String(error)}`),
    )
  tasks.push(task)
}

check('runtime identity', () => `${process.execPath} | node ${process.version} | abi ${process.versions.modules} | electron ${process.versions.electron ?? 'n/a'}`)

check('marketplace and embedded plugin toolchain', () => {
  const marketplaceRoot = join(APP, 'node_modules', 'dsh-plugin-marketplace')
  const manifest = JSON.parse(readFileSync(join(marketplaceRoot, 'package.json'), 'utf8'))
  const required = [
    join(marketplaceRoot, 'cordis.patch.yml'),
    join(marketplaceRoot, 'lib', 'index.js'),
    join(marketplaceRoot, 'lib', 'client.js'),
    join(APP, 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js'),
    join(APP, 'node_modules', 'pnpm', 'bin', 'pnpm.cjs'),
  ]
  const missing = required.filter(path => !existsSync(path))
  if (missing.length > 0) throw new Error(`missing ${missing.join(', ')}`)
  if (manifest.name !== 'dsh-plugin-marketplace' || manifest.dsh?.bundle?.patch === undefined || manifest.dsh?.client === undefined) {
    throw new Error('marketplace package does not declare both host bundle and web client faces')
  }
  return `${manifest.name}@${manifest.version} with embedded dsh/pnpm`
})

check('node-pty load', () => {
  const pty = require(join(APP, 'node_modules', 'node-pty'))
  if (typeof pty.spawn !== 'function') throw new Error('spawn is not a function')
  return 'pty.spawn available'
})

check('node-pty real session', () => new Promise((resolve, reject) => {
  const pty = require(join(APP, 'node_modules', 'node-pty'))
  const command = process.platform === 'win32' ? 'cmd.exe' : '/bin/bash'
  const args = process.platform === 'win32'
    ? ['/d', '/s', '/c', 'echo PTY_OK']
    : ['--noprofile', '--norc', '-c', 'printf PTY_OK']
  const child = pty.spawn(command, args, {
    cols: 80, rows: 24, name: 'xterm', cwd: process.env.TEMP || process.cwd(),
  })
  let output = ''
  const timeout = setTimeout(() => reject(new Error(`timed out; output=${JSON.stringify(output.slice(0, 100))}`)), 20_000)
  child.onData((data) => {
    output += data
    if (output.includes('PTY_OK')) {
      clearTimeout(timeout)
      child.kill()
      resolve(`pty echoed through ConPTY: ${JSON.stringify(output.trim().slice(0, 60))}`)
    }
  })
  child.onExit(({ exitCode }) => {
    clearTimeout(timeout)
    if (!output.includes('PTY_OK')) reject(new Error(`exit ${exitCode}; output=${JSON.stringify(output.slice(0, 100))}`))
  })
}))

check('koffi FFI call', () => {
  const koffi = require(join(APP, 'node_modules', 'koffi'))
  const library = process.platform === 'win32'
    ? koffi.load('kernel32.dll')
    : koffi.load(process.platform === 'darwin' ? '/usr/lib/libSystem.B.dylib' : 'libc.so.6')
  const getPid = process.platform === 'win32'
    ? library.func('unsigned int __stdcall GetCurrentProcessId()')
    : library.func('int getpid()')
  const pid = getPid()
  if (typeof pid !== 'number' || pid === 0) throw new Error(`bad pid ${pid}`)
  return `${process.platform === 'win32' ? 'kernel32 GetCurrentProcessId' : 'libc getpid'}=${pid}`
})

if (process.platform === 'linux') {
  check('Landlock launcher payload', () => {
    const launcher = join(APP, 'node_modules', '@deepseek-ai', 'node-addon-landlock-run-linux-x64', 'bin', 'landlock-run')
    if (!existsSync(launcher)) throw new Error(`missing ${launcher}`)
    return launcher
  })
}

check('sharp resize', () => new Promise((resolve, reject) => {
  const sharp = require(join(APP, 'node_modules', 'sharp'))
  sharp({ create: { width: 2, height: 2, channels: 3, background: { r: 255, g: 0, b: 0 } } })
    .resize(1, 1)
    .png()
    .toBuffer()
    .then(buffer => resolve(`1x1 png bytes=${buffer.length}`), reject)
}))

Promise.all(tasks).then(() => {
  for (const line of results) console.log(line)
  const failed = results.some(line => line.startsWith('FAIL'))
  console.log(failed ? 'SMOKE_RESULT: FAIL' : 'SMOKE_RESULT: PASS')
  process.exit(failed ? 1 : 0)
}).catch(error => {
  console.error(`Smoke suite execution failed: ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
})
