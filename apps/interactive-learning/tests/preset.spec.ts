import { readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const packageRoot = resolve(import.meta.dirname, '..')
const repositoryRoot = resolve(packageRoot, '../..')

function filesNamed(root: string, name: string): string[] {
  const found: string[] = []
  const visit = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name)
      if (entry.isDirectory()) visit(path)
      else if (entry.isFile() && entry.name === name) found.push(path)
    }
  }
  visit(root)
  return found
}

describe('preset isolation', () => {
  it('mounts the model-facing entry only in the learning preset', () => {
    const learning = readFileSync(join(packageRoot, 'preset/learning/agent.cordis.yml'), 'utf8')
    expect(learning.match(/@dsh-portable\/interactive-learning\/agent/g)).toHaveLength(1)
    expect(learning.match(/@deepseek-ai\/dsh-tool-ask-user/g)).toHaveLength(1)
    const manifest = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>
    }
    expect(manifest.dependencies?.['@deepseek-ai/dsh-tool-ask-user']).toBe('workspace:^')

    const shippedRoot = join(repositoryRoot, 'apps/runtime/config/agent-presets')
    for (const path of filesNamed(shippedRoot, 'agent.cordis.yml')) {
      const source = readFileSync(path, 'utf8')
      expect(source, path).not.toContain('@dsh-portable/interactive-learning')
      expect(source, path).not.toContain('learning_activity')
    }
  })

  it('keeps the Host entry free of tool and prompt registration', () => {
    const host = readFileSync(join(packageRoot, 'src/index.ts'), 'utf8')
    const broker = readFileSync(join(packageRoot, 'src/broker.ts'), 'utf8')
    expect(host).not.toContain('tools.register')
    expect(host).not.toContain('systemPrompt.section')
    expect(broker).not.toContain('tools.register')
    expect(broker).not.toContain('systemPrompt.section')
  })

  it('is composed by the portable runtime as a separate shipped source and Host row', () => {
    const runtime = readFileSync(join(repositoryRoot, 'apps/runtime/src/packaged-bin.ts'), 'utf8')
    const manifest = JSON.parse(readFileSync(join(repositoryRoot, 'apps/runtime/package.json'), 'utf8')) as {
      dependencies?: Record<string, string>
    }
    expect(runtime).toContain("from '@dsh-portable/interactive-learning/preset'")
    expect(runtime).toContain("{ id: 'interactive-learning', path: interactiveLearningPresetRoot }")
    expect(runtime).toContain("name: '@dsh-portable/interactive-learning'")
    expect(manifest.dependencies?.['@dsh-portable/interactive-learning']).toBe('workspace:^')
  })
})
