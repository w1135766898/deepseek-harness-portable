# ============================================================================
# DeepSeek Harness portable distribution payload manifest
# ============================================================================

$global:RELEASE_PAYLOAD = @(
    'release-manifest.json',
    'dsh.cmd',
    'pnpm.cmd',
    'uninstall.cmd',
    'uninstall.ps1',
    'update.ps1',
    'update.cmd',
    'setup-shortcuts.ps1',
    'start-web.cmd',
    'start-desktop.cmd',
    '启动网页版.bat',
    '启动桌面窗口.bat',
    '启动桌面版.bat',
    '在线更新.bat',
    '创建桌面快捷方式.bat',
    '一键解除拦截(自签名信任).bat',
    '使用说明.txt',
    '使用说明.en.txt',
    'smoke-native.cjs',
    'updater\updater.psm1',
    'updater\release-payload.ps1'
)
