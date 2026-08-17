const { compareSemver, isValidSemver, normalizeVersion } = require('./semver.cjs')

const PORTABLE_RELEASE_REPO = 'wsnxxxs/deepseek-harness-portable'
const OFFICIAL_KERNEL_REPO = 'deepseek-ai/deepseek-harness'
const OFFICIAL_KERNEL_TAG_PREFIX = 'dsh-v'

function parseOfficialKernelTag(value) {
  const tagName = String(value || '').trim()
  if (!tagName.startsWith(OFFICIAL_KERNEL_TAG_PREFIX)) return undefined
  const version = tagName.slice(OFFICIAL_KERNEL_TAG_PREFIX.length)
  return isValidSemver(version) ? version : undefined
}

function normalizeOfficialKernelRelease(value, source = '') {
  if (!value || typeof value !== 'object' || value.draft) return undefined
  const version = parseOfficialKernelTag(value.tag_name)
  if (!version) return undefined
  const releaseUrl = typeof value.html_url === 'string' && value.html_url.startsWith('https://')
    ? value.html_url
    : `https://github.com/${OFFICIAL_KERNEL_REPO}/releases/tag/${encodeURIComponent(value.tag_name)}`
  return {
    channel: 'kernel',
    source,
    version,
    tagName: value.tag_name,
    name: typeof value.name === 'string' && value.name.trim() ? value.name.trim() : value.tag_name,
    body: typeof value.body === 'string' ? value.body : '',
    publishedAt: value.published_at || value.created_at || undefined,
    prerelease: Boolean(value.prerelease),
    releaseUrl,
  }
}

function newestRelease(releases) {
  return releases
    .filter(Boolean)
    .sort((left, right) => compareSemver(right.version, left.version))[0]
}

async function queryLatestOfficialKernelRelease({ fetchJson, urls, timeoutMs = 6000 } = {}) {
  if (typeof fetchJson !== 'function') throw new TypeError('fetchJson is required')
  const apiUrl = `https://api.github.com/repos/${OFFICIAL_KERNEL_REPO}/releases?per_page=30`
  const sources = Array.isArray(urls) && urls.length > 0
    ? urls
    : [apiUrl, `https://gh-proxy.com/${apiUrl}`]
  const settled = await Promise.allSettled(sources.map(async url => {
    const payload = await fetchJson(url, timeoutMs, { headers: { 'Cache-Control': 'no-cache' } })
    if (!Array.isArray(payload)) throw new Error('Official release response was not an array')
    return payload.map(item => normalizeOfficialKernelRelease(item, url)).filter(Boolean)
  }))
  const candidates = settled.flatMap(result => result.status === 'fulfilled' ? result.value : [])
  const latest = newestRelease(candidates)
  if (latest) return latest
  const failures = settled
    .filter(result => result.status === 'rejected')
    .map(result => result.reason instanceof Error ? result.reason.message : String(result.reason))
  throw new Error(`No valid official dsh-v* release could be fetched.${failures.length ? ` ${failures.join(' | ')}` : ''}`)
}

function evaluateUpdateChannels({ localDistributionVersion, localKernelVersion, portableRelease, kernelRelease } = {}) {
  const distributionVersion = normalizeVersion(localDistributionVersion)
  const kernelVersion = normalizeVersion(localKernelVersion)
  if (!isValidSemver(distributionVersion)) throw new Error(`Invalid local distribution version: ${localDistributionVersion}`)
  if (!isValidSemver(kernelVersion)) throw new Error(`Invalid local kernel version: ${localKernelVersion}`)

  const portableVersion = portableRelease && normalizeVersion(portableRelease.version)
  const officialKernelVersion = kernelRelease && normalizeVersion(kernelRelease.version)
  return {
    portable: {
      currentVersion: distributionVersion,
      latestVersion: isValidSemver(portableVersion) ? portableVersion : undefined,
      updateAvailable: Boolean(isValidSemver(portableVersion) && compareSemver(portableVersion, distributionVersion) > 0),
      release: portableRelease,
    },
    kernel: {
      currentVersion: kernelVersion,
      latestVersion: isValidSemver(officialKernelVersion) ? officialKernelVersion : undefined,
      updateAvailable: Boolean(isValidSemver(officialKernelVersion) && compareSemver(officialKernelVersion, kernelVersion) > 0),
      release: kernelRelease,
    },
  }
}

module.exports = {
  OFFICIAL_KERNEL_REPO,
  OFFICIAL_KERNEL_TAG_PREFIX,
  PORTABLE_RELEASE_REPO,
  evaluateUpdateChannels,
  normalizeOfficialKernelRelease,
  parseOfficialKernelTag,
  queryLatestOfficialKernelRelease,
}
