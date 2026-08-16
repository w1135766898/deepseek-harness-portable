const { test } = require('node:test')
const assert = require('node:assert/strict')
const {
  localeFromSystem,
  messageForLocale,
  normalizeLocale,
  normalizePreference,
} = require('./desktop-locale.cjs')

test('normalizes explicit locale preferences without accepting browser tags', () => {
  assert.equal(normalizePreference('zh'), 'zh')
  assert.equal(normalizePreference(' EN '), 'en')
  assert.equal(normalizePreference('zh-CN'), undefined)
  assert.equal(normalizePreference('fr'), undefined)
  assert.equal(normalizeLocale('zh', 'en-US'), 'zh')
  assert.equal(normalizeLocale(undefined, 'zh-CN'), 'zh')
  assert.equal(normalizeLocale(undefined, 'en-US'), 'en')
})

test('maps system locales to the supported Chinese and English choices', () => {
  assert.equal(localeFromSystem('zh-CN'), 'zh')
  assert.equal(localeFromSystem('zh_TW'), 'zh')
  assert.equal(localeFromSystem('en-US'), 'en')
  assert.equal(localeFromSystem('ja-JP'), 'en')
  assert.equal(localeFromSystem(undefined), 'en')
})

test('returns complete locale-specific messages with substitutions', () => {
  assert.equal(messageForLocale('zh', 'menu.checkUpdates'), '检查更新')
  assert.equal(messageForLocale('en', 'menu.checkUpdates'), 'Check for Updates')
  assert.equal(messageForLocale('zh', 'menu.maintenance'), '高级设置')
  assert.equal(messageForLocale('en', 'menu.maintenance'), 'Advanced Settings')
  assert.equal(messageForLocale('zh', 'menu.copyDiagnostics'), '复制错误日志')
  assert.equal(messageForLocale('en', 'menu.copyDiagnostics'), 'Copy Error Logs')
  assert.equal(messageForLocale('zh', 'diagnostics.copied'), '错误日志已复制到剪贴板。')
  assert.equal(messageForLocale('en', 'diagnostics.copied'), 'Error logs copied to clipboard.')
  assert.equal(messageForLocale('zh', 'menu.openWorkspace', { path: 'C:\\workspace' }), '打开工作区（C:\\workspace）')
  assert.equal(messageForLocale('en', 'menu.openWorkspace', { path: 'C:\\workspace' }), 'Open Workspace (C:\\workspace)')
  assert.notEqual(messageForLocale('zh', 'release.noHistory'), '')
})
