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

/**
 * Wait until the host API exposes the product onboarding settings namespace.
 * The web server can answer `/` before api-gateway and settings have finished
 * activating, so an HTTP 200 alone is not a safe browser-readiness signal.
 *
 * @param {string} baseUrl - loopback web URL returned by the launcher.
 * @param {{ timeoutMs?: number, intervalMs?: number }} [options]
 * @returns {Promise<void>}
 */
async function waitForOnboardingReady(baseUrl, options = {}) {
  const timeoutMs = options.timeoutMs ?? 20_000
  const intervalMs = options.intervalMs ?? 120
  const deadline = Date.now() + timeoutMs
  let lastReason = 'settings.describe has not completed'
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/api/settings.describe`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          type: 'client-request',
          rpcId: `desktop-readiness-${Date.now()}`,
          method: 'settings.describe',
          payload: {},
        }),
        signal: AbortSignal.timeout(Math.min(1500, Math.max(1, deadline - Date.now()))),
      })
      if (!response.ok) {
        lastReason = `settings.describe HTTP ${response.status}`
      } else {
        const body = await response.json()
        if (body?.result?.ok && body.result.value?.namespaces?.some(namespace => namespace.ns === 'ui-onboarding')) return
        lastReason = body?.result?.error?.message ?? 'ui-onboarding namespace is not registered'
      }
    } catch (error) {
      lastReason = error instanceof Error ? error.message : String(error)
    }
    await new Promise(resolve => setTimeout(resolve, intervalMs))
  }
  throw new Error(`Host onboarding readiness timed out: ${lastReason}`)
}

module.exports = { readyUrl, waitForOnboardingReady }
