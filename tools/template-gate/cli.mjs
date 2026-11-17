#!/usr/bin/env node
// The template gate CLI. Usage:
//   node tools/template-gate/cli.mjs [--format=text|json] [--config <file>] [path...]
// Paths are files or directories (default: the repository root); only .vue
// files are read. Exit 0: clean, 1: findings, 2: an SFC does not parse or the
// configuration is wrong.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve, sep } from 'node:path'
import process from 'node:process'
import { parseArgs } from 'node:util'

import { checkSfc, GateParseError, gateMessages } from './gate.mjs'

const root = resolve(import.meta.dirname, '..', '..')

const fail = message => {
  console.error(`template-gate: ${message}`)
  process.exit(2)
}

let options
try {
  options = parseArgs({
    allowPositionals: true,
    options: {
      format: { type: 'string', default: 'text' },
      config: {
        type: 'string',
        default: join(import.meta.dirname, 'config.json')
      }
    }
  })
} catch (error) {
  fail(error.message)
}
const { values, positionals } = options
if (!['text', 'json'].includes(values.format)) {
  fail(`unknown format "${values.format}"`)
}

let config
try {
  config = JSON.parse(readFileSync(values.config, 'utf8'))
} catch (error) {
  fail(`cannot read the configuration: ${error.message}`)
}
const unknown = (config.gates ?? []).filter(gate => !(gate in gateMessages))
if (!Array.isArray(config.gates) || unknown.length) {
  fail(`"gates" must list known gates; unknown: ${unknown.join(', ')}`)
}

const toPosix = path => path.split(sep).join('/')

// Ignore entries follow .gitignore in short: a name without a slash matches a
// path segment anywhere, a path with a slash matches from the root, `*`
// matches within one segment.
const ignores = ['node_modules', ...(config.ignore ?? [])].map(entry => {
  const segment = entry
    .replace(/\/$/, '')
    .split('*')
    .map(part => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
    .join('[^/]*')
  return entry.includes('/')
    ? new RegExp(`^${segment}(/|$)`)
    : new RegExp(`(^|/)${segment}(/|$)`)
})
const ignored = path => {
  const rel = toPosix(relative(root, path))
  return ignores.some(pattern => pattern.test(rel))
}

function* vueFiles(path) {
  let stat
  try {
    stat = statSync(path)
  } catch {
    fail(`no such file or directory: ${path}`)
  }
  if (ignored(path) && path !== root) {
    return
  }
  if (stat.isFile()) {
    if (path.endsWith('.vue')) {
      yield path
    }
    return
  }
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    if (entry.name === '.git') {
      continue
    }
    yield* vueFiles(join(path, entry.name))
  }
}

const targets = positionals.length ? positionals : [root]
const findings = []
const broken = []
let files = 0
for (const target of targets) {
  for (const file of vueFiles(resolve(target))) {
    files++
    const name = toPosix(relative(root, file))
    try {
      for (const finding of checkSfc(
        readFileSync(file, 'utf8'),
        name,
        config.gates
      )) {
        findings.push({ file: name, ...finding })
      }
    } catch (error) {
      if (!(error instanceof GateParseError)) {
        throw error
      }
      broken.push(error.message)
    }
  }
}

if (values.format === 'json') {
  console.log(JSON.stringify({ files, findings, errors: broken }, null, 2))
} else {
  for (const f of findings) {
    console.log(`${f.file}:${f.line}:${f.column} ${f.gate} ${f.message}`)
  }
  for (const message of broken) {
    console.error(`template-gate: parse error: ${message}`)
  }
  if (findings.length || broken.length) {
    console.error(
      `template-gate: ${findings.length} finding(s), ${broken.length} parse error(s) in ${files} file(s)`
    )
  }
}
process.exitCode = broken.length ? 2 : findings.length ? 1 : 0
