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
//   release:<version>  the tarball of a version published on npm
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

import { build } from 'vite'

const root = resolve(import.meta.dirname, '..')
const work = join(root, '.equivalence')
const releaseUrl = version =>
  `https://registry.npmjs.org/@dolusoft/query-table/-/query-table-${version}.tgz`

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
  // 3.0.1 has no rowPinning prop or data-pinned-row on rows and subtables
  // (C-74); the other new selection and expansion tests run on both builds.
  'tests/contract/browser/row-expansion.browser.spec.ts > F4 C-74 row-pinned details follow their row with the same data-pinned-row placement',
  // This existing playground case calls the C-74 cell-slot pinRow method
  // and reads rowPinned; neither slot member exists in 3.0.1.
  'tests/contract/browser/playground.browser.spec.ts > C-74 playground pin buttons stay enabled and focused after keyboard pinning',
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
  'tests/contract/browser/pin-right.browser.spec.ts > C-71 Resizing a right-pinned column [own]',
  'tests/contract/unit/resize.spec.ts > C-71 Resizing a right-pinned column (unit)',
  'tests/contract/browser/dom-contract-3-1.browser.spec.ts > C-72 the DOM with 3.1 features matches the DOM contract',
  'tests/contract/browser/reorder.browser.spec.ts > C-73 Reorder handle [tanstack] [own]',
  'tests/contract/unit/reorder.spec.ts > C-73 Reorder handle (unit) [own]',
  'tests/contract/browser/accessibility.browser.spec.ts > C-73 accessibility scan',
  'tests/contract/unit/row-pinning.spec.ts > C-74 Row pinning [tanstack] [own]',
  'tests/contract/unit/row-pinning.spec.ts > C-74 composable: TanStack calls go to the consumer [tanstack]',
  'tests/contract/browser/accessibility.browser.spec.ts > C-74 accessibility scan',
  // `moveColumn` is its own test, so the other C-44 tests still compare.
  'tests/contract/unit/labels.spec.ts > C-44 Labels names the reorder handles by moveColumn',
  // `filterCondition` (3.2) is its own test for the same reason.
  'tests/contract/unit/labels.spec.ts > C-44 Labels takes the condition label from filterCondition',
  'tests/contract/unit/labels.spec.ts > C-44 Labels rewrites the condition label when labels change',
  // 3.2 addition (C-82): `data-type` on the cells of a column.
  'tests/contract/unit/column-type.spec.ts > C-82 Column type on cells [own]',
  'tests/contract/browser/dom-contract-column-type.browser.spec.ts > C-82 the column type is on every cell of a column, as the DOM contract lists it [own]',
  // The test skin aligns by `data-type`, which a 3.1 table does not write.
  'tests/contract/browser/layout.browser.spec.ts > C-31 geometry of the plain markup with the test skin C-82 the skin aligns the cells of a column by its type [own]',
  // The skin puts a number header's filter button at the end by `data-type`.
  'tests/contract/browser/layout.browser.spec.ts > C-31 geometry of the plain markup with the test skin C-82 a narrow number header keeps its filter button at the end [own]',
  // 3.2: a keyed clear all hands the focus to the first filter (C-22); a
  // 3.1 button drops it to the page when it turns disabled.
  'tests/contract/browser/focus-filter.browser.spec.ts > C-22 clearing an applied filter with the key {Enter} hands the focus to the first filter',
  'tests/contract/browser/focus-filter.browser.spec.ts > C-22 clearing an applied filter with the key [Space] hands the focus to the first filter',
  'tests/contract/browser/focus-filter.browser.spec.ts > C-22 clearing text typed and not applied with the key {Enter} hands the focus to the first filter',
  'tests/contract/unit/filter.spec.ts > C-22 Clearing all filters a keyed click hands the focus to the first filter',
  // 3.2 additions (C-83 to C-91, ADR 0010): virtual rows and infinite
  // scroll. With both off the table is the one of 3.1; every other test
  // compares that.
  'tests/contract/unit/query-model.spec.ts > C-33 Exposed surface C-87 C-89 exposes scrollToIndex and loadMore too, and nothing else',
  'tests/contract/unit/infinite.spec.ts > C-89 Load-more slot and method [own]',
  'tests/contract/unit/infinite.spec.ts > C-90 End of an infinite list [own]',
  'tests/contract/unit/infinite.spec.ts > C-88 Infinite scroll trigger [own]',
  'tests/contract/browser/virtual.browser.spec.ts > C-83 Virtual rows [own]',
  'tests/contract/browser/virtual.browser.spec.ts > C-84 Row heights [own]',
  'tests/contract/browser/virtual.browser.spec.ts > C-85 Scroll element [own]',
  'tests/contract/browser/virtual.browser.spec.ts > C-86 Virtual accessibility [own]',
  'tests/contract/browser/virtual.browser.spec.ts > C-87 Print and scrollToIndex [own]',
  'tests/contract/browser/infinite.browser.spec.ts > C-88 Infinite scroll trigger, virtual false [own]',
  'tests/contract/browser/infinite.browser.spec.ts > C-88 Infinite scroll trigger, virtual true [own]',
  'tests/contract/browser/infinite.browser.spec.ts > C-89 Load-more slot and method in the browser [own]',
  'tests/contract/browser/dom-contract-3-2.browser.spec.ts > C-91 the DOM with 3.2 features matches the DOM contract',
  'tests/contract/browser/accessibility.browser.spec.ts > C-86 accessibility scan',
  // 3.3 additions (C-92 to C-95, ADR 0011): the change flash. The tracker of
  // C-92 is the core's and has its own tests; these drive `flash` and
  // `rowsUpdate`, which a 3.2 build does not have. With `flash` off the
  // table is the one of 3.2; every other test compares that.
  'tests/contract/unit/flash.spec.ts > C-93 Change flash: what flashes [own]',
  'tests/contract/unit/flash.spec.ts > C-94 Change flash: marks and timing [own]',
  'tests/contract/unit/flash.spec.ts > C-95 Change flash off and DOM contract of 3.3 [own]',
  'tests/contract/browser/flash.browser.spec.ts > C-93 Change flash: what flashes [own]',
  'tests/contract/browser/flash.browser.spec.ts > C-94 Change flash: marks and timing [own]',
  'tests/contract/browser/flash.browser.spec.ts > C-94 Change flash: the skin [own]',
  'tests/contract/browser/flash.browser.spec.ts > C-95 Change flash off and DOM contract of 3.3 [own]',
  'tests/contract/browser/dom-contract-3-3.browser.spec.ts > C-95 the DOM with the change flash matches the DOM contract',
  // 3.5 additions (C-97, C-98): `rowKind` and `rowExpandable`, which a 3.4
  // build does not have. Without them the table is the one of 3.4.
  'tests/contract/unit/row-kind.spec.ts > C-97 Row kind [own]',
  'tests/contract/unit/row-expandable.spec.ts > C-98 Rows that cannot expand [tanstack] [own]',
  'tests/contract/browser/dom-contract-row-kind.browser.spec.ts > C-97 the row kind is on its row, as the DOM contract lists it [own]',
  'tests/contract/browser/dom-contract-row-kind.browser.spec.ts > C-97 a virtual body writes the kind on the rows it draws, a pinned row included [own]',
  'tests/contract/browser/dom-contract-row-kind.browser.spec.ts > C-98 a virtual body draws no expand button on a row that cannot expand, a pinned one included [tanstack] [own]'
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

/** Exports `ref`, builds its library and packs it for the comparison. */
const packGitRef = async ref => {
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
    const vueDir = join(dir, 'packages', 'vue')
    const workspace = existsSync(join(vueDir, 'package.json'))
    if (workspace) {
      const manifest = JSON.parse(
        readFileSync(join(vueDir, 'package.json'), 'utf8')
      )
      const externalPackages = [
        ...Object.keys(manifest.peerDependencies ?? {}),
        ...Object.keys(manifest.dependencies ?? {}).filter(
          name => !name.startsWith('@dolusoft/')
        )
      ]
      // Bundle this ref's protocol and core into its Vue entry. Otherwise the
      // test aliases would silently substitute the candidate's workspace code.
      const nodeEnv = process.env.NODE_ENV
      try {
        await build({
          root: vueDir,
          configFile: join(vueDir, 'vite.config.ts'),
          logLevel: 'warn',
          resolve: {
            alias: [
              {
                find: /^@dolusoft\/query-protocol$/,
                replacement: join(dir, 'packages/query-protocol/src/index.ts')
              },
              {
                find: /^@dolusoft\/query-table-core$/,
                replacement: join(dir, 'packages/query-table-core/src/index.ts')
              },
              {
                find: /^@dolusoft\/query-table-core\/([\w-]+)$/,
                replacement: join(
                  dir,
                  'packages/query-table-core/src/features/$1/index.ts'
                )
              }
            ]
          },
          build: {
            rollupOptions: {
              external: id =>
                externalPackages.some(
                  name => id === name || id.startsWith(`${name}/`)
                )
            }
          }
        })
      } finally {
        // Vite sets NODE_ENV during a build; the test runner must retain its
        // original environment (Vue Test Utils records emits via devtools).
        if (nodeEnv === undefined) {
          delete process.env.NODE_ENV
        } else {
          process.env.NODE_ENV = nodeEnv
        }
      }
      // The bundled workspace packages need no install or workspace resolution
      // when packing this disposable test artifact.
      manifest.dependencies = Object.fromEntries(
        Object.entries(manifest.dependencies ?? {}).filter(
          ([name]) => !name.startsWith('@dolusoft/')
        )
      )
      writeFileSync(
        join(vueDir, 'package.json'),
        `${JSON.stringify(manifest, null, 2)}\n`
      )
    } else {
      must(process.execPath, [vite, 'build', '--logLevel', 'warn'], {
        cwd: dir
      })
    }
    must('pnpm', ['pack', '--pack-destination', work], {
      cwd: workspace ? vueDir : dir
    })
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
    ;({ tarball, label } = await packGitRef(value))
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
  // failing added tests wait out their timeouts: a quiet stretch can pass
  // the default idle limit of test-browser.mjs, so it gets twice that.
  const env = {
    BROWSER_TEST_IDLE_MS: '120000',
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
