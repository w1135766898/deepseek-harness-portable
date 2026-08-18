import { lstat, readFile, readdir } from 'node:fs/promises'
import { basename, join, relative, sep } from 'node:path'
import { TextDecoder, TextEncoder } from 'node:util'

const CENTRAL_HEADER = 0x02014b50
const LOCAL_HEADER = 0x04034b50
const END_OF_CENTRAL_DIRECTORY = 0x06054b50
const UTF8_NAME_FLAG = 0x0800

function comparePaths(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

function requireRange(buffer: Buffer, offset: number, length: number, label: string): void {
  if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(length) || offset < 0 || length < 0 || offset + length > buffer.length) {
    throw new Error(`Windows ZIP ${label} extends outside the archive`)
  }
}

function endOfCentralDirectory(buffer: Buffer): number {
  if (buffer.length < 22) throw new Error('Windows ZIP is shorter than its end-of-central-directory record')
  const minimum = Math.max(0, buffer.length - 65_557)
  for (let offset = buffer.length - 22; offset >= minimum; offset -= 1) {
    if (buffer.readUInt32LE(offset) !== END_OF_CENTRAL_DIRECTORY) continue
    requireRange(buffer, offset, 22, 'end-of-central-directory record')
    const commentLength = buffer.readUInt16LE(offset + 20)
    if (offset + 22 + commentLength === buffer.length) return offset
  }
  throw new Error('Windows ZIP has no valid end-of-central-directory record')
}

function assertSafeEntryName(name: string, archiveRoot: string): void {
  if (name.includes('\\') || name.startsWith('/') || /^[A-Za-z]:/.test(name) || /[\u0000-\u001f\u007f]/.test(name)) {
    throw new Error(`Windows ZIP contains an unsafe entry name: ${JSON.stringify(name)}`)
  }
  const directory = name.endsWith('/')
  const path = directory ? name.slice(0, -1) : name
  const segments = path.split('/')
  if (segments.some(segment => segment.length === 0 || segment === '.' || segment === '..')) {
    throw new Error(`Windows ZIP contains an unsafe entry name: ${JSON.stringify(name)}`)
  }
  if (!name.startsWith(`${archiveRoot}/`)) {
    throw new Error(`Windows ZIP entry escapes ${archiveRoot}: ${JSON.stringify(name)}`)
  }
}

export interface WindowsZipInventory {
  readonly entries: readonly string[]
  readonly files: readonly string[]
}

/** Parse and validate standard ZIP local/central names without trusting locale decoding. */
export function inspectWindowsZipBytes(bytes: Uint8Array, archiveRoot: string): WindowsZipInventory {
  const buffer = Buffer.isBuffer(bytes)
    ? bytes
    : Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const endOffset = endOfCentralDirectory(buffer)
  if (buffer.readUInt16LE(endOffset + 4) !== 0 || buffer.readUInt16LE(endOffset + 6) !== 0) {
    throw new Error('Windows ZIP spans multiple disks')
  }
  const diskEntries = buffer.readUInt16LE(endOffset + 8)
  const entryCount = buffer.readUInt16LE(endOffset + 10)
  const centralSize = buffer.readUInt32LE(endOffset + 12)
  const centralOffset = buffer.readUInt32LE(endOffset + 16)
  if (diskEntries !== entryCount || entryCount === 0xffff || centralSize === 0xffffffff || centralOffset === 0xffffffff) {
    throw new Error('Windows ZIP has unsupported or inconsistent ZIP64 metadata')
  }
  requireRange(buffer, centralOffset, centralSize, 'central directory')
  if (centralOffset + centralSize !== endOffset) {
    throw new Error('Windows ZIP central directory boundary is inconsistent')
  }

  const decoder = new TextDecoder('utf-8', { fatal: true })
  const encoder = new TextEncoder()
  const entries: string[] = []
  const exact = new Set<string>()
  const windowsNames = new Map<string, string>()
  let cursor = centralOffset
  for (let index = 0; index < entryCount; index += 1) {
    requireRange(buffer, cursor, 46, `central entry ${String(index)}`)
    if (buffer.readUInt32LE(cursor) !== CENTRAL_HEADER) {
      throw new Error(`Windows ZIP central entry ${String(index)} has an invalid signature`)
    }
    const centralFlags = buffer.readUInt16LE(cursor + 8)
    const nameLength = buffer.readUInt16LE(cursor + 28)
    const extraLength = buffer.readUInt16LE(cursor + 30)
    const commentLength = buffer.readUInt16LE(cursor + 32)
    const localOffset = buffer.readUInt32LE(cursor + 42)
    requireRange(buffer, cursor + 46, nameLength + extraLength + commentLength, `central entry ${String(index)} payload`)
    const centralNameBytes = buffer.subarray(cursor + 46, cursor + 46 + nameLength)
    if ((centralFlags & UTF8_NAME_FLAG) === 0) {
      throw new Error(`Windows ZIP central entry ${String(index)} does not declare UTF-8 names`)
    }
    let name: string
    try {
      name = decoder.decode(centralNameBytes)
    } catch {
      throw new Error(`Windows ZIP central entry ${String(index)} is not strict UTF-8`)
    }
    if (!Buffer.from(encoder.encode(name)).equals(centralNameBytes)) {
      throw new Error(`Windows ZIP central entry ${String(index)} is not canonical UTF-8`)
    }
    assertSafeEntryName(name, archiveRoot)

    requireRange(buffer, localOffset, 30, `local entry ${String(index)}`)
    if (buffer.readUInt32LE(localOffset) !== LOCAL_HEADER) {
      throw new Error(`Windows ZIP local entry ${String(index)} has an invalid signature`)
    }
    const localFlags = buffer.readUInt16LE(localOffset + 6)
    const localNameLength = buffer.readUInt16LE(localOffset + 26)
    const localExtraLength = buffer.readUInt16LE(localOffset + 28)
    requireRange(buffer, localOffset + 30, localNameLength + localExtraLength, `local entry ${String(index)} payload`)
    const localNameBytes = buffer.subarray(localOffset + 30, localOffset + 30 + localNameLength)
    if ((localFlags & UTF8_NAME_FLAG) === 0 || !localNameBytes.equals(centralNameBytes)) {
      throw new Error(`Windows ZIP local and central UTF-8 names differ for entry ${String(index)}`)
    }

    if (exact.has(name)) throw new Error(`Windows ZIP duplicates entry name: ${name}`)
    exact.add(name)
    const windowsKey = name.normalize('NFC').toUpperCase()
    const collided = windowsNames.get(windowsKey)
    if (collided !== undefined) {
      throw new Error(`Windows ZIP has a case-insensitive filename collision: ${collided}, ${name}`)
    }
    windowsNames.set(windowsKey, name)
    entries.push(name)
    cursor += 46 + nameLength + extraLength + commentLength
  }
  if (cursor !== endOffset) throw new Error('Windows ZIP central directory entry count is inconsistent')
  entries.sort(comparePaths)
  return { entries, files: entries.filter(name => !name.endsWith('/')) }
}

/** Enumerate the exact regular-file set which a Windows portable ZIP must contain. */
export async function windowsPortableFileEntries(portableRoot: string): Promise<readonly string[]> {
  const archiveRoot = basename(portableRoot)
  const files: string[] = []
  const visit = async (directory: string): Promise<void> => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name)
      const metadata = await lstat(path)
      if (metadata.isSymbolicLink()) {
        throw new Error(`Windows portable tree contains an unsupported link: ${path}`)
      }
      if (metadata.isDirectory()) await visit(path)
      else if (metadata.isFile()) {
        files.push(`${archiveRoot}/${relative(portableRoot, path).split(sep).join('/')}`)
      } else {
        throw new Error(`Windows portable tree contains an unsupported entry: ${path}`)
      }
    }
  }
  await visit(portableRoot)
  return files.sort(comparePaths)
}

/** Prove decoded ZIP names exactly match the final portable tree. */
export function assertWindowsZipFileInventory(
  inventory: WindowsZipInventory,
  expectedFiles: readonly string[],
  requiredUnicodeFiles: readonly string[],
): void {
  const expected = [...expectedFiles].sort(comparePaths)
  const actual = [...inventory.files].sort(comparePaths)
  const expectedSet = new Set(expected)
  const actualSet = new Set(actual)
  const missing = expected.filter(path => !actualSet.has(path))
  const unexpected = actual.filter(path => !expectedSet.has(path))
  if (missing.length > 0 || unexpected.length > 0) {
    throw new Error(`Windows ZIP file inventory is not exact; missing=${JSON.stringify(missing)} unexpected=${JSON.stringify(unexpected)}`)
  }
  for (const required of requiredUnicodeFiles) {
    if (!actualSet.has(required)) throw new Error(`Windows ZIP is missing required Unicode entry: ${required}`)
  }
}
