const { readFileSync } = require('node:fs')
const yaml = require('js-yaml')

function readLocalePreference(settingsPath) {
  try {
    const source = readFileSync(settingsPath, 'utf8')
    const document = yaml.load(source)
    const preference = document && typeof document === 'object'
      ? document.locale && typeof document.locale === 'object'
        ? document.locale.preference
        : undefined
      : undefined
    return {
      preference,
      invalidPreference: preference !== undefined && preference !== null && preference !== ''
        && preference !== 'zh' && preference !== 'en',
    }
  } catch (error) {
    if (error && error.code === 'ENOENT') return { preference: undefined, missing: true }
    return { preference: undefined, error }
  }
}

module.exports = {
  readLocalePreference,
}
