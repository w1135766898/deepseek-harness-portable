// Verifies that the git blob hashes recorded in README.i18n.yaml still match
// the actual README files, so the English and Chinese views stay in sync.
// Run with: pnpm run readme:check  (or: node scripts/check-readme-i18n.cjs)
'use strict'
const { execFileSync } = require('node:child_process')
const { readFileSync } = require('node:fs')
const { join } = require('node:path')

const root = join(__dirname, '..')
const yamlPath = join(root, 'README.i18n.yaml')
const yaml = readFileSync(yamlPath, 'utf8')

const entries = []
for (const line of yaml.split(/\r?\n/)) {
  const match = /^([A-Za-z0-9_.-]+\.[A-Za-z0-9_.-]+):\s+([0-9a-f]{40})\s*$/.exec(line)
  if (match) entries.push({ file: match[1], expected: match[2] })
}

if (entries.length === 0) {
  console.error('No hash entries found in README.i18n.yaml')
  process.exit(1)
}

let failed = false
for (const entry of entries) {
  const file = entry.file
  const expected = entry.expected
  let actual
  try {
    actual = execFileSync('git', ['hash-object', '--', file], {
      cwd: root,
      encoding: 'utf8',
    }).trim()
  } catch {
    console.error('  ✗ ' + file + ': could not hash (is git available?)')
    failed = true
    continue
  }
  if (actual.toLowerCase() === expected.toLowerCase()) {
    console.log('  ✓ ' + file + ' matches README.i18n.yaml')
  } else {
    console.error(
      '  ✗ ' + file + ' is out of sync\n' +
      '    recorded: ' + expected + '\n' +
      '    actual:   ' + actual + '\n' +
      '    Refresh the value with: git hash-object ' + file,
    )
    failed = true
  }
}

if (failed) {
  console.error('README.i18n.yaml is out of date; refresh the hashes after editing either README.')
  process.exit(1)
}
console.log('README.i18n.yaml is up to date.')
