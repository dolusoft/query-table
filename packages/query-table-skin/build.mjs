// The skin has no build step of its own: the stylesheet is published as it
// is written. `pnpm build` copies src/table.css into dist/, the only
// directory the package publishes (ADR 0023).
import { copyFileSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'

const here = import.meta.dirname
const dist = join(here, 'dist')

rmSync(dist, { recursive: true, force: true })
mkdirSync(dist)
copyFileSync(join(here, 'src', 'table.css'), join(dist, 'table.css'))
console.log('[query-table-skin] dist/table.css')
