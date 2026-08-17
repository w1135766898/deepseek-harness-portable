/**
 * Let profile-owned dependency setup mutate `profiles/node_modules`, then heal
 * the installation-owned fallback immediately before the first profile
 * compose. Dependency injection keeps this entry ordering directly testable.
 */
export function composeAfterManagedFallback<T>(options: {
  readonly virtualRuntime: boolean
  readonly installAnchor: string
  readonly mutate: () => void
  readonly heal: (installAnchor: string) => void
  readonly compose: () => T
}): T {
  options.mutate()
  if (!options.virtualRuntime) options.heal(options.installAnchor)
  return options.compose()
}
