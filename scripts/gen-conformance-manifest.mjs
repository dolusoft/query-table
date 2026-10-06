// `pnpm conformance:gen`: writes packages/query-protocol/conformance/manifest.json
// from the case files (C-79): for each file its counts of active cases,
// withdrawn cases and runs, and the SHA-256 of its bytes; the SHA-256 of the
// query schema the cases were written against; the SHA-256 of each data
// file; the profiles the cases use.
// `revision` is kept by hand: raise it on every change of meaning (a case
// added or withdrawn, a data or format change); this script never changes it.
//
//   --check  exit 1 when the checked-in manifest differs (CI)
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const root = join(import.meta.dirname, '..')
const pkg = join(root, 'packages', 'query-protocol')
const suite = join(pkg, 'conformance')
const file = join(suite, 'manifest.json')

const sha256 = path =>
  createHash('sha256').update(readFileSync(path)).digest('hex')

const current = existsSync(file) ? readFileSync(file, 'utf8') : ''
const revision = current ? JSON.parse(current).revision : 1

const profiles = new Set()
const files = readdirSync(join(suite, 'cases'))
  .filter(name => name.endsWith('.json'))
  .sort()
  .map(name => {
    const path = join(suite, 'cases', name)
    const { cases } = JSON.parse(readFileSync(path, 'utf8'))
    let active = 0
    let withdrawn = 0
    let executions = 0
    for (const kase of cases) {
      profiles.add(kase.profile)
      if (kase.withdrawn) {
        withdrawn++
      } else {
        active++
        executions += kase.runs.length
      }
    }
    return {
      path: `cases/${name}`,
      active,
      withdrawn,
      executions,
      sha256: sha256(path)
    }
  })

// The data files the cases refer to are hashed too: changing one changes
// the meaning of every case that reads it.
const data = readdirSync(join(suite, 'data'))
  .filter(name => name.endsWith('.json'))
  .sort()
  .map(name => ({
    path: `data/${name}`,
    sha256: sha256(join(suite, 'data', name))
  }))

const manifest = {
  fixtureFormat: 1,
  suite: 'query-local-conformance',
  revision,
  profiles: [...profiles].sort(),
  querySchema: {
    path: '../query.schema.json',
    sha256: sha256(join(pkg, 'query.schema.json'))
  },
  files,
  data
}
const text = `${JSON.stringify(manifest, null, 2)}\n`

if (process.argv.includes('--check')) {
  if (current.replace(/\r\n/g, '\n') !== text) {
    console.error(
      '[conformance] packages/query-protocol/conformance/manifest.json is out of date: run `pnpm conformance:gen` (and raise `revision` if the meaning changed).'
    )
    const old = current ? JSON.parse(current) : {}
    const show = value => JSON.stringify(value)
    for (const key of Object.keys(manifest)) {
      if (key !== 'files' && show(old[key]) !== show(manifest[key])) {
        console.error(`  ${key}: ${show(old[key])} -> ${show(manifest[key])}`)
      }
    }
    const before = new Map((old.files ?? []).map(entry => [entry.path, entry]))
    for (const entry of files) {
      if (show(before.get(entry.path)) !== show(entry)) {
        console.error(
          `  ${entry.path}: ${show(before.get(entry.path))} -> ${show(entry)}`
        )
      }
      before.delete(entry.path)
    }
    if (show(old.data) !== show(data)) {
      console.error(`  data: ${show(old.data)} -> ${show(data)}`)
    }
    for (const path of before.keys()) {
      console.error(`  ${path}: listed, but the file is gone`)
    }
    process.exit(1)
  }
  console.log('[conformance] manifest.json is up to date')
} else {
  writeFileSync(file, text)
  const runs = files.reduce((sum, entry) => sum + entry.executions, 0)
  console.log(
    `[conformance] ${file}: revision ${String(revision)}, ${String(files.length)} files, ${String(runs)} runs`
  )
}
