// Native-addon smoke for the packaged DeepSeek Harness desktop runtime.
// Run with the packaged Electron binary in Node mode:
//   ELECTRON_RUN_AS_NODE=1 "DeepSeek Harness.exe" smoke-native.cjs
// Exercises the three Windows-native addons the web closure loads lazily:
// node-pty (persistent PTY shell), koffi (windows-acl sandbox FFI), sharp
// (attachment image processing).
'use strict'

const { join } = require('node:path')

const APP = process.argv[2] || join(__dirname, 'resources', 'app')
const results = []

function check(name, fn) {
  try {
    const value = fn()
    if (value && typeof value.then === 'function') {
      value.then(v => results.push(`PASS ${name}: ${v}`), e => results.push(`FAIL ${name}: ${e.message}`))
    } else {
      results.push(`PASS ${name}: ${value}`)
    }
  } catch (error) {
    results.push(`FAIL ${name}: ${error.message}`)
  }
}

check('runtime identity', () => `${process.execPath} | node ${process.version} | abi ${process.versions.modules} | electron ${process.versions.electron ?? 'n/a'}`)

check('node-pty load', () => {
  const pty = require(join(APP, 'node_modules', 'node-pty'))
  if (typeof pty.spawn !== 'function') throw new Error('spawn is not a function')
  return 'pty.spawn available'
})

check('node-pty real session', () => new Promise((resolve, reject) => {
  const pty = require(join(APP, 'node_modules', 'node-pty'))
  const child = pty.spawn('cmd.exe', ['/d', '/s', '/c', 'echo PTY_OK'], {
    cols: 80, rows: 24, name: 'xterm', cwd: process.env.TEMP,
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
  const kernel32 = koffi.load('kernel32.dll')
  const getPid = kernel32.func('unsigned int __stdcall GetCurrentProcessId()')
  const pid = getPid()
  if (typeof pid !== 'number' || pid === 0) throw new Error(`bad pid ${pid}`)
  return `kernel32 GetCurrentProcessId=${pid}`
})

check('sharp resize', () => new Promise((resolve, reject) => {
  const sharp = require(join(APP, 'node_modules', 'sharp'))
  sharp({ create: { width: 2, height: 2, channels: 3, background: { r: 255, g: 0, b: 0 } } })
    .resize(1, 1)
    .png()
    .toBuffer()
    .then(buffer => resolve(`1x1 png bytes=${buffer.length}`), reject)
}))

setTimeout(() => {
  for (const line of results) console.log(line)
  const failed = results.some(line => line.startsWith('FAIL'))
  console.log(failed ? 'SMOKE_RESULT: FAIL' : 'SMOKE_RESULT: PASS')
  process.exit(failed ? 1 : 0)
}, 100)
