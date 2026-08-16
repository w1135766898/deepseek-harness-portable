const { test } = require('node:test')
const assert = require('node:assert/strict')
const {
  mergeReleaseHistory,
  normalizeReleaseNotes,
  normalizeReleaseNotesHistory,
  parseReleaseBody,
  releaseType,
  splitBilingualReleaseBody,
} = require('./release-notes.cjs')

test('splits combined bilingual release bodies at language boundaries', () => {
  const sample = [
    '# DeepSeek Harness for Win v1.2.2',
    '',
    '## 新功能与体验优化',
    '- 视觉辅助外挂插件',
    '',
    '---',
    '',
    '## English Release Notes',
    '',
    '### New Features & Improvements',
    '- Vision Bridge Plugin',
  ].join('\n')

  const { bodyZh, bodyEn } = splitBilingualReleaseBody(sample)
  assert.equal(bodyZh.includes('视觉辅助外挂插件'), true)
  assert.equal(bodyZh.includes('Vision Bridge Plugin'), false)
  assert.equal(bodyEn.includes('Vision Bridge Plugin'), true)
  assert.equal(bodyEn.includes('视觉辅助外挂插件'), false)
})

test('parses combined bilingual release markdown into clean monolingual sections', () => {
  const sample = [
    '# DeepSeek Harness for Win v1.2.2',
    '',
    '## 新功能与体验优化',
    '- 视觉辅助外挂插件',
    '- 全局 view_image 工具',
    '',
    '## 组件版本',
    '- 分发：1.2.2',
    '',
    '---',
    '',
    '## English Release Notes',
    '',
    '### New Features & Improvements',
    '- Vision Bridge Plugin',
    '- Global view_image Tool',
  ].join('\n')

  const sections = parseReleaseBody(sample)
  assert.equal(sections.length, 1)
  assert.equal(sections[0].key, 'features')
  assert.deepEqual(sections[0].itemsZh, ['视觉辅助外挂插件', '全局 view_image 工具'])
  assert.deepEqual(sections[0].itemsEn, ['Vision Bridge Plugin', 'Global view_image Tool'])
})

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
  assert.equal(release.assetName, 'DeepSeek-Harness-2.3.0-win32-x64.zip')
  assert.equal(normalizeReleaseNotes({ url: 'javascript:alert(1)' }).releaseUrl, undefined)
  assert.equal(normalizeReleaseNotes({ url: 'javascript:alert(1)' }).assetName, undefined)
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

test('normalizes bundled bilingual history entries, includes root version, and drops versionless ones', () => {
  const history = normalizeReleaseNotesHistory({
    version: '1.1.2',
    history: [
      {
        version: '1.1.1',
        body: '## Bug Fixes\n- Fixed',
        sections: [{
          key: 'fixes',
          titleEn: 'Bug Fixes',
          titleZh: '问题修复',
          itemsEn: ['Fixed an English item'],
          itemsZh: ['修复中文条目'],
        }],
      },
      { version: '1.0.0', body: 'Older notes' },
      {},
    ],
  })

  assert.equal(history.length, 3)
  assert.equal(history[0].version, '1.1.2')
  assert.equal(history[1].version, '1.1.1')
  assert.equal(history[1].sections[0].titleZh, '问题修复')
  assert.deepEqual(history[1].sections[0].itemsZh, ['修复中文条目'])
  assert.equal(history[2].version, '1.0.0')
})

test('keeps bundled bilingual notes ahead of English remote bodies for the same version', () => {
  const merged = mergeReleaseHistory(
    [{
      version: '1.1.1',
      body: '## Bug Fixes / 问题修复\n- Fixed',
      sections: [{
        key: 'fixes',
        titleEn: 'Bug Fixes',
        titleZh: '问题修复',
        itemsEn: ['English remote would say this'],
        itemsZh: ['中文更新说明'],
      }],
    }],
    [{ version: 'v1.1.1', body: '## Bug Fixes\n- English remote note' }],
  )

  assert.equal(merged.length, 1)
  const release = merged[0]
  assert.equal(release.sections[0].titleZh, '问题修复')
  assert.deepEqual(release.sections[0].itemsZh, ['中文更新说明'])
})

test('infers major, minor, and patch release types', () => {
  assert.equal(releaseType('2.0.0'), 'Major')
  assert.equal(releaseType('2.1.0'), 'Minor')
  assert.equal(releaseType('2.1.1'), 'Patch')
})
