export interface WorkspacePackage {
  readonly name: string
  readonly version: string
  readonly path: string
  readonly dependencies?: Readonly<Record<string, string>>
  readonly peerDependencies?: Readonly<Record<string, string>>
  readonly optionalDependencies?: Readonly<Record<string, string>>
}

const PACKAGE_REFERENCE = /@(?:deepseek-ai|dsh-portable)\/[A-Za-z0-9._-]+/g

export function collectPackageReferences(sources: readonly string[]): string[] {
  return [...new Set(sources.flatMap(source => source.match(PACKAGE_REFERENCE) ?? []))].sort()
}

export function resolveWorkspaceDependencyClosure(
  packages: ReadonlyMap<string, WorkspacePackage>,
  roots: readonly string[],
): WorkspacePackage[] {
  const pending = [...new Set(roots)].sort()
  const resolved = new Map<string, WorkspacePackage>()
  while (pending.length > 0) {
    const name = pending.shift() as string
    if (resolved.has(name)) continue
    const manifest = packages.get(name)
    if (manifest === undefined) throw new Error(`runtime dependency root is not a workspace package: ${name}`)
    resolved.set(name, manifest)
    const related = {
      ...manifest.dependencies,
      ...manifest.peerDependencies,
      ...manifest.optionalDependencies,
    }
    for (const dependency of Object.keys(related).sort()) {
      if (packages.has(dependency) && !resolved.has(dependency)) pending.push(dependency)
    }
    pending.sort()
  }
  return [...resolved.values()].sort((left, right) => left.name.localeCompare(right.name))
}

export function generatedDependencyMap(
  closure: readonly WorkspacePackage[],
  externalDependencies: Readonly<Record<string, string>>,
): Record<string, string> {
  return Object.fromEntries([
    ...closure.map(pkg => [pkg.name, 'workspace:^'] as const),
    ...Object.entries(externalDependencies),
  ].sort(([left], [right]) => left.localeCompare(right)))
}
