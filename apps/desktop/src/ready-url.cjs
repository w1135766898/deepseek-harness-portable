/**
 * Extract the loopback URL printed by the web profile.
 *
 * @param {string} output - accumulated Harness stdout/stderr.
 * @returns {string|undefined} the local URL when the server is ready.
 */
function readyUrl(output) {
  return output.match(/^dsh web: (http:\/\/127\.0\.0\.1:\d+)/m)?.[1]
}

module.exports = { readyUrl }
