const { contextBridge, ipcRenderer } = require('electron')

const SPLASH_STATUSES = new Set(['engine', 'workspace', 'interface'])
const isSplashDocument = window.location.protocol === 'file:'

const splashListeners = new Set()
ipcRenderer.on('desktop:splash-status', (_event, value) => {
  const status = value && typeof value === 'object' ? value.status : value
  if (!SPLASH_STATUSES.has(status)) return
  splashListeners.forEach(listener => listener(status))
})

contextBridge.exposeInMainWorld('deepSeekSplash', {
  onStatus: callback => {
    if (typeof callback !== 'function') return () => {}
    splashListeners.add(callback)
    return () => splashListeners.delete(callback)
  },
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
    notice: undefined,
    noticeExpanded: true,
    noticeTimer: undefined,
    requestId: 0,
    updateState: '',
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;')
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
      html, body { height: 100%; min-height: 0 !important; }
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
      button, a, input, textarea, select, [role="button"] { -webkit-user-select: none; user-select: none; }
    `
    document.head.appendChild(style)
  }

  function mountStartupCover() {
    const cover = document.createElement('div')
    cover.id = 'dsh-startup-cover'
    cover.innerHTML = '<div class="dsh-startup-mark">◈</div><div class="dsh-startup-name">DeepSeek Harness</div><div class="dsh-startup-copy">正在加载界面…</div><div class="dsh-startup-progress"><i></i></div>'
    const style = document.createElement('style')
    style.textContent = `
      #dsh-startup-cover { position: fixed; inset: 0; z-index: 2147483646; display: grid; place-content: center; justify-items: center; gap: 10px; background: #0c1220; color: #f8fbff; opacity: 1; transition: opacity .42s ease, visibility .42s ease; font: 13px/1.5 "Segoe UI", "Microsoft YaHei", sans-serif; }
      #dsh-startup-cover.is-hidden { opacity: 0; visibility: hidden; pointer-events: none; }
      .dsh-startup-mark { width: 54px; height: 54px; display: grid; place-items: center; border-radius: 18px; color: #fff; background: linear-gradient(145deg, #2f82ff, #1760d0); box-shadow: 0 10px 38px rgba(31, 111, 255, .34); font-size: 26px; animation: dsh-breathe 1.8s ease-in-out infinite; }
      .dsh-startup-name { font-size: 17px; font-weight: 650; letter-spacing: .01em; }
      .dsh-startup-copy { color: rgba(226, 234, 249, .72); }
      .dsh-startup-progress { width: 128px; height: 3px; overflow: hidden; border-radius: 99px; background: rgba(255,255,255,.12); }
      .dsh-startup-progress i { display: block; width: 45%; height: 100%; border-radius: inherit; background: #55a4ff; animation: dsh-progress 1.3s ease-in-out infinite; }
      @keyframes dsh-breathe { 50% { transform: scale(1.06); box-shadow: 0 12px 48px rgba(31, 111, 255, .5); } }
      @keyframes dsh-progress { from { transform: translateX(-120%); } to { transform: translateX(300%); } }
    `
    document.head.appendChild(style)
    document.documentElement.appendChild(cover)
    const hide = () => {
      if (!cover.isConnected) return
      cover.classList.add('is-hidden')
      setTimeout(() => cover.remove(), 520)
    }
    window.addEventListener('load', () => setTimeout(hide, 100), { once: true })
    setTimeout(hide, 1800)
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

  function renderDrawer() {
    if (!state.drawerOpen) return ''
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
    const title = state.drawerContext.mode === 'about' ? '关于 DeepSeek Harness' : '更新日志'
    const version = data?.currentVersion || '—'
    return '<div class="dsh-drawer-layer"><button class="dsh-drawer-backdrop" data-action="drawer-close" aria-label="关闭"></button><aside class="dsh-drawer" role="dialog" aria-modal="true" aria-label="' + escapeHtml(title) + '"><header class="dsh-drawer-header"><div><div class="dsh-eyebrow">DEEPSEEK HARNESS</div><h2>' + title + '</h2><span class="dsh-subtitle">当前版本 v' + escapeHtml(version) + '</span></div><button class="dsh-close" data-action="drawer-close" aria-label="关闭">×</button></header><div class="dsh-drawer-tabs"><button class="' + (state.drawerContext.mode === 'about' ? '' : 'active') + '" data-action="show-notes">更新日志</button><button class="' + (state.drawerContext.mode === 'about' ? 'active' : '') + '" data-action="show-about">关于</button></div><div class="dsh-drawer-scroll">' + (state.drawerLoading ? '<div class="dsh-loading">正在加载更新记录…</div>' : (state.drawerContext.mode === 'about' ? '<div class="dsh-about"><div class="dsh-about-logo">◈</div><h3>DeepSeek Harness</h3><p>面向 Windows 的 DeepSeek Harness 桌面外壳。</p><p class="dsh-muted">内核 v' + escapeHtml(data?.localInfo?.kernelVersion || 'unknown') + ' · 外壳 v' + escapeHtml(data?.localInfo?.desktopVersion || 'unknown') + '</p></div>' : updateCard + statusNotice + renderTimeline(data?.history || []))) + '</div><footer class="dsh-drawer-footer"><button class="dsh-button ghost" data-action="open-github">GitHub 仓库 ↗</button><button class="dsh-button ghost" data-action="drawer-close">完成</button></footer></aside></div>'
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
    if (!state.noticeExpanded) return '<button class="dsh-notice-pill" data-action="open-release-notes" title="查看更新日志"><span class="dsh-bell">♢</span><span>更新</span><i></i></button>'
    return '<section class="dsh-notice" role="status"><div class="dsh-notice-icon">◈</div><div class="dsh-notice-copy"><strong>' + title + '</strong><span>' + desc + '</span></div><button class="dsh-button primary" data-action="' + action + '">' + actionLabel + '</button><button class="dsh-notice-dismiss" data-action="notice-collapse" aria-label="稍后查看">×</button></section>'
  }

  function render() {
    if (!host?.shadowRoot) return
    shadow.innerHTML = '<style>' + SHADOW_CSS + '</style><div class="dsh-chrome"><div class="dsh-drag-region" aria-hidden="true"></div>' + renderNotice() + renderDrawer() + '</div>'
  }

  function collapseNotice() {
    state.noticeExpanded = false
    if (state.noticeTimer !== undefined) clearTimeout(state.noticeTimer)
    render()
  }

  function scheduleNoticeCollapse() {
    if (state.noticeTimer !== undefined) clearTimeout(state.noticeTimer)
    state.noticeTimer = setTimeout(collapseNotice, 7000)
  }

  async function openDrawer(context = { mode: 'history' }) {
    state.drawerContext = context && typeof context === 'object' ? context : { mode: 'history' }
    state.drawerOpen = true
    state.drawerLoading = true
    state.updateState = ''
    render()
    const requestId = ++state.requestId
    try {
      const data = await ipcRenderer.invoke('desktop:release-notes:get-data', state.drawerContext)
      if (requestId !== state.requestId) return
      state.data = data
    } catch (error) {
      state.data = { error: error instanceof Error ? error.message : String(error), history: [] }
    } finally {
      if (requestId === state.requestId) {
        state.drawerLoading = false
        render()
      }
    }
  }

  function sendAction(type, extra = {}) {
    ipcRenderer.send('desktop:release-notes:action', { type, ...extra })
  }

  function handleAction(target) {
    const action = target?.dataset?.action
    if (!action) return
    if (action === 'notice-collapse') {
      collapseNotice()
      return
    }
    if (action === 'open-release-notes') {
      const context = state.notice?.kind === 'available'
        ? { mode: 'update', currentVersion: state.notice.currentVersion, update: state.notice.release }
        : { mode: 'history', selectedVersion: state.notice?.currentVersion }
      collapseNotice()
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
    .dsh-drag-region { position: fixed; inset: 0 0 auto; height: 36px; pointer-events: auto; -webkit-app-region: drag; }
    .dsh-notice, .dsh-notice-pill, .dsh-drawer-layer { pointer-events: auto; }
    .dsh-notice { position: fixed; top: 46px; left: 50%; width: min(760px, calc(100vw - 32px)); transform: translateX(-50%); display: flex; align-items: center; gap: 12px; padding: 12px 14px; border: 1px solid rgba(87, 151, 255, .32); border-radius: 14px; background: rgba(247, 250, 255, .94); box-shadow: 0 14px 40px rgba(31, 50, 83, .18), 0 1px 2px rgba(15, 23, 42, .08); backdrop-filter: blur(22px) saturate(160%); animation: dsh-slide-in .28s cubic-bezier(.16,1,.3,1); }
    .dsh-notice-icon { display: grid; flex: 0 0 32px; place-items: center; width: 32px; height: 32px; border-radius: 10px; color: #fff; background: linear-gradient(145deg, #3a8bff, #1b59c5); box-shadow: 0 5px 16px rgba(47, 117, 238, .3); font-size: 16px; }
    .dsh-notice-copy { min-width: 0; flex: 1; display: grid; gap: 1px; }
    .dsh-notice-copy strong { color: #15223a; font-weight: 650; }
    .dsh-notice-copy span { overflow: hidden; color: #60708a; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; }
    .dsh-notice-dismiss, .dsh-close { border: 0; background: transparent; color: #7b8aa3; cursor: pointer; font-size: 18px; line-height: 1; }
    .dsh-notice-dismiss { padding: 5px; }
    .dsh-notice-pill { position: fixed; top: 46px; right: 16px; display: inline-flex; align-items: center; gap: 7px; padding: 7px 10px; border: 1px solid rgba(87, 151, 255, .28); border-radius: 999px; color: #2f6fda; background: rgba(247, 250, 255, .92); box-shadow: 0 8px 24px rgba(31, 50, 83, .14); cursor: pointer; backdrop-filter: blur(18px); }
    .dsh-notice-pill i { width: 6px; height: 6px; border-radius: 50%; background: #3a8bff; box-shadow: 0 0 0 4px rgba(58, 139, 255, .15); }
    .dsh-bell { font-size: 16px; }
    .dsh-button { display: inline-flex; align-items: center; justify-content: center; min-height: 30px; padding: 5px 11px; border: 1px solid rgba(28, 48, 78, .11); border-radius: 8px; color: #1d2b42; background: rgba(241, 245, 251, .92); cursor: pointer; font: 600 12px/1.2 inherit; white-space: nowrap; }
    .dsh-button:hover { background: #e4ebf6; }
    .dsh-button.primary { border-color: #307bf0; color: #fff; background: #307bf0; box-shadow: 0 3px 10px rgba(48, 123, 240, .25); }
    .dsh-button.primary:hover { background: #2567ce; }
    .dsh-button.ghost { color: #5d6d85; background: transparent; }
    .dsh-button:disabled { opacity: .6; cursor: default; }
    .dsh-drawer-layer { position: fixed; inset: 36px 0 0; display: flex; justify-content: flex-end; }
    .dsh-drawer-backdrop { position: absolute; inset: 0; width: 100%; border: 0; background: rgba(12, 22, 38, .24); cursor: default; animation: dsh-fade-in .2s ease; }
    .dsh-drawer { position: relative; display: flex; flex-direction: column; width: min(540px, calc(100vw - 12px)); height: 100%; overflow: hidden; border-left: 1px solid rgba(116, 138, 171, .22); background: rgba(250, 252, 255, .97); box-shadow: -20px 0 50px rgba(23, 43, 72, .2); animation: dsh-drawer-in .3s cubic-bezier(.16,1,.3,1); }
    .dsh-drawer-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 20px; padding: 28px 28px 18px; border-bottom: 1px solid rgba(42, 61, 92, .1); }
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
    .dsh-about { padding: 48px 10px; text-align: center; }
    .dsh-about-logo { width: 64px; height: 64px; display: grid; place-items: center; margin: 0 auto 16px; border-radius: 20px; color: #fff; background: linear-gradient(145deg, #3a8bff, #1b59c5); box-shadow: 0 10px 28px rgba(47, 117, 238, .26); font-size: 28px; }
    .dsh-about h3 { margin: 0 0 8px; color: #1e2d44; font-size: 18px; }
    .dsh-about p { margin: 5px 0; color: #657793; }
    .dsh-muted { color: #9aa7ba !important; font-size: 11px; }
    @keyframes dsh-slide-in { from { opacity: 0; transform: translate(-50%, -8px); } to { opacity: 1; transform: translate(-50%, 0); } }
    @keyframes dsh-drawer-in { from { opacity: .75; transform: translateX(100%); } to { opacity: 1; transform: translateX(0); } }
    @keyframes dsh-fade-in { from { opacity: 0; } to { opacity: 1; } }
    @media (prefers-color-scheme: dark) {
      .dsh-chrome { color: #e8eef9; }
      .dsh-notice, .dsh-notice-pill { border-color: rgba(93, 157, 255, .36); background: rgba(19, 29, 47, .94); box-shadow: 0 16px 40px rgba(0, 0, 0, .36); }
      .dsh-notice-copy strong { color: #edf4ff; }
      .dsh-notice-copy span { color: #9aabc4; }
      .dsh-notice-dismiss, .dsh-close { color: #92a4c0; }
      .dsh-button { border-color: rgba(185, 204, 235, .14); color: #e0eaf9; background: rgba(46, 61, 86, .8); }
      .dsh-button:hover { background: #354766; }
      .dsh-button.ghost { color: #9eafc8; background: transparent; }
      .dsh-drawer { border-color: rgba(170, 192, 228, .16); background: rgba(17, 26, 42, .97); box-shadow: -20px 0 50px rgba(0, 0, 0, .36); }
      .dsh-drawer-header, .dsh-drawer-tabs, .dsh-drawer-footer { border-color: rgba(170, 192, 228, .12); }
      .dsh-eyebrow, .dsh-subtitle, .dsh-release-head time, .dsh-empty-copy, .dsh-loading { color: #7f91ad; }
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
    mountStartupCover()
    render()
    ipcRenderer.send('desktop:renderer-ready')
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once: true })
  else mount()
}
