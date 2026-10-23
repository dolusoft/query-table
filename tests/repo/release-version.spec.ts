import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

// The same rule runs in CI (scripts/check-release-version.mjs, no flag) and in
// the `version` job of release.yml (`--release`): a release is the next minor
// or the next patch of the latest released version, never a major (ADR 0019).

type Check = (
  version: string,
  tags: string[],
  release?: boolean
) => string | null

const script = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'scripts',
  'check-release-version.mjs'
)
const { releaseVersionError } = (await import(/* @vite-ignore */ script)) as {
  releaseVersionError: Check
}

const tags = ['v3.9.0', 'v3.10.0', 'v3.11.0', 'v3.11.1']

describe('release version gate', () => {
  it('accepts the next minor and the next patch of the latest release', () => {
    expect(releaseVersionError('3.12.0', tags)).toBeNull()
    expect(releaseVersionError('3.11.2', tags)).toBeNull()
  })

  it('orders tags by semver, not by text', () => {
    const old = ['v3.9.0', 'v3.10.0']
    expect(releaseVersionError('3.11.0', old)).toBeNull()
    expect(releaseVersionError('3.10.1', old)).toBeNull()
    expect(releaseVersionError('3.10.0', old, true)).toBeNull()
  })

  it('rejects another major', () => {
    expect(releaseVersionError('4.0.0', tags)).toMatch(/major/)
    expect(releaseVersionError('2.99.0', tags)).toMatch(/major/)
  })

  it('rejects a skipped number', () => {
    expect(releaseVersionError('3.13.0', tags)).toMatch(/neither/)
    expect(releaseVersionError('3.11.3', tags)).toMatch(/neither/)
    expect(releaseVersionError('3.12.1', tags)).toMatch(/neither/)
  })

  it('rejects a version that is not greater and a pre-release', () => {
    expect(releaseVersionError('3.10.5', tags)).toMatch(/not greater/)
    expect(releaseVersionError('3.12.0-rc.1', tags)).toMatch(/plain/)
  })

  it('lets a version that already is a released tag pass in CI', () => {
    expect(releaseVersionError('3.11.1', tags)).toBeNull()
    expect(releaseVersionError('3.11.0', tags)).toBeNull()
  })

  it('judges a release without its own tag, so a re-run passes', () => {
    expect(releaseVersionError('3.12.0', [...tags, 'v3.12.0'], true)).toBeNull()
    expect(releaseVersionError('3.11.1', tags, true)).toBeNull()
    expect(releaseVersionError('4.0.0', [...tags, 'v4.0.0'], true)).toMatch(
      /major/
    )
    expect(releaseVersionError('3.13.0', [...tags, 'v3.13.0'], true)).toMatch(
      /neither/
    )
  })

  it('asks for the tags when there are none', () => {
    expect(releaseVersionError('3.12.0', [])).toMatch(/fetch/)
  })
})
