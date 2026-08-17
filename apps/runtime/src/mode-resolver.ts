export type CapabilityState = 'available' | 'degraded' | 'unavailable'
export type ModeSupportLevel = 'native' | 'compatible' | 'alternative' | 'unavailable'

export interface CapabilityResult {
  readonly state: CapabilityState
  readonly provider?: string
  readonly version?: string
  readonly reason?: string
  readonly remediation?: string
  readonly limitations?: readonly string[]
}

export interface CapabilityReport {
  readonly target: {
    readonly platform: NodeJS.Platform
    readonly arch: NodeJS.Architecture
  }
  readonly capabilities: Readonly<Record<string, CapabilityResult>>
  readonly generatedAt: string
  readonly snapshotHash: string
}

export interface ModeVariant {
  readonly id: string
  readonly supportLevel: Exclude<ModeSupportLevel, 'unavailable'>
  readonly requires: readonly string[]
  readonly acceptsDegraded?: readonly string[]
  readonly limitations?: readonly string[]
  readonly config: string
  readonly provides?: Readonly<Record<string, string>>
}

export interface ModeDefinition {
  readonly id: string
  readonly baseConfig?: string
  readonly contract: ModeContract
  readonly variants: readonly ModeVariant[]
}

export interface ModeContract {
  readonly tools?: {
    readonly exactRows?: readonly string[]
    readonly requiredRows?: readonly string[]
    readonly variantSlots?: Readonly<Record<string, readonly string[]>>
  }
  readonly composition?: {
    readonly requiredRows?: readonly string[]
    readonly forbiddenRows?: readonly string[]
  }
  readonly [key: string]: unknown
}

export interface MissingCapability {
  readonly id: string
  readonly reason: string
  readonly remediation?: string
}

export type ResolvedMode = {
  readonly modeId: string
  readonly variantId: string
  readonly supportLevel: Exclude<ModeSupportLevel, 'unavailable'>
  readonly limitations: readonly string[]
} | {
  readonly modeId: string
  readonly supportLevel: 'unavailable'
  readonly missingCapabilities: readonly string[]
  readonly missing: readonly MissingCapability[]
  readonly reason: string
  readonly remediation: readonly string[]
}

function missingRequirements(variant: ModeVariant, report: CapabilityReport): string[] {
  return variant.requires.filter(id => {
    const state = report.capabilities[id]?.state
    return state !== 'available' && !(state === 'degraded' && variant.acceptsDegraded?.includes(id))
  })
}

/** Resolve the first variant whose complete capability contract is available. */
export function resolveVariant(mode: ModeDefinition, report: CapabilityReport): ResolvedMode {
  for (const variant of mode.variants) {
    if (missingRequirements(variant, report).length === 0) {
      const degradedLimitations = variant.requires.flatMap(id => (
        report.capabilities[id]?.state === 'degraded'
          ? (report.capabilities[id]?.limitations ?? [`${id}:degraded`])
          : []
      ))
      return {
        modeId: mode.id,
        variantId: variant.id,
        supportLevel: variant.supportLevel,
        limitations: [...new Set([...(variant.limitations ?? []), ...degradedLimitations])],
      }
    }
  }
  return {
    modeId: mode.id,
    supportLevel: 'unavailable',
    missingCapabilities: [...new Set(mode.variants.flatMap(variant => missingRequirements(variant, report)))],
    missing: [...new Set(mode.variants.flatMap(variant => missingRequirements(variant, report)))].map(id => ({
      id,
      reason: report.capabilities[id]?.reason ?? `capability ${id} did not report available`,
      remediation: report.capabilities[id]?.remediation
        ?? `Install or enable ${id}, then restart the runtime so it can be measured again.`,
    })),
    reason: `no ${mode.id} runtime variant satisfies all required capabilities`,
    remediation: [...new Set(mode.variants.flatMap(variant => missingRequirements(variant, report))
      .map(id => report.capabilities[id]?.remediation
        ?? `Install or enable ${id}, then restart the runtime so it can be measured again.`))],
  }
}

/**
 * Pick the closest platform implementation for diagnostics and fail-loud tool
 * startup when no variant is fully usable. Product support remains
 * `unavailable`; this fallback never upgrades the resolver result.
 */
export function closestVariant(mode: ModeDefinition, report: CapabilityReport): ModeVariant {
  if (mode.variants.length === 0) throw new Error(`mode ${mode.id} declares no variants`)
  return [...mode.variants].sort((left, right) => (
    missingRequirements(left, report).length - missingRequirements(right, report).length
  ))[0]
}
