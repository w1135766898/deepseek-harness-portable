import { rcedit } from 'rcedit'

const [executablePath, iconPath] = process.argv.slice(2)

if (!executablePath || !iconPath) {
  throw new Error('Usage: node src/apply-icon.mjs <executable> <icon>')
}

await rcedit(executablePath, { icon: iconPath })
