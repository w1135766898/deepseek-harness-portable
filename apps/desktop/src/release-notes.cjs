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

function parseReleaseBody(body) {
  const source = asText(body).replace(/\r\n?/g, '\n')
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
      section.itemsEn.push(text)
      section.itemsZh.push(text)
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
      const meta = CATEGORY_META[categoryKey(title)]
      current = {
        ...meta,
        title: title || meta.label,
        titleEn: title || meta.label,
        titleZh: title || meta.labelZh,
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
      const section = ensureSection()
      section.items.push(item)
      section.itemsEn.push(item)
      section.itemsZh.push(item)
      continue
    }

    if (!line) {
      flushParagraph()
      continue
    }

    paragraph.push(line)
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

function normalizeReleaseNotes(input, fallbackVersion = '0.0.0') {
  const source = input && typeof input === 'object' ? input : {}
  const version = normalizeVersion(source.version || source.tag_name, fallbackVersion)
  const bodyEn = asText(source.bodyEn).slice(0, MAX_BODY_LENGTH)
  const bodyZh = asText(source.bodyZh).slice(0, MAX_BODY_LENGTH)
  const body = (asText(source.body) || bodyEn || bodyZh).slice(0, MAX_BODY_LENGTH)
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
    assetName: asText(source.assetName) || undefined,
  }
}

function normalizeReleaseNotesHistory(input) {
  const source = input && typeof input === 'object' ? input : {}
  const entries = Array.isArray(source.history) ? source.history : []
  return entries
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
}
