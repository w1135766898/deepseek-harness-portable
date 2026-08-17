'use strict'

function shouldDisplayDesktopWindows(environment = process.env) {
  return environment.DSH_E2E_HIDDEN_WINDOWS !== '1'
}

module.exports = { shouldDisplayDesktopWindows }
