const { createHash } = require('node:crypto')
const { createReadStream, createWriteStream, mkdirSync, unlinkSync } = require('node:fs')
const { dirname } = require('node:path')
const http = require('node:http')
const https = require('node:https')

const DEFAULT_HEADERS = {
  'User-Agent': 'DeepSeek-Harness-Desktop',
  Accept: 'application/json',
}

const GITHUB_MIRROR_PREFIXES = Object.freeze([
  '',
  'https://ghfast.top/',
  'https://mirror.ghproxy.com/',
  'https://gh-proxy.com/',
  'https://gh.ddlc.top/',
])

const {
  compareSemver,
  isValidSemver,
  normalizeVersion,
  parseSemver,
  tryCompareSemver,
} = require('./semver.cjs')

function compareVersions(left, right) {
  const result = tryCompareSemver(left, right)
  if (result !== undefined) return result
  const normalizedLeft = normalizeVersion(left)
  const normalizedRight = normalizeVersion(right)
  if (normalizedLeft === normalizedRight) return 0
  return normalizedLeft < normalizedRight ? -1 : 1
}

function mirrorUrls(url, prefixes = GITHUB_MIRROR_PREFIXES) {
  return [...new Set(prefixes.map(prefix => prefix ? `${prefix}${url}` : url))]
}

function requestText(url, timeoutMs, redirectCount, options) {
  if (redirectCount > 5) return Promise.reject(new Error('Too many update-server redirects'))

  return new Promise((resolve, reject) => {
    let settled = false
    let request
    const finish = (callback, value) => {
      if (settled) return
      settled = true
      callback(value)
    }
    const fail = error => finish(reject, error instanceof Error ? error : new Error(String(error)))

    let parsed
    try {
      parsed = new URL(url)
    } catch (error) {
      fail(error)
      return
    }

    const client = parsed.protocol === 'https:' ? https : (parsed.protocol === 'http:' ? http : undefined)
    if (!client) {
      fail(new Error(`Unsupported update URL protocol: ${parsed.protocol}`))
      return
    }

    const signal = options?.signal
    const abort = () => {
      request?.destroy(new Error('Update request aborted'))
      fail(new Error('Update request aborted'))
    }
    if (signal?.aborted) {
      abort()
      return
    }
    signal?.addEventListener('abort', abort, { once: true })

    request = client.get(parsed, {
      headers: { ...DEFAULT_HEADERS, ...(options?.headers || {}) },
      signal,
    }, response => {
      const statusCode = Number(response.statusCode || 0)
      const location = response.headers.location
      if (statusCode >= 300 && statusCode < 400 && location) {
        response.resume()
        requestText(new URL(location, parsed).toString(), timeoutMs, redirectCount + 1, options)
          .then(value => finish(resolve, value), fail)
        return
      }
      if (statusCode < 200 || statusCode >= 300) {
        response.resume()
        fail(new Error(`HTTP ${statusCode}`))
        return
      }

      const chunks = []
      response.on('data', chunk => chunks.push(chunk))
      response.on('error', fail)
      response.on('aborted', () => fail(new Error('Update response aborted')))
      response.on('end', () => finish(resolve, Buffer.concat(chunks).toString('utf8')))
    })
    request.setTimeout(timeoutMs, () => {
      request.destroy()
      fail(new Error('请求超时'))
    })
    request.on('error', fail)
  })
}

function fetchText(url, timeoutMs = 5000, options = {}) {
  return requestText(url, timeoutMs, 0, options)
}

async function fetchJson(url, timeoutMs = 5000, options = {}) {
  const text = await fetchText(url, timeoutMs, options)
  try {
    return JSON.parse(text)
  } catch (error) {
    error.message = `Invalid JSON from update server: ${error.message}`
    throw error
  }
}

function downloadFile(url, destination, options = {}, redirectCount = 0) {
  if (redirectCount > 5) return Promise.reject(new Error('Too many update-server redirects'))

  return new Promise((resolve, reject) => {
    let settled = false
    let request
    let response
    let output
    const finish = (callback, value) => {
      if (settled) return
      settled = true
      callback(value)
    }
    const cleanup = () => {
      try { output?.destroy() } catch {}
      try { response?.destroy() } catch {}
      try { unlinkSync(destination) } catch {}
    }
    const fail = error => {
      cleanup()
      finish(reject, error instanceof Error ? error : new Error(String(error)))
    }

    let parsed
    try {
      parsed = new URL(url)
      mkdirSync(dirname(destination), { recursive: true })
    } catch (error) {
      fail(error)
      return
    }

    const client = parsed.protocol === 'https:' ? https : (parsed.protocol === 'http:' ? http : undefined)
    if (!client) {
      fail(new Error(`Unsupported update URL protocol: ${parsed.protocol}`))
      return
    }

    const signal = options.signal
    const abort = () => {
      request?.destroy(new Error('Update download aborted'))
      fail(new Error('Update download aborted'))
    }
    if (signal?.aborted) {
      abort()
      return
    }
    signal?.addEventListener('abort', abort, { once: true })

    request = client.get(parsed, {
      headers: { ...DEFAULT_HEADERS, ...(options.headers || {}), Accept: '*/*' },
      signal,
    }, nextResponse => {
      response = nextResponse
      const statusCode = Number(response.statusCode || 0)
      const location = response.headers.location
      if (statusCode >= 300 && statusCode < 400 && location) {
        response.resume()
        downloadFile(new URL(location, parsed).toString(), destination, options, redirectCount + 1)
          .then(value => finish(resolve, value), fail)
        return
      }
      if (statusCode < 200 || statusCode >= 300) {
        response.resume()
        fail(new Error(`HTTP ${statusCode}`))
        return
      }

      const totalBytes = Number(response.headers['content-length']) || 0
      let receivedBytes = 0
      output = createWriteStream(destination)
      const reportProgress = () => {
        if (typeof options.onProgress === 'function') options.onProgress({ receivedBytes, totalBytes })
      }
      response.on('data', chunk => {
        receivedBytes += chunk.length
        reportProgress()
      })
      response.on('error', fail)
      response.on('aborted', () => fail(new Error('Update download response aborted')))
      output.on('error', fail)
      output.on('finish', () => {
        output.close(error => {
          if (error) {
            fail(error)
            return
          }
          reportProgress()
          finish(resolve, { receivedBytes, totalBytes })
        })
      })
      response.pipe(output)
    })
    request.setTimeout(options.timeoutMs || 10_000, () => {
      request.destroy()
      fail(new Error('下载请求超时'))
    })
    request.on('error', fail)
  })
}

async function downloadWithFallback(urls, destination, options = {}) {
  const errors = []
  for (const url of [...new Set(urls.filter(Boolean))]) {
    try {
      if (typeof options.onAttempt === 'function') options.onAttempt(url)
      return await downloadFile(url, destination, options)
    } catch (error) {
      errors.push(`${new URL(url).host}: ${error.message}`)
    }
  }
  throw new Error(`All update download sources failed. ${errors.join(' | ')}`)
}

function hashFile(path) {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256')
    const input = createReadStream(path)
    input.on('error', reject)
    input.on('data', chunk => hash.update(chunk))
    input.on('end', () => resolve(hash.digest('hex').toUpperCase()))
  })
}

function normalizeSha256(value) {
  const match = String(value || '').match(/(?:sha256:)?([0-9a-f]{64})/i)
  return match ? match[1].toUpperCase() : ''
}

function parseSha256Sums(text, assetName) {
  const expectedName = String(assetName || '').trim()
  if (!expectedName) return ''
  for (const line of String(text || '').split(/\r?\n/)) {
    const match = line.trim().match(/^([0-9a-f]{64})\s+\*?(.+)$/i)
    if (match && match[2].trim() === expectedName) return match[1].toUpperCase()
  }
  return ''
}

module.exports = {
  GITHUB_MIRROR_PREFIXES,
  compareVersions,
  downloadFile,
  downloadWithFallback,
  fetchJson,
  fetchText,
  hashFile,
  mirrorUrls,
  normalizeSha256,
  normalizeVersion,
  parseSha256Sums,
}
