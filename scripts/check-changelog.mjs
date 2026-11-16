// Fails when a pull request changes a behavior rule (`contract/rules.md`) or
// the public API (`contract/api.json`) and leaves `CHANGELOG.md` alone: what a
// consumer can observe gets its entry in the same pull request (P12,
// CONTRIBUTING.md, "Changelog").
//
// A change nobody outside the repository can see, such as the wording of a
// rule, passes with a `Changelog: yok` line in the pull request body, the
// reason after it. HTML comments and fenced code blocks of the body are
// ignored, as in scripts/check-pr-body.mjs.
//
// The changed paths come from a file given as the argument, or from standard
// input (the workflow pipes `git diff --name-only base...head`); the body from
// the PR_BODY environment variable.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { bodyText } from './check-pr-body.mjs'

const watched = ['contract/rules.md', 'contract/api.json']

/**
 * Why the change needs a changelog entry, or null when it has one, needs
 * none, or the body says `Changelog: yok`.
 */
export const changelogError = (paths, body) => {
  const changed = new Set(paths.map(path => path.trim()).filter(Boolean))
  const touched = watched.filter(path => changed.has(path))
  if (touched.length === 0 || changed.has('CHANGELOG.md')) {
    return null
  }
  if (/^\s*Changelog:[ \t]*yok\b/imu.test(bodyText(body))) {
    return null
  }
  return `${touched.join(' and ')} changed, CHANGELOG.md did not: add the entry under "## [Unreleased]", or put a "Changelog: yok" line with the reason in the pull request body when nobody outside the repository can see the change`
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const file = process.argv[2]
  const paths = readFileSync(file ?? 0, 'utf8').split(/\r?\n/)
  const error = changelogError(paths, process.env.PR_BODY)
  if (error) {
    console.error(`[check-changelog] ${error}`)
    process.exit(1)
  }
  console.log('[check-changelog] the changelog is in step with the contract')
}
