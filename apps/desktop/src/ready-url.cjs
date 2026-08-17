/**
 * Extract the loopback URL printed by the web profile.
 *
 * @param {string} output - accumulated Harness stdout/stderr.
 * @returns {string|undefined} the local URL when the server is ready.
 */
function readyUrl(output) {
  if (typeof output !== 'string') return undefined
  // Strip ANSI escape sequences if any
  const clean = output.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '')
  return clean.match(/(?:^|\r?\n)dsh web:\s*(http:\/\/127\.0\.0\.1:\d+)/)?.[1]
}

/** The browser shell cannot activate until these two graph entries exist. */
const REQUIRED_CLIENT_ENTRIES = [
  '@deepseek-ai/dsh-client-runtime',
  '@deepseek-ai/dsh-client-ui-layout',
]

/** Build the settings RPC endpoint without producing a double-slash path. */
function settingsDescribeUrl(baseUrl) {
  return new URL('/api/settings.describe', baseUrl).href
}

/**
 * Parse the JSON boot graph injected into the web index document.
 *
 * The graph is deliberately read from the served document rather than inferred
 * from an API response: the browser consumes this exact snapshot on navigation.
 *
 * @param {string} html - served index document.
 * @returns {{ entries?: Array<{ id?: string, inject?: string[] }> }|undefined}
 */
function parseBootManifest(html) {
  if (typeof html !== 'string') return undefined
  const match = html.match(/window\.__DSH_BOOT__\s*=\s*(\{[\s\S]*?\})\s*<\/script>/)
  if (!match) return undefined
  try {
    const manifest = JSON.parse(match[1])
    return manifest !== null && typeof manifest === 'object' ? manifest : undefined
  } catch {
    return undefined
  }
}

/**
 * Check that the graph contains the shell's roots and every declared inject
 * dependency beneath them. This avoids hard-coding the entire client roster
 * while still rejecting a partially scanned graph.
 *
 * @param {{ entries?: Array<{ id?: string, inject?: string[] }> }|undefined} manifest
 * @returns {boolean}
 */
function hasRequiredClientGraph(manifest) {
  if (!Array.isArray(manifest?.entries)) return false
  const rows = new Map(manifest.entries
    .filter(row => row !== null && typeof row === 'object' && typeof row.id === 'string')
    .map(row => [row.id, row]))
  const pending = [...REQUIRED_CLIENT_ENTRIES]
  const seen = new Set()
  while (pending.length > 0) {
    const id = pending.pop()
    if (seen.has(id)) continue
    seen.add(id)
    const row = rows.get(id)
    if (!row) return false
    if (Array.isArray(row.inject)) pending.push(...row.inject)
  }
  return true
}

/**
 * Wait until both host and browser boot prerequisites are ready.
 *
 * The web server can answer `/` and `settings.describe` before the incremental
 * client-module scan has populated the boot graph. Opening that first document
 * produces the permanent app-shell error shown by the desktop client, because
 * the browser has already captured an empty graph. Poll the same index document
 * the browser will consume and require the shell's transitive dependency graph
 * before resolving.
 *
 * @param {string} baseUrl - loopback web URL returned by the launcher.
 * @param {{ timeoutMs?: number, intervalMs?: number }} [options]
 * @returns {Promise<void>}
 */
async function waitForOnboardingReady(baseUrl, options = {}) {
  const timeoutMs = options.timeoutMs ?? 20_000
  const intervalMs = options.intervalMs ?? 120
  const settingsUrl = settingsDescribeUrl(baseUrl)
  const indexUrl = new URL('/', baseUrl).href
  const deadline = Date.now() + timeoutMs
  let lastReason = 'settings.describe has not completed'
  let onboardingReady = false
  let clientGraphReady = false
  while (Date.now() < deadline) {
    const remainingMs = () => Math.min(1500, Math.max(1, deadline - Date.now()))
    if (!onboardingReady) {
      try {
        const response = await fetch(settingsUrl, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            type: 'client-request',
            rpcId: `desktop-readiness-${Date.now()}`,
            method: 'settings.describe',
            payload: {},
          }),
          signal: AbortSignal.timeout(remainingMs()),
        })
        if (!response.ok) {
          lastReason = `settings.describe HTTP ${response.status}`
        } else {
          const body = await response.json()
          if (body?.result?.ok && body.result.value?.namespaces?.some(namespace => namespace.ns === 'ui-onboarding')) {
            onboardingReady = true
          } else {
            lastReason = body?.result?.error?.message ?? 'ui-onboarding namespace is not registered'
          }
        }
      } catch (error) {
        lastReason = error instanceof Error ? error.message : String(error)
      }
    }
    if (!clientGraphReady) {
      try {
        const response = await fetch(indexUrl, {
          headers: { 'cache-control': 'no-cache' },
          signal: AbortSignal.timeout(remainingMs()),
        })
        if (!response.ok) {
          lastReason = `web index HTTP ${response.status}`
        } else if (hasRequiredClientGraph(parseBootManifest(await response.text()))) {
          clientGraphReady = true
        } else {
          lastReason = 'client plugin graph is not populated'
        }
      } catch (error) {
        lastReason = error instanceof Error ? error.message : String(error)
      }
    }
    if (onboardingReady && clientGraphReady) return
    await new Promise(resolve => setTimeout(resolve, intervalMs))
  }
  throw new Error(`Host onboarding readiness timed out: ${lastReason}`)
}

module.exports = {
  hasRequiredClientGraph,
  parseBootManifest,
  readyUrl,
  settingsDescribeUrl,
  waitForOnboardingReady,
}
