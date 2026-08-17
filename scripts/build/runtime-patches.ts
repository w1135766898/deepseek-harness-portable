import { readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { join, resolve } from 'node:path'
import {
  attestPatchedFile,
  loadPatchManifest,
  patchApplies,
  patchStatus,
  type PatchAttestation,
  type PatchDefinition,
} from './patch-manifest.js'

const require = createRequire(import.meta.url)
const { patchWelcomeNoticeStore } = require('../../patches/dsh-client-ui-settings-models-welcome-store.js') as {
  patchWelcomeNoticeStore(source: string): string
}
const { patchMarketplaceSelfUpdate } = require('../../patches/dsh-plugin-marketplace-self-update.js') as {
  patchMarketplaceSelfUpdate(source: string): string
}

export interface RuntimePatchOptions {
  readonly root: string
  readonly staging: string
  readonly targetId: string
  readonly dryRun?: boolean
}

function definitionById(definitions: readonly PatchDefinition[], id: string): PatchDefinition {
  const definition = definitions.find(item => item.id === id)
  if (definition === undefined) throw new Error(`patch manifest does not declare required patch ${id}`)
  return definition
}

export function patchDirectoryPickerWorker(source: string): string {
  let output = source
  const oldReadUtf16 = `function readUtf16(koffi, address) {\n\tconst bytes = Buffer.from(koffi.view(address, 32768));\n\tlet end = 0;\n\twhile (end + 1 < bytes.length && bytes[end] !== 0) end += 2;\n\treturn bytes.toString("utf16le", 0, end);\n}`
  const newReadUtf16 = `function readUtf16(koffi, address) {\n\treturn koffi.decode.string16(address);\n}`
  const oldPost = `const post = (message) => {\n\t/* v8 ignore next 3 -- disconnect needs a live IPC channel the unit lane must not sever (built-worker.e2e.ts owns the real close path). */\n\tsend(message, () => {\n\t\tif (process.connected) process.disconnect();\n\t});\n};`
  const newPost = `const post = (message) => {\n\tsend(message);\n};`
  if (output.includes(oldReadUtf16)) output = output.replace(oldReadUtf16, newReadUtf16)
  if (output.includes(oldPost)) output = output.replace(oldPost, newPost)
  if (!output.includes(newReadUtf16) || !output.includes(newPost)) {
    throw new Error('directory-picker worker no longer matches the reviewed memory/IPC implementation')
  }
  if (!output.includes('DSH_DIRECTORY_PICKER_IPC_PROBE')) {
    const disconnect = `process.on("disconnect", () => process.exit(0));`
    const probe = `${disconnect}\nconst ipcProbe = process.env.DSH_DIRECTORY_PICKER_IPC_PROBE === "1";\nif (ipcProbe) post({ kind: "probe", protocolVersion: 1 });`
    if (!output.includes(disconnect)) throw new Error('directory-picker worker disconnect marker is missing')
    output = output.replace(disconnect, probe)
    const launch = `(async () => {`
    if (!output.includes(launch)) throw new Error('directory-picker worker launch marker is missing')
    output = output.replace(launch, `if (!ipcProbe) ${launch}`)
  }
  return output
}

async function applyDefinition(
  options: RuntimePatchOptions,
  definition: PatchDefinition,
  transforms: Readonly<Record<string, (source: string) => string>>,
): Promise<PatchAttestation> {
  if (!patchApplies(definition, options.targetId)) return { id: definition.id, status: 'not-applicable', files: [] }
  const results: Array<{ changed: boolean; attestation: PatchAttestation['files'][number] }> = []
  for (const file of definition.files) {
    const target = join(options.staging, ...file.path.split('/'))
    const transform = transforms[file.path]
    if (transform === undefined) throw new Error(`patch ${definition.id} has no implementation for ${file.path}`)
    if (options.dryRun) {
      console.log(`runtime-patches: [dry-run] ${definition.id} -> ${target}`)
      continue
    }
    const result = attestPatchedFile(definition, file, await readFile(target, 'utf8'), transform)
    if (result.changed) await writeFile(target, result.output)
    results.push({ changed: result.changed, attestation: result.attestation })
  }
  return {
    id: definition.id,
    status: options.dryRun ? 'applied' : patchStatus(results),
    files: results.map(result => result.attestation),
  }
}

/** Apply the reviewed runtime patch layer and return its input/output hash attestations. */
export async function applyRuntimePatchLayer(options: RuntimePatchOptions): Promise<readonly PatchAttestation[]> {
  const definitions = await loadPatchManifest(resolve(options.root, 'patches/manifest.yml'))
  const directoryPicker = definitionById(definitions, 'directory-picker-electron-ipc')
  const welcome = definitionById(definitions, 'settings-model-welcome-retry')
  const marketplace = definitionById(definitions, 'marketplace-self-update-fallback')
  const directoryIndex = await readFile(resolve(options.root, 'patches/dsh-host-directory-picker-native-index.js'), 'utf8')
  const attestations = await Promise.all([
    applyDefinition(options, directoryPicker, {
      'node_modules/@deepseek-ai/dsh-host-directory-picker-native/lib/index.js': () => directoryIndex,
      'node_modules/@deepseek-ai/dsh-host-directory-picker-native/lib/worker.cjs': patchDirectoryPickerWorker,
    }),
    applyDefinition(options, welcome, {
      'node_modules/@deepseek-ai/dsh-client-ui-settings-models/lib/client.js': source => (
        source.includes('scheduleRetry(operation)') ? source : patchWelcomeNoticeStore(source)
      ),
    }),
    applyDefinition(options, marketplace, {
      'node_modules/dsh-plugin-marketplace/lib/index.js': patchMarketplaceSelfUpdate,
    }),
  ])
  const declared = new Set(definitions.map(item => item.id))
  const implemented = new Set(attestations.map(item => item.id))
  const missing = [...declared].filter(id => !implemented.has(id))
  if (missing.length > 0) throw new Error(`patch manifest contains unimplemented patch(es): ${missing.join(', ')}`)
  return attestations
}
