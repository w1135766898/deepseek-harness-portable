const assert = require('node:assert/strict')
const test = require('node:test')
const {
  isValidSemver,
  parseSemver,
  compareSemver,
} = require('./semver.cjs')

test('isValidSemver validates standard and invalid SemVer versions', () => {
  assert.equal(isValidSemver('1.0.0'), true)
  assert.equal(isValidSemver('v1.0.0'), true)
  assert.equal(isValidSemver('1.0.0-alpha'), true)
  assert.equal(isValidSemver('1.0.0-alpha.1'), true)
  assert.equal(isValidSemver('1.0.0-0.3.7'), true)
  assert.equal(isValidSemver('1.0.0-x.7.z.92'), true)
  assert.equal(isValidSemver('1.0.0+20130313144700'), true)
  assert.equal(isValidSemver('1.0.0-beta+exp.sha.5114f85'), true)

  // Invalid versions
  assert.equal(isValidSemver('1.0.0-01'), false, 'Numeric prerelease identifier must not have leading zero')
  assert.equal(isValidSemver('01.0.0'), false, 'Major must not have leading zero')
  assert.equal(isValidSemver('1.01.0'), false, 'Minor must not have leading zero')
  assert.equal(isValidSemver('1.0.01'), false, 'Patch must not have leading zero')
  assert.equal(isValidSemver('1.0.0-alpha..1'), false, 'Empty dot segment is invalid')
  assert.equal(isValidSemver('1.0'), false, 'Must have 3 parts')
  assert.equal(isValidSemver(''), false, 'Empty string is invalid')
})

test('compareSemver complies with SemVer 2.0.0 test vectors', () => {
  // Prerelease vs Normal
  assert.equal(compareSemver('1.0.0-beta', '1.0.0'), -1)
  assert.equal(compareSemver('1.0.0', '1.0.0-beta'), 1)

  // Prerelease precedence
  assert.equal(compareSemver('1.0.0-alpha', '1.0.0-beta'), -1)
  assert.equal(compareSemver('1.0.0-rc.2', '1.0.0-rc.10'), -1)
  assert.equal(compareSemver('1.0.0-alpha.1', '1.0.0-alpha.beta'), -1)
  assert.equal(compareSemver('1.0.0-alpha', '1.0.0-alpha.1'), -1)

  // Build metadata is ignored in precedence comparison
  assert.equal(compareSemver('1.0.0+build.1', '1.0.0+build.2'), 0)
  assert.equal(compareSemver('1.0.0-alpha+001', '1.0.0-alpha+002'), 0)
  assert.equal(compareSemver('v1.0.0', '1.0.0'), 0)

  // Standard major/minor/patch precedence
  assert.equal(compareSemver('2.0.0', '1.9.9'), 1)
  assert.equal(compareSemver('1.1.0', '1.0.99'), 1)
  assert.equal(compareSemver('1.0.10', '1.0.2'), 1)

  // Rejects invalid versions with Error
  assert.throws(() => compareSemver('1.0.0-01', '1.0.0'), /Invalid SemVer/)
  assert.throws(() => compareSemver('1.0.0', 'not-a-version'), /Invalid SemVer/)
})
