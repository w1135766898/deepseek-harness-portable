import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { test } from 'node:test'
import { load } from 'js-yaml'

const root = resolve(import.meta.dirname, '..', '..')

interface WorkflowStep {
  run?: string
  uses?: string
  with?: Record<string, unknown>
}

interface Workflow {
  jobs: Record<string, { steps: WorkflowStep[] }>
}

const targets = [
  { id: 'linux-x64', job: 'linux-x64', script: 'desktop:package:linux' },
  { id: 'win32-x64', job: 'windows-x64-wsl', script: 'desktop:package:win' },
  { id: 'darwin-arm64', job: 'macos-arm64', script: 'desktop:package:mac' },
] as const

test('native package jobs upload the exact verified output produced by their package command', () => {
  const buildSource = readFileSync(resolve(root, 'scripts', 'build-desktop-web-exe.ts'), 'utf8')
  const outputMatch = /const ELECTRON_OUT_DIR = '([^']+)'/.exec(buildSource)
  assert.ok(outputMatch, 'the Electron output root must remain an explicit build contract')
  const electronOutputRoot = outputMatch[1]
  assert.match(buildSource, /outputRoot: resolve\(this\.electronOutDir, 'verified'\)/)

  const manifest = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as {
    scripts: Record<string, string>
  }
  const workflow = load(readFileSync(resolve(root, '.github', 'workflows', 'package.yml'), 'utf8')) as Workflow

  for (const target of targets) {
    const packageCommand = manifest.scripts[target.script]
    assert.equal(
      packageCommand,
      `pnpm run package --target ${target.id} --output-root ${electronOutputRoot}`,
      `${target.script} must pin the build output root consumed by CI`,
    )

    const steps = workflow.jobs[target.job]?.steps ?? []
    const bridgeIndex = steps.findIndex(step => step.run === 'pnpm exec tsx scripts/build/client-manifest-bridge.ts')
    const buildStep = steps.find(step => step.run?.includes(`pnpm run ${target.script}`))
    assert.ok(buildStep, `${target.job} must run ${target.script}`)
    assert.equal(buildStep.run, `pnpm run ${target.script}`)
    const buildIndex = steps.indexOf(buildStep)
    assert.ok(bridgeIndex >= 0, `${target.job} must create the portable client manifest bridge`)
    assert.ok(buildIndex > bridgeIndex, `${target.job} must create the bridge before packaging`)

    const uploadStep = steps.find(step => step.uses === 'actions/upload-artifact@v4')
    assert.ok(uploadStep, `${target.job} must upload its verified artifact bundle`)
    assert.equal(uploadStep.with?.path, `${electronOutputRoot}/verified/${target.id}`)
    assert.equal(uploadStep.with?.['if-no-files-found'], 'error')
  }
})

test('CI materializes portable client manifests before building the pinned kernel', () => {
  const workflow = load(readFileSync(resolve(root, '.github', 'workflows', 'verify.yml'), 'utf8')) as Workflow
  const steps = workflow.jobs['contracts-and-static-gates']?.steps ?? []
  const bridgeIndex = steps.findIndex(step => step.run === 'pnpm exec tsx scripts/build/client-manifest-bridge.ts')
  const kernelBuildIndex = steps.findIndex(step => step.run === 'pnpm --filter @deepseek-ai/dsh-root run build')
  assert.ok(bridgeIndex >= 0, 'verify must create the portable client manifest bridge')
  assert.ok(kernelBuildIndex > bridgeIndex, 'verify must create the bridge before the pinned kernel build')
})

test('Linux packaging prepares Electron sandbox permissions before starting Electron', () => {
  const workflow = load(readFileSync(resolve(root, '.github', 'workflows', 'package.yml'), 'utf8')) as Workflow
  const steps = workflow.jobs['linux-x64']?.steps ?? []
  const sandboxStep = steps.find(step => step.run?.includes("find node_modules -type f -path '*/electron/dist/chrome-sandbox'"))
  const packageStep = steps.find(step => step.run === 'pnpm run desktop:package:linux')
  assert.ok(sandboxStep, 'Linux packaging must configure the Electron chrome-sandbox helper')
  assert.match(sandboxStep.run ?? '', /sudo chown root:root/)
  assert.match(sandboxStep.run ?? '', /sudo chmod 4755/)
  assert.ok(packageStep, 'Linux packaging must run the Linux package command')
  assert.ok(steps.indexOf(packageStep) > steps.indexOf(sandboxStep), 'sandbox permissions must be configured before packaging')
})
