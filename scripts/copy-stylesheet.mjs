// The last step of the Vue package's build: copies the reference skin,
// packages/vue/styles/table.css, into dist/ as it is (ADR 0025). The package
// exports it as `@dolusoft/query-table/table.css`. No module imports it, so
// it never goes through the script build; `check:package` holds the copy to
// the bytes of the source.
import { copyFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const pkg = join(import.meta.dirname, '..', 'packages', 'vue')

if (!existsSync(join(pkg, 'dist'))) {
  console.error('[stylesheet] packages/vue/dist is missing: build first')
  process.exit(1)
}
copyFileSync(join(pkg, 'styles', 'table.css'), join(pkg, 'dist', 'table.css'))
console.log('[stylesheet] packages/vue/styles/table.css -> dist/table.css')
