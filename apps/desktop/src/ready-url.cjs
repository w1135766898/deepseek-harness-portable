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

module.exports = { readyUrl }
