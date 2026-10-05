// `pnpm analyze:build:json`: builds the library with Rolldown's devtools
// session output on and condenses the session into one small JSON file,
// node_modules/.cache/measure/build.json. Nothing is served and nothing keeps
// running: the process exits when the build ends.
//
// Only `build.rolldownOptions.devtools` is set. The top-level Vite `devtools`
// option (what `pnpm analyze:build` uses) would start a DevTools server after
// the build and never exit.
//
// Rolldown writes the session to node_modules/.rolldown/sid_<n>_<timestamp>/
// (`logs.json`: one JSON object per line; its `sessionId` option is ignored).
// This script reads the directories that appeared during its own build and
// removes exactly those.
//
// The library config builds two formats (ES and CJS), so a session holds two
// builds; each one gets its own entry in the output.
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { join, relative } from 'node:path'
import { gzipSync } from 'node:zlib'

import { build } from 'vite'

const root = join(import.meta.dirname, '..')
const sessionsDir = join(root, 'node_modules', '.rolldown')
const outDir = join(root, 'node_modules', '.cache', 'measure')
const distDir = join(root, 'node_modules', '.cache', 'analyze-json-dist')
const resultFile = join(outDir, 'build.json')
mkdirSync(outDir, { recursive: true })

const sessionsBefore = new Set(
  existsSync(sessionsDir) ? readdirSync(sessionsDir) : []
)

await build({
  root,
  configFile: join(root, 'vite.config.ts'),
  logLevel: 'warn',
  build: {
    outDir: distDir,
    emptyOutDir: true,
    rolldownOptions: { devtools: {} }
  }
})

const created = (
  existsSync(sessionsDir) ? readdirSync(sessionsDir) : []
).filter(
  name =>
    !sessionsBefore.has(name) &&
    existsSync(join(sessionsDir, name, 'logs.json'))
)
if (created.length === 0) {
  console.error(
    '[analyze:build:json] the build wrote no Rolldown session to node_modules/.rolldown'
  )
  process.exit(1)
}

// Ids in the log use forward slashes and absolute paths; keep them
// relative to the repository so the file is the same on every machine.
const rootPrefix = root.replaceAll('\\', '/') + '/'
const shorten = id =>
  id.startsWith(rootPrefix) ? id.slice(rootPrefix.length) : id
const bytes = text => Buffer.byteLength(text, 'utf8')

const builds = []
try {
  for (const name of created) {
    const events = readFileSync(join(sessionsDir, name, 'logs.json'), 'utf8')
      .split('\n')
      .filter(Boolean)
      .map(line => JSON.parse(line))

    // Large strings are stored once as a `StringRef` event and appear elsewhere
    // as "$ref:<id>".
    const strings = new Map(
      events.filter(e => e.action === 'StringRef').map(e => [e.id, e.content])
    )
    const refPrefix = '$ref:'
    const text = value => {
      if (typeof value !== 'string') {
        return null
      }
      return value.startsWith(refPrefix)
        ? (strings.get(value.slice(refPrefix.length)) ?? '')
        : value
    }

    // The source of each module after its last transform.
    const sourceOf = new Map()
    for (const event of events) {
      if (
        event.action === 'HookTransformCallEnd' &&
        event.content !== undefined &&
        event.content !== null
      ) {
        sourceOf.set(
          `${event.build_id}|${event.module_id}`,
          text(event.content)
        )
      }
    }

    const buildIds = [
      ...new Set(events.filter(e => e.build_id).map(e => e.build_id))
    ]
    for (const buildId of buildIds) {
      const of = action =>
        events.find(e => e.action === action && e.build_id === buildId)
      const moduleGraph = of('ModuleGraphReady')
      const chunkGraph = of('ChunkGraphReady')
      const packageGraph = of('PackageGraphReady')
      const assetsReady = of('AssetsReady')
      if (!moduleGraph || !chunkGraph || !packageGraph || !assetsReady) {
        continue
      }

      const modules = moduleGraph.modules.map(module => ({
        id: shorten(module.id),
        external: module.is_external,
        bytes: bytes(sourceOf.get(`${buildId}|${module.id}`) ?? ''),
        imports: [
          ...new Set(
            (module.imports ?? []).map(entry => shorten(entry.module_id))
          )
        ],
        importers: (module.importers ?? []).length
      }))

      // Maps are listed with their size but not gzipped: nobody downloads them
      // with the page.
      const assets = assetsReady.assets.map(asset => {
        const content = text(asset.content) ?? ''
        const isMap = asset.filename.endsWith('.map')
        return {
          file: asset.filename,
          bytes: asset.size,
          gzipBytes: isMap ? null : gzipSync(content).length
        }
      })

      builds.push({
        format: assets.some(a => a.file.endsWith('.cjs')) ? 'cjs' : 'es',
        assets,
        chunks: chunkGraph.chunks.map(chunk => ({
          id: chunk.chunk_id,
          name: chunk.name,
          reason: chunk.reason,
          entry: chunk.entry_module ? shorten(chunk.entry_module) : null,
          modules: chunk.modules.length,
          imports: chunk.imports
        })),
        packages: packageGraph.packages.map(pkg => ({
          name: pkg.name,
          version: pkg.version,
          bytes: pkg.size,
          used: pkg.is_used,
          type: pkg.dependency_type,
          modules: pkg.modules.length
        })),
        // Modules that stay outside the bundle (the peer dependency).
        externals: modules.filter(m => m.external).map(m => m.id),
        modules: modules.filter(m => !m.external)
      })
    }
  }
} finally {
  for (const name of created) {
    rmSync(join(sessionsDir, name), { recursive: true, force: true })
  }
  rmSync(distDir, { recursive: true, force: true })
}

if (builds.length === 0) {
  console.error('[analyze:build:json] the session holds no complete build')
  process.exit(1)
}

const read = pkg =>
  JSON.parse(
    readFileSync(join(root, 'node_modules', pkg, 'package.json'), 'utf8')
  ).version
const result = {
  generatedAt: new Date().toISOString(),
  versions: { vite: read('vite'), vue: read('vue') },
  note: 'bytes are unminified output; module bytes are the source after the last transform',
  builds
}
writeFileSync(resultFile, JSON.stringify(result, null, 2) + '\n')

console.log(
  `[analyze:build:json] ${relative(process.cwd(), resultFile) || resultFile}`
)
for (const entry of builds) {
  for (const asset of entry.assets.filter(a => a.gzipBytes !== null)) {
    console.log(
      `${entry.format}  ${asset.file}  ${asset.bytes} B  (gzip ${asset.gzipBytes} B)  ` +
        `${entry.modules.length} modules, externals: ${entry.externals.join(', ') || 'none'}`
    )
  }
}
