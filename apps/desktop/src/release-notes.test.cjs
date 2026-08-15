const { test } = require('node:test')
const assert = require('node:assert/strict')
const {
  mergeReleaseHistory,
  normalizeReleaseNotes,
  parseReleaseBody,
  releaseType,
} = require('./release-notes.cjs')

test('parses release headings and bullet items into typed sections', () => {
  const sections = parseReleaseBody([
    '## Features',
    '',
    '- Added an in-app viewer',
    '',
    '## Bug Fixes',
    '',
    '- Fixed offline fallback',
  ].join('\n'))

  assert.deepEqual(sections.map(section => section.key), ['features', 'fixes'])
  assert.deepEqual(sections[0].items, ['Added an in-app viewer'])
  assert.deepEqual(sections[1].items, ['Fixed offline fallback'])
})

test('normalizes GitHub release fields and keeps only https URLs', () => {
  const release = normalizeReleaseNotes({
    tag_name: 'v2.3.0',
    html_url: 'https://github.com/example/repo/releases/tag/v2.3.0',
    published_at: '2026-08-14T00:00:00Z',
    body: '## Improvements\n- Faster startup',
  })

  assert.equal(release.version, '2.3.0')
  assert.equal(release.releaseType, 'Minor')
  assert.equal(release.releaseUrl.startsWith('https://'), true)
  assert.equal(normalizeReleaseNotes({ url: 'javascript:alert(1)' }).releaseUrl, undefined)
})

test('preserves localized release sections and bodies', () => {
  const release = normalizeReleaseNotes({
    version: '1.2.0',
    bodyEn: 'English body',
    bodyZh: '中文正文',
    sections: [{
      key: 'features',
      titleEn: 'Features',
      titleZh: '主要更新',
      itemsEn: ['Added an English item'],
      itemsZh: ['新增中文条目'],
    }],
  })

  assert.equal(release.bodyEn, 'English body')
  assert.equal(release.bodyZh, '中文正文')
  assert.equal(release.sections[0].titleEn, 'Features')
  assert.equal(release.sections[0].titleZh, '主要更新')
  assert.deepEqual(release.sections[0].itemsEn, ['Added an English item'])
  assert.deepEqual(release.sections[0].itemsZh, ['新增中文条目'])
})

test('deduplicates history while preferring the copy with a body', () => {
  const merged = mergeReleaseHistory(
    [{ version: '1.0.0', body: '' }],
    [{ version: 'v1.0.0', body: '## Features\n- Notes' }, { version: '0.9.0', body: 'Older' }],
  )

  assert.equal(merged.length, 2)
  assert.equal(merged.find(item => item.version === '1.0.0').body, '## Features\n- Notes')
})

test('infers major, minor, and patch release types', () => {
  assert.equal(releaseType('2.0.0'), 'Major')
  assert.equal(releaseType('2.1.0'), 'Minor')
  assert.equal(releaseType('2.1.1'), 'Patch')
})
