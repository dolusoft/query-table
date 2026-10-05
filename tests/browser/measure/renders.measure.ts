import type { ComponentInternalInstance, ComponentPublicInstance } from 'vue'
import { afterAll, beforeAll, expect, test } from 'vitest'
import { userEvent } from 'vitest/browser'
import { cleanup, config, render } from 'vitest-browser-vue'

import MeasureHost from './MeasureHost.vue'
import type { Column, TableQuery } from '../../../src/contract'

// Counts how often each component re-renders for a few fixed user scenarios
// on a 1000-row dataset. `pnpm measure:renders` runs this file and turns the
// numbers into node_modules/.cache/measure/renders.json.
//
// Counts are deterministic and are asserted to be the same on every
// repetition; timings are not, so they are only reported (median of RUNS).
//
// How it counts: a global mixin (`config.global.mixins`) adds `mounted`,
// `updated` and `renderTriggered` hooks to every component. `renderTriggered`
// only fires in a development build of Vue, which is what this project serves.

const ROWS = 1000
const RUNS = 5

declare module 'vitest' {
  interface TaskMeta {
    renders?: ScenarioResult
  }
}

type Tally = Record<string, number>

interface Counts {
  /** Components mounted during the scenario, by name. */
  mounts: Tally
  /** `updated` hook calls, by component name. */
  updates: Tally
  /** What triggered a re-render, as "<component>: <type> <key>". */
  triggers: Tally
}

interface ScenarioResult {
  rows: number
  /** Updates the consumer applied (one per `update:query` event). */
  queryUpdates: number
  counts: Counts
  /** Of the counts above: the table's own components (`src/components/`). */
  libraryUpdates: number
  /** Median over RUNS, in milliseconds. */
  timings: {
    /** Render and layout of one answer to `update:query`, summed per run. */
    applyMs: number
    /** Whole scenario, driver round trips included. */
    scenarioMs: number
  }
}

const columns: Column[] = [
  { field: 'id', title: 'ID', type: 'number' },
  { field: 'name', title: 'Name' },
  { field: 'age', title: 'Age', type: 'number' },
  { field: 'joined', title: 'Joined', type: 'date' }
]

const dataset = Array.from({ length: ROWS }, (_, i) => ({
  id: i + 1,
  name: `Name ${i + 1}`,
  age: 20 + (i % 50),
  joined: `2024-0${(i % 9) + 1}-1${i % 9}`
}))

const startQuery = (pageSize: number): TableQuery => ({
  page: 1,
  pageSize,
  sort: null,
  filters: []
})

// --- counting ---------------------------------------------------------------

let counting = false
let counts: Counts = { mounts: {}, updates: {}, triggers: {} }
let libraryUpdates = 0

const bump = (tally: Tally, key: string) => {
  tally[key] = (tally[key] ?? 0) + 1
}

const nameOf = (instance: ComponentPublicInstance) =>
  instance.$options.name ?? instance.$options.__name ?? 'Anonymous'

// A component belongs to the library when it, or an ancestor, is a file of
// src/components (a render function created inside one has no `__file`).
const isLibrary = (internal: ComponentInternalInstance | null): boolean => {
  for (let at = internal; at; at = at.parent) {
    const file = (at.type as { __file?: string }).__file
    if (file?.replaceAll('\\', '/').includes('/src/components/')) {
      return true
    }
  }
  return false
}

const counter = {
  mounted(this: ComponentPublicInstance) {
    if (counting) {
      bump(counts.mounts, nameOf(this))
    }
  },
  updated(this: ComponentPublicInstance) {
    if (counting) {
      bump(counts.updates, nameOf(this))
      if (isLibrary(this.$)) {
        libraryUpdates++
      }
    }
  },
  renderTriggered(
    this: ComponentPublicInstance,
    event: { type: string; key?: unknown }
  ) {
    if (counting) {
      bump(
        counts.triggers,
        `${nameOf(this)}: ${event.type} ${String(event.key)}`
      )
    }
  }
}

const reset = () => {
  counts = { mounts: {}, updates: {}, triggers: {} }
  libraryUpdates = 0
}

const previousMixins = config.global.mixins
beforeAll(() => {
  config.global.mixins = [counter]
})
afterAll(() => {
  config.global.mixins = previousMixins
})

// --- scenarios --------------------------------------------------------------

const frame = () =>
  new Promise<void>(done => requestAnimationFrame(() => done()))

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)]
}

interface Run {
  rows: number
  queryUpdates: number
  counts: Counts
  libraryUpdates: number
  applyMs: number
  scenarioMs: number
}

interface Scenario {
  name: string
  pageSize: number
  /** Counts the mount itself instead of an action on a mounted table. */
  mountOnly?: boolean
  /** Query updates the action must end with. */
  expectedUpdates: number
  act: (applied: number[]) => Promise<void>
}

const sortButton = (field: string) =>
  document.querySelector<HTMLElement>(`th[data-field="${field}"] .bh-sort`)

const once = async (scenario: Scenario): Promise<Run> => {
  const applied: number[] = []
  const mount = () =>
    render(MeasureHost as never, {
      props: {
        dataset,
        columns,
        initialQuery: startQuery(scenario.pageSize),
        // Long on purpose, and the filter scenario ends with Enter: the
        // update comes from Enter, so no timer decides how many there are.
        filterDebounce: 5000,
        applied
      } as never
    })

  cleanup()
  reset()
  counting = Boolean(scenario.mountOnly)
  const started = performance.now()
  await mount()
  if (scenario.mountOnly) {
    await frame()
    counting = false
    return finish(applied, started)
  }
  await frame()
  reset()
  counting = true
  const actStarted = performance.now()
  await scenario.act(applied)
  await expect.poll(() => applied.length).toBe(scenario.expectedUpdates)
  await frame()
  counting = false
  return finish(applied, actStarted)
}

const finish = (applied: number[], started: number): Run => ({
  rows: document.querySelectorAll('tbody tr[data-row-index]').length,
  queryUpdates: applied.length,
  counts,
  libraryUpdates,
  applyMs: applied.reduce((sum, ms) => sum + ms, 0),
  scenarioMs: performance.now() - started
})

const measure = async (scenario: Scenario): Promise<ScenarioResult> => {
  const runs: Run[] = []
  for (let i = 0; i < RUNS; i++) {
    runs.push(await once(scenario))
  }
  // Deterministic: every repetition counted the same thing.
  for (const run of runs.slice(1)) {
    expect(run.counts).toEqual(runs[0].counts)
    expect(run.rows).toBe(runs[0].rows)
    expect(run.queryUpdates).toBe(runs[0].queryUpdates)
  }
  const { rows, queryUpdates, counts: first, libraryUpdates: lib } = runs[0]
  return {
    rows,
    queryUpdates,
    counts: first,
    libraryUpdates: lib,
    timings: {
      applyMs: round(median(runs.map(run => run.applyMs))),
      scenarioMs: round(median(runs.map(run => run.scenarioMs)))
    }
  }
}

const round = (value: number) => Math.round(value * 10) / 10

const scenarios: Scenario[] = [
  {
    name: 'mount',
    pageSize: ROWS,
    mountOnly: true,
    expectedUpdates: 0,
    act: async () => {}
  },
  {
    // Six keys ("Name 1"), then Enter applies the filter: 1000 -> 112 rows.
    name: 'filter',
    pageSize: ROWS,
    expectedUpdates: 1,
    act: async () => {
      const input = document.querySelector<HTMLInputElement>(
        'th[data-field="name"] .bh-filter-input'
      )
      if (!input) {
        throw new Error('no name filter input')
      }
      await userEvent.click(input)
      await userEvent.keyboard('Name 1')
      await userEvent.keyboard('{Enter}')
    }
  },
  {
    // Name ascending, then descending: 1000 rows reordered twice.
    name: 'sort',
    pageSize: ROWS,
    expectedUpdates: 2,
    act: async applied => {
      const button = sortButton('name')
      if (!button) {
        throw new Error('no name sort button')
      }
      await userEvent.click(button)
      await expect.poll(() => applied.length).toBe(1)
      await userEvent.click(button)
    }
  },
  {
    // 100 rows a page over the same 1000: three clicks on "Next".
    name: 'page',
    pageSize: 100,
    expectedUpdates: 3,
    act: async applied => {
      for (let step = 1; step <= 3; step++) {
        const next = document.querySelector<HTMLElement>('.next-page')
        if (!next) {
          throw new Error('no next button')
        }
        await userEvent.click(next)
        await expect.poll(() => applied.length).toBe(step)
      }
    }
  }
]

for (const scenario of scenarios) {
  test(`renders: ${scenario.name}`, async ({ task }) => {
    task.meta.renders = await measure(scenario)
  })
}
