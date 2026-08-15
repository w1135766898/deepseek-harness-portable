#!/usr/bin/env node

const { parseSemver, isValidSemver, compareSemver } = require('./semver.cjs')

function main() {
  const args = process.argv.slice(2)
  const command = args[0]

  if (!command) {
    console.error('Usage: semver-cli <compare|validate|parse> [args...]')
    process.exit(1)
  }

  if (command === 'compare') {
    const left = args[1]
    const right = args[2]
    if (left === undefined || right === undefined) {
      console.error('Usage: semver-cli compare <version1> <version2>')
      process.exit(1)
    }

    try {
      const result = compareSemver(left, right)
      process.stdout.write(`${result}\n`)
      process.exit(0)
    } catch (error) {
      console.error(`semver-cli compare error: ${error.message}`)
      process.exit(1)
    }
  } else if (command === 'validate') {
    const version = args[1]
    if (version === undefined) {
      console.error('Usage: semver-cli validate <version>')
      process.exit(1)
    }

    if (isValidSemver(version)) {
      process.stdout.write('valid\n')
      process.exit(0)
    } else {
      process.stdout.write('invalid\n')
      process.exit(1)
    }
  } else if (command === 'parse') {
    const version = args[1]
    if (version === undefined) {
      console.error('Usage: semver-cli parse <version>')
      process.exit(1)
    }

    const parsed = parseSemver(version)
    if (parsed) {
      process.stdout.write(`${JSON.stringify(parsed)}\n`)
      process.exit(0)
    } else {
      console.error(`Invalid semver: ${version}`)
      process.exit(1)
    }
  } else {
    console.error(`Unknown command: ${command}`)
    process.exit(1)
  }
}

if (require.main === module) {
  main()
}

module.exports = { main }
