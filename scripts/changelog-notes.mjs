// Prints the release notes of a version from CHANGELOG.md: the body of its
// `## [<version>]` section and its compare link. A release page resolves no
// relative link, so links into the repository are made absolute at the tag.
// release.yml publishes these notes, with the conformance pin of
// scripts/pack-conformance.mjs after them.
//
// Fails when the version has no section, an empty one or no compare link:
// the release pull request turns `## [Unreleased]` into the version
// (CONTRIBUTING.md, "Releasing").
//
//   node scripts/changelog-notes.mjs <version>
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(import.meta.dirname, '..')

const escape = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * The body of the `## [version]` section of `changelog`, without its heading
 * and trimmed; null when there is no such section or it is empty.
 */
export const changelogSection = (changelog, version) => {
  const lines = changelog.split(/\r?\n/)
  const heading = new RegExp(`^## \\[${escape(version)}\\](?:\\s|$)`)
  const start = lines.findIndex(line => heading.test(line))
  if (start === -1) {
    return null
  }
  const rest = lines.slice(start + 1)
  // The next version, or the link definitions after the last one.
  const end = rest.findIndex(line => /^## |^\[[^\]]+\]:\s/.test(line))
  const body = (end === -1 ? rest : rest.slice(0, end)).join('\n').trim()
  return body === '' ? null : body
}

/**
 * The release notes of `version`: its section with every relative link made
 * absolute at the tag `v<version>` of `repo` (`owner/name`), then its compare
 * link. Throws when the section or the compare link is missing.
 */
export const releaseNotes = (changelog, version, repo) => {
  const section = changelogSection(changelog, version)
  if (section === null) {
    throw new Error(
      `CHANGELOG.md has no "## [${version}]" section with entries`
    )
  }
  const compare = new RegExp(
    `^\\[${escape(version)}\\]:[ \\t]*(\\S+)`,
    'm'
  ).exec(changelog)?.[1]
  if (compare === undefined) {
    throw new Error(`CHANGELOG.md has no "[${version}]: <url>" compare link`)
  }
  const base = `https://github.com/${repo}/blob/v${version}/`
  // A target with a scheme (https:, mailto:) or only an anchor stays.
  const body = section.replace(
    /\]\((?![a-z][a-z\d+.-]*:|#)([^)\s]+)\)/gi,
    (_, target) => `](${base}${target.replace(/^\.\//, '')})`
  )
  return `${body}\n\n**Full Changelog**: ${compare}\n`
}

/** `owner/name` from the `repository` field of the root package.json. */
const repository = () => {
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
  const url =
    typeof pkg.repository === 'string' ? pkg.repository : pkg.repository?.url
  const match = /github\.com[/:]([^/]+\/[^/]+?)(?:\.git)?\/?$/.exec(url ?? '')
  if (!match) {
    throw new Error('package.json has no GitHub repository url')
  }
  return match[1]
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const version = process.argv[2]
  if (!version) {
    console.error('usage: node scripts/changelog-notes.mjs <version>')
    process.exit(1)
  }
  try {
    const changelog = readFileSync(join(root, 'CHANGELOG.md'), 'utf8')
    process.stdout.write(releaseNotes(changelog, version, repository()))
  } catch (error) {
    console.error(`[changelog-notes] ${error.message}`)
    process.exit(1)
  }
}
