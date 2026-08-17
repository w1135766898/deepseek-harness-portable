import { copyFile, mkdir, stat, writeFile } from 'node:fs/promises'
import { basename, join, resolve } from 'node:path'
import { sha256File, verifyArtifactBundle } from '../build/artifact-verification.js'

interface PublishOptions {
  readonly input: string
  readonly output: string
  readonly allowNonOfficial: boolean
}

function parse(argv: readonly string[]): PublishOptions {
  let input: string | undefined
  let output = resolve(process.cwd(), 'release')
  let allowNonOfficial = false
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--input') input = resolve(argv[++index] ?? '')
    else if (arg === '--output') output = resolve(argv[++index] ?? '')
    else if (arg === '--allow-non-official') allowNonOfficial = true
    else if (arg === '--help') {
      console.log('Usage: --input <verified-bundle> [--output <dir>] [--allow-non-official]')
      process.exit(0)
    } else throw new Error(`unknown release option: ${String(arg)}`)
  }
  if (input === undefined) throw new Error('--input <verified-bundle> is required; release jobs never build or retest')
  return { input, output, allowNonOfficial }
}

/** Publish exact verified bytes. This function cannot build, patch, sign, archive, or test. */
export async function publishVerifiedTarget(targetId: string, argv = process.argv.slice(2)): Promise<void> {
  const options = parse(argv)
  const record = await verifyArtifactBundle(options.input, targetId)
  if (record.distributionClassification !== 'official' && !options.allowNonOfficial) {
    throw new Error(
      `${targetId} is ${record.distributionClassification}; official publishing fails closed until signing/notarization evidence is attached`,
    )
  }
  await mkdir(options.output, { recursive: true })
  const checksumLines: string[] = []
  for (const artifact of record.artifacts) {
    const source = join(options.input, artifact.name)
    const destination = join(options.output, basename(artifact.name))
    await copyFile(source, destination)
    const metadata = await stat(destination)
    const verified = record.artifacts.find(item => item.name === artifact.name)
    if (verified === undefined || metadata.size !== verified.size) throw new Error(`published artifact size changed: ${artifact.name}`)
    if (await sha256File(destination) !== artifact.sha256) throw new Error(`published artifact bytes changed during copy: ${artifact.name}`)
    checksumLines.push(`${artifact.sha256.toUpperCase()} *${artifact.name}`)
  }
  await copyFile(join(options.input, 'artifact-verification.json'), join(options.output, `artifact-verification-${targetId}.json`))
  await writeFile(join(options.output, `SHA256SUMS-${targetId}.txt`), `${checksumLines.join('\n')}\n`)
  console.log(`published ${record.artifacts.length} immutable ${targetId} artifact(s) to ${options.output}`)
}
