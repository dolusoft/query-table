// Post-processes the declarations emitted by vue-tsc so they resolve under
// Node's ESM and CJS module modes (checked by `attw --profile node16`).
//
// 1. vue-tsc writes relative imports the way the sources spell them
//    (`../core/query`, `./vue-server-table.vue`). Node16 ESM requires
//    explicit extensions, and TypeScript resolves `./vue-server-table.vue` to
//    `vue-server-table.d.vue.ts` rather than the emitted
//    `vue-server-table.vue.d.ts`.
//    Every relative specifier therefore gets a `.js` suffix, which TypeScript
//    maps back to the matching .d.ts.
// 2. The package is "type": "module", so every .d.ts is read as ESM, which
//    misdescribes the CJS build ("masquerading as ESM"). TypeScript reads a
//    declaration as CommonJS only when it ends in .d.cts, so each .d.ts gets a
//    .d.cts twin whose relative specifiers end in `.cjs`. The CJS bundle uses
//    named exports (`exports.VueServerTable`, `exports.default`), which the
//    twin describes as they are.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const typesDir = fileURLToPath(new URL('../dist/types', import.meta.url))

const walk = dir =>
  readdirSync(dir, { withFileTypes: true }).flatMap(entry =>
    entry.isDirectory() ? walk(join(dir, entry.name)) : [join(dir, entry.name)]
  )

const withExtension = (source, extension) =>
  source.replace(
    /(from\s+|import\()(['"])(\.[^'"]*)\2/g,
    (_, lead, quote, specifier) => {
      const base = specifier.replace(/\.(c|m)?js$/, '')
      return `${lead}${quote}${base}.${extension}${quote}`
    }
  )

let emitted = 0
for (const file of walk(typesDir).filter(f => f.endsWith('.d.ts'))) {
  const source = readFileSync(file, 'utf8')
  writeFileSync(file, withExtension(source, 'js'))

  writeFileSync(
    file.replace(/\.d\.ts$/, '.d.cts'),
    withExtension(source, 'cjs')
  )
  emitted += 1
}
console.log(`post-processed ${emitted} declaration files`)
