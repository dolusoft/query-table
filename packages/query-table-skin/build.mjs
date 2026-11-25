// The skin has no build step of its own: the stylesheet is published as it
// is written. Since ADR 0025 its source is the Vue package's
// styles/table.css, which `@dolusoft/query-table/table.css` exports; this
// package is published one last time in 3.23.0 with the same file, so
// `pnpm build` copies that file into dist/, the only directory the package
// publishes.
import { copyFileSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'

const here = import.meta.dirname
const dist = join(here, 'dist')

rmSync(dist, { recursive: true, force: true })
mkdirSync(dist)
copyFileSync(
  join(here, '..', 'vue', 'styles', 'table.css'),
  join(dist, 'table.css')
)
console.log('[query-table-skin] dist/table.css')
