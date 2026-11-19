import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

// CHANGELOG.md is the release notes: release.yml publishes the version's
// section (scripts/changelog-notes.mjs), and the `PR body` workflow fails a
// rule or API change that leaves it alone (scripts/check-changelog.mjs).

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const scripts = join(root, 'scripts')

const { changelogSection, releaseNotes } = (await import(
  /* @vite-ignore */ join(scripts, 'changelog-notes.mjs')
)) as {
  changelogSection: (changelog: string, version: string) => string | null
  releaseNotes: (changelog: string, version: string, repo: string) => string
}
const { changelogError } = (await import(
  /* @vite-ignore */ join(scripts, 'check-changelog.mjs')
)) as {
  changelogError: (paths: string[], body: string | undefined) => string | null
}

const sample = [
  '# Changelog',
  '',
  '## [Unreleased]',
  '',
  '## [3.2.0] - 2026-01-02',
  '',
  'Summary.',
  '',
  '### Added',
  '',
  '- `x` ([C-1](contract/rules.md#c-1-x), [ADR 0001](./docs/decisions/0001-x.md), [site](https://example.com), [here](#added)).',
  '',
  '## [3.1.0] - 2026-01-01',
  '',
  '### Fixed',
  '',
  '- `y`.',
  '',
  '[Unreleased]: https://github.com/o/r/compare/v3.2.0...HEAD',
  '[3.2.0]: https://github.com/o/r/compare/v3.1.0...v3.2.0',
  '[3.1.0]: https://github.com/o/r/compare/v3.0.0...v3.1.0',
  ''
].join('\n')

describe('release notes from the changelog', () => {
  it('takes the body of one version, up to the next version or the links', () => {
    expect(changelogSection(sample, '3.2.0')).toMatch(/^Summary\.\n\n### Added/)
    expect(changelogSection(sample, '3.2.0')).not.toMatch(/Fixed/)
    expect(changelogSection(sample, '3.1.0')).toBe('### Fixed\n\n- `y`.')
  })

  it('has no section for a missing, an empty or a partly matching version', () => {
    expect(changelogSection(sample, '3.3.0')).toBeNull()
    expect(changelogSection(sample, 'Unreleased')).toBeNull()
    expect(changelogSection(sample, '3.2')).toBeNull()
  })

  it('makes repository links absolute at the tag and ends with the compare link', () => {
    const notes = releaseNotes(sample, '3.2.0', 'o/r')
    expect(notes).toContain(
      '[C-1](https://github.com/o/r/blob/v3.2.0/contract/rules.md#c-1-x)'
    )
    expect(notes).toContain(
      '[ADR 0001](https://github.com/o/r/blob/v3.2.0/docs/decisions/0001-x.md)'
    )
    expect(notes).toContain('[site](https://example.com)')
    expect(notes).toContain('[here](#added)')
    expect(notes).toMatch(
      /\*\*Full Changelog\*\*: https:\/\/github\.com\/o\/r\/compare\/v3\.1\.0\.\.\.v3\.2\.0\n$/
    )
  })

  it('throws without the section or the compare link', () => {
    expect(() => releaseNotes(sample, '3.3.0', 'o/r')).toThrow(
      /no "## \[3\.3\.0\]"/
    )
    const unlinked = sample.replace(/^\[3\.2\.0\]:.*$/m, '')
    expect(() => releaseNotes(unlinked, '3.2.0', 'o/r')).toThrow(/compare link/)
  })

  it('has notes for the version in package.json', () => {
    const { version } = JSON.parse(
      readFileSync(join(root, 'package.json'), 'utf8')
    ) as { version: string }
    const changelog = readFileSync(join(root, 'CHANGELOG.md'), 'utf8')
    expect(() =>
      releaseNotes(changelog, version, 'dolusoft/query-table')
    ).not.toThrow()
  })
})

describe('changelog check of a pull request', () => {
  it('passes a change that touches neither the rules nor the API', () => {
    expect(
      changelogError(['README.md', 'packages/vue/src/x.ts'], '')
    ).toBeNull()
    expect(changelogError([], undefined)).toBeNull()
  })

  it('fails a rule or API change without a changelog entry', () => {
    expect(changelogError(['contract/rules.md'], '')).toMatch(
      /contract\/rules\.md changed/
    )
    expect(changelogError(['contract/api.json', 'CONTRACT.md'], '')).toMatch(
      /contract\/api\.json changed/
    )
  })

  it('passes it with the changelog, or with a Changelog: yok line', () => {
    expect(changelogError(['contract/rules.md', 'CHANGELOG.md'], '')).toBeNull()
    expect(
      changelogError(['contract/rules.md'], 'Changelog: yok — yalnız ifade\n')
    ).toBeNull()
  })

  it('does not count a Changelog line in a comment, a fence or without yok', () => {
    const rules = ['contract/rules.md']
    expect(changelogError(rules, '<!-- Changelog: yok -->')).not.toBeNull()
    expect(changelogError(rules, '```\nChangelog: yok\n```')).not.toBeNull()
    expect(changelogError(rules, 'Changelog:\n')).not.toBeNull()
    expect(changelogError(rules, 'Changelog: var')).not.toBeNull()
  })

  it('keeps the unfilled template from passing the check', () => {
    const template = readFileSync(
      join(root, '.github', 'pull_request_template.md'),
      'utf8'
    )
    expect(template).toContain('Changelog: yok')
    expect(changelogError(['contract/rules.md'], template)).not.toBeNull()
  })
})
