const { contextBridge, ipcRenderer } = require('electron')

const DEEPSEEK_LOGO_DATA_URI = 'data:image/png;base64,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'

const SPLASH_STATUSES = new Set(['engine', 'workspace', 'interface'])
const isSplashDocument = window.location.protocol === 'file:'

const splashListeners = new Set()
const splashStateListeners = new Set()
const splashTransitionListeners = new Set()
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
  retry: () => ipcRenderer.send('desktop:splash-action', { type: 'retry' }),
  chooseWorkspace: () => ipcRenderer.send('desktop:splash-action', { type: 'choose-workspace' }),
})

contextBridge.exposeInMainWorld('deepSeekDesktop', {
  openReleaseNotes: context => ipcRenderer.send('desktop:release-notes:open', context || {}),
  showNotice: () => ipcRenderer.send('desktop:notice:show'),
})

if (!isSplashDocument) {
  const state = {
    data: undefined,
    drawerContext: { mode: 'history' },
    drawerOpen: false,
    drawerLoading: false,
    menuOpen: false,
    notice: undefined,
    noticeExpanded: true,
    noticeTimer: undefined,
    requestId: 0,
    drawerRefreshing: false,
    updateState: '',
  }

  let chromeRefs
  let menuMarkup
  let noticeMarkup
  let drawerContentMarkup

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
    return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(date)
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

  function updateIsBusy(status) {
    return Boolean(state.updateState || (status && ['starting', 'checking', 'downloading', 'verifying', 'extracting', 'replacing'].includes(status.state)))
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
      button, a, input, textarea, select, [role="button"] {
        -webkit-user-select: none;
        user-select: none;
        -webkit-app-region: no-drag !important;
        pointer-events: auto !important;
      }
    `
    document.head.appendChild(style)
  }

  function renderReleaseSections(release) {
    const sections = release?.sections || []
    if (sections.length === 0 && release?.body) {
      return '<div class="dsh-release-item"><span class="dsh-release-icon other">•</span><div>' + inlineMarkdown(release.body) + '</div></div>'
    }
    if (sections.length === 0) return '<div class="dsh-empty-copy">常规维护与性能提升</div>'
    return sections.map(section => (
      '<section class="dsh-release-section"><h3><span class="dsh-section-icon ' + escapeHtml(section.key || 'other') + '">' + releaseIcon(section.key) + '</span>' + escapeHtml(section.title || section.label || 'Other') + '</h3>' +
      (section.items || []).map(item => '<div class="dsh-release-item"><span class="dsh-release-icon ' + escapeHtml(section.key || 'other') + '">' + releaseIcon(section.key) + '</span><div>' + inlineMarkdown(item) + '</div></div>').join('') +
      '</section>'
    )).join('')
  }

  function renderTimeline(releases) {
    if (!Array.isArray(releases) || releases.length === 0) return '<div class="dsh-empty-copy">暂无更新记录</div>'
    return '<div class="dsh-timeline">' + releases.map(release => {
      const current = release.version === state.data?.currentVersion
      return '<article class="dsh-release-entry ' + (current ? 'is-current' : '') + '"><div class="dsh-release-node"></div><div class="dsh-release-head"><div><span class="dsh-version">v' + escapeHtml(release.version) + '</span><span class="dsh-type">' + escapeHtml(release.releaseType || 'Patch') + '</span>' + (current ? '<span class="dsh-current">当前安装</span>' : '') + '</div><time>' + formatDate(release.publishedAt) + '</time></div><div class="dsh-release-sections">' + renderReleaseSections(release) + '</div></article>'
    }).join('') + '</div>'
  }

  function renderDrawerContent() {
    const data = state.data
    const status = data?.updateStatus || {}
    const update = data?.latestRelease
    const hasUpdate = Boolean(data?.updateAvailable && update)
    const busy = updateIsBusy(status)
    const statusNotice = status.state === 'failed' || status.state === 'interrupted'
      ? '<div class="dsh-status ' + (status.state === 'failed' ? 'failed' : 'interrupted') + '"><strong>' + (status.state === 'failed' ? '更新失败' : '上次更新未完成') + '</strong><span>' + escapeHtml(status.message || '当前安装仍可使用，可以重新检查更新。') + '</span><button class="dsh-button ghost" data-action="retry-update">重新检查</button></div>'
      : ''
    const updateCard = hasUpdate
      ? '<div class="dsh-update-card"><div><strong>新版本 v' + escapeHtml(update.version) + ' 已发布</strong><span>安全下载并替换便携版运行时</span></div><button class="dsh-button primary" data-action="update"' + (busy ? ' disabled' : '') + '>' + escapeHtml(state.updateState || (busy ? '更新进行中…' : '立即更新')) + '</button></div>'
      : ''
    const refreshing = state.drawerRefreshing ? '<div class="dsh-refreshing">正在后台同步最新更新记录…</div>' : ''
    if (state.drawerLoading) return '<div class="dsh-loading">正在读取本地更新记录…</div>'
    return refreshing + (state.drawerContext.mode === 'about'
      ? '<div class="dsh-about"><div class="dsh-about-logo">' + logoMarkup('dsh-about-logo-image', 'DeepSeek') + '</div><h3>DeepSeek Harness</h3><p>面向 Windows 的 DeepSeek Harness 桌面外壳。</p><p class="dsh-muted">内核 v' + escapeHtml(data?.localInfo?.kernelVersion || 'unknown') + ' · 外壳 v' + escapeHtml(data?.localInfo?.desktopVersion || 'unknown') + '</p></div>'
      : updateCard + statusNotice + renderTimeline(data?.history || []))
  }

  function renderDrawerShell() {
    return '<div class="dsh-drawer-layer" aria-hidden="true"><button class="dsh-drawer-backdrop" data-action="drawer-close" aria-label="关闭"></button><aside class="dsh-drawer" role="dialog" aria-modal="true" aria-label="更新日志"><header class="dsh-drawer-header"><div><div class="dsh-eyebrow">DEEPSEEK HARNESS</div><h2 class="dsh-drawer-title"></h2><span class="dsh-subtitle"></span></div><button class="dsh-close" data-action="drawer-close" aria-label="关闭">×</button></header><div class="dsh-drawer-tabs"><button class="dsh-notes-tab active" data-action="show-notes">更新日志</button><button class="dsh-about-tab" data-action="show-about">关于</button></div><div class="dsh-drawer-scroll"></div><footer class="dsh-drawer-footer"><button class="dsh-button ghost" data-action="open-github">GitHub 仓库 ↗</button><button class="dsh-button ghost" data-action="drawer-close">完成</button></footer></aside></div>'
  }

  function syncDrawer() {
    if (chromeRefs === undefined) return
    const title = state.drawerContext.mode === 'about' ? '关于 DeepSeek Harness' : '更新日志'
    const version = state.data?.currentVersion || '—'
    chromeRefs.drawerLayer.classList.toggle('is-open', state.drawerOpen)
    chromeRefs.drawerLayer.setAttribute('aria-hidden', state.drawerOpen ? 'false' : 'true')
    chromeRefs.drawer.setAttribute('aria-label', title)
    chromeRefs.drawerTitle.textContent = title
    chromeRefs.drawerSubtitle.textContent = '当前版本 v' + version
    chromeRefs.notesTab.classList.toggle('active', state.drawerContext.mode !== 'about')
    chromeRefs.aboutTab.classList.toggle('active', state.drawerContext.mode === 'about')
    const content = renderDrawerContent()
    if (content !== drawerContentMarkup) {
      chromeRefs.drawerScroll.innerHTML = content
      drawerContentMarkup = content
    }
  }

  function renderNotice() {
    const notice = state.notice
    if (!notice) return ''
    const release = notice.release || {}
    const status = notice.updateStatus || {}
    const isAvailable = notice.kind === 'available'
    const isProblem = notice.kind === 'failed' || notice.kind === 'interrupted'
    const title = isAvailable
      ? '发现新版本 v' + escapeHtml(release.version || '—')
      : (isProblem ? (notice.kind === 'failed' ? '更新失败' : '上次更新未完成') : '🎉 DeepSeek Harness 已更新至 v' + escapeHtml(release.version || notice.currentVersion || '—'))
    const desc = isAvailable
      ? '新版本已准备就绪，打开更新日志了解详细变化。'
      : (isProblem ? escapeHtml(status.message || '当前安装仍可使用，可以重新检查更新。') : '查看新特性与完整更新记录。')
    const actionLabel = isAvailable ? '查看新特性' : (isProblem ? '重新检查' : '查看新特性')
    const action = isProblem ? 'retry-update' : 'open-release-notes'
    if (!state.noticeExpanded) return '<button class="dsh-notice-pill" data-action="open-release-notes" title="查看更新日志">' + logoMarkup('dsh-bell-logo') + '<span>更新</span><i></i></button>'
    return '<section class="dsh-notice" role="status"><div class="dsh-notice-icon">' + logoMarkup('dsh-notice-logo') + '</div><div class="dsh-notice-copy"><strong>' + title + '</strong><span>' + desc + '</span></div><button class="dsh-button primary" data-action="' + action + '">' + actionLabel + '</button><button class="dsh-notice-dismiss" data-action="notice-collapse" aria-label="稍后查看">×</button></section>'
  }

  function renderMenu() {
    const trigger = '<button class="dsh-menu-trigger" data-action="toggle-menu" aria-haspopup="menu" aria-expanded="' + (state.menuOpen ? 'true' : 'false') + '" title="桌面菜单">' + logoMarkup('dsh-menu-logo') + '</button>'
    if (!state.menuOpen) return '<div class="dsh-app-menu">' + trigger + '</div>'
    return '<div class="dsh-app-menu">' + trigger + '<div class="dsh-menu-popover" role="menu" aria-label="桌面菜单">' +
      '<button class="dsh-menu-item" data-action="desktop-check-updates" role="menuitem"><span>↻</span><strong>检查更新</strong></button>' +
      '<button class="dsh-menu-item" data-action="desktop-release-notes" role="menuitem"><span>☷</span><strong>更新日志</strong></button>' +
      '<button class="dsh-menu-item" data-action="desktop-about" role="menuitem"><span>ⓘ</span><strong>关于 DeepSeek Harness</strong></button>' +
      '<div class="dsh-menu-separator"></div>' +
      '<button class="dsh-menu-item" data-action="desktop-choose-workspace" role="menuitem"><span>⌂</span><strong>选择工作区</strong></button>' +
      '<button class="dsh-menu-item" data-action="desktop-restart" role="menuitem"><span>↺</span><strong>重启 Harness</strong></button>' +
      '<button class="dsh-menu-item" data-action="desktop-open-browser" role="menuitem"><span>↗</span><strong>在浏览器打开 Web UI</strong></button>' +
      '</div></div>'
  }

  function render() {
    if (!host?.shadowRoot || chromeRefs === undefined) return
    const nextMenuMarkup = renderMenu()
    if (nextMenuMarkup !== menuMarkup) {
      chromeRefs.menuHost.innerHTML = nextMenuMarkup
      menuMarkup = nextMenuMarkup
    }
    const nextNoticeMarkup = renderNotice()
    if (nextNoticeMarkup !== noticeMarkup) {
      chromeRefs.noticeHost.innerHTML = nextNoticeMarkup
      noticeMarkup = nextNoticeMarkup
    }
    syncDrawer()
  }

  function collapseNotice(renderNow = true) {
    state.noticeExpanded = false
    if (state.noticeTimer !== undefined) clearTimeout(state.noticeTimer)
    if (renderNow) render()
  }

  function scheduleNoticeCollapse() {
    if (state.noticeTimer !== undefined) clearTimeout(state.noticeTimer)
    state.noticeTimer = setTimeout(collapseNotice, 7000)
  }

  async function openDrawer(context = { mode: 'history' }) {
    state.drawerContext = context && typeof context === 'object' ? context : { mode: 'history' }
    state.drawerOpen = true
    state.drawerLoading = true
    state.drawerRefreshing = false
    state.updateState = ''
    const requestId = ++state.requestId
    render()
    let hasCachedData = false
    try {
      state.data = await ipcRenderer.invoke('desktop:release-notes:get-cached-data', state.drawerContext)
      hasCachedData = true
    } catch {}
    if (requestId !== state.requestId) return
    state.drawerLoading = false
    state.drawerRefreshing = true
    render()
    try {
      const data = await ipcRenderer.invoke('desktop:release-notes:get-data', state.drawerContext)
      if (requestId !== state.requestId) return
      state.data = data
    } catch (error) {
      if (!hasCachedData) state.data = { error: error instanceof Error ? error.message : String(error), history: [] }
    } finally {
      if (requestId === state.requestId) {
        state.drawerRefreshing = false
        render()
      }
    }
  }

  function sendAction(type, extra = {}) {
    ipcRenderer.send('desktop:release-notes:action', { type, ...extra })
  }

  function sendMenuAction(type) {
    state.menuOpen = false
    render()
    ipcRenderer.send('desktop:menu:action', { type })
  }

  function handleAction(target) {
    const action = target?.dataset?.action
    if (!action) return
    if (action === 'toggle-menu') {
      state.menuOpen = !state.menuOpen
      render()
      return
    }
    if (action === 'desktop-check-updates') {
      sendMenuAction('check-for-updates')
      return
    }
    if (action === 'desktop-release-notes') {
      sendMenuAction('release-notes')
      return
    }
    if (action === 'desktop-about') {
      sendMenuAction('about')
      return
    }
    if (action === 'desktop-choose-workspace') {
      sendMenuAction('choose-workspace')
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
    if (action === 'notice-collapse') {
      collapseNotice()
      return
    }
    if (action === 'open-release-notes') {
      const context = state.notice?.kind === 'available'
        ? { mode: 'update', currentVersion: state.notice.currentVersion, update: state.notice.release }
        : { mode: 'history', selectedVersion: state.notice?.currentVersion }
      collapseNotice(false)
      void openDrawer(context)
      return
    }
    if (action === 'drawer-close') {
      state.drawerOpen = false
      render()
      return
    }
    if (action === 'retry-update') {
      sendAction('retry-update')
      return
    }
    if (action === 'update') {
      const version = state.data?.latestRelease?.version || state.notice?.release?.version || ''
      state.updateState = '更新器已启动，正在安全退出应用…'
      render()
      sendAction('update', { targetVersion: version })
      return
    }
    if (action === 'show-about') {
      void openDrawer({ ...state.drawerContext, mode: 'about' })
      return
    }
    if (action === 'show-notes') {
      void openDrawer({ ...state.drawerContext, mode: state.drawerContext.update ? 'update' : 'history' })
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
    .dsh-drag-region { position: fixed; inset: 0 140px auto 44px; height: var(--dsh-titlebar-height); pointer-events: none; -webkit-app-region: drag; }
    .dsh-app-menu, .dsh-notice, .dsh-notice-pill, .dsh-drawer-layer { pointer-events: auto; }
    .dsh-app-menu { position: fixed; top: 5px; left: 10px; z-index: 2; -webkit-app-region: no-drag; }
    .dsh-menu-trigger { display: grid; place-items: center; width: 28px; height: 26px; padding: 0; border: 1px solid rgba(93, 126, 177, .2); border-radius: 8px; color: #4775b8; background: rgba(247, 250, 255, .72); box-shadow: 0 4px 12px rgba(31, 50, 83, .1); cursor: pointer; font-size: 15px; -webkit-app-region: no-drag; }
    .dsh-menu-logo { width: 18px; height: 18px; object-fit: contain; pointer-events: none; }
    .dsh-menu-trigger:hover, .dsh-menu-trigger[aria-expanded="true"] { border-color: rgba(52, 127, 242, .5); color: #2366ca; background: rgba(231, 240, 255, .96); }
    .dsh-menu-popover { display: grid; min-width: 236px; margin-top: 6px; padding: 6px; border: 1px solid rgba(116, 138, 171, .24); border-radius: 12px; background: rgba(250, 252, 255, .98); box-shadow: 0 16px 40px rgba(23, 43, 72, .2); -webkit-app-region: no-drag; }
    .dsh-menu-item { display: flex; align-items: center; gap: 10px; width: 100%; min-height: 32px; padding: 7px 9px; border: 0; border-radius: 7px; color: #263a5a; background: transparent; cursor: pointer; text-align: left; font: 12px/1.2 inherit; -webkit-app-region: no-drag; }
    .dsh-menu-item:hover { color: #1d5ebf; background: #eaf2ff; }
    .dsh-menu-item span { display: inline-grid; place-items: center; width: 17px; color: #5b80b8; font-size: 14px; }
    .dsh-menu-item strong { font-weight: 600; }
    .dsh-menu-separator { height: 1px; margin: 5px 4px; background: rgba(116, 138, 171, .18); }
    .dsh-notice { position: fixed; top: 46px; left: 50%; width: min(760px, calc(100vw - 32px)); transform: translateX(-50%); display: flex; align-items: center; gap: 12px; padding: 12px 14px; border: 1px solid rgba(87, 151, 255, .32); border-radius: 14px; background: rgba(247, 250, 255, .94); box-shadow: 0 14px 40px rgba(31, 50, 83, .18), 0 1px 2px rgba(15, 23, 42, .08); backdrop-filter: blur(22px) saturate(160%); animation: dsh-slide-in .28s cubic-bezier(.16,1,.3,1); }
    .dsh-notice-icon { display: grid; flex: 0 0 32px; place-items: center; width: 32px; height: 32px; border-radius: 10px; background: rgba(255, 255, 255, .94); box-shadow: 0 5px 16px rgba(47, 117, 238, .3); }
    .dsh-notice-logo { width: 25px; height: 25px; object-fit: contain; pointer-events: none; }
    .dsh-notice-copy { min-width: 0; flex: 1; display: grid; gap: 1px; }
    .dsh-notice-copy strong { color: #15223a; font-weight: 650; }
    .dsh-notice-copy span { overflow: hidden; color: #60708a; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; }
    .dsh-notice-dismiss, .dsh-close { border: 0; background: transparent; color: #7b8aa3; cursor: pointer; font-size: 18px; line-height: 1; }
    .dsh-notice-dismiss { padding: 5px; }
    .dsh-notice-pill { position: fixed; top: 46px; right: 16px; display: inline-flex; align-items: center; gap: 7px; padding: 7px 10px; border: 1px solid rgba(87, 151, 255, .28); border-radius: 999px; color: #2f6fda; background: rgba(247, 250, 255, .92); box-shadow: 0 8px 24px rgba(31, 50, 83, .14); cursor: pointer; backdrop-filter: blur(18px); }
    .dsh-notice-pill i { width: 6px; height: 6px; border-radius: 50%; background: #3a8bff; box-shadow: 0 0 0 4px rgba(58, 139, 255, .15); }
    .dsh-bell-logo { width: 16px; height: 16px; object-fit: contain; pointer-events: none; }
    .dsh-button { display: inline-flex; align-items: center; justify-content: center; min-height: 30px; padding: 5px 11px; border: 1px solid rgba(28, 48, 78, .11); border-radius: 8px; color: #1d2b42; background: rgba(241, 245, 251, .92); cursor: pointer; font: 600 12px/1.2 inherit; white-space: nowrap; }
    .dsh-button:hover { background: #e4ebf6; }
    .dsh-button.primary { border-color: #307bf0; color: #fff; background: #307bf0; box-shadow: 0 3px 10px rgba(48, 123, 240, .25); }
    .dsh-button.primary:hover { background: #2567ce; }
    .dsh-button.ghost { color: #5d6d85; background: transparent; }
    .dsh-button:disabled { opacity: .6; cursor: default; }
    .dsh-drawer-layer { position: fixed; inset: 0; display: flex; justify-content: flex-end; opacity: 0; visibility: hidden; pointer-events: none; transition: opacity .2s ease, visibility 0s linear .3s; }
    .dsh-drawer-layer.is-open { opacity: 1; visibility: visible; pointer-events: auto; transition-delay: 0s; }
    .dsh-drawer-backdrop { position: absolute; inset: 0; width: 100%; border: 0; background: rgba(12, 22, 38, .24); cursor: default; opacity: 0; transition: opacity .2s ease; }
    .dsh-drawer-layer.is-open .dsh-drawer-backdrop { opacity: 1; }
    .dsh-drawer { position: relative; display: flex; flex-direction: column; width: min(540px, calc(100vw - 12px)); height: 100%; overflow: hidden; border-left: 1px solid rgba(116, 138, 171, .22); background: rgba(250, 252, 255, .97); box-shadow: -20px 0 50px rgba(23, 43, 72, .2); opacity: .75; transform: translateX(100%); transition: transform .3s cubic-bezier(.16,1,.3,1), opacity .3s ease; will-change: transform, opacity; }
    .dsh-drawer-layer.is-open .dsh-drawer { opacity: 1; transform: translateX(0); }
    .dsh-drawer-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 20px; padding: calc(var(--dsh-titlebar-height) + 14px) 28px 18px; border-bottom: 1px solid rgba(42, 61, 92, .1); }
    .dsh-eyebrow { margin-bottom: 4px; color: #6e85a8; font: 700 10px/1.2 ui-monospace, SFMono-Regular, Consolas, monospace; letter-spacing: .12em; }
    .dsh-drawer h2 { margin: 0; color: #18263d; font-size: 21px; letter-spacing: -.02em; }
    .dsh-subtitle { display: block; margin-top: 4px; color: #7e8da4; font-size: 12px; }
    .dsh-close { padding: 2px 5px; font-size: 26px; }
    .dsh-drawer-tabs { display: flex; gap: 18px; padding: 0 28px; border-bottom: 1px solid rgba(42, 61, 92, .1); }
    .dsh-drawer-tabs button { padding: 11px 1px 9px; border: 0; border-bottom: 2px solid transparent; color: #7c8ba1; background: transparent; cursor: pointer; font: 600 12px/1.3 inherit; }
    .dsh-drawer-tabs button.active { border-bottom-color: #347ff2; color: #2d6fd6; }
    .dsh-drawer-scroll { min-height: 0; flex: 1; overflow-y: auto; overscroll-behavior: contain; scrollbar-gutter: stable; padding: 20px 28px 36px; -webkit-overflow-scrolling: touch; }
    .dsh-drawer-footer { display: flex; justify-content: space-between; padding: 12px 22px; border-top: 1px solid rgba(42, 61, 92, .1); }
    .dsh-update-card, .dsh-status { display: flex; align-items: center; justify-content: space-between; gap: 14px; margin-bottom: 18px; padding: 13px 14px; border: 1px solid rgba(61, 129, 240, .25); border-radius: 12px; background: rgba(74, 143, 247, .08); }
    .dsh-update-card div { min-width: 0; display: grid; gap: 2px; }
    .dsh-update-card strong { color: #245db1; }
    .dsh-update-card span, .dsh-status span { color: #6e7e96; font-size: 11px; }
    .dsh-status { justify-content: flex-start; flex-wrap: wrap; border-color: rgba(221, 143, 33, .28); background: rgba(245, 174, 68, .1); }
    .dsh-status.failed { border-color: rgba(224, 71, 95, .26); background: rgba(224, 71, 95, .08); }
    .dsh-status strong { color: #aa6c11; }
    .dsh-status.failed strong { color: #c43b53; }
    .dsh-status span { flex: 1 1 180px; }
    .dsh-timeline { position: relative; padding-left: 20px; }
    .dsh-timeline::before { content: ""; position: absolute; left: 4px; top: 10px; bottom: 10px; width: 1px; background: rgba(71, 94, 129, .16); }
    .dsh-release-entry { position: relative; margin-bottom: 28px; }
    .dsh-release-node { position: absolute; left: -20px; top: 5px; width: 9px; height: 9px; border: 2px solid #a4b2c8; border-radius: 50%; background: #f9fbff; }
    .dsh-release-entry.is-current .dsh-release-node { border-color: #347ff2; background: #347ff2; box-shadow: 0 0 10px rgba(52, 127, 242, .45); }
    .dsh-release-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 10px; }
    .dsh-version { color: #1e2d44; font: 700 15px/1.2 ui-monospace, SFMono-Regular, Consolas, monospace; }
    .dsh-type, .dsh-current { display: inline-block; margin-left: 8px; padding: 2px 7px; border-radius: 999px; color: #5371a0; background: #edf3fb; font-size: 10px; font-weight: 650; }
    .dsh-current { color: #287451; background: #e5f6ee; }
    .dsh-release-head time { color: #94a1b5; font-size: 11px; }
    .dsh-release-section { margin-bottom: 13px; }
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
    .dsh-about { padding: 48px 10px; text-align: center; }
    .dsh-about-logo { width: 64px; height: 64px; display: grid; place-items: center; margin: 0 auto 16px; border: 1px solid rgba(72, 112, 190, .16); border-radius: 20px; background: #f7faff; box-shadow: 0 10px 28px rgba(47, 117, 238, .26); }
    .dsh-about-logo-image { width: 54px; height: 54px; object-fit: contain; }
    .dsh-about h3 { margin: 0 0 8px; color: #1e2d44; font-size: 18px; }
    .dsh-about p { margin: 5px 0; color: #657793; }
    .dsh-muted { color: #9aa7ba !important; font-size: 11px; }
    @keyframes dsh-slide-in { from { opacity: 0; transform: translate(-50%, -8px); } to { opacity: 1; transform: translate(-50%, 0); } }
    @keyframes dsh-drawer-in { from { opacity: .75; transform: translateX(100%); } to { opacity: 1; transform: translateX(0); } }
    @keyframes dsh-fade-in { from { opacity: 0; } to { opacity: 1; } }
    @media (prefers-color-scheme: dark) {
      .dsh-chrome { color: #e8eef9; }
      .dsh-notice-icon, .dsh-about-logo { border-color: rgba(93, 157, 255, .36); background: #edf4ff; }
      .dsh-menu-trigger { border-color: rgba(93, 157, 255, .36); color: #a8c7fa; background: rgba(19, 29, 47, .86); }
      .dsh-menu-trigger:hover, .dsh-menu-trigger[aria-expanded="true"] { color: #d5e5ff; background: rgba(44, 72, 119, .96); }
      .dsh-menu-popover { border-color: rgba(170, 192, 228, .16); background: rgba(17, 26, 42, .98); box-shadow: 0 16px 40px rgba(0, 0, 0, .4); }
      .dsh-menu-item { color: #dbe7fa; }
      .dsh-menu-item:hover { color: #d5e5ff; background: #253b61; }
      .dsh-menu-item span { color: #9ebdf0; }
      .dsh-menu-separator { background: rgba(170, 192, 228, .16); }
      .dsh-notice, .dsh-notice-pill { border-color: rgba(93, 157, 255, .36); background: rgba(19, 29, 47, .94); box-shadow: 0 16px 40px rgba(0, 0, 0, .36); }
      .dsh-notice-copy strong { color: #edf4ff; }
      .dsh-notice-copy span { color: #9aabc4; }
      .dsh-notice-dismiss, .dsh-close { color: #92a4c0; }
      .dsh-button { border-color: rgba(185, 204, 235, .14); color: #e0eaf9; background: rgba(46, 61, 86, .8); }
      .dsh-button:hover { background: #354766; }
      .dsh-button.ghost { color: #9eafc8; background: transparent; }
      .dsh-drawer { border-color: rgba(170, 192, 228, .16); background: rgba(17, 26, 42, .97); box-shadow: -20px 0 50px rgba(0, 0, 0, .36); }
      .dsh-drawer-header, .dsh-drawer-tabs, .dsh-drawer-footer { border-color: rgba(170, 192, 228, .12); }
      .dsh-eyebrow, .dsh-subtitle, .dsh-release-head time, .dsh-empty-copy, .dsh-loading, .dsh-refreshing { color: #7f91ad; }
      .dsh-drawer h2, .dsh-version, .dsh-about h3 { color: #edf4ff; }
      .dsh-drawer-tabs button { color: #8496b2; }
      .dsh-release-node { border-color: #647896; background: #18263d; }
      .dsh-version { color: #e7effc; }
      .dsh-type { color: #a9c2e9; background: #253652; }
      .dsh-current { color: #83d2ac; background: #1b3d31; }
      .dsh-release-item { color: #c0cee2; }
      .dsh-release-item strong { color: #e4edf9; }
      .dsh-release-icon { color: #9db0cd; background: #25344d; }
      .dsh-release-item code { border-color: rgba(185, 204, 235, .12); color: #b4c9e9; background: #23324b; }
      .dsh-update-card, .dsh-status { border-color: rgba(81, 149, 255, .28); background: rgba(55, 113, 201, .16); }
      .dsh-update-card strong { color: #9fc5ff; }
      .dsh-update-card span, .dsh-status span { color: #9aacC5; }
      .dsh-status { border-color: rgba(245, 174, 68, .28); background: rgba(159, 104, 22, .17); }
      .dsh-status.failed { border-color: rgba(245, 100, 122, .28); background: rgba(159, 40, 66, .17); }
      .dsh-status strong { color: #f5c46e; }
      .dsh-status.failed strong { color: #ff9aad; }
      .dsh-about p { color: #a2b2c9; }
    }
    @media (max-width: 620px) {
      .dsh-notice { width: calc(100vw - 20px); }
      .dsh-notice-copy span { white-space: normal; }
      .dsh-notice .dsh-button { padding-inline: 8px; }
      .dsh-drawer-header, .dsh-drawer-scroll { padding-left: 20px; padding-right: 20px; }
      .dsh-drawer-tabs { padding-left: 20px; padding-right: 20px; }
    }
  `

  const host = document.createElement('div')
  host.id = 'deepseek-harness-desktop-chrome'
  const shadow = host.attachShadow({ mode: 'open' })

  ipcRenderer.on('desktop:theme-changed', (_event, theme) => {
    const dark = theme?.theme === 'dark'
    document.documentElement.dataset.dshTheme = dark ? 'dark' : 'light'
    document.documentElement.style.colorScheme = dark ? 'dark' : 'light'
    document.documentElement.style.setProperty('--dsh-titlebar-height', `${Number(theme?.titleBar?.height) || 36}px`)
    document.documentElement.style.setProperty('--dsh-window-surface', theme?.surface || (dark ? '#0c1220' : '#f4f7fb'))
  })
  ipcRenderer.on('desktop:notice', (_event, notice) => {
    state.notice = notice && typeof notice === 'object' ? notice : undefined
    state.noticeExpanded = true
    render()
    scheduleNoticeCollapse()
  })
  ipcRenderer.on('desktop:release-notes:open', (_event, context) => { void openDrawer(context) })
  ipcRenderer.on('desktop:release-notes:reload', () => {
    if (state.drawerOpen) void openDrawer(state.drawerContext)
  })
  ipcRenderer.on('desktop:update-state', (_event, update) => {
    state.updateState = update?.label || ''
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
    shadow.innerHTML = '<style>' + SHADOW_CSS + '</style><div class="dsh-chrome"><div class="dsh-drag-region" aria-hidden="true"></div><div class="dsh-menu-host"></div><div class="dsh-notice-host"></div><div class="dsh-drawer-host">' + renderDrawerShell() + '</div></div>'
    const drawerLayer = shadow.querySelector('.dsh-drawer-layer')
    chromeRefs = {
      menuHost: shadow.querySelector('.dsh-menu-host'),
      noticeHost: shadow.querySelector('.dsh-notice-host'),
      drawerLayer,
      drawer: drawerLayer.querySelector('.dsh-drawer'),
      drawerTitle: drawerLayer.querySelector('.dsh-drawer-title'),
      drawerSubtitle: drawerLayer.querySelector('.dsh-subtitle'),
      notesTab: drawerLayer.querySelector('.dsh-notes-tab'),
      aboutTab: drawerLayer.querySelector('.dsh-about-tab'),
      drawerScroll: drawerLayer.querySelector('.dsh-drawer-scroll'),
    }
    render()
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

  document.addEventListener('pointerdown', event => {
    if (!state.menuOpen || event.composedPath().includes(host)) return
    state.menuOpen = false
    render()
  }, true)
  window.addEventListener('keydown', event => {
    if (event.key === 'Alt' || event.key === 'F10') {
      event.preventDefault()
      state.menuOpen = !state.menuOpen
      render()
      return
    }
    if (event.key === 'Escape' && state.menuOpen) {
      event.preventDefault()
      state.menuOpen = false
      render()
    }
  })

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once: true })
  else mount()
}
