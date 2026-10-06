// Runs the behavior specs (`tests/contract/**`) against two builds of the
// package and compares them test by test: the result of every test and the
// ordered `update:query` trace (reason and query) it recorded. A release
// ships only when this finds no difference against the baseline (2.2.x for
// 3.0.0, 3.0.0 for 3.1.0; ADR 0006).
//
//   node scripts/equivalence.mjs [--baseline <target>] [--candidate <target>]
//                                [--unit-only] [--browser-only]
//
// A target is one of:
//   src                the source of this working tree (default candidate)
//   git:<ref>          a tarball packed from a git ref: the ref is exported,
//                      its library is built and `pnpm pack`ed (default
//                      baseline: git:origin/main)
//   release:<version>  the tarball of a published GitHub release
//   tgz:<path>         a local tarball
//
// The specs are always the ones of this working tree; only the package they
// import (`@dolusoft/query-table`, see `QT_TARGET` in vitest.config.ts)
// changes. Everything is written under `.equivalence/` (gitignored):
// prepared packages, the raw Vitest reports and `report.json`.
import { spawnSync } from 'node:child_process'
import {
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, relative, resolve } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'

const root = resolve(import.meta.dirname, '..')
const work = join(root, '.equivalence')
const releaseUrl = version =>
  `https://github.com/dolusoft/query-table/releases/download/v${version}/dolusoft-query-table-${version}.tgz`

const args = process.argv.slice(2)
const option = (name, fallback) => {
  const at = args.indexOf(`--${name}`)
  return at >= 0 ? args[at + 1] : fallback
}
// A run with fewer tests than this is not an equivalence run (the specs did
// not load, a filter matched nothing); it fails instead of passing on zero.
const MIN_TESTS = 300
// Tests of behavior a 2.2.x baseline does not have: the v3 additions (C-56
// to C-66: cursor paging, search, selection, `useQueryTable`, the TanStack
// path). They cannot pass on 2.2.x, so they are not compared and may fail on
// the baseline; the candidate must still pass them. Every other test is
// compared, the v3 spec files' own tests of old behavior included.
//
// An entry is `file > name`, where the name is the full title of a test or
// the title of a `describe` (every test under it). An entry that matches no
// test fails the run, so the list cannot go stale.
const K6_UNIT = 'tests/contract/unit/k6.spec.ts'
const K6_PAGES = 'tests/contract/browser/k6-pages.browser.spec.ts'
const COLUMNS_UNIT = 'tests/contract/unit/columns.spec.ts'
const ADDED_AFTER_BASELINE = [
  // C-63 search, C-65 cursor paging controls, C-62 `useQueryTable`: no such
  // surface in 2.2.x. (C-64's "draws no column without `selection`" is
  // compared: 2.2.x draws none either.)
  `${K6_UNIT} > C-63 Typed search is debounced [own]`,
  `${K6_UNIT} > C-64 Selection column [tanstack] [own] toggles a row and emits the new map, keyed by rowKey`,
  `${K6_UNIT} > C-64 Selection column [tanstack] [own] the header checkbox selects the page and keeps other keys`,
  `${K6_UNIT} > C-64 Selection column [tanstack] [own] keys rows by index without rowKey`,
  `${K6_UNIT} > C-65 Cursor paging controls [tanstack] [own]`,
  `${K6_UNIT} > C-62 Dispose and isolation [own]`,
  // Pages of the playground that use the v3 surface. The TanStack path page
  // never loads the package under test (it builds on the core plugins), so
  // it passes on both builds and a comparison would say nothing.
  `${K6_PAGES} > cursor paging walks forward and back with the cursors of the server`,
  `${K6_PAGES} > typed search is applied once, after the debounce, from the first page`,
  `${K6_PAGES} > the checkbox column selects rows into the page selection`,
  `${K6_PAGES} > the TanStack path sorts, filters and pages through the query`,
  // C-66: the selection column's DOM hooks.
  'tests/contract/browser/dom-contract-selection.browser.spec.ts > C-66 the DOM with a selection matches the DOM contract',
  // 3.1 additions (C-67 to C-74, ADR 0007): not in a 3.0.0 baseline.
  `${COLUMNS_UNIT} > C-67 Column visibility [tanstack] [own]`,
  `${COLUMNS_UNIT} > C-68 Columns are controlled [tanstack] [own]`,
  `${COLUMNS_UNIT} > C-69 Column order [tanstack] [own]`,
  `${COLUMNS_UNIT} > C-70 Column controls in slots [tanstack] [own]`,
  `${COLUMNS_UNIT} > C-68 composable: TanStack calls go to the consumer [tanstack]`,
  `tests/contract/unit/pin.spec.ts > C-71 Right pinning [tanstack] [own]`,
  `tests/contract/browser/pin-right.browser.spec.ts > C-71 Right pinning [tanstack] [own]`,
  'tests/contract/browser/accessibility.browser.spec.ts > C-71 accessibility scan',
  'tests/contract/browser/dom-contract-3-1.browser.spec.ts > C-72 the DOM with 3.1 features matches the DOM contract',
  'tests/contract/browser/reorder.browser.spec.ts > C-73 Reorder handle [tanstack] [own]',
  'tests/contract/browser/accessibility.browser.spec.ts > C-73 accessibility scan',
  // `moveColumn` is its own test, so the other C-44 tests still compare.
  'tests/contract/unit/labels.spec.ts > C-44 Labels names the reorder handles by moveColumn'
]
const isAdded = name =>
  ADDED_AFTER_BASELINE.some(
    entry => name === entry || name.startsWith(`${entry} `)
  )
const baseline = option('baseline', 'git:origin/main')
const candidate = option('candidate', 'src')
const runUnit = !args.includes('--browser-only')
const runBrowser = !args.includes('--unit-only')

const run = (command, commandArgs, options = {}) => {
  const result = spawnSync(command, commandArgs, {
    cwd: root,
    stdio: 'inherit',
    shell: process.platform === 'win32' && !command.endsWith('.exe'),
    ...options
  })
  return result.status ?? 1
}

const must = (command, commandArgs, options) => {
  const code = run(command, commandArgs, options)
  if (code !== 0) {
    throw new Error(`${command} ${commandArgs.join(' ')} failed (${code})`)
  }
}

// `tar` runs inside the target directory and gets a relative, forward-slash
// path: GNU tar (Git for Windows) reads `C:` in an absolute path as a host.
const untar = (archive, into) =>
  must('tar', ['-xf', relative(into, archive).replace(/\\/g, '/')], {
    cwd: into
  })

const safeName = target => target.replace(/[^a-zA-Z0-9.-]+/g, '_')

/** Unpacks a tarball and returns the file its `exports['.']` points at. */
const entryOfTarball = (tarball, into) => {
  rmSync(into, { recursive: true, force: true })
  mkdirSync(into, { recursive: true })
  untar(tarball, into)
  const pkgDir = join(into, 'package')
  const manifest = JSON.parse(
    readFileSync(join(pkgDir, 'package.json'), 'utf8')
  )
  const exported = manifest.exports?.['.']
  const file =
    (typeof exported === 'string' ? exported : exported?.default) ??
    manifest.module ??
    manifest.main
  return { entry: join(pkgDir, file), version: manifest.version }
}

/** Exports `ref`, builds its library and packs it, like a release does. */
const packGitRef = ref => {
  const sha = spawnSync('git', ['rev-parse', ref], {
    cwd: root,
    encoding: 'utf8'
  }).stdout.trim()
  if (!sha) {
    throw new Error(`unknown git ref ${ref}`)
  }
  const dir = join(work, `git-${sha.slice(0, 12)}`)
  const tarball = join(work, `git-${sha.slice(0, 12)}.tgz`)
  if (!existsSync(tarball)) {
    rmSync(dir, { recursive: true, force: true })
    mkdirSync(dir, { recursive: true })
    const archive = join(work, `git-${sha.slice(0, 12)}.tar`)
    must('git', ['archive', '--format=tar', '-o', archive, sha])
    untar(archive, dir)
    rmSync(archive)
    // The exported tree has no node_modules of its own: its build tools and
    // `vue` resolve from this repository's node_modules, one level up.
    const vite = join(
      dirname(createRequire(import.meta.url).resolve('vite/package.json')),
      'bin',
      'vite.js'
    )
    must(process.execPath, [vite, 'build', '--logLevel', 'warn'], { cwd: dir })
    must('pnpm', ['pack', '--pack-destination', work], { cwd: dir })
    const packed = readdirSync(work).find(
      name => name.startsWith('dolusoft-query-table-') && name.endsWith('.tgz')
    )
    must(process.execPath, [
      '-e',
      `require('node:fs').renameSync(${JSON.stringify(join(work, packed))}, ${JSON.stringify(tarball)})`
    ])
    rmSync(dir, { recursive: true, force: true })
  }
  return { tarball, label: `${ref} (${sha.slice(0, 12)})` }
}

const download = async (url, file) => {
  const response = await fetch(url)
  if (!response.ok || !response.body) {
    throw new Error(`${url} answered ${response.status}`)
  }
  await pipeline(Readable.fromWeb(response.body), createWriteStream(file))
}

/** `{ entry, label }` for a target; `entry` is null for the source. */
const prepare = async target => {
  if (target === 'src') {
    return {
      entry: null,
      resolved: resolve(root, 'packages/vue/src/index.ts'),
      label: 'src (working tree)'
    }
  }
  const [kind, value] = [
    target.slice(0, target.indexOf(':')),
    target.slice(target.indexOf(':') + 1)
  ]
  let tarball
  let label
  if (kind === 'git') {
    ;({ tarball, label } = packGitRef(value))
  } else if (kind === 'release') {
    tarball = join(work, `release-${value}.tgz`)
    if (!existsSync(tarball)) {
      await download(releaseUrl(value), tarball)
    }
    label = `release ${value}`
  } else if (kind === 'tgz') {
    tarball = resolve(value)
    label = `tarball ${relative(root, tarball)}`
  } else {
    throw new Error(`unknown target ${target}: use src, git:, release: or tgz:`)
  }
  const { entry, version } = entryOfTarball(
    tarball,
    join(work, `pkg-${safeName(target)}`)
  )
  return { entry, resolved: entry, label: `${label}, version ${version}` }
}

/** Runs the contract specs against one target; returns the report files. */
const runSuites = (target, prepared) => {
  // A built baseline starts cold (Vite optimizes its dependencies) and its
  // failing added tests wait out their timeouts: the default 120 s per
  // attempt of test-browser.mjs can be too short for that run.
  const env = {
    BROWSER_TEST_TIMEOUT_MS: '240000',
    ...process.env,
    HEADLESS: '1'
  }
  if (prepared.entry) {
    env.QT_TARGET = prepared.entry
  } else {
    delete env.QT_TARGET
  }
  const reports = []
  const vitest = join(
    dirname(createRequire(import.meta.url).resolve('vitest/package.json')),
    'vitest.mjs'
  )
  if (runUnit) {
    const out = join(work, `${safeName(target)}-unit.json`)
    rmSync(out, { force: true })
    run(
      process.execPath,
      [
        vitest,
        'run',
        '--project',
        'unit',
        'tests/contract/unit',
        '--reporter=dot',
        '--reporter=json',
        `--outputFile.json=${out}`
      ],
      { env }
    )
    reports.push(out)
  }
  if (runBrowser) {
    const out = join(work, `${safeName(target)}-browser.json`)
    rmSync(out, { force: true })
    run(
      process.execPath,
      [
        join(root, 'scripts', 'test-browser.mjs'),
        '--browser.headless',
        'tests/contract/browser',
        '--reporter=dot',
        '--reporter=json',
        `--outputFile.json=${out}`
      ],
      { env }
    )
    reports.push(out)
  }
  return reports
}

/** `file > full name` → `{ status, updates }` for every test of the reports. */
const resultsOf = reports => {
  const results = new Map()
  for (const report of reports) {
    if (!existsSync(report)) {
      throw new Error(
        `${relative(root, report)} was not written: the run failed to start`
      )
    }
    const json = JSON.parse(readFileSync(report, 'utf8'))
    for (const file of json.testResults) {
      const name = relative(root, file.name).replace(/\\/g, '/')
      for (const test of file.assertionResults) {
        results.set(`${name} > ${test.fullName}`, {
          status: test.status,
          updates: test.meta?.updates ?? []
        })
      }
    }
  }
  return results
}

const main = async () => {
  mkdirSync(work, { recursive: true })
  const targets = { baseline, candidate }
  const results = {}
  const labels = {}
  const resolvedEntries = {}
  for (const [role, target] of Object.entries(targets)) {
    console.log(`\n[equivalence] ${role}: preparing ${target}`)
    const prepared = await prepare(target)
    labels[role] = prepared.label
    // Canary: the entry the package name resolves to for this run. If both
    // roles resolved to the same file, the comparison would be a build against
    // itself and "0 differences" would mean nothing.
    resolvedEntries[role] = prepared.resolved
    console.log(
      `[equivalence] ${role}: @dolusoft/query-table -> ${prepared.resolved}`
    )
    console.log(
      `[equivalence] ${role}: running the contract specs on ${prepared.label}`
    )
    results[role] = resultsOf(runSuites(target, prepared))
  }

  const names = new Set([
    ...results.baseline.keys(),
    ...results.candidate.keys()
  ])
  // A run narrowed to one suite cannot tell which entries are stale.
  const stale = (runUnit && runBrowser ? ADDED_AFTER_BASELINE : []).filter(
    entry =>
      ![...results.candidate.keys()].some(
        name => name === entry || name.startsWith(`${entry} `)
      )
  )
  const differences = []
  const added = []
  let traced = 0
  for (const name of [...names].sort()) {
    const a = results.baseline.get(name)
    const b = results.candidate.get(name)
    if (isAdded(name)) {
      added.push({
        test: name,
        baseline: a?.status ?? 'missing',
        candidate: b?.status ?? 'missing'
      })
      continue
    }
    if (!a || !b) {
      differences.push({
        test: name,
        kind: a ? 'missing in candidate' : 'missing in baseline'
      })
      continue
    }
    if (a.updates.length > 0) {
      traced += 1
    }
    if (a.status !== b.status) {
      differences.push({
        test: name,
        kind: 'status',
        baseline: a.status,
        candidate: b.status
      })
    }
    if (JSON.stringify(a.updates) !== JSON.stringify(b.updates)) {
      differences.push({
        test: name,
        kind: 'updates',
        baseline: a.updates,
        candidate: b.updates
      })
    }
  }
  // An added test counts as failing only in the candidate.
  const failing = role =>
    [...results[role]]
      .filter(([, r]) => r.status !== 'passed')
      .map(([name]) => name)
      .filter(name => role === 'candidate' || !isAdded(name))

  const report = {
    baseline: labels.baseline,
    candidate: labels.candidate,
    tests: names.size,
    compared: names.size - added.length,
    testsWithUpdates: traced,
    differences: differences.length,
    addedAfterBaseline: added,
    failing: { baseline: failing('baseline'), candidate: failing('candidate') },
    details: differences
  }
  writeFileSync(
    join(work, 'report.json'),
    `${JSON.stringify(report, null, 2)}\n`
  )

  console.log(`\n[equivalence] baseline:  ${labels.baseline}`)
  console.log(`[equivalence] candidate: ${labels.candidate}`)
  console.log(
    `[equivalence] ${names.size} tests, ${names.size - added.length} compared, ` +
      `${added.length} added after the baseline (not compared), ${traced} with an update trace; ` +
      `failing: baseline ${report.failing.baseline.length}, candidate ${report.failing.candidate.length}`
  )
  for (const difference of differences.slice(0, 20)) {
    console.log(`  ${difference.kind}: ${difference.test}`)
  }
  console.log(
    `[equivalence] ${differences.length} difference(s); report: ${relative(root, join(work, 'report.json'))}`
  )

  // Zero differences only counts when the runs were real: nothing failed on
  // either side, enough tests ran, and the two roles used different builds.
  const problems = []
  if (differences.length > 0) {
    problems.push(`${differences.length} difference(s) between the builds`)
  }
  for (const role of ['baseline', 'candidate']) {
    if (report.failing[role].length > 0) {
      problems.push(
        `${report.failing[role].length} test(s) not passing in ${role}`
      )
    }
    if (results[role].size < MIN_TESTS) {
      problems.push(
        `${role} ran ${results[role].size} tests, below the floor of ${MIN_TESTS} (specs missing or filtered out?)`
      )
    }
  }
  if (resolvedEntries.baseline === resolvedEntries.candidate) {
    problems.push(
      `baseline and candidate resolve to the same entry (${resolvedEntries.baseline}): the comparison is a build against itself`
    )
  }
  for (const entry of stale) {
    problems.push(`ADDED_AFTER_BASELINE entry matches no test: ${entry}`)
  }
  for (const problem of problems) {
    console.error(`[equivalence] FAIL: ${problem}`)
  }
  process.exit(problems.length === 0 ? 0 : 1)
}

await main()
