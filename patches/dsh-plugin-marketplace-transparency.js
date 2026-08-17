const CLIENT_MARKER = 'var PORTABLE_PLUGIN_AUDITS = {'
const SERVER_MARKER = 'const MARKETPLACE_BOOT_BUNDLES = new Set('

function replaceReviewed(source, original, replacement, label) {
  const first = source.indexOf(original)
  if (first < 0 || source.indexOf(original, first + original.length) >= 0) {
    throw new Error(`marketplace ${label} source no longer matches the reviewed bundle`)
  }
  return source.replace(original, replacement)
}

const CLIENT_CSS = `        '.dsh-market-progress-log { font-size: 10px; opacity: 0.6; white-space: pre-wrap; word-break: break-all; font-family: ui-monospace, SFMono-Regular, Consolas, monospace; max-height: 60px; overflow: hidden; }',`

const CLIENT_CSS_PATCHED = `${CLIENT_CSS}
        '.dsh-market-audit-chip { border: 1px solid rgba(128,128,128,0.45); border-radius: 999px; padding: 1px 8px; font-size: 11px; white-space: nowrap; }',
        '.dsh-market-audit-chip[data-review=reviewed] { color: var(--dsw-alias-state-success-primary, #16803c); border-color: currentColor; }',
        '.dsh-market-audit-chip[data-review=unknown] { color: var(--dsw-alias-state-warning-primary, #b4690e); border-color: currentColor; }',
        '.dsh-market-review { border: 1px solid rgba(128,128,128,0.3); border-radius: 7px; background: rgba(128,128,128,0.05); }',
        '.dsh-market-review > summary { cursor: pointer; padding: 7px 9px; font-size: 12px; font-weight: 600; list-style-position: inside; }',
        '.dsh-market-review-body { border-top: 1px solid rgba(128,128,128,0.25); padding: 8px 10px 10px; display: flex; flex-direction: column; gap: 7px; }',
        '.dsh-market-audit-grid { display: grid; grid-template-columns: minmax(110px, 0.3fr) minmax(0, 1fr); gap: 5px 10px; font-size: 11px; }',
        '.dsh-market-audit-key { opacity: 0.66; }',
        '.dsh-market-audit-value { overflow-wrap: anywhere; }',
        '.dsh-market-review-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; padding-top: 2px; }',
        '.dsh-market-review-warning { color: var(--dsw-alias-state-warning-primary, #9a5b08); font-size: 11px; }',
        '.dsh-market-lifecycle { display: flex; align-items: stretch; gap: 4px; flex-wrap: wrap; margin-top: 3px; }',
        '.dsh-market-life-step { flex: 1 1 116px; border: 1px solid rgba(128,128,128,0.3); border-radius: 6px; padding: 5px 7px; font-size: 10px; }',
        '.dsh-market-life-step strong { display: block; font-size: 11px; }',
        '.dsh-market-life-step[data-state=done] { border-color: var(--dsw-alias-state-success-primary, #16803c); }',
        '.dsh-market-life-step[data-state=pending] { border-color: var(--dsw-alias-state-warning-primary, #b4690e); }',
        '.dsh-market-life-step[data-state=off], .dsh-market-life-step[data-state=unknown] { opacity: 0.62; }',`

const CLIENT_PAGE_SIZE = `    var PAGE_SIZE = 50`

const CLIENT_AUDITS = `${CLIENT_PAGE_SIZE}

    // Portable-owned review snapshot. Unknown repositories stay explicitly
    // unverified; GitHub topic membership alone is not a compatibility claim.
    var PORTABLE_PLUGIN_AUDITS = {
      'omdsh-dev/dsh-genui': {
        reviewed: true,
        dshContract: '^0.1.0-rc.6 (rc7/Portable 未做 exact-profile 兼容声明)',
        platform: 'CI: Ubuntu, Node 22/24；Windows 与 macOS 未验证',
        externalRuntime: 'Node ^22.19.0 || >=24；内置 Mermaid / Three 前端资源',
        dataEgress: '可能打开 HTTP(S) 链接；表单/action 数据会回写对话并进入模型；默认不上传图片',
        activation: '安装后为全局工具与 standing glossary；不是 Agent-scoped',
        knownIssues: 'rc7 无原生 fence registry；长期 DOM observer 兼容路径不采用；action 非 durable；standing prompt 有固定 token 成本风险',
        verified: '报告核查 2026-08-17 · v0.8.6 · 2187fa4',
      },
      'anionex/dsh-vision-toolkit': {
        reviewed: true,
        dshContract: '^0.1.0-rc.6 (rc7/Portable 未做 exact-profile 兼容声明)',
        platform: 'CI: Ubuntu, Node 22/24 + Python 3.11；Windows 与 macOS 未验证',
        externalRuntime: 'Python runtime；固定上游 snapshot；pip/uv 版本锁定但 wheel/sdist 未全哈希',
        dataEgress: '远程工具会发送所选图片字节与 prompt；crop/trace/diff/palette/foreground 等本地路径不外发',
        activation: 'bootstrap 成功后才注册 Agent-scoped 工具；runtime 失败时保留 Settings 供修复',
        knownIssues: '与 Vision Bridge 可能争用 paste owner；共享服务的保留政策未知；Python 供应链需独立审计',
        verified: '报告核查 2026-08-17 · v0.1.28 · 28e9a98',
      },
      'zseven-w/dsh-openpencil': {
        reviewed: true,
        dshContract: '多个 ^0.1.0-rc.6 包 (rc7/Portable 未做 exact-profile 兼容声明)',
        platform: 'CI: Ubuntu, Node 24 + Rust 1.94；Windows 与 macOS 未验证',
        externalRuntime: 'OpenPencil binary/daemon；预览可尝试 Jian fallback；Web SDK / CanvasKit',
        dataEgress: '不默认调用远程视觉服务；viewer/editor 使用同源 signed grant；模型结果仍可见文件与 binary 路径',
        activation: '缺 binary 时 Runtime 应继续；render 可降级 Jian；managed editor 不可用时提供修复诊断',
        knownIssues: 'Windows 11 managed editor 401 (#2)；binary 来源/哈希/升级回滚与 render containment 尚未完整治理',
        verified: '报告核查 2026-08-17 · v0.1.0-rc.1 · ff9074d',
      },
    }

    function portableAuditFor(it) {
      var key = String((it && it.fullName) || '').toLowerCase()
      return PORTABLE_PLUGIN_AUDITS[key] || {
        reviewed: false,
        dshContract: 'Portable 未审阅；不要从 topic 标签推断兼容性',
        platform: '未验证',
        externalRuntime: '未验证；安装前检查 README、package.json 与安装脚本',
        dataEgress: '未验证联网或图片外发行为',
        activation: '未验证工具、prompt、daemon 的激活与卸载行为',
        knownIssues: 'Portable 尚无该仓库的审阅记录',
        verified: '未验证',
      }
    }

    function InstallReview(props) {
      var audit = props.audit
      var rows = [
        ['DSH contract', audit.dshContract],
        ['平台', audit.platform],
        ['外部 runtime', audit.externalRuntime],
        ['联网 / 图片外发', audit.dataEgress],
        ['激活 / 降级', audit.activation],
        ['已知问题', audit.knownIssues],
        ['最近验证', audit.verified],
      ]
      var disabled = props.status === 'sending' || props.status === 'sent'
        || props.status === 'installing' || props.status === 'installed'
      var action = props.status === 'error' ? '确认重试' : '确认安装'
      if (props.status === 'sending') action = '发送中…'
      if (props.status === 'sent') action = '已交给 agent'
      if (props.status === 'installing') action = '安装中…'
      if (props.status === 'installed') action = '已安装'
      return React.createElement('details', {
        className: 'dsh-market-review',
        'data-portable-install-review': props.item.fullName,
        'data-review': audit.reviewed ? 'reviewed' : 'unknown',
      },
        React.createElement('summary', null, '查看安装信息'),
        React.createElement('div', { className: 'dsh-market-review-body' },
          React.createElement('div', { className: 'dsh-market-audit-grid' },
            rows.flatMap(function (row, index) { return [
              React.createElement('span', { key: 'k' + index, className: 'dsh-market-audit-key' }, row[0]),
              React.createElement('span', { key: 'v' + index, className: 'dsh-market-audit-value' }, row[1]),
            ] }),
          ),
          audit.reviewed ? null : React.createElement('div', { className: 'dsh-market-review-warning' },
            '未验证插件可能改变工具、提示词、网络和本机进程表面。确认安装前请自行核查仓库。'),
          React.createElement('div', { className: 'dsh-market-review-actions' },
            React.createElement('button', {
              className: 'dsh-market-install',
              'data-state': props.status,
              'data-portable-confirm-install': props.item.fullName,
              onClick: props.onConfirm,
              disabled: disabled,
            }, action),
            React.createElement('span', { className: 'dsh-market-install-note' },
              '只有此处的确认按钮会开始安装。'),
          ),
        ),
      )
    }

    function PluginLifecycle(props) {
      var plugin = props.plugin
      var available = plugin.available
      var activated = plugin.activated === undefined ? plugin.enabled : plugin.activated
      var exposure = plugin.exposure || (activated ? 'unknown' : 'inactive')
      var exposedState = exposure === 'boot-configured' ? 'done'
        : exposure === 'pending-restart' || exposure === 'stale' ? 'pending'
          : exposure === 'inactive' ? 'off' : 'unknown'
      var exposedLabel = exposure === 'boot-configured' ? '启动时已配置'
        : exposure === 'pending-restart' ? '待重启'
          : exposure === 'stale' ? '旧版本可见，待重启'
            : exposure === 'inactive' ? '未暴露' : '状态未知'
      var steps = [
        ['Installed', 'done', '包已安装'],
        ['Available', available === true ? 'done' : available === false ? 'off' : 'unknown', available === true ? '入口与依赖可用' : available === false ? '入口或依赖缺失' : '状态未知'],
        ['Activated', activated ? 'done' : 'off', activated ? '已加入 profile' : '未加入 profile'],
        ['Exposed', exposedState, exposedLabel],
      ]
      return React.createElement('div', { className: 'dsh-market-lifecycle', 'aria-label': '插件生命周期' },
        steps.map(function (step) { return React.createElement('div', {
          key: step[0], className: 'dsh-market-life-step', 'data-state': step[1],
        }, React.createElement('strong', null, step[0]), step[2]) }),
      )
    }`

const CLIENT_BUTTON = `                var btn = React.createElement('button', {
                  className: 'dsh-market-install',
                  'data-state': st.status,
                  onClick: function () { install(it) },
                  disabled: sending || sent || installing || installed,
                }, installLabel(st))`

const CLIENT_BUTTON_PATCHED = `                var audit = portableAuditFor(it)
                var btn = React.createElement('span', {
                  className: 'dsh-market-audit-chip',
                  'data-review': audit.reviewed ? 'reviewed' : 'unknown',
                }, audit.reviewed ? 'Portable 已审阅' : 'Portable 未验证')`

const CLIENT_TAGS = `                  React.createElement('div', { className: 'dsh-market-tags' },
                    React.createElement('span', { className: 'dsh-market-tag' }, '★ ' + it.stars),
                    it.language ? React.createElement('span', { className: 'dsh-market-tag' }, it.language) : null,
                  ),`

const CLIENT_TAGS_PATCHED = `${CLIENT_TAGS}
                  React.createElement(InstallReview, {
                    item: it,
                    audit: audit,
                    status: st.status,
                    onConfirm: function () { install(it) },
                  }),`

const CLIENT_INSTALLED_DESCRIPTION = `                  p.description ? React.createElement('div', { className: 'dsh-market-desc' }, p.description) : null,
                  self ? React.createElement('div', { className: 'dsh-market-out' }, '当前正在使用的插件，不能关闭或卸载。') : null,`

const CLIENT_INSTALLED_DESCRIPTION_PATCHED = `                  p.description ? React.createElement('div', { className: 'dsh-market-desc' }, p.description) : null,
                  React.createElement(PluginLifecycle, { plugin: p }),
                  self ? React.createElement('div', { className: 'dsh-market-out' }, '当前正在使用的插件，不能关闭或卸载。') : null,`

/** Add reviewed pre-install disclosure, explicit confirmation, and lifecycle UI. */
export function patchMarketplaceTransparencyClient(source) {
  if (source.includes(CLIENT_MARKER)) return source
  let output = replaceReviewed(source, CLIENT_CSS, CLIENT_CSS_PATCHED, 'client CSS')
  output = replaceReviewed(output, CLIENT_PAGE_SIZE, CLIENT_AUDITS, 'client audit model')
  output = replaceReviewed(output, CLIENT_BUTTON, CLIENT_BUTTON_PATCHED, 'client install entry')
  output = replaceReviewed(output, CLIENT_TAGS, CLIENT_TAGS_PATCHED, 'client review panel')
  output = replaceReviewed(output, CLIENT_INSTALLED_DESCRIPTION, CLIENT_INSTALLED_DESCRIPTION_PATCHED, 'client lifecycle panel')
  return output
}

const SERVER_BOOT = `const HARNESS_BOOT_MS = Date.now()`

const SERVER_BOOT_PATCHED = `${SERVER_BOOT}
const bootProfile = profileManifest()
const MARKETPLACE_BOOT_BUNDLES = new Set(
  Array.isArray(bootProfile && bootProfile.dsh && bootProfile.dsh.profile && bootProfile.dsh.profile.bundles)
    ? bootProfile.dsh.profile.bundles
    : [],
)`

const SERVER_LOADABLE = `function pluginLoadable(name) {
  const manifest = profileManifest()
  if (!manifest) return false
  const bundles = Array.isArray(manifest.dsh && manifest.dsh.profile && manifest.dsh.profile.bundles)
    ? manifest.dsh.profile.bundles
    : []
  if (!bundles.includes(name)) return false
  const inst = installedManifest(name)
  if (!inst) return false
  const base = join(webProfileDir(), 'node_modules', ...String(name).split('/'))
  if (inst.dsh && inst.dsh.bundle && inst.dsh.bundle.patch !== undefined) {
    const patchPath = join(base, String(inst.dsh.bundle.patch).split('/').join(sep))
    if (!existsSync(patchPath)) return false
  }
  if (inst.main) {
    const mainPath = join(base, String(inst.main).split('/').join(sep))
    if (!existsSync(mainPath)) return false
  }
  return true
}`

const SERVER_LOADABLE_PATCHED = `function pluginAvailable(name) {
  const inst = installedManifest(name)
  if (!inst || !(inst.dsh?.bundle?.patch !== undefined || inst.dsh?.client !== undefined)) return false
  const base = join(webProfileDir(), 'node_modules', ...String(name).split('/'))
  if (inst.dsh?.bundle?.patch !== undefined) {
    const patchPath = join(base, String(inst.dsh.bundle.patch).split('/').join(sep))
    if (!existsSync(patchPath)) return false
  }
  if (inst.main) {
    const mainPath = join(base, String(inst.main).split('/').join(sep))
    if (!existsSync(mainPath)) return false
  }
  return runtimeDepsReachable(name)
}

function pluginLoadable(name) {
  const manifest = profileManifest()
  if (!manifest) return false
  const bundles = Array.isArray(manifest.dsh && manifest.dsh.profile && manifest.dsh.profile.bundles)
    ? manifest.dsh.profile.bundles
    : []
  return bundles.includes(name) && pluginAvailable(name)
}`

const SERVER_ENTRY = `      enabled: isBundle,
      version,`

const SERVER_ENTRY_PATCHED = `      enabled: isBundle,
      available: pluginAvailable(name),
      activated: isBundle,
      exposure: MARKETPLACE_BOOT_BUNDLES.has(name)
        ? (needsRestart(name) ? 'stale' : 'boot-configured')
        : (isBundle ? 'pending-restart' : 'inactive'),
      version,`

/** Expose a conservative lifecycle projection from facts the marketplace already owns. */
export function patchMarketplaceLifecycleHost(source) {
  if (source.includes(SERVER_MARKER)) return source
  let output = replaceReviewed(source, SERVER_BOOT, SERVER_BOOT_PATCHED, 'host boot snapshot')
  output = replaceReviewed(output, SERVER_LOADABLE, SERVER_LOADABLE_PATCHED, 'host availability split')
  output = replaceReviewed(output, SERVER_ENTRY, SERVER_ENTRY_PATCHED, 'host lifecycle inventory')
  return output
}
