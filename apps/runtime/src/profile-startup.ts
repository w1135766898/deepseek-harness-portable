/**
 * Heal installation-owned fallback links before the first profile compose.
 * Dependency injection makes this executable-entry ordering contract directly
 * testable without importing the entry and starting the runtime.
 */
export function composeAfterManagedFallback<T>(options: {
  readonly virtualRuntime: boolean
  readonly installAnchor: string
  readonly heal: (installAnchor: string) => void
  readonly compose: () => T
}): T {
  if (!options.virtualRuntime) options.heal(options.installAnchor)
  return options.compose()
}
