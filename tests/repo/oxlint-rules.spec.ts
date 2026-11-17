import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

import { RuleTester } from 'oxlint/plugins-dev'
import { describe, it } from 'vitest'

// The local oxlint JS plugin rules besides the layers (tests/repo/layers.spec.ts):
// the tr-1 syntax fence and the Vue script checks.

type Rule = Parameters<RuleTester['run']>[1]
type Plugin = { default: { rules: Record<string, Rule> } }

const root = join(import.meta.dirname, '..', '..')
const load = async (name: string) =>
  (
    (await import(
      pathToFileURL(join(root, 'oxlint-plugins', name)).href
    )) as Plugin
  ).default.rules

const fences = await load('fences.mjs')
const vueScript = await load('vue-script.mjs')

RuleTester.describe = describe
RuleTester.it = it
const tester = new RuleTester({
  languageOptions: { parserOptions: { lang: 'ts' } }
})

describe('fences/tr1-local-syntax', () => {
  tester.run('tr1-local-syntax', fences['tr1-local-syntax'], {
    valid: [
      'for (let i = 0; i < s.length; i++) { s.charCodeAt(i) }',
      'const parts = [a, b]',
      'const day = daysIn(year, month)'
    ],
    invalid: [
      {
        code: 'for (const c of s) {}',
        errors: [{ message: /UTF-16 code units/ }]
      },
      {
        code: 'const { slice } = String.prototype',
        errors: [{ message: /off a prototype/ }]
      },
      {
        code: 'const d = new Date(s)',
        errors: [{ message: /calendar by hand/ }]
      },
      { code: 'const d = Date()', errors: [{ message: /calendar by hand/ }] },
      { code: 'const p = [...s]', errors: [{ message: /spread splits/ }] },
      { code: 'f(...s)', errors: [{ message: /spread splits/ }] }
    ]
  })
})

describe('vue-script/no-ref-as-condition', () => {
  const head = `import { computed, ref } from 'vue'
const open = ref(false)
const total = computed(() => 1)
`
  tester.run('no-ref-as-condition', vueScript['no-ref-as-condition'], {
    valid: [
      `${head}if (open.value) {}`,
      `${head}const label = total.value ? 'a' : 'b'`,
      // A ref() that is not Vue's is not a ref.
      `const ref = (x: boolean) => x
const open = ref(false)
if (open) {}`,
      // A parameter that shadows the ref is not the ref.
      `${head}function f(open: boolean) { if (open) {} }`,
      `${head}const g = (total: number) => (total ? 1 : 2)`,
      // A parameter that shadows the imported factory is not Vue's.
      `import { ref as makeRef } from 'vue'
function f(makeRef: () => boolean) { const on = makeRef(); if (on) {} }`
    ],
    invalid: [
      {
        code: `import { ref as makeRef } from 'vue'
const on = makeRef(false)
if (on) {}`,
        errors: 1
      },
      {
        code: `import * as vue from 'vue'
const on = vue.shallowRef(false)
if (on) {}`,
        errors: 1
      },
      // The import may stand anywhere in the file.
      {
        code: `function f() { if (on) {} }
const on = ref(false)
import { ref } from 'vue'`,
        errors: 1
      },
      { code: `${head}if (open) {}`, errors: 1 },
      { code: `${head}const label = total ? 'a' : 'b'`, errors: 1 },
      { code: `${head}const shut = !open`, errors: 1 },
      { code: `${head}const either = open || total`, errors: 1 },
      { code: `${head}while (ready && open) {}`, errors: 1 }
    ]
  })
})

describe('vue-script/no-mutating-props', () => {
  tester.run('no-mutating-props', vueScript['no-mutating-props'], {
    valid: [
      `const props = defineProps<{ items: string[] }>()
const copy = [...props.items]
copy.push('x')`,
      // props.a = x is a type error (readonly props): the type check owns it.
      `const props = defineProps<{ a: number }>()
props.a = 1`,
      `const items: string[] = []
items.push('x')`,
      // A parameter that shadows a destructured prop is not the prop.
      `const { items } = defineProps<{ items: string[] }>()
function f(items: string[]) { items.push('x') }`,
      // A setup() of an object that is not a component.
      `export const service = { setup(state) { state.items.push('x') } }`,
      // A nested object's method: its this is that object.
      `export default defineComponent({
  props: ['items'],
  methods: { helper: { run() { this.items.push(1) } } }
})`,
      `export default defineComponent({
  props: ['items'],
  data() { return { box: { add() { this.items.push(1) } } } }
})`,
      // Another component's prop is not this component's.
      `const A = defineComponent({ props: ['items'] })
const B = defineComponent({
  data: () => ({ items: [] }),
  methods: { add() { this.items.push(1) } }
})`,
      // A parameter that shadows the props object is not the props.
      `const props = defineProps<{ items: string[] }>()
function f(props: { items: string[] }) { props.items.push('x') }`,
      // Options API: data, not a prop, may change in place.
      `export default defineComponent({
  props: { items: Array },
  data: () => ({ rows: [] }),
  methods: { add() { this.rows.push(1) } }
})`
    ],
    invalid: [
      {
        code: `const props = defineProps<{ items: string[] }>()
props.items.push('x')`,
        errors: [{ message: /"items"/ }]
      },
      {
        code: `const props = withDefaults(defineProps<{ meta: { a: number } }>(), {})
props.meta.a = 2`,
        errors: 1
      },
      {
        code: `const props = defineProps<{ meta: { a: number } }>()
props.meta.a++`,
        errors: 1
      },
      {
        code: `const { items } = defineProps<{ items: string[] }>()
items.sort()`,
        errors: 1
      },
      {
        code: `export default defineComponent({
  setup(props) {
    props.list.splice(0, 1)
  }
})`,
        errors: 1
      },
      {
        code: `export default defineComponent({
  props: { items: Array },
  methods: { add() { this.items.push(1) } }
})`,
        errors: [{ message: /"items"/ }]
      },
      {
        code: `export default defineComponent({
  props: ['meta'],
  watch: { x() { this.meta.a = 1 } }
})`,
        errors: 1
      },
      {
        code: `export default defineComponent({
  props: ['items'],
  computed: { first: { get() { return this.items.pop() } } }
})`,
        errors: 1
      },
      {
        code: `export default { props: ['list'], setup(props) { props.list.push(1) } }`,
        errors: 1
      }
    ]
  })
})

describe('vue-script/require-valid-default-prop', () => {
  tester.run(
    'require-valid-default-prop',
    vueScript['require-valid-default-prop'],
    {
      valid: [
        `withDefaults(defineProps<{ items?: string[] }>(), { items: () => [] })`,
        `defineProps({ name: { type: String, default: 'x' } })`,
        `defineProps({ list: { type: Array, default: () => [] } })`,
        `defineProps({ size: { type: [Number, String], default: 'auto' } })`,
        `defineProps({ meta: { type: Object, default() { return {} } } })`,
        `defineProps({ fn: { type: Function, default: () => 'x' } })`,
        // A nested function's return is not the factory's.
        `defineProps({ meta: { type: Object, default() { const f = () => []; return {} } } })`
      ],
      invalid: [
        {
          code: `withDefaults(defineProps<{ items?: string[] }>(), { items: [] })`,
          errors: [{ message: /shared array/ }]
        },
        {
          code: `defineProps({ meta: { type: Object, default: {} } })`,
          errors: [{ message: /shared object/ }]
        },
        {
          code: `defineProps({ items: { type: Array, default: 1 } })`,
          errors: [{ message: /is a Number, but the prop is Array/ }]
        },
        {
          code: `defineProps({ meta: { type: Object, default: 'x' } })`,
          errors: [{ message: /is a String, but the prop is Object/ }]
        },
        {
          code: `defineProps({ count: { type: Number, default: 'one' } })`,
          errors: [{ message: /is a String, but the prop is Number/ }]
        },
        {
          code: `defineComponent({ props: { on: { type: Boolean, default: 1 } } })`,
          errors: 1
        },
        {
          code: `defineProps({ list: { type: Array, default: () => ({}) } })`,
          errors: [{ message: /is a Object, but the prop is Array/ }]
        },
        {
          code: `defineProps({ meta: { type: Object, default() { return [] } } })`,
          errors: 1
        },
        {
          code: `defineProps({ meta: { type: Object, default(a) { if (a) { return [] } return {} } } })`,
          errors: [{ message: /is a Array, but the prop is Object/ }]
        }
      ]
    }
  )
})
