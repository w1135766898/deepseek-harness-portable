import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const yaml = require('js-yaml') as { load(source: string): unknown }

export type PatchStatus = 'applied' | 'already-upstream' | 'not-applicable' | 'conflict'

export interface PatchFileDefinition {
  readonly path: string
  readonly guards: readonly string[]
}

export interface PatchDefinition {
  readonly id: string
  readonly targets: readonly string[]
  readonly files: readonly PatchFileDefinition[]
}

export interface PatchFileAttestation {
  readonly path: string
  readonly inputSha256: string
  readonly outputSha256: string
}

export interface PatchAttestation {
  readonly id: string
  readonly status: Exclude<PatchStatus, 'conflict'>
  readonly files: readonly PatchFileAttestation[]
}

export class PatchConflictError extends Error {
  readonly code = 'PATCH_CONFLICT'
  readonly status = 'conflict' as const

  constructor(
    readonly patchId: string,
    readonly file: string,
    readonly inputSha256: string,
    cause: unknown,
  ) {
    super(`patch ${patchId} conflicts with ${file} (input sha256 ${inputSha256}): ${String(cause)}`, { cause })
  }
}

function sha256(source: string | Buffer): string {
  return createHash('sha256').update(source).digest('hex')
}

function strings(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || value.length === 0 || value.some(item => typeof item !== 'string' || item.length === 0)) {
    throw new Error(`${label} must be a non-empty string array`)
  }
  return value
}

/** Read and validate the reviewed patch inventory. */
export async function loadPatchManifest(path: string): Promise<readonly PatchDefinition[]> {
  const raw = yaml.load(await readFile(path, 'utf8'))
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new Error(`${path}: patch manifest must be an object`)
  const record = raw as Record<string, unknown>
  if (record.schemaVersion !== 1 || !Array.isArray(record.patches)) {
    throw new Error(`${path}: patch manifest requires schemaVersion 1 and patches[]`)
  }
  const ids = new Set<string>()
  return record.patches.map((value, index): PatchDefinition => {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      throw new Error(`${path}: patch ${String(index + 1)} must be an object`)
    }
    const patch = value as Record<string, unknown>
    if (typeof patch.id !== 'string' || patch.id.length === 0 || ids.has(patch.id)) {
      throw new Error(`${path}: patch ${String(index + 1)} has a missing or duplicate id`)
    }
    ids.add(patch.id)
    if (!Array.isArray(patch.files) || patch.files.length === 0) throw new Error(`${path}: patch ${patch.id} requires files[]`)
    return {
      id: patch.id,
      targets: strings(patch.targets, `${path}: ${patch.id}.targets`),
      files: patch.files.map((file, fileIndex): PatchFileDefinition => {
        if (typeof file !== 'object' || file === null || Array.isArray(file)) {
          throw new Error(`${path}: ${patch.id}.files[${String(fileIndex)}] must be an object`)
        }
        const entry = file as Record<string, unknown>
        if (typeof entry.path !== 'string' || entry.path.length === 0) {
          throw new Error(`${path}: ${patch.id}.files[${String(fileIndex)}].path must be a string`)
        }
        return { path: entry.path, guards: strings(entry.guards, `${path}: ${patch.id}.${entry.path}.guards`) }
      }),
    }
  })
}

export function patchApplies(definition: PatchDefinition, targetId: string): boolean {
  return definition.targets.includes('*') || definition.targets.includes(targetId)
}

/** Guard, transform and hash one patch file; every mismatch is a typed conflict. */
export function attestPatchedFile(
  definition: PatchDefinition,
  file: PatchFileDefinition,
  input: string,
  transform: (source: string) => string,
): { output: string; attestation: PatchFileAttestation; changed: boolean } {
  const inputSha256 = sha256(input)
  try {
    const missingGuards = file.guards.filter(marker => !input.includes(marker))
    if (missingGuards.length > 0) throw new Error(`missing reviewed guard(s): ${missingGuards.join(', ')}`)
    const output = transform(input)
    if (typeof output !== 'string' || output.length === 0) throw new Error('transform returned an empty or invalid output')
    const outputSha256 = sha256(output)
    return {
      output,
      changed: inputSha256 !== outputSha256,
      attestation: { path: file.path, inputSha256, outputSha256 },
    }
  } catch (error) {
    throw new PatchConflictError(definition.id, file.path, inputSha256, error)
  }
}

export function patchStatus(files: readonly { changed: boolean }[]): 'applied' | 'already-upstream' {
  return files.some(file => file.changed) ? 'applied' : 'already-upstream'
}
