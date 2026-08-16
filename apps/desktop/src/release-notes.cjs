const { isValidSemver } = require('./semver.cjs')

const MAX_BODY_LENGTH = 32_000

const CATEGORY_META = {
  features: { key: 'features', label: 'Features', labelZh: '新功能', icon: '✦' },
  improvements: { key: 'improvements', label: 'Improvements', labelZh: '优化提升', icon: '↗' },
  fixes: { key: 'fixes', label: 'Bug Fixes', labelZh: '问题修复', icon: '✓' },
  breaking: { key: 'breaking', label: 'Breaking Changes', labelZh: '重要变更', icon: '!' },
  other: { key: 'other', label: 'Other', labelZh: '其他', icon: '•' },
}

function asText(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeVersion(value, fallback = '0.0.0') {
  const version = asText(value).replace(/^v/i, '')
  return version || fallback
}

function normalizeDate(value) {
  const date = asText(value)
  return date || undefined
}

function normalizeUrl(value) {
  const url = asText(value)
  if (!url) return undefined
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'https:' ? parsed.toString() : undefined
  } catch {
    return undefined
  }
}

function releaseType(version) {
  const match = normalizeVersion(version).match(/^(\d+)\.(\d+)\.(\d+)/)
  if (!match) return 'Patch'
  if (Number(match[3]) > 0) return 'Patch'
  if (Number(match[2]) > 0) return 'Minor'
  return 'Major'
}

function categoryKey(value) {
  const title = asText(value).toLowerCase()
  if (/feature|new feature|added|新增|新功能|特性|亮点|what'?s new/.test(title)) return 'features'
  if (/improvement|enhancement|优化|提升|性能|改进/.test(title)) return 'improvements'
  if (/bug|fix|fixed|修复|问题|错误|故障/.test(title)) return 'fixes'
  if (/breaking|migration|重要变更|不兼容/.test(title)) return 'breaking'
  return 'other'
}

function cleanMarkdownText(value) {
  return asText(value)
    .replace(/^\s*[-*+]\s+/, '')
    .replace(/^\s*\d+[.)]\s+/, '')
    .trim()
}

function splitBilingualReleaseBody(body) {
  const source = asText(body).replace(/\r\n?/g, '\n')
  if (!source) return { bodyZh: '', bodyEn: '' }

  // 1. Check for English delimiter (e.g. --- ## English Release Notes or ## English Release Notes)
  const enMatch = /(?:^|\n)(?:---\r?\n\s*)?#{1,3}\s+(?:English Release Notes|English Notes|English)\b/i.exec(source)
  if (enMatch) {
    const zhPart = source.slice(0, enMatch.index).trim()
    const enPart = source.slice(enMatch.index + enMatch[0].length).trim()
    return { bodyZh: zhPart, bodyEn: enPart }
  }

  // 2. Check for Chinese delimiter (e.g. --- ## 中文发布说明 or ## 中文更新日志)
  const zhMatch = /(?:^|\n)(?:---\r?\n\s*)?#{1,3}\s+(?:中文发布说明|中文更新日志|中文说明|Release Notes \(中文\))\b/i.exec(source)
  if (zhMatch) {
    const enPart = source.slice(0, zhMatch.index).trim()
    const zhPart = source.slice(zhMatch.index + zhMatch[0].length).trim()
    return { bodyZh: zhPart, bodyEn: enPart }
  }

  // 3. Fallback: check if text contains Chinese characters
  const hasChinese = /[\u4e00-\u9fa5]/.test(source)
  return {
    bodyZh: hasChinese ? source : '',
    bodyEn: hasChinese ? '' : source,
  }
}

function parseSingleLanguageBody(source, lang = 'en') {
  if (!source) return []
  const sections = []
  let current
  let paragraph = []
  let inCodeBlock = false

  const ensureSection = () => {
    if (current === undefined) {
      const meta = CATEGORY_META.other
      current = {
        ...meta,
        title: meta.label,
        titleEn: meta.label,
        titleZh: meta.labelZh,
        items: [],
        itemsEn: [],
        itemsZh: [],
      }
      sections.push(current)
    }
    return current
  }

  const flushParagraph = () => {
    if (paragraph.length === 0) return
    const text = paragraph.join(' ').trim()
    paragraph = []
    if (text) {
      const section = ensureSection()
      section.items.push(text)
      if (lang === 'zh') section.itemsZh.push(text)
      else section.itemsEn.push(text)
    }
  }

  for (const rawLine of source.split('\n')) {
    const line = rawLine.trim()
    if (line.startsWith('```')) {
      if (!inCodeBlock) flushParagraph()
      inCodeBlock = !inCodeBlock
      continue
    }
    if (inCodeBlock) {
      paragraph.push(rawLine.trim())
      continue
    }

    const heading = line.match(/^#{1,6}\s+(.+?)\s*#*$/)
    if (heading) {
      flushParagraph()
      const title = heading[1].replace(/^\[|\]$/g, '').trim()
      if (/^deepseek harness/i.test(title) || /^组件版本/i.test(title) || /^component versions?/i.test(title) || /^校验和|checksum/i.test(title)) {
        current = undefined
        continue
      }
      const meta = CATEGORY_META[categoryKey(title)]
      current = {
        ...meta,
        title: title || meta.label,
        titleEn: lang === 'en' ? (title || meta.label) : meta.label,
        titleZh: lang === 'zh' ? (title || meta.labelZh) : meta.labelZh,
        items: [],
        itemsEn: [],
        itemsZh: [],
      }
      sections.push(current)
      continue
    }

    if (/^\s*(?:[-*+]\s+|\d+[.)]\s+)/.test(rawLine)) {
      flushParagraph()
      const item = cleanMarkdownText(rawLine)
      if (!item || current === undefined) continue
      const section = ensureSection()
      section.items.push(item)
      if (lang === 'zh') section.itemsZh.push(item)
      else section.itemsEn.push(item)
      continue
    }

    if (!line) {
      flushParagraph()
      continue
    }

    if (current !== undefined) {
      paragraph.push(line)
    }
  }
  flushParagraph()

  return sections
    .map(section => ({
      ...section,
      items: section.items.filter(Boolean),
      itemsEn: section.itemsEn.filter(Boolean),
      itemsZh: section.itemsZh.filter(Boolean),
    }))
    .filter(section => section.items.length > 0)
}

function parseReleaseBody(body) {
  const source = asText(body).replace(/\r\n?/g, '\n')
  if (!source) return []

  const { bodyZh, bodyEn } = splitBilingualReleaseBody(source)
  if (bodyZh && bodyEn) {
    const zhSections = parseSingleLanguageBody(bodyZh, 'zh')
    const enSections = parseSingleLanguageBody(bodyEn, 'en')

    const merged = new Map()
    for (const s of zhSections) {
      merged.set(s.key, {
        ...s,
        titleZh: s.titleZh || s.title,
        itemsZh: s.itemsZh,
        itemsEn: [],
      })
    }
    for (const s of enSections) {
      if (merged.has(s.key)) {
        const existing = merged.get(s.key)
        existing.titleEn = s.titleEn || s.title
        existing.itemsEn = s.itemsEn
        if (existing.itemsZh.length === 0) existing.itemsZh = s.itemsZh.length > 0 ? s.itemsZh : s.itemsEn
        if (existing.items.length === 0) existing.items = s.items
      } else {
        merged.set(s.key, {
          ...s,
          titleEn: s.titleEn || s.title,
          itemsEn: s.itemsEn,
          itemsZh: [],
        })
      }
    }
    return [...merged.values()].filter(s => s.itemsZh.length > 0 || s.itemsEn.length > 0 || s.items.length > 0)
  }

  const lang = bodyZh ? 'zh' : 'en'
  return parseSingleLanguageBody(source, lang)
}

function normalizeReleaseNotes(input, fallbackVersion = '0.0.0') {
  const source = input && typeof input === 'object' ? input : {}
  const version = normalizeVersion(source.version || source.tag_name, fallbackVersion)
  const rawBody = asText(source.body)
  const split = splitBilingualReleaseBody(rawBody)
  const bodyEn = (asText(source.bodyEn) || split.bodyEn || rawBody).slice(0, MAX_BODY_LENGTH)
  const bodyZh = (asText(source.bodyZh) || split.bodyZh || rawBody).slice(0, MAX_BODY_LENGTH)
  const body = (rawBody || bodyEn || bodyZh).slice(0, MAX_BODY_LENGTH)
  const suppliedSections = Array.isArray(source.sections)
    ? source.sections.map(section => {
      if (!section || typeof section !== 'object') return undefined
      const rawItems = Array.isArray(section.items) ? section.items.filter(item => typeof item === 'string').map(item => item.trim()).filter(Boolean) : []
      const itemsEn = Array.isArray(section.itemsEn) ? section.itemsEn.filter(item => typeof item === 'string').map(item => item.trim()).filter(Boolean) : rawItems
      const itemsZh = Array.isArray(section.itemsZh) ? section.itemsZh.filter(item => typeof item === 'string').map(item => item.trim()).filter(Boolean) : rawItems
      const items = rawItems.length > 0 ? rawItems : (itemsEn.length > 0 ? itemsEn : itemsZh)
      if (items.length === 0) return undefined
      const meta = CATEGORY_META[asText(section.key)] || CATEGORY_META.other
      const title = asText(section.title)
      return {
        ...meta,
        title: title || meta.label,
        titleEn: asText(section.titleEn) || title || meta.label,
        titleZh: asText(section.titleZh) || title || meta.labelZh,
        items,
        itemsEn,
        itemsZh,
      }
    }).filter(Boolean)
    : []
  const sections = suppliedSections.length > 0 ? suppliedSections : parseReleaseBody(body)
  return {
    version,
    name: asText(source.name) || `DeepSeek Harness for Win v${version}`,
    body,
    bodyEn: bodyEn || body,
    bodyZh: bodyZh || body,
    sections,
    publishedAt: normalizeDate(source.publishedAt || source.published_at || source.createdAt || source.created_at),
    releaseUrl: normalizeUrl(source.releaseUrl || source.html_url || source.url),
    releaseType: asText(source.releaseType) || releaseType(version),
    prerelease: Boolean(source.prerelease),
    channel: asText(source.channel) || undefined,
    assetName: asText(source.assetName) || (isValidSemver(version) && version !== '0.0.0' ? `DeepSeek-Harness-${version}-win32-x64.zip` : undefined),
  }
}

function normalizeReleaseNotesHistory(input) {
  const source = input && typeof input === 'object' ? input : {}
  const entries = Array.isArray(source.history) ? source.history : (Array.isArray(source) ? source : [])
  const rootEntry = source.version && isValidSemver(String(source.version).replace(/^v/i, '')) ? [source] : []
  return [...rootEntry, ...entries]
    .map(entry => normalizeReleaseNotes(entry))
    .filter(release => release.version !== '0.0.0')
}

function countSectionBadges(release) {
  const counts = new Map()
  const sections = release && Array.isArray(release.sections) ? release.sections : []

  for (const section of sections) {
    if (!section || typeof section !== 'object') continue
    const key = CATEGORY_META[asText(section.key)] === undefined ? 'other' : asText(section.key)
    const items = Array.isArray(section.items)
      ? section.items.filter(item => typeof item === 'string' && item.trim() !== '')
      : []
    if (items.length === 0) continue
    counts.set(key, (counts.get(key) || 0) + items.length)
  }

  return [...counts.entries()]
    .map(([key, count]) => ({ ...CATEGORY_META[key], count }))
    .filter(badge => badge.count > 0)
}

function mergeReleaseHistory(...lists) {
  const byVersion = new Map()
  for (const list of lists) {
    if (!Array.isArray(list)) continue
    for (const item of list) {
      const release = normalizeReleaseNotes(item)
      const existing = byVersion.get(release.version)
      if (existing === undefined || (!existing.body && release.body)) {
        byVersion.set(release.version, release)
      }
    }
  }
  return [...byVersion.values()]
}

module.exports = {
  CATEGORY_META,
  MAX_BODY_LENGTH,
  countSectionBadges,
  mergeReleaseHistory,
  normalizeReleaseNotes,
  normalizeReleaseNotesHistory,
  normalizeUrl,
  parseReleaseBody,
  releaseType,
  splitBilingualReleaseBody,
}
