const { compareSemver, isValidSemver, normalizeVersion } = require('./semver.cjs')

const PORTABLE_RELEASE_REPO = 'wsnxxxs/deepseek-harness-portable'

/**
 * Compare only the portable distribution release. The bundled DeepSeek
 * Harness kernel is release payload content and is never an independent
 * update channel.
 */
function evaluateReleaseUpdate({ localDistributionVersion, release } = {}) {
  const distributionVersion = normalizeVersion(localDistributionVersion)
  if (!isValidSemver(distributionVersion)) throw new Error(`Invalid local distribution version: ${localDistributionVersion}`)

  const releaseVersion = release && normalizeVersion(release.version)
  return {
    currentVersion: distributionVersion,
    latestVersion: isValidSemver(releaseVersion) ? releaseVersion : undefined,
    updateAvailable: Boolean(isValidSemver(releaseVersion) && compareSemver(releaseVersion, distributionVersion) > 0),
    release,
  }
}

module.exports = {
  PORTABLE_RELEASE_REPO,
  evaluateReleaseUpdate,
}
