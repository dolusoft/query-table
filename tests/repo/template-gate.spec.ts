import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

import { afterAll, describe, expect, it } from 'vitest'

// The template gate (tools/template-gate): the Vue <template> checks oxlint
// cannot make, and the unused imports of an SFC.

interface Finding {
  line: number
  column: number
  gate: string
  message: string
}

const root = join(import.meta.dirname, '..', '..')
const gateDir = join(root, 'tools', 'template-gate')
const { checkSfc, GateParseError } = (await import(
  pathToFileURL(join(gateDir, 'gate.mjs')).href
)) as {
  checkSfc: (source: string, file: string, gates: string[]) => Finding[]
  GateParseError: new (message: string) => Error
}

const allGates = [
  'no-v-html',
  'require-v-for-key',
  'no-v-if-with-v-for',
  'valid-v-model',
  'no-unused-imports'
]
const sfc = (template: string, script = '') =>
  `<script setup lang="ts">\n${script}\n</script>\n\n<template>\n${template}\n</template>\n`
const gatesOf = (source: string) =>
  checkSfc(source, 'x.vue', allGates).map(finding => finding.gate)

describe('template gate checks', () => {
  it('reports v-html', () => {
    expect(gatesOf(sfc('<div v-html="html" />'))).toEqual(['no-v-html'])
    expect(gatesOf(sfc('<div v-text="html" />'))).toEqual([])
  })

  it('reports a v-for without a key', () => {
    expect(gatesOf(sfc('<li v-for="row in rows">{{ row }}</li>'))).toEqual([
      'require-v-for-key'
    ])
    expect(
      gatesOf(sfc('<li v-for="row in rows" :key="row.id">{{ row }}</li>'))
    ).toEqual([])
    expect(
      gatesOf(sfc('<li v-for="row in rows" key="static">{{ row }}</li>'))
    ).toEqual([])
  })

  it('accepts a template v-for keyed on itself, on its children, or holding only slots', () => {
    expect(
      gatesOf(
        sfc(
          '<template v-for="r in rows" :key="r.id"><li>{{ r }}</li></template>'
        )
      )
    ).toEqual([])
    expect(
      gatesOf(
        sfc(
          '<template v-for="r in rows"><li :key="r.id">{{ r }}</li></template>'
        )
      )
    ).toEqual([])
    expect(
      gatesOf(
        sfc(
          '<Table><template v-for="(_, name) in $slots" #[name]="p"><slot :name="name" v-bind="p" /></template></Table>'
        )
      )
    ).toEqual([])
    expect(
      gatesOf(sfc('<template v-for="r in rows"><li>{{ r }}</li></template>'))
    ).toEqual(['require-v-for-key'])
  })

  it('reports v-if and v-for on one element', () => {
    expect(
      gatesOf(sfc('<li v-for="r in rows" v-if="r.on" :key="r.id">{{ r }}</li>'))
    ).toEqual(['no-v-if-with-v-for'])
    expect(
      gatesOf(
        sfc(
          '<template v-if="show"><li v-for="r in rows" :key="r.id">{{ r }}</li></template>'
        )
      )
    ).toEqual([])
  })

  it('reports an invalid v-model', () => {
    const problems = (template: string) =>
      checkSfc(sfc(template), 'x.vue', ['valid-v-model']).map(
        finding => finding.message
      )
    expect(problems('<span v-model="x" />')).toEqual([
      expect.stringContaining('not supported on <span>')
    ])
    expect(problems(`<input v-model="'text'" />`)).toEqual([
      expect.stringContaining('assignable expression')
    ])
    expect(problems('<input v-model="f()" />')).toEqual([
      expect.stringContaining('assignable expression')
    ])
    expect(problems('<input type="file" v-model="x" />')).toEqual([
      expect.stringContaining('type="file"')
    ])
    expect(
      problems('<div v-for="r in rows" :key="r"><input v-model="r" /></div>')
    ).toEqual([expect.stringContaining('the v-for variable "r"')])
    expect(
      problems(
        '<input v-model="a" /><input v-model.trim="state.b" /><select v-model="c" /><textarea v-model="d!" /><Field v-model:value="e" />'
      )
    ).toEqual([])
    expect(
      problems(
        '<div v-for="r in rows" :key="r.id"><input v-model="r.name" /></div>'
      )
    ).toEqual([])
  })

  it('reports an import the script and the template both leave unused', () => {
    const findings = checkSfc(
      sfc(
        '<Child v-focus :items="list" @pick="onPick" /><my-part />',
        `import { ref } from 'vue'
import Child from './Child.vue'
import MyPart from './MyPart.vue'
import { vFocus } from './focus'
import { onPick, unusedHelper } from './helpers'
import type { Row, Unused } from './types'
const list = ref<Row[]>([])`
      ),
      'x.vue',
      ['no-unused-imports']
    )
    expect(findings.map(finding => [finding.line, finding.message])).toEqual([
      [6, expect.stringContaining('"unusedHelper"')],
      [7, expect.stringContaining('"Unused"')]
    ])
  })

  it('counts an import used only by the generic attribute', () => {
    const source = `<script setup lang="ts" generic="Q extends Query">
import type { Query } from './query'
defineProps<{ query: Q }>()
</script>

<template><p /></template>
`
    expect(gatesOf(source)).toEqual([])
  })

  it('runs only the gates it is given', () => {
    expect(
      checkSfc(sfc('<div v-html="h" /><li v-for="r in rows" />'), 'x.vue', [
        'no-v-html'
      ]).map(finding => finding.gate)
    ).toEqual(['no-v-html'])
  })
})

describe('template gate disable comments', () => {
  it('silences the named gate on the next element only', () => {
    expect(
      gatesOf(
        sfc(`<!-- template-gate-disable-next-line no-v-html -- trusted markup -->
<div v-html="a" />
<div v-html="b" />`)
      )
    ).toEqual(['no-v-html'])
  })

  it('reports a disable comment without a reason, an unknown gate, or nothing to silence', () => {
    const messages = (template: string) =>
      checkSfc(sfc(template), 'x.vue', allGates).map(
        finding => `${finding.gate}: ${finding.message}`
      )
    expect(
      messages(`<!-- template-gate-disable-next-line no-v-html -->
<div v-html="a" />`)
    ).toEqual([expect.stringContaining('needs a reason')])
    expect(
      messages(`<!-- template-gate-disable-next-line no-such-gate -- x -->
<div />`)
    ).toEqual([expect.stringContaining('unknown gate')])
    expect(
      messages(`<!-- template-gate-disable-next-line no-v-html -- x -->
<div />`)
    ).toEqual([expect.stringContaining('nothing is reported')])
  })
})

describe('template gate parse errors', () => {
  it('throws on a broken template', () => {
    expect(() => gatesOf(sfc('<div><span></div>'))).toThrow(GateParseError)
  })

  it('throws on a script that does not parse', () => {
    expect(() => gatesOf(sfc('<p />', 'import { from'))).toThrow(GateParseError)
  })
})

describe('template gate CLI', () => {
  const dir = mkdtempSync(join(tmpdir(), 'template-gate-'))
  afterAll(() => rmSync(dir, { recursive: true, force: true }))
  const write = (name: string, content: string) => {
    const file = join(dir, name)
    writeFileSync(file, content)
    return file
  }
  const run = (...args: string[]) =>
    spawnSync(process.execPath, [join(gateDir, 'cli.mjs'), ...args], {
      cwd: root,
      encoding: 'utf8'
    })

  it('passes the repository', () => {
    const result = run()
    expect(result.stdout + result.stderr).toBe('')
    expect(result.status).toBe(0)
  })

  it('checks the files it is given, as a pre-commit hook passes staged paths', () => {
    const file = write('Bad.vue', sfc('<div v-html="h" />'))
    const clean = write('Good.vue', sfc('<p>{{ 1 }}</p>'))
    const result = run(file, clean)
    expect(result.status).toBe(1)
    expect(result.stdout).toMatch(
      /Bad\.vue:6:6 no-v-html v-html renders raw HTML/
    )
    expect(result.stdout).not.toMatch(/Good\.vue/)
  })

  it('prints JSON', () => {
    const file = write('Json.vue', sfc('<li v-for="r in rows" />'))
    const result = run('--format=json', file)
    expect(result.status).toBe(1)
    const report = JSON.parse(result.stdout) as {
      files: number
      findings: (Finding & { file: string })[]
    }
    expect(report.files).toBe(1)
    expect(report.findings.map(finding => finding.gate)).toEqual([
      'require-v-for-key'
    ])
  })

  it('exits with 2 on an SFC that does not parse', () => {
    const file = write('Broken.vue', sfc('<div><span></div>'))
    const result = run(file)
    expect(result.status).toBe(2)
    expect(result.stderr).toMatch(/parse error: .*Broken\.vue/)
  })

  it('exits with 2 on a bad configuration', () => {
    const config = write('config.json', '{ "gates": ["no-such-gate"] }')
    expect(run('--config', config).status).toBe(2)
    expect(run('--format=xml').status).toBe(2)
    expect(run(join(dir, 'missing.vue')).status).toBe(2)
  })
})
