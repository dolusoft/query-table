// Post-processes the declarations emitted by vue-tsc so they resolve under
// Node's ESM module mode (checked by `attw --profile esm-only`).
//
// vue-tsc writes relative imports the way the sources spell them
// (`../core/query`, `./query-table.vue`). Node16 ESM requires explicit
// extensions, and TypeScript resolves `./query-table.vue` to
// `query-table.d.vue.ts` rather than the emitted `query-table.vue.d.ts`.
// Every relative specifier therefore gets a `.js` suffix, which TypeScript maps
// back to the matching .d.ts.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const typesDir = fileURLToPath(new URL('../dist/types', import.meta.url))

const walk = dir =>
  readdirSync(dir, { withFileTypes: true }).flatMap(entry =>
    entry.isDirectory() ? walk(join(dir, entry.name)) : [join(dir, entry.name)]
  )

const withExtension = source =>
  source.replace(
    /(from\s+|import\()(['"])(\.[^'"]*)\2/g,
    (_, lead, quote, specifier) => {
      const base = specifier.replace(/\.(c|m)?js$/, '')
      return `${lead}${quote}${base}.js${quote}`
    }
  )

let emitted = 0
for (const file of walk(typesDir).filter(f => f.endsWith('.d.ts'))) {
  writeFileSync(file, withExtension(readFileSync(file, 'utf8')))
  emitted += 1
}
console.log(`post-processed ${emitted} declaration files`)
