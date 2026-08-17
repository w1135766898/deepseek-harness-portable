import assert from 'node:assert/strict'
import { test } from 'node:test'
import { patchDirectoryPickerWorker } from './runtime-patches.js'

test('directory-picker worker patch adds a non-interactive versioned IPC probe', () => {
  const source = [
    'function readUtf16(koffi, address) {',
    '\tconst bytes = Buffer.from(koffi.view(address, 32768));',
    '\tlet end = 0;',
    '\twhile (end + 1 < bytes.length && bytes[end] !== 0) end += 2;',
    '\treturn bytes.toString("utf16le", 0, end);',
    '}',
    'const post = (message) => {',
    '\t/* v8 ignore next 3 -- disconnect needs a live IPC channel the unit lane must not sever (built-worker.e2e.ts owns the real close path). */',
    '\tsend(message, () => {',
    '\t\tif (process.connected) process.disconnect();',
    '\t});',
    '};',
    'process.on("disconnect", () => process.exit(0));',
    '(async () => {',
    '  post({ kind: "result" });',
    '})();',
  ].join('\n')
  const output = patchDirectoryPickerWorker(source)
  assert.match(output, /DSH_DIRECTORY_PICKER_IPC_PROBE/)
  assert.match(output, /post\(\{ kind: "probe", protocolVersion: 1 \}\)/)
  assert.match(output, /if \(!ipcProbe\) \(async \(\) => \{/)
  assert.match(output, /koffi\.decode\.string16/)
  assert.doesNotMatch(output, /process\.disconnect/)
})
