#!/usr/bin/env node
import { installLearningPreset, uninstallLearningPreset } from './installer.ts'

function usage(): never {
  console.error('Usage: dsh-learning-preset <install|uninstall> [--home <DSH_HOME>]')
  process.exit(2)
}

const args = process.argv.slice(2)
const command = args.shift()
let dshHome: string | undefined
while (args.length > 0) {
  const flag = args.shift()
  if (flag !== '--home' || args.length === 0) usage()
  dshHome = args.shift()
}

if (command === 'install') {
  const result = await installLearningPreset({ ...(dshHome === undefined ? {} : { dshHome }) })
  console.log(JSON.stringify(result, null, 2))
} else if (command === 'uninstall') {
  const result = await uninstallLearningPreset({ ...(dshHome === undefined ? {} : { dshHome }) })
  console.log(JSON.stringify(result, null, 2))
} else {
  usage()
}
