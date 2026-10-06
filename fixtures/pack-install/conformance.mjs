// Run by `pnpm pack-install` inside the consumer app, against the installed
// @dolusoft/query-protocol tarball (C-79): finds the suite through its own
// export, checks every hash of the manifest against the installed bytes and
// runs C02.1 and C47.1 with the installed evaluator. Exit 1 on a difference.
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

import { applyQuery, defineDataset } from '@dolusoft/query-protocol/local'

// The suite of the installed tarball, found through its own export.
const require = createRequire(import.meta.url)
const manifestFile = require.resolve(
  '@dolusoft/query-protocol/conformance/manifest.json'
)
const suite = dirname(manifestFile)
const manifest = JSON.parse(readFileSync(manifestFile, 'utf8'))
const problems = []
const sha256 = path =>
  createHash('sha256').update(readFileSync(join(suite, path))).digest('hex')
if (manifest.fixtureFormat !== 1) {
  problems.push(`unknown fixtureFormat ${manifest.fixtureFormat}`)
}
for (const entry of [manifest.querySchema, ...manifest.files, ...manifest.data]) {
  if (sha256(entry.path) !== entry.sha256) {
    problems.push(`${entry.path}: the SHA-256 does not match the manifest`)
  }
}
console.log(
  `[pack-install] conformance revision ${manifest.revision}: ${manifest.files.length + manifest.data.length + 1} hashes checked`
)

// Compares JSON values with the keys of every object in order.
const canonical = value =>
  JSON.stringify(value, (_key, item) =>
    item && typeof item === 'object' && !Array.isArray(item)
      ? Object.fromEntries(Object.entries(item).sort())
      : item
  )

const runs = new Map()
for (const entry of manifest.files) {
  const doc = JSON.parse(readFileSync(join(suite, entry.path), 'utf8'))
  for (const kase of doc.cases) {
    for (const run of kase.runs) {
      runs.set(run.id, { file: entry.path, kase, run })
    }
  }
}
for (const id of ['C02.1', 'C47.1']) {
  const found = runs.get(id)
  if (!found) {
    problems.push(`${id} is not in the suite`)
    continue
  }
  const { file, kase, run } = found
  const source = run.data ?? kase.data
  const data =
    'ref' in source
      ? JSON.parse(
          readFileSync(join(suite, dirname(file), source.ref), 'utf8')
        )
      : source.inline
  const result = applyQuery(data.rows, run.query, defineDataset(data.dataset), {
    profile: run.options?.profile ?? kase.profile,
    paginate: run.options?.paginate ?? true
  })
  let actual
  if (result.ok) {
    actual = {
      keys: result.rows.map(row => row[data.dataset.key]),
      totalRows: result.totalRows
    }
  } else {
    const { message: _message, ...error } = result.error
    actual = { error }
  }
  const same = canonical(actual) === canonical(run.expect)
  console.log(`[pack-install] ${id} ${same ? 'passes' : 'FAILS'}`)
  if (!same) {
    problems.push(
      `${id}: expected ${JSON.stringify(run.expect)}, got ${JSON.stringify(actual)}`
    )
  }
}
if (problems.length > 0) {
  for (const problem of problems) {
    console.error(`[pack-install] ${problem}`)
  }
  process.exit(1)
}
