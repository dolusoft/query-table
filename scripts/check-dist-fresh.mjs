// `check:package` and `api:check` read `dist/`, they do not build it. Fails
// when `dist/query-table.js` is missing or older than a file in `src/` (specs
// never reach `dist`, so they do not count).
//
//   node scripts/check-dist-fresh.mjs   (after `pnpm build`)
import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const entry = join(root, 'dist', 'query-table.js')

const walk = dir =>
  readdirSync(dir, { withFileTypes: true }).flatMap(item =>
    item.isDirectory() ? walk(join(dir, item.name)) : [join(dir, item.name)]
  )

const fail = message => {
  console.error(`check-dist-fresh: ${message}; run pnpm build first.`)
  process.exit(1)
}

let built
try {
  built = statSync(entry).mtimeMs
} catch {
  fail('dist/query-table.js is missing')
}

const newer = walk(join(root, 'src')).filter(
  file => !/\.spec\.ts$/.test(file) && statSync(file).mtimeMs > built
)

if (newer.length > 0) {
  fail(
    `dist/query-table.js is older than ${newer.length} file(s) in src/ (${newer
      .slice(0, 3)
      .map(file => file.slice(root.length))
      .join(', ')})`
  )
}
