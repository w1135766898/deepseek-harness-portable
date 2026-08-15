const { spawnSync } = require('node:child_process')
const { existsSync } = require('node:fs')
const { join, resolve } = require('node:path')

const root = resolve(__dirname, '..')
const submoduleRoot = join(root, 'vendor', 'deepseek-harness')

function runGit(args, allowFailure = false) {
  const result = spawnSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  if (result.status !== 0 && !allowFailure) {
    throw new Error((result.stderr || result.stdout || `git ${args.join(' ')} failed`).trim())
  }
  return result
}

function output(result) {
  return String(result.stdout || '').trim()
}

if (!existsSync(join(submoduleRoot, 'package.json'))) {
  process.exit(0)
}

const gitDirValue = output(runGit(['-C', submoduleRoot, 'rev-parse', '--git-dir']))
const commonDirValue = output(runGit(['-C', submoduleRoot, 'rev-parse', '--git-common-dir']))
const gitDir = resolve(root, gitDirValue)
const commonDir = resolve(root, commonDirValue)
const commonConfig = join(commonDir, 'config')
const worktreeConfig = join(gitDir, 'config.worktree')
const worktreePath = resolve(submoduleRoot)

const configuredWorktree = output(runGit(['config', '--file', commonConfig, '--get', 'core.worktree'], true))
const repositoryFormatVersion = output(runGit(['config', '--file', commonConfig, '--get', 'core.repositoryFormatVersion'], true))
const worktreeConfigEnabled = output(runGit(['config', '--file', commonConfig, '--get', 'extensions.worktreeConfig'], true))
if (!configuredWorktree) {
  if (worktreeConfigEnabled === 'true' && (!repositoryFormatVersion || repositoryFormatVersion === '0')) {
    runGit(['config', '--file', commonConfig, 'core.repositoryFormatVersion', '1'])
    console.log(`Upgraded submodule repository format for worktree config: ${worktreePath}`)
  }
  process.exit(0)
}

const configuredWorktreeFile = output(runGit(['config', '--file', worktreeConfig, '--get', 'core.worktree'], true))
if (configuredWorktreeFile && resolve(configuredWorktreeFile) !== worktreePath) {
  throw new Error(`Refusing to replace an unexpected submodule worktree path: ${configuredWorktreeFile}`)
}

if (!repositoryFormatVersion || repositoryFormatVersion === '0') {
  runGit(['config', '--file', commonConfig, 'core.repositoryFormatVersion', '1'])
}
runGit(['config', '--file', commonConfig, '--unset-all', 'core.worktree'])
runGit(['config', '--file', commonConfig, 'extensions.worktreeConfig', 'true'])
runGit(['config', '--file', worktreeConfig, 'core.worktree', worktreePath])
console.log(`Prepared submodule worktree config: ${worktreePath}`)
