/** Profile-first package metadata resolution for downloadable client plugins. */

import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'

function packageManifestFromAnchor(anchor: string, packageName: string): string | undefined {
  for (const searchPath of createRequire(anchor).resolve.paths(packageName) ?? []) {
    const candidate = join(searchPath, packageName, 'package.json')
    if (existsSync(candidate)) return candidate
  }
  return undefined
}

/**
 * Resolve client plugin manifests from the writable profile first, then from
 * the immutable runtime closure. This keeps downloaded host/client plugin
 * faces on the same version while retaining the in-box dependency fallback.
 */
export function createProfileFirstPackageJsonResolver(
  profileDir: string,
  installAnchor: string,
): (packageName: string) => string {
  const anchors = [join(profileDir, 'package.json'), installAnchor]
  return packageName => {
    for (const anchor of anchors) {
      const manifest = packageManifestFromAnchor(anchor, packageName)
      if (manifest !== undefined) return manifest
    }
    throw new Error(
      `cannot resolve package manifest ${JSON.stringify(packageName)} from profile ${profileDir} or runtime ${installAnchor}`,
    )
  }
}
