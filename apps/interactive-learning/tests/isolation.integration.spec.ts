import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { existsSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative, resolve } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { boot, healProfilesModuleFallback, loadOverlayPatches } from '@deepseek-ai/dsh-app-boot'
import { provideCmdline } from '@deepseek-ai/dsh-cmdline'
import { SessionId } from '@deepseek-ai/dsh-session'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { PatchOptions } from '@deepseek-ai/cordis-plugin-include'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { LearningActivityBroker } from '../src/broker.ts'

const repositoryRoot = resolve(import.meta.dirname, '../../..')
const pinnedRoot = join(repositoryRoot, 'vendor/deepseek-harness')
const configRoot = join(pinnedRoot, 'apps/cli/config')
const basePatch = join(pinnedRoot, 'packages/bundle/base/cordis.patch.yml')
const webPatch = join(pinnedRoot, 'packages/bundle/web-app/cordis.patch.yml')
// A workspace install always materializes this package and its dependency
// links; the isolation test must remain runnable from a clean checkout.
const installAnchor = join(repositoryRoot, 'apps/runtime/package.json')

let ctx: Context
let temporaryRoot = ''

async function bootCatalogHost(): Promise<Context> {
  temporaryRoot = await mkdtemp(join(tmpdir(), 'dsh-learning-isolation-'))
  const settingsFile = join(temporaryRoot, 'settings.yaml')
  await writeFile(settingsFile, '{}\n')
  const patches: PatchOptions[] = [
    ...loadOverlayPatches('dsh-learning-isolation', basePatch),
    ...loadOverlayPatches('dsh-learning-isolation', webPatch),
    { id: 'settings', config: { path: settingsFile, watch: false } },
    { id: 'storage-json', config: { root: join(temporaryRoot, 'storages') } },
    { id: 'webserver', disabled: true },
    { id: 'web-runtime', disabled: true },
    { id: 'session-telemetry-otel', disabled: true },
    { id: 'modules', disabled: true },
    { id: 'connection', disabled: true },
    { id: 'client-hmr', disabled: true },
    { id: 'directory-picker', disabled: true },
    { insert: [
      { id: 'directory-picker-browse', name: '@deepseek-ai/dsh-host-directory-picker-browse' },
      { id: 'ui-directory-picker-browse', name: '@deepseek-ai/dsh-client-ui-directory-picker-browse' },
    ] },
    {
      id: 'agent-presets',
      config: {
        default: 'standard',
        roots: [{ path: join(configRoot, 'agent-presets'), trust: 'system' }],
        includeUserRoot: false,
      },
    },
  ]
  healProfilesModuleFallback(installAnchor, temporaryRoot)
  const profile = join(temporaryRoot, 'profiles', 'isolation')
  await mkdir(profile, { recursive: true })
  const rootConfig = join(profile, 'cordis.yml')
  await writeFile(rootConfig, '[]\n')
  return await boot('dsh-learning-isolation', rootConfig, patches, bootCtx => {
    provideCmdline(bootCtx, { args: [], exit: () => {} })
  })
}

async function createAgent(preset: string): Promise<{ agent: Agent; dispose(): Promise<void> }> {
  const handle = await ctx.agents.create({
    sessionId: SessionId(`learning-isolation-${preset}`),
    setup: agentCtx => ctx.agentPresets.mount(agentCtx, preset).then(() => undefined),
  })
  return { agent: handle.agent, dispose: handle.dispose }
}

async function catalog(agent: Agent): Promise<unknown> {
  return JSON.parse(JSON.stringify({
    tools: ctx.tools.schemas(agent),
    prompt: await ctx.systemPrompt.assemble({ scope: agent }),
  })) as unknown
}

beforeAll(async () => {
  ctx = await bootCatalogHost()
}, 120_000)

afterAll(async () => {
  await ctx?.fiber.dispose()
  if (temporaryRoot !== '') await rm(temporaryRoot, { recursive: true, force: true })
})

describe('exact non-Learning catalog isolation', () => {
  it('boots from a clean-checkout workspace anchor instead of generated desktop output', () => {
    const anchorPath = relative(repositoryRoot, installAnchor).replaceAll('\\', '/')
    const manifest = JSON.parse(readFileSync(installAnchor, 'utf8')) as {
      name?: string
      dependencies?: Record<string, string>
    }
    expect(existsSync(installAnchor)).toBe(true)
    expect(anchorPath).toBe('apps/runtime/package.json')
    expect(anchorPath).not.toContain('dist-')
    expect(manifest.name).toBe('@dsh-portable/runtime')
    expect(manifest.dependencies?.['@dsh-portable/interactive-learning']).toBe('workspace:^')
  })

  it('leaves Standard, Code, Minimal, and Cordis tool schemas and assembled prompts byte-equivalent', async () => {
    const handles = await Promise.all(['standard', 'code', 'minimal', 'cordis'].map(createAgent))
    try {
      const before = await Promise.all(handles.map(handle => catalog(handle.agent)))
      expect(ctx.tools.schemas().map(tool => tool.name)).toEqual([])

      await ctx.plugin(LearningActivityBroker)

      const after = await Promise.all(handles.map(handle => catalog(handle.agent)))
      expect(after).toEqual(before)
      expect(JSON.stringify(after)).not.toContain('learning_activity')
      expect(JSON.stringify(after)).not.toContain('learning:policy')
      expect(ctx.tools.schemas().map(tool => tool.name)).toEqual([])
    } finally {
      await Promise.all(handles.map(handle => handle.dispose()))
    }
  }, 120_000)
})
