import test from 'node:test'
import assert from 'node:assert/strict'
import { chromeVersion, checkVersions } from '../scripts/version.mjs'

test('development labels map to valid Chrome versions; malformed releases fail', () => {
  assert.equal(chromeVersion('0.3.0-dev.0'), '0.3.0')
  assert.equal(chromeVersion('1.2.3'), '1.2.3')
  for (const version of ['0.0.0', '01.2.3', '1.2', '65536.0.0', '1.0.0-01', 'v1.0.0', '1.0.0+build']) {
    assert.throws(() => chromeVersion(version))
  }
})

test('package, lockfile and extension share a release identity', async () => {
  assert.ok(await checkVersions())
})
