// The API report of every package (api-extractor): `etc/<name>.api.md` in
// each package is the reviewed public surface of its `dist/types`. A change
// to the public API shows up as a diff of that file.
//
//   node scripts/api-report.mjs           fails when a report is out of date
//   node scripts/api-report.mjs --local   rewrites the reports
//
// Reads `dist/`; run `pnpm build` first (`api:check` checks it is fresh).
import { mkdirSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

import { Extractor, ExtractorConfig } from '@microsoft/api-extractor'

const root = join(import.meta.dirname, '..')
const local = process.argv.includes('--local')

const packages = readdirSync(join(root, 'packages'), { withFileTypes: true })
  .filter(entry => entry.isDirectory())
  .map(entry => join(root, 'packages', entry.name))

let failed = false
for (const dir of packages) {
  const config = ExtractorConfig.loadFileAndPrepare(
    join(dir, 'api-extractor.json')
  )
  if (local) {
    mkdirSync(config.reportFolder, { recursive: true })
  }
  const result = Extractor.invoke(config, {
    localBuild: local,
    showVerboseMessages: false
  })
  const name = config.packageJson?.name ?? dir
  if (result.succeeded) {
    console.log(
      `api-report: ${name} ${result.apiReportChanged ? 'updated' : 'unchanged'}`
    )
    continue
  }
  failed = true
  console.error(
    `api-report: ${name} failed (${result.errorCount} errors, ${result.warningCount} warnings)${
      result.apiReportChanged
        ? ' - the API changed; review it and run pnpm api:update'
        : ''
    }`
  )
}

if (failed) {
  process.exit(1)
}
