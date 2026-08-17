export interface BuildStage<TState> {
  readonly id: string
  readonly run: (state: TState) => Promise<void>
}

/** Run explicit build layers in order; errors identify the boundary that failed. */
export async function runBuildStages<TState>(state: TState, stages: readonly BuildStage<TState>[]): Promise<void> {
  const ids = new Set<string>()
  for (const stage of stages) {
    if (ids.has(stage.id)) throw new Error(`duplicate build stage: ${stage.id}`)
    ids.add(stage.id)
    const startedAt = performance.now()
    console.log(`build-stage:${stage.id}: start`)
    try {
      await stage.run(state)
    } catch (cause) {
      throw new Error(`build stage ${stage.id} failed: ${cause instanceof Error ? cause.message : String(cause)}`, { cause })
    }
    console.log(`build-stage:${stage.id}: complete (${((performance.now() - startedAt) / 1000).toFixed(2)}s)`)
  }
}
