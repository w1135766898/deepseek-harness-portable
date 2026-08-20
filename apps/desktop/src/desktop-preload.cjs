const { contextBridge, ipcRenderer } = require('electron')
const { getLocaleMessages, localeFromSystem, messageForLocale, normalizePreference } = require('./desktop-locale.cjs')

const DEEPSEEK_LOGO_DATA_URI = 'data:image/png;base64,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'

const SPLASH_STATUSES = new Set(['engine', 'workspace', 'interface'])
const isSplashDocument = window.location.protocol === 'file:'

const splashListeners = new Set()
const splashStateListeners = new Set()
const splashTransitionListeners = new Set()
const splashLocaleListeners = new Set()
const splashThemeListeners = new Set()
ipcRenderer.on('desktop:splash-status', (_event, value) => {
  const status = value && typeof value === 'object' ? value.status : value
  if (!SPLASH_STATUSES.has(status)) return
  splashListeners.forEach(listener => listener(status))
})
ipcRenderer.on('desktop:splash-state', (_event, value) => {
  splashStateListeners.forEach(listener => listener(value && typeof value === 'object' ? value : {}))
})
ipcRenderer.on('desktop:splash-transition', (_event, value) => {
  splashTransitionListeners.forEach(listener => listener(value))
})
ipcRenderer.on('desktop:splash-locale', (_event, value) => {
  const locale = normalizePreference(value?.locale) || localeFromSystem(typeof navigator === 'object' ? navigator.language : 'en')
  splashLocaleListeners.forEach(listener => listener(locale))
})
ipcRenderer.on('desktop:splash-theme', (_event, value) => {
  splashThemeListeners.forEach(listener => listener(value && typeof value === 'object' ? value : {}))
})

contextBridge.exposeInMainWorld('deepSeekSplash', {
  onStatus: callback => {
    if (typeof callback !== 'function') return () => {}
    splashListeners.add(callback)
    return () => splashListeners.delete(callback)
  },
  onState: callback => {
    if (typeof callback !== 'function') return () => {}
    splashStateListeners.add(callback)
    return () => splashStateListeners.delete(callback)
  },
  onTransition: callback => {
    if (typeof callback !== 'function') return () => {}
    splashTransitionListeners.add(callback)
    return () => splashTransitionListeners.delete(callback)
  },
  onLocale: callback => {
    if (typeof callback !== 'function') return () => {}
    splashLocaleListeners.add(callback)
    return () => splashLocaleListeners.delete(callback)
  },
  onTheme: callback => {
    if (typeof callback !== 'function') return () => {}
    splashThemeListeners.add(callback)
    return () => splashThemeListeners.delete(callback)
  },
  retry: () => ipcRenderer.send('desktop:splash-action', { type: 'retry' }),
  chooseWorkspace: () => ipcRenderer.send('desktop:splash-action', { type: 'choose-workspace' }),
})

contextBridge.exposeInMainWorld('deepSeekDesktop', {
  openReleaseNotes: context => ipcRenderer.send('desktop:release-notes:open', context || {}),
  showNotice: () => ipcRenderer.send('desktop:notice:show'),
})

if (!isSplashDocument) {
  // rc7 rendered one combined wordmark; rc8 renders the fish and official
  // wordmark as sibling SVGs. Either expanded brand remains our menu trigger.
  const NATIVE_BRAND_LOGO_SELECTOR = 'svg[viewBox="0 0 182 24"], svg[viewBox="26 0 156 24"]'
  const NATIVE_FISH_LOGO_SELECTOR = 'svg[viewBox="0 0 23.16 17.04"]'
  const DESKTOP_MENU_WIDTH = 248

  const state = {
    locale: localeFromSystem(typeof navigator === 'object' ? navigator.language : 'en'),
    data: undefined,
    modalContext: { mode: 'history' },
    modalOpen: false,
    modalLoading: false,
    menuOpen: false,
    menuFocusIndex: -1,
    menuSubmenu: undefined,
    menuPosition: { left: 8, top: 42 },
    recentWorkspaces: [],
    currentWorkspace: '',
    harnessStatus: { state: 'starting', consecutiveFailures: 0, message: '' },
    actionMessage: '',
    actionMessageTimer: undefined,
    notice: undefined,
    noticeTimer: undefined,
    requestId: 0,
    modalRefreshing: false,
    expandedVersions: new Set(),
    expansionSeedKey: '',
    modalReturnFocus: undefined,
    updateState: '',
    updateProgress: undefined,
    shellState: undefined,
  }

  function desktopText(key, values = {}) {
    return messageForLocale(state.locale, key, values)
  }

  function desktopMessages() {
    return getLocaleMessages(state.locale)
  }

  function shellEnvironmentLabel() {
    if (state.shellState?.native === true) {
      return desktopText('shell.menuStatusNative', { distros: state.shellState?.distros?.[0] || 'POSIX Bash' })
    }
    return state.shellState?.available
      ? desktopText('shell.menuStatusReady', { distros: state.shellState?.distros?.[0] || 'Linux' })
      : desktopText('shell.menuStatusMissing')
  }

  let chromeRefs
  let menuMarkup
  let noticeMarkup
  let healthMarkup
  let modalContentMarkup
  let noticeDismissCleanup
  let noticeDismissSequence = 0

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;')
  }

  function logoMarkup(className, alt = '') {
    return '<img class="' + className + '" src="' + DEEPSEEK_LOGO_DATA_URI + '" alt="' + escapeHtml(alt) + '" draggable="false">'
  }

  function formatDate(value) {
    if (!value) return ''
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return escapeHtml(value)
    return new Intl.DateTimeFormat(state.locale === 'zh' ? 'zh-CN' : 'en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(date)
  }

  function inlineMarkdown(value) {
    let text = escapeHtml(value)
    const tick = String.fromCharCode(96)
    text = text.replace(new RegExp(tick + '([^' + tick + ']+)' + tick, 'g'), '<code>$1</code>')
    text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    return text.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, (_match, label, url) => (
      '<button class="dsh-link" data-action="open-url" data-url="' + escapeHtml(url) + '">' + escapeHtml(label) + '</button>'
    ))
  }

  function releaseIcon(key) {
    return key === 'features' ? '✦' : (key === 'improvements' ? '↗' : (key === 'fixes' ? '✓' : '•'))
  }

  function mountGlobalStyles() {
    if (document.getElementById('dsh-desktop-layout-style')) return
    const style = document.createElement('style')
    style.id = 'dsh-desktop-layout-style'
    style.textContent = `
      :root { --dsh-titlebar-height: 36px; --dsh-window-surface: #f4f7fb; }
      html, body { height: 100%; min-height: 0 !important; background: var(--dsh-window-surface) !important; }
      body { overflow: hidden !important; overscroll-behavior: none; }
      body > * { min-height: 0; }
      #root, #app, #__next, [data-reactroot] { min-height: 0 !important; height: 100%; }
      main, [role="main"], [data-scroll-container], [data-radix-scroll-area-viewport] {
        min-height: 0 !important;
        overscroll-behavior: contain;
        scrollbar-gutter: stable;
      }
      main, [role="main"], [data-scroll-container], [data-radix-scroll-area-viewport] {
        overflow-y: auto;
        -webkit-overflow-scrolling: touch;
        scroll-behavior: smooth;
      }
      *, *::before, *::after {
        scrollbar-width: thin;
        scrollbar-color: rgba(128, 138, 156, .48) transparent;
        -webkit-user-select: text;
        user-select: text;
      }
      *::-webkit-scrollbar { width: 8px; height: 8px; }
      *::-webkit-scrollbar-track { background: transparent; }
      *::-webkit-scrollbar-thumb { background: rgba(128, 138, 156, .42); border: 2px solid transparent; border-radius: 999px; background-clip: padding-box; }
      *::-webkit-scrollbar-thumb:hover { background: rgba(128, 138, 156, .7); border: 1px solid transparent; background-clip: padding-box; }
      button, button *, a, a *, input, textarea, select, [role="button"], [role="button"] * {
        -webkit-user-select: none;
        user-select: none;
        -webkit-app-region: no-drag !important;
      }

      /* Desktop Layout: Frameless Scheme B with breathing room */
      [class*="SidebarRoot_root"],
      [class*="sidebarCol"] > div {
        padding-top: calc(var(--dsh-titlebar-height, 36px) + 6px) !important;
        box-sizing: border-box !important;
      }
      [class*="SidebarRoot_root"][class*="collapsed"],
      [class*="sidebarCol"] > div[class*="collapsed"] {
        padding-top: calc(var(--dsh-titlebar-height, 36px) + 18px) !important;
      }

      [class*="ConversationRoot_root"] > header,
      [class*="centerCol"] header:not([class*="dsh-"]) {
        padding-top: calc(var(--dsh-titlebar-height, 36px) + 12px) !important;
        box-sizing: border-box !important;
      }

      [class*="detailsCol"] header:not([class*="dsh-"]),
      [class*="DetailsPanel_header"],
      [class*="DetailsPanel_root"] > header {
        padding-top: calc(var(--dsh-titlebar-height, 36px) + 14px) !important;
        box-sizing: border-box !important;
      }

      [class*="logoRow"],
      [class*="titleCluster"],
      [class*="headerUtilities"],
      [class*="sessionLogButton"] {
        -webkit-app-region: no-drag !important;
      }

      button.dsh-native-brand-trigger,
      button.dsh-native-brand-trigger svg,
      .dsh-native-brand-trigger {
        color: #307bf0 !important;
        transition: color .15s ease;
      }
      button.dsh-native-brand-trigger:hover,
      button.dsh-native-brand-trigger:hover svg,
      .dsh-native-brand-trigger:hover {
        color: #3a8bff !important;
      }
    `
    document.head.appendChild(style)
  }

  function renderReleaseSections(release) {
    const sections = release?.sections || []
    const isZh = state.locale === 'zh'
    const body = isZh ? (release?.bodyZh || release?.body) : (release?.bodyEn || release?.body)
    if (sections.length === 0 && body) {
      return '<div class="dsh-release-item"><span class="dsh-release-icon other">•</span><div>' + inlineMarkdown(body) + '</div></div>'
    }
    if (sections.length === 0) return '<div class="dsh-empty-copy">' + escapeHtml(desktopText('release.maintenance')) + '</div>'
    const rendered = sections.map(section => {
      const title = isZh
        ? (section.titleZh || section.labelZh || section.title || '其他')
        : (section.titleEn || section.label || section.title || 'Other')
      const rawItems = isZh ? section.itemsZh : section.itemsEn
      const items = Array.isArray(rawItems) && rawItems.length > 0
        ? rawItems
        : (Array.isArray(section.items) ? section.items : [])
      if (items.length === 0) return ''
      return '<section class="dsh-release-section"><h3><span class="dsh-section-icon ' + escapeHtml(section.key || 'other') + '">' + releaseIcon(section.key) + '</span>' + escapeHtml(title) + '</h3>' +
        items.map(item => '<div class="dsh-release-item"><span class="dsh-release-icon ' + escapeHtml(section.key || 'other') + '">' + releaseIcon(section.key) + '</span><div>' + inlineMarkdown(item) + '</div></div>').join('') +
        '</section>'
    }).filter(Boolean).join('')
    return rendered || '<div class="dsh-empty-copy">' + escapeHtml(desktopText('release.maintenance')) + '</div>'
  }

  function renderTimeline(releases) {
    if (!Array.isArray(releases) || releases.length === 0) return '<div class="dsh-empty-copy">' + escapeHtml(desktopText('release.noHistory')) + '</div>'
    ensureExpandedVersions(releases)
    return '<div class="dsh-timeline" aria-label="' + escapeHtml(desktopText('release.timelineAria')) + '">' + releases.map((release, index) => {
      const version = String(release.version || '')
      const current = version === state.data?.currentVersion
      const expanded = state.expandedVersions.has(version)
      const itemId = releaseElementId(version)
      const bodyId = itemId + '-body'
      const badges = renderReleaseBadges(release)
      const chevronSvg = '<svg class="dsh-accordion-chevron" viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 4 10 8 6 12"/></svg>'
      return '<article class="dsh-accordion-item ' + (current ? 'is-current ' : '') + (expanded ? 'is-expanded' : '') + '"><div class="dsh-release-node" aria-hidden="true"></div><button class="dsh-accordion-header" type="button" data-action="toggle-release" data-version="' + escapeHtml(version) + '" id="' + escapeHtml(itemId) + '" aria-expanded="' + (expanded ? 'true' : 'false') + '" aria-controls="' + escapeHtml(bodyId) + '">' + chevronSvg + '<span class="dsh-release-heading"><span class="dsh-version">v' + escapeHtml(version) + '</span><span class="dsh-type">' + escapeHtml(releaseTypeLabel(release.releaseType)) + '</span>' + (current ? '<span class="dsh-current">' + escapeHtml(desktopText('release.current')) + '</span>' : (index === 0 ? '<span class="dsh-latest">' + escapeHtml(desktopText('release.latest')) + '</span>' : '')) + '</span><span class="dsh-release-badges">' + badges + '</span><time datetime="' + escapeHtml(release.publishedAt || '') + '">' + formatDate(release.publishedAt) + '</time></button><div class="dsh-accordion-body" id="' + escapeHtml(bodyId) + '" role="region" aria-labelledby="' + escapeHtml(itemId) + '"' + (expanded ? '' : ' hidden') + '>' + renderReleaseSections(release) + '</div></article>'
    }).join('') + '</div>'
  }

  function releaseElementId(version) {
    return 'dsh-release-' + encodeURIComponent(String(version || 'version')).replace(/%/g, '_')
  }

  function renderReleaseBadges(release) {
    const badges = Array.isArray(release?.badgeSummary) ? release.badgeSummary : []
    return badges.map(badge => '<span class="dsh-badge ' + escapeHtml(badge.key || 'other') + '" title="' + escapeHtml(state.locale === 'zh' ? (badge.labelZh || badge.label || '') : (badge.label || badge.labelZh || '')) + '">' + escapeHtml(badge.icon || '•') + ' ' + escapeHtml(badge.count) + '</span>').join('')
  }

  function releaseTypeLabel(value) {
    if (value === 'Major') return desktopText('release.releaseTypeMajor')
    if (value === 'Minor') return desktopText('release.releaseTypeMinor')
    if (value === 'Patch' || !value) return desktopText('release.releaseTypePatch')
    return String(value)
  }

  function ensureExpandedVersions(releases) {
    if (!Array.isArray(releases) || releases.length === 0) return
    const latestVersion = String(releases[0]?.version || '')
    const currentVersion = String(state.data?.currentVersion || '')
    const seedKey = latestVersion + '|' + currentVersion
    if (state.expansionSeedKey === seedKey) return
    if (latestVersion) state.expandedVersions.add(latestVersion)
    if (currentVersion) state.expandedVersions.add(currentVersion)
    state.expansionSeedKey = seedKey
  }

  function formatBytes(value) {
    const bytes = Number(value)
    if (!Number.isFinite(bytes) || bytes <= 0) return ''
    if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + ' KB'
    return (bytes / (1024 * 1024)).toFixed(bytes >= 100 * 1024 * 1024 ? 0 : 1) + ' MB'
  }

  function renderProgress(status) {
    const value = Number.isFinite(status?.progress) ? Math.max(0, Math.min(100, Number(status.progress))) : undefined
    return '<div class="dsh-update-progress" role="group" aria-label="' + escapeHtml(desktopText('release.progressAria')) + '"><div class="dsh-progress-track"><span class="dsh-progress-fill' + (value === undefined ? ' indeterminate' : '') + '"' + (value === undefined ? '' : ' style="width:' + value + '%"') + '></span></div><span class="dsh-progress-label" role="status">' + (value === undefined ? escapeHtml(desktopText('release.processing')) : value + '%') + '</span></div>'
  }

  function renderPortableUpdateCard() {
    const data = state.data || {}
    const persisted = data.updateStatus || {}
    const live = state.updateProgress || {}
    const rawState = live.state || persisted.state || (data.updateAvailable ? 'available' : 'idle')
    const targetVersion = live.targetVersion || persisted.targetVersion || data.latestRelease?.version || ''
    const update = data.latestRelease || data.currentRelease || {}
    const manualDownload = data.portableUpdateSupported === false
    const message = live.label || live.message || persisted.message || state.updateState
    const busy = ['starting', 'checking', 'downloading', 'verifying', 'extracting', 'replacing'].includes(rawState)
    const ready = rawState === 'ready'
    const failed = rawState === 'failed' || rawState === 'interrupted'
    const completed = rawState === 'completed' || rawState === 'updated'
    const size = formatBytes(update.assetSize)
    const versionLabel = targetVersion ? 'v' + escapeHtml(targetVersion) : escapeHtml(desktopText('release.currentVersion'))
    const button = (action, label, kind = 'primary', extra = '') => '<button class="dsh-button ' + kind + '" type="button" data-action="' + action + '"' + extra + '>' + escapeHtml(label) + '</button>'
    const rollbackButton = manualDownload ? '' : button('desktop-rollback', desktopText('release.rollback'), 'ghost')

    if (state.modalLoading) return '<div class="dsh-loading">' + escapeHtml(desktopText('release.loadingLocal')) + '</div>'
    if (data.error) return '<section class="dsh-hero-card dsh-hero-card-error" role="alert"><div class="dsh-hero-copy"><span class="dsh-status-kicker">' + escapeHtml(desktopText('release.unavailableKicker')) + '</span><strong>' + escapeHtml(desktopText('release.unavailableTitle')) + '</strong><small>' + escapeHtml(data.error) + '</small></div><div class="dsh-hero-actions">' + button('retry-update', desktopText('release.retry'), 'secondary') + '</div></section>'
    if (failed) {
      const retryButtons = (data.updateAvailable
        ? button('update', desktopText(manualDownload ? 'release.openDownloadPage' : 'release.downloadNow'), 'primary') + button('retry-update', desktopText('release.retry'), 'secondary')
        : button('retry-update', desktopText('release.retry'), 'secondary')
      ) + rollbackButton
      return '<section class="dsh-hero-card dsh-hero-card-error" role="alert"><div class="dsh-hero-copy"><span class="dsh-status-kicker">' + escapeHtml(rawState === 'interrupted' ? desktopText('release.failedInterrupted') : desktopText('release.transactionError')) + '</span><strong>' + escapeHtml(message || desktopText('release.failedFallback')) + '</strong><small>' + escapeHtml(desktopText('release.targetVersion', { version: versionLabel })) + '</small></div><div class="dsh-hero-actions">' + retryButtons + '</div></section>'
    }
    if (completed && targetVersion === (data.currentVersion || '')) return '<section class="dsh-hero-card dsh-hero-card-success" role="status"><div class="dsh-hero-copy"><span class="dsh-status-kicker">' + escapeHtml(desktopText('release.completed')) + '</span><strong>' + escapeHtml(desktopText('release.updatedTo', { version: versionLabel })) + '</strong><small>' + escapeHtml(message || desktopText('release.healthPassed')) + '</small></div><div class="dsh-hero-actions">' + rollbackButton + '</div></section>'
    if (rawState === 'rolled-back') return '<section class="dsh-hero-card dsh-hero-card-success" role="status"><div class="dsh-hero-copy"><span class="dsh-status-kicker">' + escapeHtml(desktopText('release.rollbackKicker')) + '</span><strong>' + escapeHtml(desktopText('release.rolledBackTo', { version: versionLabel })) + '</strong><small>' + escapeHtml(message || desktopText('release.rollbackDetail')) + '</small></div></section>'
    if (rawState === 'idle' && !data.updateAvailable) return '<section class="dsh-hero-card dsh-hero-card-neutral" role="status"><div class="dsh-hero-copy"><span class="dsh-status-kicker">' + escapeHtml(desktopText('release.portableChannel')) + '</span><strong>' + escapeHtml(desktopText('release.latestVersion', { version: data.currentVersion || '—' })) + '</strong><small>' + escapeHtml(data.sourceErrors?.portable || (data.offline ? desktopText('release.offline') : desktopText('release.noUpdate'))) + '</small></div></section>'

    const title = ready
      ? desktopText('release.readyTitle', { version: versionLabel })
      : (busy ? desktopText('release.busyTitle', { version: versionLabel }) : desktopText('release.availableTitle', { version: versionLabel }))
    const detail = ready
      ? desktopText('release.readyDetail')
      : (busy ? (message || desktopText('release.busyDetail')) : desktopText('release.availableDetail') + (size ? ' · ' + size : ''))
    const action = ready
      ? button('update', desktopText(manualDownload ? 'release.openDownloadPage' : 'release.restartUpdate'))
      : (busy ? button('update', desktopText('release.updating'), 'secondary', ' disabled') : button('update', desktopText(manualDownload ? 'release.openDownloadPage' : 'release.downloadNow')))
    return '<section class="dsh-hero-card ' + (ready ? 'dsh-hero-card-ready' : (busy ? 'dsh-hero-card-progress' : 'dsh-hero-card-available')) + '" role="status" aria-live="polite"><div class="dsh-hero-copy"><span class="dsh-status-kicker">' + escapeHtml(ready ? desktopText('release.verifiedKicker') : (busy ? desktopText('release.transactionEngine') : desktopText('release.foundNew'))) + '</span><strong>' + escapeHtml(title) + '</strong><small>' + escapeHtml(detail) + '</small>' + (busy ? renderProgress({ ...persisted, ...live }) : '') + '</div><div class="dsh-hero-actions">' + action + '</div></section>'
  }

  function renderHeroCard() {
    return '<div class="dsh-update-channels">' + renderPortableUpdateCard() + '</div>'
  }

  function renderModalContent() {
    const data = state.data
    const refreshing = state.modalRefreshing ? '<div class="dsh-refreshing" role="status">' + escapeHtml(desktopText('release.syncing')) + '</div>' : ''
    if (state.modalLoading) return '<div class="dsh-loading">' + escapeHtml(desktopText('release.loadingLocal')) + '</div>'
    return refreshing + (state.modalContext.mode === 'about'
      ? '<div class="dsh-about"><div class="dsh-about-logo">' + logoMarkup('dsh-about-logo-image', 'DeepSeek') + '</div><div class="dsh-status-kicker">DEEPSEEK HARNESS</div><h3>DeepSeek Harness</h3><p>' + escapeHtml(desktopText('release.aboutDescription')) + '</p><p class="dsh-muted">' + escapeHtml(desktopText('release.kernelVersion', { version: data?.localInfo?.kernelVersion || 'unknown' })) + ' · ' + escapeHtml(desktopText('release.desktopVersion', { version: data?.localInfo?.desktopVersion || 'unknown' })) + '</p></div>'
      : renderHeroCard() + renderTimeline(data?.history || []))
  }

  function renderModalShell() {
    return '<div class="dsh-modal-layer" aria-hidden="true"><button class="dsh-modal-backdrop" data-action="modal-close" aria-hidden="true" tabindex="-1"></button><section class="dsh-modal-dialog" role="dialog" aria-modal="true" aria-labelledby="dsh-modal-title" aria-describedby="dsh-modal-subtitle"><header class="dsh-modal-header"><div class="dsh-header-brand"><div class="dsh-brand-badge">' + logoMarkup('dsh-brand-logo', 'DeepSeek') + '</div><div><div class="dsh-eyebrow">DEEPSEEK HARNESS</div><h2 class="dsh-modal-title" id="dsh-modal-title">' + escapeHtml(desktopText('release.modalTitle')) + '</h2><span class="dsh-subtitle" id="dsh-modal-subtitle"></span></div></div><div class="dsh-header-controls"><nav class="dsh-modal-tabs" role="tablist" aria-label="' + escapeHtml(desktopText('release.modalTitle')) + '"><button class="dsh-tab dsh-notes-tab active" type="button" data-action="show-notes" role="tab" id="dsh-notes-tab" aria-selected="true" aria-controls="dsh-modal-scroll">' + escapeHtml(desktopText('release.versionActivity')) + '</button><button class="dsh-tab dsh-about-tab" type="button" data-action="show-about" role="tab" id="dsh-about-tab" aria-selected="false" aria-controls="dsh-modal-scroll">' + escapeHtml(desktopText('release.about')) + '</button></nav><button class="dsh-modal-close-btn" type="button" data-action="modal-close" aria-label="' + escapeHtml(desktopText('release.close')) + '">×</button></div></header><main class="dsh-modal-body" id="dsh-modal-scroll" role="tabpanel" tabindex="-1" aria-labelledby="dsh-notes-tab"></main><footer class="dsh-modal-footer"><div class="dsh-footer-left"><button class="dsh-button ghost" type="button" data-action="open-github">' + escapeHtml(desktopText('release.githubRepository')) + '</button><button class="dsh-button ghost" type="button" data-action="desktop-export-diagnostics">' + escapeHtml(desktopText('menu.copyDiagnostics')) + '</button></div><div class="dsh-footer-right"><button class="dsh-button secondary" type="button" data-action="modal-close">' + escapeHtml(desktopText('release.complete')) + '</button></div></footer></section></div>'
  }

  function syncModal() {
    if (chromeRefs === undefined) return
    const isAbout = state.modalContext.mode === 'about'
    const title = isAbout ? desktopText('release.aboutTitle', { appName: 'DeepSeek Harness' }) : desktopText('release.modalTitle')
    const version = state.data?.currentVersion || '—'
    chromeRefs.modalLayer.classList.toggle('is-open', state.modalOpen)
    chromeRefs.modalLayer.setAttribute('aria-hidden', state.modalOpen ? 'false' : 'true')
    chromeRefs.modalDialog.classList.toggle('is-about-mode', isAbout)
    chromeRefs.modalTitle.textContent = title
    chromeRefs.modalSubtitle.textContent = desktopText('release.installedVersion', { version })
    chromeRefs.notesTab.textContent = desktopText('release.versionActivity')
    chromeRefs.aboutTab.textContent = desktopText('release.about')
    chromeRefs.modalCloseButton.setAttribute('aria-label', desktopText('release.close'))
    chromeRefs.githubButton.textContent = desktopText('release.githubRepository')
    chromeRefs.diagnosticsButton.textContent = desktopText('menu.copyDiagnostics')
    chromeRefs.completeButton.textContent = desktopText('release.complete')
    chromeRefs.notesTab.classList.toggle('active', !isAbout)
    chromeRefs.aboutTab.classList.toggle('active', isAbout)
    chromeRefs.notesTab.setAttribute('aria-selected', isAbout ? 'false' : 'true')
    chromeRefs.aboutTab.setAttribute('aria-selected', isAbout ? 'true' : 'false')
    chromeRefs.modalBody.setAttribute('aria-labelledby', isAbout ? 'dsh-about-tab' : 'dsh-notes-tab')
    const content = renderModalContent()
    if (content !== modalContentMarkup) {
      chromeRefs.modalBody.innerHTML = content
      modalContentMarkup = content
    }
  }

  function renderNotice() {
    const notice = state.notice
    const actionMarkup = state.actionMessage
      ? '<div class="dsh-action-toast" role="status">' + escapeHtml(state.actionMessage) + '</div>'
      : ''
    if (!notice) return actionMarkup
    const release = notice.release || {}
    const status = notice.updateStatus || {}
    const isAvailable = notice.kind === 'available'
    const isProblem = notice.kind === 'failed' || notice.kind === 'interrupted'
    const isRolledBack = notice.kind === 'rolled-back'
    const isReady = notice.kind === 'ready'
    let title
    let desc
    let actionLabel
    let action
    if (isAvailable) {
      title = desktopText('release.availableTitle', { version: 'v' + (release.version || '—') })
      desc = desktopText('release.openFeaturesDescription')
      actionLabel = desktopText('release.openFeatures')
      action = 'open-release-notes'
    } else if (isProblem) {
      title = notice.kind === 'failed' ? desktopText('release.updateFailed') : desktopText('release.failedInterrupted')
      desc = status.message || desktopText('release.failedFallback')
      actionLabel = desktopText('release.retry')
      action = 'retry-update'
    } else if (isReady) {
      const readyVersion = status.targetVersion || release.version || notice.currentVersion || '—'
      title = desktopText('release.readyTitle', { version: 'v' + readyVersion })
      desc = status.message || desktopText('release.readyDetail')
      actionLabel = desktopText('release.restartUpdate')
      action = 'update'
    } else if (isRolledBack) {
      const rollbackVersion = status.targetVersion || release.version || notice.currentVersion || '—'
      title = '↺ ' + desktopText('release.rolledBackTo', { version: 'v' + rollbackVersion })
      desc = status.message || desktopText('release.rollbackDetail')
      actionLabel = desktopText('release.openFeatures')
      action = 'open-release-notes'
    } else {
      title = '🎉 ' + desktopText('release.updatedTo', { version: 'v' + (release.version || notice.currentVersion || '—') })
      desc = desktopText('release.historyDescription')
      actionLabel = desktopText('release.openFeatures')
      action = 'open-release-notes'
    }
    const version = status.targetVersion || release.version || notice.currentVersion || ''
    const neverButton = isReady
      ? ''
      : '<button class="dsh-button ghost dsh-notice-never" data-action="notice-dismiss-forever" data-version="' + escapeHtml(version) + '"' + (version ? '' : ' disabled') + '>' + escapeHtml(desktopText('release.never')) + '</button>'
    const releaseUrl = isKernelAvailable ? ' data-release-url="' + escapeHtml(release.releaseUrl || '') + '"' : ''
    return actionMarkup + '<section class="dsh-notice" role="status"><div class="dsh-notice-icon">' + logoMarkup('dsh-notice-logo') + '</div><div class="dsh-notice-copy"><strong>' + escapeHtml(title) + '</strong><span>' + escapeHtml(desc) + '</span></div><button class="dsh-button primary" data-action="' + action + '"' + releaseUrl + '>' + escapeHtml(actionLabel) + '</button>' + neverButton + '<button class="dsh-notice-dismiss" data-action="notice-dismiss" aria-label="' + escapeHtml(desktopText('release.closeNotice')) + '">×</button></section>'
  }

  function showActionMessage(message) {
    state.actionMessage = typeof message === 'string' ? message : ''
    if (state.actionMessageTimer !== undefined) clearTimeout(state.actionMessageTimer)
    render()
    if (state.actionMessage !== '') {
      state.actionMessageTimer = setTimeout(() => {
        state.actionMessage = ''
        state.actionMessageTimer = undefined
        render()
      }, 5000)
    }
  }

  function renderHealthBanner() {
    const status = state.harnessStatus || {}
    if (status.state !== 'disconnected') return ''
    return '<section class="dsh-disconnect-banner" role="alert"><div class="dsh-disconnect-copy"><strong>' + escapeHtml(desktopText('health.disconnected')) + '</strong><span>' + escapeHtml(status.message || desktopText('health.unavailable')) + '</span></div><button class="dsh-button" data-action="health-reconnect">' + escapeHtml(desktopText('health.reconnect')) + '</button><button class="dsh-button primary" data-action="health-restart">' + escapeHtml(desktopText('health.restart')) + '</button></section>'
  }

  const MENU_ICONS = {
    workspace: '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.5 6.5L8 2.5l5.5 4v6.5a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1v-6.5z"/><path d="M6 14v-4.5h4V14"/></svg>',
    recentWorkspaces: '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 4.5A1.5 1.5 0 0 1 3.5 3h2.8l1.4 1.5H12.5A1.5 1.5 0 0 1 14 6v5.5a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 2 11.5v-7z"/><polyline points="7.5 7 9.5 8.5 7.5 10"/></svg>',
    refresh: '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.5 8a5.5 5.5 0 1 1 1.6 3.9L2.5 13.5"/><polyline points="2.5 9.5 2.5 13.5 6.5 13.5"/></svg>',
    restart: '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9L13.5 2.5"/><polyline points="13.5 6.5 13.5 2.5 9.5 2.5"/></svg>',
    browser: '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 9v4a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h4"/><polyline points="9.5 2.5 13.5 2.5 13.5 6.5"/><line x1="6.5" y1="9.5" x2="13.5" y2="2.5"/></svg>',
    advanced: '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="2.5" y1="4" x2="13.5" y2="4"/><circle cx="5.5" cy="4" r="1.75" fill="currentColor"/><line x1="2.5" y1="8" x2="13.5" y2="8"/><circle cx="10.5" cy="8" r="1.75" fill="currentColor"/><line x1="2.5" y1="12" x2="13.5" y2="12"/><circle cx="6.5" cy="12" r="1.75" fill="currentColor"/></svg>',
    terminal: '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="2.5" width="12" height="11" rx="2"/><polyline points="5 6 7.5 8 5 10"/><line x1="9" y1="10.5" x2="11.5" y2="10.5"/></svg>',
    log: '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 2H4a1.5 1.5 0 0 0-1.5 1.5v9A1.5 1.5 0 0 0 4 14h8a1.5 1.5 0 0 0 1.5-1.5V6L9 2z"/><polyline points="9 2 9 6 13 6"/><line x1="5.5" y1="8.5" x2="10.5" y2="8.5"/><line x1="5.5" y1="11" x2="9" y2="11"/></svg>',
    resetCache: '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M13.5 8A5.5 5.5 0 0 1 3.5 11.5M2.5 8A5.5 5.5 0 0 1 12.5 4.5"/><polyline points="2.5 12 3.5 11.5 4 13.5"/><polyline points="13.5 4 12.5 4.5 12 2.5"/><line x1="6" y1="6" x2="10" y2="10"/><line x1="10" y1="6" x2="6" y2="10"/></svg>',
    about: '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="8" cy="8" r="6"/><line x1="8" y1="7" x2="8" y2="11.5"/><circle cx="8" cy="4.75" r="0.75" fill="currentColor"/></svg>',
    expandChevron: '<svg class="dsh-menu-expand" viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 4 10 8 6 12"/></svg>',
    check: '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3.5 8.5 6.5 11.5 12.5 4.5"/></svg>',
    folder: '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 4.5A1.5 1.5 0 0 1 3.5 3h2.8l1.4 1.5H12.5A1.5 1.5 0 0 1 14 6v5.5a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 2 11.5v-7z"/></svg>',
    trash: '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 4.5h10M6 4.5V3a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v1.5M4.5 4.5v8a1.5 1.5 0 0 0 1.5 1.5h4a1.5 1.5 0 0 0 1.5-1.5v-8"/></svg>',
    dot: '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" aria-hidden="true"><circle cx="8" cy="8" r="2.5" fill="currentColor"/></svg>',
  }

  function renderRecentWorkspaceItems() {
    const entries = Array.isArray(state.recentWorkspaces) ? state.recentWorkspaces : []
    const items = entries.length === 0
      ? '<button class="dsh-menu-item" type="button" disabled><span>' + MENU_ICONS.dot + '</span><strong>' + escapeHtml(desktopText('menu.noRecentWorkspaces')) + '</strong></button>'
      : entries.map(path => (
        '<button class="dsh-menu-item" type="button" data-action="desktop-recent-workspace" data-path="' + escapeHtml(path) + '" role="menuitem"><span>' + (path === state.currentWorkspace ? MENU_ICONS.check : MENU_ICONS.folder) + '</span><strong>' + escapeHtml(path) + '</strong></button>'
      )).join('')
    return items + '<button class="dsh-menu-item" type="button" data-action="desktop-clear-recent-workspaces" role="menuitem"' + (entries.length === 0 ? ' disabled' : '') + '><span>' + MENU_ICONS.trash + '</span><strong>' + escapeHtml(desktopText('menu.clearRecentWorkspaces')) + '</strong></button>'
  }

  function isNativeBrandButton(button) {
    return button instanceof Element && button.querySelector(NATIVE_BRAND_LOGO_SELECTOR) !== null
  }

  function isNativeFishButton(button) {
    return button instanceof Element && button.querySelector(NATIVE_FISH_LOGO_SELECTOR) !== null
  }

  function isNativeMenuTrigger(button) {
    return isNativeBrandButton(button) || isNativeFishButton(button)
  }

  function nativeButtonFromTarget(target) {
    if (!(target instanceof Element)) return undefined
    const button = target.closest('button')
    if (!button) return undefined
    if (isNativeMenuTrigger(button)) return button
    return undefined
  }

  function findNativeBrandButton() {
    return Array.from(document.querySelectorAll('button')).find(button => button.querySelector(NATIVE_BRAND_LOGO_SELECTOR) !== null)
  }

  function findNativeFishButton() {
    return Array.from(document.querySelectorAll('button')).find(button => button.querySelector(NATIVE_FISH_LOGO_SELECTOR) !== null)
  }

  function findNativeMenuAnchor() {
    return findNativeBrandButton() || findNativeFishButton()
  }

  function defaultMenuPosition() {
    const titlebarHeight = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--dsh-titlebar-height'))
    return { left: 8, top: Math.round((Number.isFinite(titlebarHeight) ? titlebarHeight : 36) + 6) }
  }

  function menuPositionForButton(button) {
    if (!(button instanceof Element) || !button.isConnected) return defaultMenuPosition()
    const rect = button.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return defaultMenuPosition()
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0
    const left = Math.max(8, Math.min(Math.round(rect.left), Math.max(8, viewportWidth - DESKTOP_MENU_WIDTH)))
    return { left, top: Math.max(8, Math.round(rect.bottom + 6)) }
  }

  let brandObserver
  function observeBrandTrigger() {
    if (brandObserver || typeof MutationObserver !== 'function') return
    brandObserver = new MutationObserver(() => {
      syncNativeMenuTrigger()
    })
    brandObserver.observe(document.documentElement, { childList: true, subtree: true })
  }

  function syncNativeMenuTrigger() {
    const anchor = findNativeMenuAnchor()
    for (const stale of document.querySelectorAll('button.dsh-native-brand-trigger')) {
      if (stale !== anchor) {
        stale.classList.remove('dsh-native-brand-trigger')
        stale.removeAttribute('title')
        stale.removeAttribute('aria-haspopup')
        stale.removeAttribute('aria-expanded')
      }
    }
    if (!anchor) return
    if (!anchor.classList.contains('dsh-native-brand-trigger')) {
      anchor.classList.add('dsh-native-brand-trigger')
    }
    anchor.setAttribute('aria-haspopup', 'menu')
    anchor.setAttribute('aria-expanded', state.menuOpen ? 'true' : 'false')
    anchor.setAttribute('aria-label', desktopText('menu.desktopMenu'))
    anchor.title = desktopText('menu.desktopMenu')
  }

  function openMenuAt(anchor) {
    state.menuOpen = true
    state.menuFocusIndex = 0
    state.menuSubmenu = undefined
    state.menuPosition = menuPositionForButton(anchor || findNativeMenuAnchor())
    ipcRenderer.send('desktop:shell:probe')
    render()
  }

  function closeMenu() {
    state.menuOpen = false
    state.menuFocusIndex = -1
    state.menuSubmenu = undefined
    render()
  }

  function toggleMenu(anchor) {
    if (state.menuOpen) closeMenu()
    else openMenuAt(anchor || findNativeMenuAnchor())
  }

  function renderMenu() {
    if (!state.menuOpen) return ''
    const position = state.menuPosition || defaultMenuPosition()
    const positionMarkup = ' style="--dsh-menu-left:' + escapeHtml(position.left) + 'px;--dsh-menu-top:' + escapeHtml(position.top) + 'px"'
    const shellLabel = shellEnvironmentLabel()
    const hasUpdate = Boolean(state.data?.updateAvailable || state.notice?.kind === 'available' || state.updateProgress)
    const updateDot = hasUpdate ? '<span class="dsh-menu-dot" title="' + escapeHtml(desktopText('release.foundNew')) + '">●</span>' : ''

    const isRecentOpen = state.menuSubmenu === 'workspaces'
    const isMaintenanceOpen = state.menuSubmenu === 'maintenance'

    const recentSubmenu = '<div class="dsh-submenu-wrapper dsh-recent-submenu' + (isRecentOpen ? ' is-expanded' : '') + '" aria-hidden="' + (isRecentOpen ? 'false' : 'true') + '">' +
      '<div class="dsh-submenu-container">' + renderRecentWorkspaceItems() + '</div>' +
      '</div>'

    const maintenanceSubmenu = '<div class="dsh-submenu-wrapper dsh-maintenance-submenu' + (isMaintenanceOpen ? ' is-expanded' : '') + '" aria-hidden="' + (isMaintenanceOpen ? 'false' : 'true') + '">' +
      '<div class="dsh-submenu-container">' +
        '<button class="dsh-menu-item" data-action="desktop-shell-guide" role="menuitem"><span>' + MENU_ICONS.terminal + '</span><strong>' + escapeHtml(shellLabel) + '</strong></button>' +
        '<button class="dsh-menu-item" data-action="desktop-export-diagnostics" role="menuitem"><span>' + MENU_ICONS.log + '</span><strong>' + escapeHtml(desktopText('menu.copyDiagnostics')) + '</strong></button>' +
        '<button class="dsh-menu-item" data-action="desktop-clear-storage" role="menuitem"><span>' + MENU_ICONS.resetCache + '</span><strong>' + escapeHtml(desktopText('menu.clearWebStorage')) + '</strong></button>' +
      '</div>' +
      '</div>'

    return '<div class="dsh-menu-popover" role="menu" aria-label="' + escapeHtml(desktopText('menu.desktopMenu')) + '"' + positionMarkup + '>' +
      '<button class="dsh-menu-item" data-action="desktop-choose-workspace" role="menuitem"><span>' + MENU_ICONS.workspace + '</span><strong>' + escapeHtml(desktopText('menu.chooseWorkspace')) + '</strong></button>' +
      '<button class="dsh-menu-item dsh-menu-item-expandable' + (isRecentOpen ? ' is-expanded' : '') + '" data-action="desktop-toggle-recent" role="menuitem" aria-expanded="' + (isRecentOpen ? 'true' : 'false') + '"><span>' + MENU_ICONS.recentWorkspaces + '</span><strong>' + escapeHtml(desktopText('menu.recentWorkspaces')) + '</strong>' + MENU_ICONS.expandChevron + '</button>' +
      recentSubmenu +
      '<div class="dsh-menu-separator"></div>' +
      '<button class="dsh-menu-item" data-action="desktop-reload-ui" role="menuitem"><span>' + MENU_ICONS.refresh + '</span><strong>' + escapeHtml(desktopText('menu.refreshInterface')) + '</strong><kbd>Ctrl+R</kbd></button>' +
      '<button class="dsh-menu-item" data-action="desktop-restart" role="menuitem"><span>' + MENU_ICONS.restart + '</span><strong>' + escapeHtml(desktopText('menu.restartHarness')) + '</strong><kbd>Ctrl+Shift+R</kbd></button>' +
      '<button class="dsh-menu-item" data-action="desktop-open-browser" role="menuitem"><span>' + MENU_ICONS.browser + '</span><strong>' + escapeHtml(desktopText('menu.openBrowser')) + '</strong></button>' +
      '<div class="dsh-menu-separator"></div>' +
      '<button class="dsh-menu-item dsh-menu-item-expandable' + (isMaintenanceOpen ? ' is-expanded' : '') + '" data-action="desktop-toggle-maintenance" role="menuitem" aria-expanded="' + (isMaintenanceOpen ? 'true' : 'false') + '"><span>' + MENU_ICONS.advanced + '</span><strong>' + escapeHtml(desktopText('menu.maintenance')) + '</strong>' + (!state.shellState?.available && state.shellState?.native !== true && state.shellState !== undefined ? '<span class="dsh-menu-warn">⚠️</span>' : '') + MENU_ICONS.expandChevron + '</button>' +
      maintenanceSubmenu +
      '<div class="dsh-menu-separator"></div>' +
      '<button class="dsh-menu-item" data-action="desktop-about-and-updates" role="menuitem"><span>' + MENU_ICONS.about + '</span><strong>' + escapeHtml(desktopText('menu.aboutAndUpdates')) + '</strong>' + updateDot + '</button>' +
      '</div>'
  }

  function focusableMenuItems() {
    return Array.from(shadow.querySelectorAll('.dsh-menu-item:not(:disabled)')).filter(el => {
      const wrapper = el.closest('.dsh-submenu-wrapper')
      return !wrapper || wrapper.classList.contains('is-expanded')
    })
  }

  function syncMenuFocus() {
    const items = focusableMenuItems()
    items.forEach((item, index) => {
      const focused = state.menuOpen && index === state.menuFocusIndex
      item.classList.toggle('is-focused', focused)
      if (focused) item.setAttribute('aria-current', 'true')
      else item.removeAttribute('aria-current')
    })
    if (state.menuOpen && state.menuFocusIndex >= 0 && items[state.menuFocusIndex] !== undefined) {
      items[state.menuFocusIndex].focus({ preventScroll: true })
    }
  }

  function moveMenuFocus(delta) {
    const items = focusableMenuItems()
    if (items.length === 0) return
    const current = state.menuFocusIndex < 0 ? 0 : state.menuFocusIndex
    state.menuFocusIndex = (current + delta + items.length) % items.length
    syncMenuFocus()
  }

  function activateMenuFocus() {
    const items = focusableMenuItems()
    const item = items[state.menuFocusIndex]
    if (item !== undefined) item.click()
  }

  function syncMenu() {
    if (!state.menuOpen) {
      if (chromeRefs.menuHost.innerHTML !== '') {
        chromeRefs.menuHost.innerHTML = ''
        menuMarkup = ''
      }
      return
    }

    const popover = chromeRefs.menuHost.querySelector('.dsh-menu-popover')
    if (!popover) {
      const nextMenuMarkup = renderMenu()
      chromeRefs.menuHost.innerHTML = nextMenuMarkup
      menuMarkup = nextMenuMarkup
      return
    }

    const position = state.menuPosition || defaultMenuPosition()
    popover.style.setProperty('--dsh-menu-left', position.left + 'px')
    popover.style.setProperty('--dsh-menu-top', position.top + 'px')

    const isRecentOpen = state.menuSubmenu === 'workspaces'
    const isMaintenanceOpen = state.menuSubmenu === 'maintenance'

    const recentBtn = popover.querySelector('[data-action="desktop-toggle-recent"]')
    const recentWrapper = popover.querySelector('.dsh-recent-submenu')
    if (recentBtn && recentWrapper) {
      recentBtn.classList.toggle('is-expanded', isRecentOpen)
      recentBtn.setAttribute('aria-expanded', isRecentOpen ? 'true' : 'false')
      recentWrapper.classList.toggle('is-expanded', isRecentOpen)
      recentWrapper.setAttribute('aria-hidden', isRecentOpen ? 'false' : 'true')
      const recentContainer = recentWrapper.querySelector('.dsh-submenu-container')
      if (recentContainer) {
        const recentHtml = renderRecentWorkspaceItems()
        if (recentContainer.innerHTML !== recentHtml) {
          recentContainer.innerHTML = recentHtml
        }
      }
    }

    const maintenanceBtn = popover.querySelector('[data-action="desktop-toggle-maintenance"]')
    const maintenanceWrapper = popover.querySelector('.dsh-maintenance-submenu')
    if (maintenanceBtn && maintenanceWrapper) {
      maintenanceBtn.classList.toggle('is-expanded', isMaintenanceOpen)
      maintenanceBtn.setAttribute('aria-expanded', isMaintenanceOpen ? 'true' : 'false')
      maintenanceWrapper.classList.toggle('is-expanded', isMaintenanceOpen)
      maintenanceWrapper.setAttribute('aria-hidden', isMaintenanceOpen ? 'false' : 'true')
    }

    const shellItem = popover.querySelector('[data-action="desktop-shell-guide"] strong')
    if (shellItem) {
      const shellLabel = shellEnvironmentLabel()
      if (shellItem.textContent !== shellLabel) {
        shellItem.textContent = shellLabel
      }
    }
  }

  function render() {
    if (!host?.shadowRoot || chromeRefs === undefined) return
    syncMenu()
    const nextNoticeMarkup = renderNotice()
    if (nextNoticeMarkup !== noticeMarkup) {
      chromeRefs.noticeHost.innerHTML = nextNoticeMarkup
      noticeMarkup = nextNoticeMarkup
    }
    const nextHealthMarkup = renderHealthBanner()
    if (nextHealthMarkup !== healthMarkup) {
      chromeRefs.healthHost.innerHTML = nextHealthMarkup
      healthMarkup = nextHealthMarkup
    }
    syncModal()
    syncMenuFocus()
    syncNativeMenuTrigger()
  }

  function clearNoticeTimer() {
    if (state.noticeTimer !== undefined) clearTimeout(state.noticeTimer)
    state.noticeTimer = undefined
  }

  function cancelNoticeDismiss() {
    noticeDismissSequence += 1
    if (noticeDismissCleanup !== undefined) {
      noticeDismissCleanup()
      noticeDismissCleanup = undefined
    }
  }

  function dismissNotice(remember = false) {
    const notice = state.notice
    const version = notice?.release?.version || notice?.currentVersion || ''
    const node = chromeRefs?.noticeHost?.querySelector('.dsh-notice')
    clearNoticeTimer()
    if (remember && version) ipcRenderer.send('desktop:notice:dismiss', String(version).trim())

    cancelNoticeDismiss()
    if (!notice || node === null || node === undefined) {
      state.notice = undefined
      noticeMarkup = ''
      render()
      return
    }

    const sequence = noticeDismissSequence
    const finalize = () => {
      if (sequence !== noticeDismissSequence || state.notice !== notice) return
      const cleanup = noticeDismissCleanup
      noticeDismissCleanup = undefined
      if (cleanup !== undefined) cleanup()
      state.notice = undefined
      chromeRefs.noticeHost.replaceChildren()
      noticeMarkup = ''
      render()
    }
    const onAnimationEnd = event => {
      if (event.target === node && event.animationName === 'dsh-notice-out') finalize()
    }
    const fallbackTimer = setTimeout(finalize, 320)
    node.addEventListener('animationend', onAnimationEnd)
    noticeDismissCleanup = () => {
      clearTimeout(fallbackTimer)
      node.removeEventListener('animationend', onAnimationEnd)
    }
    node.classList.add('is-closing')
  }

  function scheduleNoticeDismiss() {
    clearNoticeTimer()
    state.noticeTimer = setTimeout(() => {
      state.noticeTimer = undefined
      dismissNotice()
    }, 7000)
  }

  function focusableModalElements() {
    if (!chromeRefs?.modalDialog) return []
    return Array.from(chromeRefs.modalDialog.querySelectorAll('button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])'))
      .filter(element => element instanceof HTMLElement && element.offsetParent !== null)
  }

  function focusModal() {
    const elements = focusableModalElements()
    const target = elements.find(element => element.matches('.dsh-modal-close-btn')) || elements[0]
    if (target) target.focus({ preventScroll: true })
  }

  function trapModalFocus(event) {
    if (!state.modalOpen || event.key !== 'Tab') return false
    const elements = focusableModalElements()
    if (elements.length === 0) return false
    const active = shadow.activeElement
    const currentIndex = elements.indexOf(active)
    if (currentIndex === -1) {
      event.preventDefault()
      focusModal()
      return true
    }
    if ((event.shiftKey && currentIndex === 0) || (!event.shiftKey && currentIndex === elements.length - 1)) {
      event.preventDefault()
      const nextIndex = event.shiftKey ? elements.length - 1 : 0
      elements[nextIndex].focus({ preventScroll: true })
    }
    return false
  }

  function closeModal() {
    if (!state.modalOpen) return
    state.modalOpen = false
    render()
    const returnFocus = state.modalReturnFocus
    state.modalReturnFocus = undefined
    if (returnFocus && typeof returnFocus.focus === 'function' && returnFocus.isConnected !== false) returnFocus.focus({ preventScroll: true })
  }

  function toggleReleaseAccordion(version) {
    const normalized = typeof version === 'string' ? version : ''
    if (!normalized) return
    if (state.expandedVersions.has(normalized)) state.expandedVersions.delete(normalized)
    else state.expandedVersions.add(normalized)
    render()
  }

  async function openModal(context = { mode: 'history' }) {
    const wasOpen = state.modalOpen
    if (!wasOpen) state.modalReturnFocus = document.activeElement
    state.modalContext = context && typeof context === 'object' ? context : { mode: 'history' }
    state.modalOpen = true
    state.modalLoading = true
    state.modalRefreshing = false
    const requestId = ++state.requestId
    render()
    let hasCachedData = false
    try {
      state.data = await ipcRenderer.invoke('desktop:release-notes:get-cached-data', state.modalContext)
      hasCachedData = true
    } catch {}
    if (requestId !== state.requestId) return
    state.modalLoading = false
    state.modalRefreshing = true
    render()
    try {
      const data = await ipcRenderer.invoke('desktop:release-notes:get-data', state.modalContext)
      if (requestId !== state.requestId) return
      state.data = data
    } catch (error) {
      if (!hasCachedData) state.data = { error: error instanceof Error ? error.message : String(error), history: [] }
    } finally {
      if (requestId === state.requestId) {
        state.modalRefreshing = false
        render()
        if (!wasOpen) focusModal()
      }
    }
  }

  function sendAction(type, extra = {}) {
    ipcRenderer.send('desktop:release-notes:action', { type, ...extra })
  }

  function sendMenuAction(type, extra = {}) {
    state.menuOpen = false
    state.menuFocusIndex = -1
    render()
    ipcRenderer.send('desktop:menu:action', { type, ...extra })
  }

  function handleAction(target) {
    const action = target?.dataset?.action
    if (!action) return
    if (action === 'desktop-toggle-recent') {
      state.menuSubmenu = state.menuSubmenu === 'workspaces' ? undefined : 'workspaces'
      render()
      return
    }
    if (action === 'desktop-toggle-maintenance') {
      state.menuSubmenu = state.menuSubmenu === 'maintenance' ? undefined : 'maintenance'
      render()
      return
    }
    if (action === 'desktop-about-and-updates') {
      closeMenu()
      void openModal({ mode: 'history' })
      return
    }
    if (action === 'desktop-check-updates') {
      sendMenuAction('check-for-updates')
      return
    }
    if (action === 'desktop-release-notes') {
      closeMenu()
      void openModal({ mode: 'history' })
      return
    }
    if (action === 'desktop-about') {
      closeMenu()
      void openModal({ mode: 'about' })
      return
    }
    if (action === 'desktop-choose-workspace') {
      sendMenuAction('choose-workspace')
      return
    }
    if (action === 'desktop-recent-workspace') {
      sendMenuAction('recent-workspace', { path: target.dataset.path })
      return
    }
    if (action === 'desktop-clear-recent-workspaces') {
      sendMenuAction('clear-recent-workspaces')
      return
    }
    if (action === 'desktop-reload-ui') {
      sendMenuAction('reload-ui')
      return
    }
    if (action === 'desktop-shell-guide') {
      sendMenuAction('shell-guide')
      return
    }
    if (action === 'desktop-export-diagnostics') {
      sendMenuAction('export-diagnostics')
      return
    }
    if (action === 'desktop-clear-storage') {
      sendMenuAction('clear-storage')
      return
    }
    if (action === 'desktop-restart') {
      sendMenuAction('restart')
      return
    }
    if (action === 'desktop-open-browser') {
      sendMenuAction('open-browser')
      return
    }
    if (action === 'health-reconnect') {
      ipcRenderer.send('desktop:health:action', { type: 'reconnect' })
      return
    }
    if (action === 'health-restart') {
      ipcRenderer.send('desktop:health:action', { type: 'restart-engine' })
      return
    }
    if (action === 'notice-dismiss') {
      dismissNotice()
      return
    }
    if (action === 'notice-dismiss-forever') {
      dismissNotice(true)
      return
    }
    if (action === 'open-release-notes') {
      const context = state.notice?.kind === 'available'
        ? { mode: 'update', currentVersion: state.notice.currentVersion, update: state.notice.release }
        : { mode: 'history', selectedVersion: state.notice?.currentVersion }
      dismissNotice()
      void openModal(context)
      return
    }
    if (action === 'modal-close') {
      closeModal()
      return
    }
    if (action === 'toggle-release') {
      toggleReleaseAccordion(target.dataset.version)
      return
    }
    if (action === 'retry-update') {
      dismissNotice()
      state.updateProgress = undefined
      state.updateState = desktopText('update.prepareDownload')
      render()
      sendAction('retry-update')
      return
    }
    if (action === 'desktop-rollback') {
      sendMenuAction('rollback')
      return
    }
    if (action === 'update') {
      const version = state.data?.latestRelease?.version || state.notice?.release?.version || ''
      const ready = state.updateProgress?.state === 'ready' || state.data?.updateStatus?.state === 'ready'
      state.updateState = ready ? desktopText('release.restartUpdate') : desktopText('update.prepareDownload')
      render()
      sendAction('update', { targetVersion: version })
      return
    }
    if (action === 'show-about') {
      void openModal({ ...state.modalContext, mode: 'about' })
      return
    }
    if (action === 'show-notes') {
      void openModal({ ...state.modalContext, mode: state.modalContext.update ? 'update' : 'history' })
      return
    }
    if (action === 'open-github') {
      sendAction('open-url', { url: state.data?.currentRelease?.releaseUrl || 'https://github.com/wsnxxxs/deepseek-harness-portable' })
      return
    }
    if (action === 'open-url') {
      sendAction('open-url', { url: target.dataset.url })
    }
  }

  const SHADOW_CSS = `
    :host { all: initial; color-scheme: light dark; font-family: "Segoe UI", "Microsoft YaHei", sans-serif; }
    .dsh-chrome, .dsh-chrome * { box-sizing: border-box; }
    .dsh-chrome { position: fixed; inset: 0; z-index: 2147483647; pointer-events: none; color: #182235; font: 13px/1.5 "Segoe UI", "Microsoft YaHei", sans-serif; }
    .dsh-drag-region { position: fixed; inset: 0 140px auto 0; height: var(--dsh-titlebar-height); pointer-events: auto; -webkit-app-region: drag; }
    .dsh-notice, .dsh-modal-layer { pointer-events: auto; }
    .dsh-menu-popover { position: fixed; top: var(--dsh-menu-top, 42px); left: var(--dsh-menu-left, 8px); z-index: 6; display: grid; min-width: 236px; max-height: calc(100vh - 16px); overflow-y: auto; padding: 6px; border: 1px solid rgba(116, 138, 171, .24); border-radius: 12px; background: rgba(250, 252, 255, .98); box-shadow: 0 16px 40px rgba(23, 43, 72, .2); pointer-events: auto; -webkit-app-region: no-drag; animation: dsh-popover-in .18s cubic-bezier(.16, 1, .3, 1) both; transform-origin: top left; }
    .dsh-menu-item { display: flex; align-items: center; gap: 10px; width: 100%; min-height: 32px; padding: 7px 9px; border: 0; border-radius: 7px; color: #263a5a; background: transparent; cursor: pointer; text-align: left; font: 12px/1.2 inherit; -webkit-app-region: no-drag; }
    .dsh-menu-item:hover { color: #1d5ebf; background: #eaf2ff; }
    .dsh-menu-item.is-focused { color: #1d5ebf; background: #eaf2ff; outline: 2px solid rgba(52, 127, 242, .24); outline-offset: -2px; }
    .dsh-menu-item span { display: inline-grid; place-items: center; width: 17px; height: 17px; color: #5b80b8; font-size: 14px; flex-shrink: 0; }
    .dsh-menu-item span svg { display: block; width: 14px; height: 14px; }
    .dsh-menu-item:hover span, .dsh-menu-item.is-focused span { color: #1d5ebf; }
    .dsh-menu-item strong { font-weight: 600; }
    .dsh-menu-item kbd { margin-left: auto; padding: 2px 5px; border: 1px solid rgba(116, 138, 171, .22); border-radius: 4px; color: #6e8099; background: rgba(220, 230, 245, .55); font: 10px ui-monospace, SFMono-Regular, Consolas, monospace; }
    .dsh-menu-item:disabled { color: #9aa8bc; cursor: default; opacity: .78; }
    .dsh-submenu-wrapper { display: grid; grid-template-rows: 0fr; transition: grid-template-rows .22s cubic-bezier(.16, 1, .3, 1), visibility 0s linear .22s; visibility: hidden; }
    .dsh-submenu-wrapper.is-expanded { grid-template-rows: 1fr; visibility: visible; transition: grid-template-rows .22s cubic-bezier(.16, 1, .3, 1), visibility 0s; }
    .dsh-submenu-container { min-height: 0; overflow: hidden; margin-left: 12px; padding-left: 6px; border-left: 2px solid rgba(116, 138, 171, .16); display: grid; gap: 2px; opacity: 0; transform: translateY(-4px); transition: opacity .18s cubic-bezier(.16, 1, .3, 1), transform .2s cubic-bezier(.16, 1, .3, 1); }
    .dsh-submenu-wrapper.is-expanded .dsh-submenu-container { opacity: 1; transform: translateY(0); padding-top: 2px; padding-bottom: 2px; }
    .dsh-menu-expand { display: inline-flex; align-items: center; justify-content: center; margin-left: auto; color: #8191a8; font-size: 11px; transition: transform .2s cubic-bezier(.16, 1, .3, 1); }
    .dsh-menu-item-expandable.is-expanded .dsh-menu-expand { transform: rotate(90deg); }
    .dsh-menu-dot { margin-left: auto; color: #307bf0; font-size: 10px; animation: dsh-pulse 1.8s ease-in-out infinite; }
    .dsh-menu-warn { margin-left: auto; font-size: 11px; }
    .dsh-menu-heading { padding: 5px 9px 3px; color: #8191a8; font-size: 10px; font-weight: 700; letter-spacing: .04em; }
    .dsh-menu-separator { height: 1px; margin: 5px 4px; background: rgba(116, 138, 171, .18); }
    .dsh-notice { position: fixed; top: var(--dsh-titlebar-height, 36px); left: 50%; right: auto; bottom: auto; width: min(700px, calc(100vw - 32px)); display: flex; align-items: center; gap: 10px; padding: 8px 10px; border: 1px solid rgba(87, 151, 255, .32); border-radius: 10px; background: rgba(247, 250, 255, .94); box-shadow: 0 10px 28px rgba(31, 50, 83, .18), 0 1px 2px rgba(15, 23, 42, .08); backdrop-filter: blur(22px) saturate(160%); animation: dsh-notice-in .28s cubic-bezier(.16,1,.3,1) both; z-index: 5; }
    .dsh-action-toast { position: fixed; right: 24px; bottom: 86px; max-width: min(520px, calc(100vw - 32px)); padding: 9px 13px; border: 1px solid rgba(87, 151, 255, .3); border-radius: 10px; color: #2e5a9d; background: rgba(247, 250, 255, .96); box-shadow: 0 10px 28px rgba(31, 50, 83, .18); font-size: 12px; animation: dsh-slide-in .22s ease-out; z-index: 5; }
    .dsh-disconnect-banner { position: fixed; top: calc(var(--dsh-titlebar-height) + 12px); right: 16px; width: min(560px, calc(100vw - 32px)); display: flex; align-items: center; gap: 10px; padding: 11px 13px; border: 1px solid rgba(221, 143, 33, .34); border-radius: 12px; background: rgba(255, 248, 235, .96); box-shadow: 0 12px 32px rgba(31, 50, 83, .18); backdrop-filter: blur(18px) saturate(150%); animation: dsh-slide-in .28s cubic-bezier(.16,1,.3,1); z-index: 4; }
    .dsh-disconnect-copy { min-width: 0; flex: 1; display: grid; gap: 2px; }
    .dsh-disconnect-copy strong { color: #8c5710; font-weight: 700; }
    .dsh-disconnect-copy span { overflow: hidden; color: #806f55; text-overflow: ellipsis; white-space: nowrap; font-size: 11px; }
    .dsh-notice-icon { display: grid; flex: 0 0 32px; place-items: center; width: 32px; height: 32px; border-radius: 10px; background: rgba(255, 255, 255, .94); box-shadow: 0 5px 16px rgba(47, 117, 238, .3); }
    .dsh-notice-logo { width: 25px; height: 25px; object-fit: contain; pointer-events: none; }
    .dsh-notice-copy { min-width: 0; flex: 1; display: grid; gap: 1px; }
    .dsh-notice-copy strong { color: #15223a; font-weight: 650; }
    .dsh-notice-copy span { overflow: hidden; color: #60708a; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; }
    .dsh-notice-dismiss, .dsh-close { border: 0; background: transparent; color: #7b8aa3; cursor: pointer; font-size: 18px; line-height: 1; }
    .dsh-notice-dismiss { flex: 0 0 auto; padding: 5px; }
    .dsh-notice-never { flex: 0 0 auto; min-height: 28px; padding-inline: 8px; color: #5d6d85; }
    .dsh-notice-never:hover { color: #2d6fd6; }
    .dsh-notice.is-closing { pointer-events: none; animation: dsh-notice-out .24s ease-in both; }
    .dsh-button { display: inline-flex; align-items: center; justify-content: center; min-height: 30px; padding: 5px 11px; border: 1px solid rgba(28, 48, 78, .11); border-radius: 8px; color: #1d2b42; background: rgba(241, 245, 251, .92); cursor: pointer; font: 600 12px/1.2 inherit; white-space: nowrap; }
    .dsh-button:hover { background: #e4ebf6; }
    .dsh-button.primary { border-color: #307bf0; color: #fff; background: #307bf0; box-shadow: 0 3px 10px rgba(48, 123, 240, .25); }
    .dsh-button.primary:hover { background: #2567ce; }
    .dsh-button.secondary { border-color: rgba(48, 123, 240, .22); color: #245db1; background: #eaf2ff; }
    .dsh-button.secondary:hover { border-color: rgba(48, 123, 240, .34); background: #dceaff; }
    .dsh-button.ghost { color: #5d6d85; background: transparent; }
    .dsh-button:disabled { opacity: .6; cursor: default; }
    .dsh-modal-layer { position: fixed; inset: 0; display: grid; place-items: center; padding: 24px 16px; background: rgba(10, 18, 30, .48); backdrop-filter: blur(14px) saturate(150%); opacity: 0; visibility: hidden; pointer-events: none; transition: opacity .2s ease, visibility 0s linear .22s; }
    .dsh-modal-layer.is-open { opacity: 1; visibility: visible; pointer-events: auto; transition-delay: 0s; }
    .dsh-modal-backdrop { position: absolute; inset: 0; width: 100%; height: 100%; padding: 0; border: 0; background: transparent; cursor: default; }
    .dsh-modal-dialog { --dsh-modal-width: min(620px, calc(100vw - 32px)); --dsh-modal-height: min(660px, calc(100vh - 48px)); position: relative; z-index: 1; display: grid; grid-template-rows: auto minmax(0, 1fr) auto; width: var(--dsh-modal-width); min-height: 320px; height: var(--dsh-modal-height); max-height: var(--dsh-modal-height); overflow: hidden; border: 1px solid rgba(116, 138, 171, .24); border-radius: 14px; background: rgba(250, 252, 255, .98); box-shadow: 0 24px 60px rgba(15, 30, 54, .26), 0 2px 8px rgba(18, 38, 68, .06); opacity: 0; transform: scale(.96) translateY(10px); transition: opacity .2s ease, transform .22s cubic-bezier(.16, 1, .3, 1); will-change: opacity, transform; }
    .dsh-modal-layer.is-open .dsh-modal-dialog { opacity: 1; transform: scale(1) translateY(0); }
    .dsh-modal-header { display: flex; align-items: center; justify-content: space-between; gap: 18px; padding: 20px 24px 16px; border-bottom: 1px solid rgba(42, 61, 92, .1); }
    .dsh-header-brand, .dsh-header-controls, .dsh-modal-tabs, .dsh-footer-left, .dsh-footer-right, .dsh-hero-actions { display: flex; align-items: center; }
    .dsh-header-brand { flex: 1 1 auto; min-width: 0; gap: 10px; }
    .dsh-brand-badge { display: grid; flex: 0 0 34px; place-items: center; width: 34px; height: 34px; border: 1px solid rgba(72, 112, 190, .16); border-radius: 10px; background: #f7faff; box-shadow: 0 5px 14px rgba(47, 117, 238, .18); }
    .dsh-brand-logo { width: 28px; height: 28px; object-fit: contain; pointer-events: none; }
    .dsh-eyebrow { margin-bottom: 4px; color: #6e85a8; font: 700 10px/1.2 ui-monospace, SFMono-Regular, Consolas, monospace; letter-spacing: .12em; }
    .dsh-modal-title { margin: 0; color: #18263d; font-size: 20px; letter-spacing: -.02em; }
    .dsh-subtitle { display: block; margin-top: 3px; color: #7e8da4; font-size: 11px; }
    .dsh-header-controls { flex: 0 0 auto; gap: 12px; }
    .dsh-modal-tabs { gap: 4px; padding: 3px; border: 1px solid rgba(116, 138, 171, .18); border-radius: 9px; background: rgba(235, 241, 249, .72); }
    .dsh-tab { min-height: 28px; padding: 5px 10px; border: 0; border-radius: 7px; color: #7c8ba1; background: transparent; cursor: pointer; font: 600 12px/1.3 inherit; white-space: nowrap; }
    .dsh-tab.active, .dsh-tab[aria-selected="true"] { color: #245db1; background: #fff; box-shadow: 0 1px 3px rgba(31, 50, 83, .12); }
    .dsh-modal-close-btn { width: 30px; height: 30px; padding: 0; border: 0; border-radius: 8px; color: #7b8aa3; background: transparent; cursor: pointer; font-size: 22px; line-height: 1; }
    .dsh-modal-close-btn:hover { color: #18263d; background: #e4ebf6; }
    .dsh-modal-body { min-height: 0; overflow-y: auto; overscroll-behavior: contain; scrollbar-gutter: stable; scroll-behavior: smooth; padding: 20px 24px 30px; -webkit-overflow-scrolling: touch; }
    .dsh-modal-footer { display: flex; align-items: center; justify-content: space-between; gap: 12px; min-height: 56px; padding: 10px 20px; border-top: 1px solid rgba(42, 61, 92, .1); }
    .dsh-footer-left, .dsh-footer-right { gap: 6px; }
    .dsh-update-channels { display: grid; gap: 10px; margin-bottom: 20px; }
    .dsh-hero-card { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin: 0; padding: 16px; border: 1px solid rgba(61, 129, 240, .25); border-left-width: 4px; border-radius: 12px; background: rgba(74, 143, 247, .08); }
    .dsh-hero-card-success, .dsh-hero-card-ready { border-color: rgba(40, 116, 81, .28); border-left-color: #287451; background: #e5f6ee; }
    .dsh-hero-card-error { border-color: rgba(224, 71, 95, .28); border-left-color: #bd3e56; background: #fde8ed; }
    .dsh-hero-card-available, .dsh-hero-card-progress { border-left-color: #307bf0; }
    .dsh-hero-card-neutral { border-color: rgba(116, 138, 171, .2); border-left-color: #6e85a8; background: rgba(235, 241, 249, .72); }
    .dsh-hero-copy { min-width: 0; display: grid; gap: 3px; }
    .dsh-hero-copy strong { color: #245db1; font-size: 14px; }
    .dsh-hero-card-success .dsh-hero-copy strong, .dsh-hero-card-ready .dsh-hero-copy strong { color: #287451; }
    .dsh-hero-card-error .dsh-hero-copy strong { color: #bd3e56; }
    .dsh-hero-card-neutral .dsh-hero-copy strong { color: #31435f; }
    .dsh-hero-copy small { color: #6e7e96; font-size: 11px; line-height: 1.45; }
    .dsh-status-kicker { color: #6e85a8; font: 700 10px/1.2 ui-monospace, SFMono-Regular, Consolas, monospace; letter-spacing: .08em; text-transform: uppercase; }
    .dsh-hero-actions { flex: 0 0 auto; gap: 7px; flex-wrap: wrap; justify-content: flex-end; }
    .dsh-update-progress { display: flex; align-items: center; gap: 8px; margin-top: 7px; }
    .dsh-progress-track { min-width: 140px; width: min(280px, 100%); height: 6px; overflow: hidden; border-radius: 999px; background: rgba(54, 113, 201, .16); }
    .dsh-progress-fill { display: block; height: 100%; border-radius: inherit; background: #347ff2; transition: width .2s ease; }
    .dsh-progress-fill.indeterminate { width: 42%; animation: dsh-progress-slide 1.1s ease-in-out infinite; }
    .dsh-progress-label { color: #6e7e96; font: 10px ui-monospace, SFMono-Regular, Consolas, monospace; white-space: nowrap; }
    .dsh-timeline { position: relative; padding-left: 20px; }
    .dsh-timeline::before { content: ""; position: absolute; left: 4px; top: 10px; bottom: 10px; width: 1px; background: rgba(71, 94, 129, .16); }
    .dsh-timeline { position: relative; padding-left: 20px; }
    .dsh-timeline::before { content: ""; position: absolute; left: 4px; top: 12px; bottom: 12px; width: 1px; background: rgba(71, 94, 129, .16); }
    .dsh-accordion-item { position: relative; margin-bottom: 10px; border: 1px solid rgba(116, 138, 171, .18); border-radius: 10px; background: rgba(255, 255, 255, .5); overflow: hidden; transition: border-color .15s ease, background-color .15s ease; }
    .dsh-accordion-item.is-expanded, .dsh-accordion-item.is-current { border-color: rgba(48, 123, 240, .28); background: transparent; }
    .dsh-release-node { position: absolute; z-index: 1; left: -20px; top: 17px; width: 9px; height: 9px; border: 2px solid #a4b2c8; border-radius: 50%; background: #f9fbff; }
    .dsh-accordion-item.is-current .dsh-release-node { border-color: #347ff2; background: #347ff2; box-shadow: 0 0 10px rgba(52, 127, 242, .45); }
    .dsh-accordion-header { display: flex; align-items: center; gap: 8px; width: 100%; min-height: 48px; padding: 9px 12px; border: 0; color: inherit; background: transparent; cursor: pointer; text-align: left; font: inherit; }
    .dsh-accordion-header:hover { background: rgba(234, 242, 255, .72); }
    .dsh-accordion-chevron { flex: 0 0 12px; width: 12px; height: 12px; color: #6e85a8; transition: transform .2s cubic-bezier(.16, 1, .3, 1); }
    .dsh-accordion-item.is-expanded .dsh-accordion-chevron { transform: rotate(90deg); }
    .dsh-release-heading { min-width: 0; display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
    .dsh-version { color: #1e2d44; font: 700 14px/1.2 ui-monospace, SFMono-Regular, Consolas, monospace; }
    .dsh-type, .dsh-current, .dsh-latest { display: inline-block; padding: 2px 7px; border-radius: 999px; color: #5371a0; background: #edf3fb; font-size: 10px; font-weight: 650; }
    .dsh-current { color: #287451; background: #e5f6ee; }
    .dsh-latest { color: #2672dc; background: #eaf2ff; }
    .dsh-release-badges { display: flex; align-items: center; gap: 4px; margin-left: auto; flex-wrap: wrap; }
    .dsh-badge { display: inline-flex; align-items: center; gap: 3px; padding: 2px 6px; border-radius: 999px; color: #6e83a0; background: #edf2f8; font: 700 10px/1 ui-monospace, SFMono-Regular, Consolas, monospace; }
    .dsh-badge.features { color: #267c58; background: #e3f5ed; }
    .dsh-badge.improvements { color: #a96b0c; background: #fff1d8; }
    .dsh-badge.fixes { color: #bd3e56; background: #fde8ed; }
    .dsh-accordion-header time { flex: 0 0 auto; color: #94a1b5; font-size: 11px; }
    .dsh-accordion-body { padding: 0 14px 14px 38px; border-top: 1px solid rgba(116, 138, 171, .15); animation: dsh-fade-in .18s ease; }
    .dsh-release-section { margin: 13px 0 0; }
    .dsh-release-section h3 { display: flex; align-items: center; gap: 6px; margin: 0 0 6px; color: #61738f; font-size: 11px; font-weight: 700; }
    .dsh-section-icon, .dsh-release-icon { display: inline-grid; place-items: center; flex: 0 0 auto; border-radius: 5px; font-size: 10px; font-weight: 800; }
    .dsh-section-icon { width: 17px; height: 17px; color: #347ff2; background: #e8f1ff; }
    .dsh-release-item { display: flex; align-items: flex-start; gap: 8px; margin: 6px 0; color: #31435f; font-size: 12px; line-height: 1.55; }
    .dsh-release-icon { width: 17px; height: 17px; margin-top: 1px; color: #6e83a0; background: #edf2f8; }
    .dsh-release-icon.features, .dsh-section-icon.features { color: #267c58; background: #e3f5ed; }
    .dsh-release-icon.improvements, .dsh-section-icon.improvements { color: #a96b0c; background: #fff1d8; }
    .dsh-release-icon.fixes, .dsh-section-icon.fixes { color: #bd3e56; background: #fde8ed; }
    .dsh-release-item > div { min-width: 0; flex: 1; overflow-wrap: anywhere; }
    .dsh-release-item code { padding: 1px 4px; border: 1px solid rgba(43, 66, 98, .1); border-radius: 4px; color: #405a80; background: #eef3f9; font: 11px ui-monospace, SFMono-Regular, Consolas, monospace; }
    .dsh-release-item strong { color: #203452; }
    .dsh-link { padding: 0; border: 0; color: #2672dc; background: transparent; cursor: pointer; font: inherit; }
    .dsh-empty-copy, .dsh-loading { padding: 42px 8px; color: #8a99ae; text-align: center; }
    .dsh-refreshing { margin: -8px 0 14px; color: #8191a8; font-size: 11px; }
    .dsh-about { min-height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; box-sizing: border-box; padding: 32px 10px; text-align: center; }
    .dsh-about-logo { width: 64px; height: 64px; display: grid; place-items: center; margin: 0 auto 16px; border: 1px solid rgba(72, 112, 190, .16); border-radius: 20px; background: #f7faff; box-shadow: 0 10px 28px rgba(47, 117, 238, .26); }
    .dsh-about-logo-image { width: 54px; height: 54px; object-fit: contain; }
    .dsh-about h3 { margin: 0 0 8px; color: #1e2d44; font-size: 18px; }
    .dsh-about p { margin: 5px 0; color: #657793; }
    .dsh-muted { color: #9aa7ba !important; font-size: 11px; }
    @keyframes dsh-popover-in { from { opacity: 0; transform: scale(.96) translateY(-4px); } to { opacity: 1; transform: scale(1) translateY(0); } }
    @keyframes dsh-pulse { 0%, 100% { opacity: 1; } 50% { opacity: .35; } }
    @keyframes dsh-notice-in { from { opacity: 0; transform: translate(-50%, -8px); } to { opacity: 1; transform: translate(-50%, 0); } }
    @keyframes dsh-notice-out { from { opacity: 1; transform: translate(-50%, 0); } to { opacity: 0; transform: translate(-50%, -8px); } }
    @keyframes dsh-slide-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
    @keyframes dsh-progress-slide { from { transform: translateX(-110%); } to { transform: translateX(260%); } }
    @keyframes dsh-fade-in { from { opacity: 0; } to { opacity: 1; } }
    @media (prefers-reduced-motion: reduce) {
      .dsh-notice { animation: none; transform: translateX(-50%); }
      .dsh-notice.is-closing { animation: none; opacity: 0; transform: translate(-50%, -8px); }
      .dsh-modal-dialog { transition: none; }
      .dsh-progress-fill, .dsh-progress-fill.indeterminate { animation: none; transition: none; }
    }
    :host([data-theme="dark"]) {
      .dsh-chrome { color: #e8eef9; }
      .dsh-notice-icon, .dsh-about-logo { border-color: rgba(93, 157, 255, .36); background: #edf4ff; }
      .dsh-menu-popover { border-color: rgba(170, 192, 228, .16); background: rgba(17, 26, 42, .98); box-shadow: 0 16px 40px rgba(0, 0, 0, .4); }
      .dsh-menu-item { color: #dbe7fa; }
      .dsh-menu-item:hover { color: #d5e5ff; background: #253b61; }
      .dsh-menu-item.is-focused { color: #d5e5ff; background: #253b61; outline-color: rgba(93, 157, 255, .4); }
      .dsh-menu-item span { color: #9ebdf0; }
      .dsh-menu-item:hover span, .dsh-menu-item.is-focused span { color: #72a7f9; }
      .dsh-menu-item kbd { border-color: rgba(170, 192, 228, .18); background: rgba(30, 44, 70, .6); color: #8ca3c8; }
      .dsh-submenu-container { border-left-color: rgba(170, 192, 228, .16); }
      .dsh-menu-expand { color: #6e84a8; }
      .dsh-menu-dot { color: #5ba8ff; }
      .dsh-menu-item:disabled, .dsh-menu-heading { color: #7185a5; }
      .dsh-menu-separator { background: rgba(170, 192, 228, .16); }
      .dsh-notice { border-color: rgba(93, 157, 255, .36); background: rgba(19, 29, 47, .94); box-shadow: 0 16px 40px rgba(0, 0, 0, .36); }
      .dsh-action-toast { border-color: rgba(93, 157, 255, .36); color: #b5d0ff; background: rgba(19, 29, 47, .96); box-shadow: 0 16px 40px rgba(0, 0, 0, .36); }
      .dsh-disconnect-banner { border-color: rgba(245, 174, 68, .36); background: rgba(55, 42, 22, .96); box-shadow: 0 16px 40px rgba(0, 0, 0, .36); }
      .dsh-disconnect-copy strong { color: #f5c46e; }
      .dsh-disconnect-copy span { color: #c9b38e; }
      .dsh-notice-copy strong { color: #edf4ff; }
      .dsh-notice-copy span { color: #9aabc4; }
      .dsh-notice-dismiss, .dsh-modal-close-btn { color: #92a4c0; }
      .dsh-button { border-color: rgba(185, 204, 235, .14); color: #e0eaf9; background: rgba(46, 61, 86, .8); }
      .dsh-button:hover { background: #354766; }
      .dsh-button.ghost { color: #9eafc8; background: transparent; }
      .dsh-modal-dialog { border-color: rgba(170, 192, 228, .16); background: rgba(17, 26, 42, .98); box-shadow: 0 24px 60px rgba(0, 0, 0, .52), 0 2px 8px rgba(0, 0, 0, .3); }
      .dsh-modal-header, .dsh-modal-footer { border-color: rgba(170, 192, 228, .12); }
      .dsh-modal-title, .dsh-version, .dsh-about h3 { color: #edf4ff; }
      .dsh-modal-tabs { border-color: rgba(170, 192, 228, .16); background: #18263d; }
      .dsh-tab { color: #8496b2; }
      .dsh-tab.active, .dsh-tab[aria-selected="true"] { color: #d5e5ff; background: #253b61; }
      .dsh-eyebrow, .dsh-subtitle, .dsh-status-kicker, .dsh-accordion-header time, .dsh-empty-copy, .dsh-loading, .dsh-refreshing { color: #7f91ad; }
      .dsh-release-node { border-color: #647896; background: #18263d; }
      .dsh-type { color: #a9c2e9; background: #253652; }
      .dsh-current { color: #83d2ac; background: #1b3d31; }
      .dsh-latest { color: #b5d0ff; background: #253b61; }
      .dsh-badge { color: #9db0cd; background: #25344d; }
      .dsh-badge.features { color: #83d2ac; background: #1b3d31; }
      .dsh-badge.improvements { color: #f5c46e; background: #372a16; }
      .dsh-badge.fixes { color: #ff9aad; background: #3d1b24; }
      .dsh-accordion-item { border-color: rgba(170, 192, 228, .16); background: rgba(25, 39, 62, .72); }
      .dsh-accordion-item.is-expanded, .dsh-accordion-item.is-current { border-color: rgba(93, 157, 255, .36); background: transparent; }
      .dsh-accordion-header:hover { background: #253b61; }
      .dsh-accordion-body { border-color: rgba(170, 192, 228, .14); }
      .dsh-release-item { color: #c0cee2; }
      .dsh-release-item strong { color: #e4edf9; }
      .dsh-release-icon { color: #9db0cd; background: #25344d; }
      .dsh-release-item code { border-color: rgba(185, 204, 235, .12); color: #b4c9e9; background: #23324b; }
      .dsh-hero-card { border-color: rgba(81, 149, 255, .28); background: rgba(55, 113, 201, .16); }
      .dsh-hero-card-success, .dsh-hero-card-ready { border-color: rgba(131, 210, 172, .36); background: #1b3d31; }
      .dsh-hero-card-error { border-color: rgba(245, 100, 122, .28); background: #3d1b24; }
      .dsh-hero-card-neutral { border-color: rgba(170, 192, 228, .16); background: #18263d; }
      .dsh-hero-copy strong { color: #9fc5ff; }
      .dsh-hero-card-success .dsh-hero-copy strong, .dsh-hero-card-ready .dsh-hero-copy strong { color: #83d2ac; }
      .dsh-hero-card-error .dsh-hero-copy strong { color: #ff9aad; }
      .dsh-hero-card-neutral .dsh-hero-copy strong { color: #dbe7fa; }
      .dsh-hero-copy small, .dsh-progress-label { color: #9aacC5; }
      .dsh-progress-track { background: rgba(159, 193, 255, .18); }
      .dsh-about p { color: #a2b2c9; }
    }
    @media (max-width: 620px) {
      .dsh-disconnect-banner, .dsh-action-toast { right: 16px; width: calc(100vw - 32px); }
      .dsh-notice { left: 50%; right: auto; width: calc(100vw - 32px); gap: 8px; padding: 7px 8px; }
      .dsh-notice-copy span { white-space: normal; }
      .dsh-notice .dsh-button { padding-inline: 8px; }
      .dsh-notice-never { padding-inline: 6px !important; }
      .dsh-modal-layer { padding: 12px 10px; }
      .dsh-modal-dialog { --dsh-modal-width: calc(100vw - 20px); --dsh-modal-height: calc(100vh - 24px); width: var(--dsh-modal-width); height: var(--dsh-modal-height); max-height: var(--dsh-modal-height); }
      .dsh-modal-header { align-items: flex-start; padding: 16px 16px 12px; }
      .dsh-header-controls { gap: 6px; }
      .dsh-modal-tabs { order: 2; }
      .dsh-modal-close-btn { order: 3; }
      .dsh-modal-body { padding: 16px 16px 24px; }
      .dsh-modal-footer { padding-inline: 14px; }
      .dsh-footer-left .dsh-button:first-child { display: none; }
      .dsh-hero-card { align-items: stretch; flex-direction: column; gap: 12px; }
      .dsh-hero-actions { justify-content: flex-start; }
      .dsh-release-badges { margin-left: 0; }
      .dsh-accordion-header { align-items: flex-start; flex-wrap: wrap; }
      .dsh-accordion-header time { margin-left: 20px; }
    }
    @media (max-height: 480px) {
      .dsh-modal-dialog { min-height: 260px; }
      .dsh-modal-header { padding-block: 10px; }
      .dsh-modal-body { padding-block: 12px 18px; }
      .dsh-modal-footer { min-height: 46px; padding-block: 6px; }
    }
  `

  const host = document.createElement('div')
  host.id = 'deepseek-harness-desktop-chrome'
  host.dataset.theme = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  const shadow = host.attachShadow({ mode: 'open' })

  ipcRenderer.on('desktop:theme-changed', (_event, theme) => {
    const dark = theme?.theme === 'dark'
    host.dataset.theme = dark ? 'dark' : 'light'
    host.style.colorScheme = dark ? 'dark' : 'light'
    document.documentElement.dataset.dshTheme = dark ? 'dark' : 'light'
    document.documentElement.style.colorScheme = dark ? 'dark' : 'light'
    document.documentElement.style.setProperty('--dsh-titlebar-height', `${Number(theme?.titleBar?.height) || 36}px`)
    document.documentElement.style.setProperty('--dsh-window-surface', theme?.surface || (dark ? '#0c1220' : '#f4f7fb'))
  })
  ipcRenderer.on('desktop:locale-changed', (_event, payload) => {
    const nextLocale = normalizePreference(payload?.locale) || localeFromSystem(typeof navigator === 'object' ? navigator.language : 'en')
    if (nextLocale === state.locale) return
    state.locale = nextLocale
    menuMarkup = undefined
    noticeMarkup = undefined
    healthMarkup = undefined
    modalContentMarkup = undefined
    render()
  })
  ipcRenderer.on('desktop:workspace:recents', (_event, payload) => {
    state.currentWorkspace = typeof payload?.current === 'string' ? payload.current : ''
    state.recentWorkspaces = Array.isArray(payload?.workspaces) ? payload.workspaces.filter(value => typeof value === 'string') : []
    render()
  })
  ipcRenderer.on('desktop:shell-state', (_event, payload) => {
    state.shellState = payload && typeof payload === 'object' ? payload : undefined
    render()
  })
  ipcRenderer.on('desktop:harness-status', (_event, status) => {
    state.harnessStatus = status && typeof status === 'object'
      ? { state: status.state || 'starting', consecutiveFailures: Number(status.consecutiveFailures) || 0, message: status.message || '' }
      : { state: 'starting', consecutiveFailures: 0, message: '' }
    render()
  })
  ipcRenderer.on('desktop:diagnostics:result', (_event, result) => {
    showActionMessage(result?.message || '')
  })
  ipcRenderer.on('desktop:notice', (_event, notice) => {
    cancelNoticeDismiss()
    clearNoticeTimer()
    state.notice = notice && typeof notice === 'object' ? notice : undefined
    render()
    if (state.notice !== undefined) scheduleNoticeDismiss()
  })
  ipcRenderer.on('desktop:release-notes:open', (_event, context) => { void openModal(context) })
  ipcRenderer.on('desktop:release-notes:reload', () => {
    if (state.modalOpen) void openModal(state.modalContext)
  })
  ipcRenderer.on('desktop:update-state', (_event, update) => {
    state.updateState = update?.label || ''
    state.updateProgress = update?.state === 'idle'
      ? undefined
      : (update && typeof update === 'object' ? {
          state: update.state || '',
          stage: update.stage || '',
          progress: Number.isFinite(update.progress) ? update.progress : undefined,
          targetVersion: update.targetVersion || '',
        } : undefined)
    render()
  })

  shadow.addEventListener('click', event => {
    const target = event.target instanceof Element ? event.target.closest('[data-action]') : undefined
    if (!target) return
    event.preventDefault()
    handleAction(target)
  })

  function mount() {
    mountGlobalStyles()
    document.documentElement.appendChild(host)
    shadow.innerHTML = '<style>' + SHADOW_CSS + '</style><div class="dsh-chrome"><div class="dsh-drag-region" aria-hidden="true"></div><div class="dsh-menu-host"></div><div class="dsh-health-host"></div><div class="dsh-notice-host"></div><div class="dsh-modal-host">' + renderModalShell() + '</div></div>'
    const modalLayer = shadow.querySelector('.dsh-modal-layer')
    chromeRefs = {
      menuHost: shadow.querySelector('.dsh-menu-host'),
      healthHost: shadow.querySelector('.dsh-health-host'),
      noticeHost: shadow.querySelector('.dsh-notice-host'),
      modalLayer,
      modalDialog: modalLayer.querySelector('.dsh-modal-dialog'),
      modalTitle: modalLayer.querySelector('.dsh-modal-title'),
      modalSubtitle: modalLayer.querySelector('.dsh-subtitle'),
      notesTab: modalLayer.querySelector('.dsh-notes-tab'),
      aboutTab: modalLayer.querySelector('.dsh-about-tab'),
      modalCloseButton: modalLayer.querySelector('.dsh-modal-close-btn'),
      githubButton: modalLayer.querySelector('[data-action="open-github"]'),
      diagnosticsButton: modalLayer.querySelector('[data-action="desktop-export-diagnostics"]'),
      completeButton: Array.from(modalLayer.querySelectorAll('[data-action="modal-close"]')).pop(),
      modalBody: modalLayer.querySelector('.dsh-modal-body'),
    }
    render()
    observeBrandTrigger()
    syncNativeMenuTrigger()
    ipcRenderer.send('desktop:renderer-ready')
    const reportFirstPaint = () => {
      if (typeof requestAnimationFrame !== 'function') {
        ipcRenderer.send('desktop:renderer-first-paint')
        return
      }
      requestAnimationFrame(() => requestAnimationFrame(() => ipcRenderer.send('desktop:renderer-first-paint')))
    }
    reportFirstPaint()
  }

  document.addEventListener('click', event => {
    const button = nativeButtonFromTarget(event.target)
    if (!button) return
    if (isNativeBrandButton(button)) {
      event.preventDefault()
      event.stopPropagation()
      toggleMenu(button)
      return
    }
    if (isNativeFishButton(button) && state.menuOpen) {
      closeMenu()
    }
  }, true)
  document.addEventListener('contextmenu', event => {
    const button = nativeButtonFromTarget(event.target)
    if (!button || (!isNativeFishButton(button) && !isNativeBrandButton(button))) return
    event.preventDefault()
    event.stopPropagation()
    openMenuAt(button)
  }, true)
  document.addEventListener('pointerdown', event => {
    if (!state.menuOpen || event.composedPath().includes(host) || nativeButtonFromTarget(event.target)) return
    closeMenu()
  }, true)
  window.addEventListener('resize', () => {
    if (!state.menuOpen) return
    state.menuPosition = menuPositionForButton(findNativeMenuAnchor())
    render()
  })
  window.addEventListener('unload', () => {
    if (brandObserver) {
      brandObserver.disconnect()
      brandObserver = undefined
    }
  }, { once: true })

  window.addEventListener('keydown', event => {
    if (trapModalFocus(event)) return
    if (event.key === 'Escape') {
      if (state.modalOpen) {
        event.preventDefault()
        closeModal()
        return
      }
      if (state.menuOpen) {
        event.preventDefault()
        closeMenu()
      }
      return
    }
    const commandKey = event.ctrlKey || event.metaKey
    if (commandKey && !event.altKey) {
      const key = event.key.toLowerCase()
      if (key === 'r' && event.shiftKey) {
        event.preventDefault()
        sendMenuAction('restart')
        return
      }
      if (key === 'r' && !event.shiftKey) {
        event.preventDefault()
        sendMenuAction('reload-ui')
        return
      }
      if (key === '0') {
        event.preventDefault()
        ipcRenderer.send('desktop:zoom', { type: 'reset' })
        return
      }
      if (key === '=' || key === '+') {
        event.preventDefault()
        ipcRenderer.send('desktop:zoom', { type: 'in' })
        return
      }
      if (key === '-' || key === '_') {
        event.preventDefault()
        ipcRenderer.send('desktop:zoom', { type: 'out' })
        return
      }
    }
    if (event.key === 'F5') {
      event.preventDefault()
      sendMenuAction('reload-ui')
      return
    }
    if (state.menuOpen && event.key === 'ArrowDown') {
      event.preventDefault()
      moveMenuFocus(1)
      return
    }
    if (state.menuOpen && event.key === 'ArrowUp') {
      event.preventDefault()
      moveMenuFocus(-1)
      return
    }
    if (state.menuOpen && event.key === 'Enter') {
      event.preventDefault()
      activateMenuFocus()
      return
    }
    if (event.key === 'Alt' || event.key === 'F10') {
      event.preventDefault()
      toggleMenu()
      return
    }
  })

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once: true })
  else mount()
}
