const ORIGINAL = `    const repoGh = repositoryGitHubSpec(installedManifest(name))
    if (!repoGh) return { error: '本地链接插件没有可更新的 GitHub 仓库来源' }
    target = repoGh`

const PATCHED = `    const installedRepoGh = repositoryGitHubSpec(installedManifest(name))
    const own = ownPackageJson()
    const ownRepoGh = name === String(own.name || 'dsh-plugin-marketplace')
      ? repositoryGitHubSpec(own)
      : null
    const repoGh = installedRepoGh || ownRepoGh
    if (!repoGh) return { error: '本地链接插件没有可更新的 GitHub 仓库来源' }
    target = repoGh`

/**
 * Let the bundled marketplace update itself even when its profile link is
 * dangling. The executing package is still readable and owns the canonical
 * repository metadata used by the update check.
 */
export function patchMarketplaceSelfUpdate(source) {
  if (source.includes('const installedRepoGh = repositoryGitHubSpec(installedManifest(name))')) {
    return source
  }
  const first = source.indexOf(ORIGINAL)
  if (first < 0 || source.indexOf(ORIGINAL, first + ORIGINAL.length) >= 0) {
    throw new Error('marketplace self-update source no longer matches the reviewed local-link fallback')
  }
  return source.replace(ORIGINAL, PATCHED)
}
