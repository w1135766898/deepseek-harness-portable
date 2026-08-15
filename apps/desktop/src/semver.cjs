function normalizeVersion(value) {
  return String(value || '').trim().replace(/^v/i, '')
}

// SemVer 2.0.0 specification regex:
// 1. Major/Minor/Patch: 0|[1-9]\d*
// 2. Prerelease: (?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*
// 3. Build metadata: [0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*
const SEMVER_REGEX = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/

function parseSemver(value) {
  const normalized = normalizeVersion(value)
  const match = normalized.match(SEMVER_REGEX)
  if (!match) return undefined

  return {
    raw: normalized,
    major: match[1],
    minor: match[2],
    patch: match[3],
    prerelease: match[4] ? match[4].split('.') : [],
    build: match[5] ? match[5].split('.') : [],
  }
}

function isValidSemver(value) {
  return parseSemver(value) !== undefined
}

function compareNumericStrings(left, right) {
  // Strip any accidental leading zeroes and compare length first to prevent overflow
  const l = left.replace(/^0+(?=\d)/, '')
  const r = right.replace(/^0+(?=\d)/, '')
  if (l.length !== r.length) return l.length < r.length ? -1 : 1
  if (l === r) return 0
  return l < r ? -1 : 1
}

function comparePrereleaseIdentifier(left, right) {
  const leftIsNum = /^\d+$/.test(left)
  const rightIsNum = /^\d+$/.test(right)

  if (leftIsNum && rightIsNum) {
    return compareNumericStrings(left, right)
  }
  // Numeric identifiers always have lower precedence than non-numeric
  if (leftIsNum && !rightIsNum) return -1
  if (!leftIsNum && rightIsNum) return 1

  // Lexical comparison in ASCII order
  if (left === right) return 0
  return left < right ? -1 : 1
}

function compareParsedSemver(left, right) {
  for (const key of ['major', 'minor', 'patch']) {
    const comp = compareNumericStrings(left[key], right[key])
    if (comp !== 0) return comp
  }

  // 1.0.0 without prerelease > 1.0.0-alpha
  if (left.prerelease.length === 0 && right.prerelease.length === 0) return 0
  if (left.prerelease.length === 0) return 1
  if (right.prerelease.length === 0) return -1

  const maxLen = Math.max(left.prerelease.length, right.prerelease.length)
  for (let i = 0; i < maxLen; i++) {
    if (i >= left.prerelease.length) return -1
    if (i >= right.prerelease.length) return 1

    const comp = comparePrereleaseIdentifier(left.prerelease[i], right.prerelease[i])
    if (comp !== 0) return comp
  }

  return 0
}

function compareSemver(left, right) {
  const parsedLeft = parseSemver(left)
  const parsedRight = parseSemver(right)

  if (!parsedLeft) {
    throw new Error(`Invalid SemVer version string: "${left}"`)
  }
  if (!parsedRight) {
    throw new Error(`Invalid SemVer version string: "${right}"`)
  }

  return compareParsedSemver(parsedLeft, parsedRight)
}

function tryCompareSemver(left, right) {
  try {
    return compareSemver(left, right)
  } catch {
    return undefined
  }
}

module.exports = {
  SEMVER_REGEX,
  normalizeVersion,
  parseSemver,
  isValidSemver,
  compareSemver,
  tryCompareSemver,
}
