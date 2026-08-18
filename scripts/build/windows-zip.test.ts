import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { join } from 'node:path'
import {
  assertWindowsZipFileInventory,
  inspectWindowsZipBytes,
} from './windows-zip.js'

type FixtureEntry = {
  readonly centralName: Buffer
  readonly localName?: Buffer
  readonly centralFlags?: number
  readonly localFlags?: number
}

function zipFixture(entries: readonly FixtureEntry[]): Buffer {
  const locals: Buffer[] = []
  const central: Buffer[] = []
  let localOffset = 0
  for (const entry of entries) {
    const localName = entry.localName ?? entry.centralName
    const local = Buffer.alloc(30 + localName.length)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(entry.localFlags ?? 0x0800, 6)
    local.writeUInt16LE(localName.length, 26)
    localName.copy(local, 30)
    locals.push(local)

    const record = Buffer.alloc(46 + entry.centralName.length)
    record.writeUInt32LE(0x02014b50, 0)
    record.writeUInt16LE(20, 4)
    record.writeUInt16LE(20, 6)
    record.writeUInt16LE(entry.centralFlags ?? 0x0800, 8)
    record.writeUInt16LE(entry.centralName.length, 28)
    record.writeUInt32LE(localOffset, 42)
    entry.centralName.copy(record, 46)
    central.push(record)
    localOffset += local.length
  }
  const localBytes = Buffer.concat(locals)
  const centralBytes = Buffer.concat(central)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(entries.length, 8)
  end.writeUInt16LE(entries.length, 10)
  end.writeUInt32LE(centralBytes.length, 12)
  end.writeUInt32LE(localBytes.length, 16)
  return Buffer.concat([localBytes, centralBytes, end])
}

const utf8 = (value: string): Buffer => Buffer.from(value, 'utf8')

test('Windows ZIP parser accepts canonical local/central UTF-8 names and exact inventory', () => {
  const files = ['Root/file.txt', 'Root/使用说明.txt']
  const inventory = inspectWindowsZipBytes(zipFixture(files.map(name => ({ centralName: utf8(name) }))), 'Root')
  assert.deepEqual(inventory.files, files)
  assert.doesNotThrow(() => assertWindowsZipFileInventory(inventory, files, ['Root/使用说明.txt']))
  assert.throws(() => assertWindowsZipFileInventory(inventory, [...files, 'Root/missing.txt'], []), /missing=.*missing\.txt/)
  assert.throws(() => assertWindowsZipFileInventory(inventory, ['Root/file.txt'], []), /unexpected=.*使用说明\.txt/)
})

test('Windows ZIP parser rejects CP936 bytes without UTF-8 flags', () => {
  const cp936Name = Buffer.from([0x52, 0x6f, 0x6f, 0x74, 0x2f, 0xc6, 0xf4, 0xb6, 0xaf, 0x2e, 0x74, 0x78, 0x74])
  assert.throws(
    () => inspectWindowsZipBytes(zipFixture([{ centralName: cp936Name, centralFlags: 0, localFlags: 0 }]), 'Root'),
    /does not declare UTF-8 names/,
  )
})

test('Windows ZIP parser rejects malformed UTF-8 and central/local mismatch', () => {
  const malformed = Buffer.from([0x52, 0x6f, 0x6f, 0x74, 0x2f, 0xc3, 0x28])
  assert.throws(() => inspectWindowsZipBytes(zipFixture([{ centralName: malformed }]), 'Root'), /not strict UTF-8/)
  assert.throws(() => inspectWindowsZipBytes(zipFixture([{
    centralName: utf8('Root/central.txt'),
    localName: utf8('Root/local.txt'),
  }]), 'Root'), /local and central UTF-8 names differ/)
})

test('Windows ZIP parser rejects traversal, duplicates, root escapes, and Windows collisions', () => {
  for (const name of ['Root/../escape.txt', '/Root/absolute.txt', 'C:/Root/drive.txt', 'Other/outside.txt', 'Root/back\\slash.txt']) {
    assert.throws(() => inspectWindowsZipBytes(zipFixture([{ centralName: utf8(name) }]), 'Root'), /unsafe entry name|entry escapes/)
  }
  assert.throws(() => inspectWindowsZipBytes(zipFixture([
    { centralName: utf8('Root/same.txt') },
    { centralName: utf8('Root/same.txt') },
  ]), 'Root'), /duplicates entry name/)
  assert.throws(() => inspectWindowsZipBytes(zipFixture([
    { centralName: utf8('Root/Case.txt') },
    { centralName: utf8('Root/case.txt') },
  ]), 'Root'), /case-insensitive filename collision/)
})

test('Windows packaging uses the explicit UTF-8 generator and keeps it in the staging fingerprint', async () => {
  const root = join(import.meta.dirname, '..', '..')
  const [generator, build] = await Promise.all([
    readFile(join(import.meta.dirname, 'create-windows-zip.ps1'), 'utf8'),
    readFile(join(root, 'scripts', 'build-desktop-web-exe.ts'), 'utf8'),
  ])
  assert.match(generator, /UTF8Encoding.*\$false, \$true/)
  assert.match(generator, /ZipFile\]::CreateFromDirectory/)
  assert.match(build, /STAGING_INPUT_PATHS[\s\S]*?'scripts\/build'/)
  assert.match(build, /create-windows-zip\.ps1/)
  assert.match(build, /inspectWindowsZipBytes/)
  assert.match(build, /windowsPortableFileEntries/)
})
