// `pnpm measure:renders`: counts component re-renders for fixed scenarios
// (mount, filter, sort, page over 1000 rows) in a real browser and writes
// node_modules/.cache/measure/renders.json.
//
// The scenarios live in tests/measure/renders.measure.ts. This script
// runs them through the same hang-proof wrapper as the browser tests
// (scripts/test-browser.mjs, project "measure"), takes the numbers each test
// attached to its result (`task.meta.renders`) from Vitest's JSON report, and
// writes them as one small file. Headed like the browser tests; HEADLESS=1
// for no window.
import { spawnSync } from 'node:child_process'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const outDir = join(
  import.meta.dirname,
  '..',
  'node_modules',
  '.cache',
  'measure'
)
const rawFile = join(outDir, 'renders-vitest-report.json')
const resultFile = join(outDir, 'renders.json')
mkdirSync(outDir, { recursive: true })
rmSync(rawFile, { force: true })

const run = spawnSync(
  process.execPath,
  [
    join(import.meta.dirname, 'test-browser.mjs'),
    '--reporter=json',
    `--outputFile=${rawFile}`
  ],
  {
    stdio: 'inherit',
    env: { ...process.env, BROWSER_TEST_PROJECT: 'measure' }
  }
)
if (run.status !== 0) {
  console.error('[measure:renders] the measurement run failed')
  process.exit(run.status ?? 1)
}

const report = JSON.parse(readFileSync(rawFile, 'utf8'))
rmSync(rawFile, { force: true })

const scenarios = {}
for (const file of report.testResults) {
  for (const test of file.assertionResults) {
    const renders = test.meta?.renders
    if (renders) {
      scenarios[test.title.replace(/^renders: /, '')] = renders
    }
  }
}
if (Object.keys(scenarios).length === 0) {
  console.error('[measure:renders] the report holds no measurements')
  process.exit(1)
}

const read = name =>
  JSON.parse(
    readFileSync(
      join(import.meta.dirname, '..', 'node_modules', name, 'package.json'),
      'utf8'
    )
  ).version

const result = {
  generatedAt: new Date().toISOString(),
  versions: { vue: read('vue'), vitest: read('vitest') },
  note: 'counts are deterministic (identical on every repetition); timings are medians and noisy',
  scenarios
}
writeFileSync(resultFile, JSON.stringify(result, null, 2) + '\n')

console.log(`\n[measure:renders] ${resultFile}`)
console.log('scenario  rows  queryUpdates  libraryUpdates  applyMs  scenarioMs')
for (const [name, s] of Object.entries(scenarios)) {
  console.log(
    [
      name.padEnd(9),
      String(s.rows).padStart(4),
      String(s.queryUpdates).padStart(13),
      String(s.libraryUpdates).padStart(15),
      String(s.timings.applyMs).padStart(8),
      String(s.timings.scenarioMs).padStart(11)
    ].join(' ')
  )
}
