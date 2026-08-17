import {
  defineTarget,
  type BuildArchitecture,
  type BuildPlatform,
  type ModeExpectation,
  type NativeAssetRule,
  type TargetSpec,
} from '../../packages/platform-contract/src/index.js'

const commonNativeAssets = (platform: BuildPlatform, arch: BuildArchitecture): NativeAssetRule[] => {
  const target = `${platform}-${arch}`
  return [
    {
      package: `@img/sharp-${target}`,
      source: 'lib',
      storePrefix: `@img+sharp-${target}@`,
      strategy: 'copy-directory',
    },
    {
      package: `@koromix/koffi-${target}`,
      source: `${platform}_${arch}/koffi.node`,
      storePrefix: `@koromix+koffi-${target}@`,
      strategy: 'copy-file',
    },
  ]
}

const commonModes = (minimal: ModeExpectation): ModeExpectation[] => [
  { mode: 'standard', minimum: 'native' },
  { mode: 'code', minimum: 'native' },
  { mode: 'cordis', minimum: 'native' },
  minimal,
]

export const TARGET_SPECS = [
  defineTarget({
    id: 'win32-x64',
    platform: 'win32',
    arch: 'x64',
    electron: { platform: 'win32', arch: 'x64' },
    nativeAssets: [
      ...commonNativeAssets('win32', 'x64'),
      {
        package: 'node-pty',
        source: 'prebuilds/win32-x64',
        storePrefix: 'node-pty@',
        strategy: 'copy-directory',
      },
    ],
    launchers: ['cmd', 'powershell'],
    formats: ['portable-zip', 'inno-setup'],
    updaterAdapter: 'portable-directory-win32',
    signing: {
      adapter: 'authenticode',
      officialReleaseRequiresEvidence: true,
      credentialEnvironment: ['WINDOWS_SIGNING_CERTIFICATE', 'WINDOWS_SIGNING_PASSWORD'],
    },
    requiredModeSupport: commonModes({
      mode: 'minimal',
      minimum: 'compatible',
      variant: 'win32-wsl',
      runtimeRequirements: ['WSL distribution', 'Bash inside WSL'],
      limitations: ['process-tree-unobservable', 'process-group-signals-emulated'],
    }),
  }),
  defineTarget({
    id: 'linux-x64',
    platform: 'linux',
    arch: 'x64',
    electron: { platform: 'linux', arch: 'x64' },
    nativeAssets: [
      ...commonNativeAssets('linux', 'x64'),
      {
        package: 'node-pty',
        source: 'build/Release/pty.node',
        strategy: 'electron-rebuild',
      },
      {
        package: '@deepseek-ai/node-addon-landlock-run-linux-x64',
        source: 'bin/landlock-run',
        strategy: 'generated-package',
      },
    ],
    launchers: ['sh'],
    formats: ['app-image', 'deb'],
    updaterAdapter: 'manual-package-linux',
    signing: {
      adapter: 'external-package-signing',
      officialReleaseRequiresEvidence: true,
      credentialEnvironment: ['LINUX_PACKAGE_SIGNING_KEY'],
    },
    requiredModeSupport: commonModes({ mode: 'minimal', minimum: 'native', variant: 'posix-bash' }),
  }),
  defineTarget({
    id: 'darwin-arm64',
    platform: 'darwin',
    arch: 'arm64',
    electron: { platform: 'darwin', arch: 'arm64' },
    nativeAssets: [
      ...commonNativeAssets('darwin', 'arm64'),
      {
        package: 'node-pty',
        source: 'prebuilds/darwin-arm64',
        storePrefix: 'node-pty@',
        strategy: 'copy-directory',
      },
    ],
    launchers: ['app-bundle'],
    formats: ['dmg'],
    updaterAdapter: 'manual-package-darwin',
    signing: {
      adapter: 'codesign-notarization',
      officialReleaseRequiresEvidence: true,
      credentialEnvironment: ['APPLE_SIGNING_IDENTITY', 'APPLE_NOTARY_PROFILE'],
    },
    requiredModeSupport: commonModes({ mode: 'minimal', minimum: 'native', variant: 'posix-bash' }),
  }),
] as const satisfies readonly TargetSpec[]

const TARGETS_BY_ID = new Map(TARGET_SPECS.map(target => [target.id, target]))

export type TargetId = typeof TARGET_SPECS[number]['id']

/** Resolve one registered target; unsupported platform/arch pairs fail loud. */
export function getTargetSpec(id: string): TargetSpec {
  const target = TARGETS_BY_ID.get(id as TargetId)
  if (target === undefined) {
    throw new Error(`unsupported build target ${JSON.stringify(id)}; use ${TARGET_SPECS.map(item => item.id).join(', ')}`)
  }
  return target
}

/** Compatibility bridge for the old --platform/--arch CLI pair. */
export function getTargetSpecFor(platform: string, arch: string): TargetSpec {
  return getTargetSpec(`${platform}-${arch}`)
}
