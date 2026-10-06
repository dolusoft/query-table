// The cost of applyQuery on generated rows. Not a CI gate: run with
// `pnpm bench`; the numbers go into the pull request that changes the
// evaluator. Target: scenario 1 on 10k rows, median <= 50 ms.

import { describe, expect, test } from 'vitest'

import { applyQuery, defineDataset } from '../src/local'
import type { Query } from '../src/protocol/types'

interface Person {
  id: number
  name: string
  city: string
  score: number
}

// mulberry32: a small seeded generator, so every run sees the same rows.
const generator = (seed: number) => {
  let state = seed >>> 0
  return (): number => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const initials = [
  'A',
  '\u00c7',
  'D',
  'E',
  'I',
  '\u0130',
  'K',
  'M',
  '\u00d6',
  'S',
  '\u015e',
  '\u00dc',
  'Y',
  'Z'
]
const syllables = [
  'ar',
  'ka',
  'li',
  '\u011f\u0131',
  'mer',
  '\u015fe',
  'ne',
  '\u00fcl',
  '\u00e7i',
  '\u00f6n',
  '\u0131r',
  'da',
  'ya',
  'su',
  'ze',
  'yn',
  'ep',
  'tan',
  'is',
  'can',
  '\u00f6',
  '\u00fc',
  '\u015f',
  '\u0131l'
]
const cities = [
  '\u0130stanbul',
  'Ankara',
  '\u0130zmir',
  'I\u011fd\u0131r',
  '\u00c7anakkale',
  '\u015eanl\u0131urfa',
  'Mu\u011fla',
  'Eski\u015fehir',
  'Diyarbak\u0131r',
  'A\u011fr\u0131',
  'Bursa',
  'Antalya',
  'Konya',
  'Adana',
  'Trabzon',
  'Kars',
  'Sivas',
  'Ordu',
  'Rize',
  'Van'
]

/** `count` rows: a name of 6 to 14 units from Turkish syllables, a city, a score. */
const people = (count: number): Person[] => {
  const random = generator(20261006)
  const pick = <T>(list: readonly T[]): T =>
    list[Math.floor(random() * list.length)]
  const rows: Person[] = []
  for (let id = 1; id <= count; id++) {
    const length = 6 + Math.floor(random() * 9)
    let name = pick(initials)
    while (name.length < length) {
      name += pick(syllables)
    }
    rows.push({
      id,
      name: name.slice(0, length),
      city: pick(cities),
      score: Math.round(random() * 100_000) / 100
    })
  }
  return rows
}

const dataset = defineDataset<Person>({
  key: 'id',
  fields: {
    id: { type: 'integer' },
    name: { type: 'string', search: true },
    city: { type: 'string', search: true },
    score: { type: 'number' }
  }
})

const page = { page: 1, pageSize: 20 }
const scenarios: [string, Query][] = [
  [
    '(1) name Contains "ar", name asc, search "ist"',
    {
      ...page,
      sort: { field: 'name', direction: 'asc' },
      filters: [{ field: 'name', condition: 'Contains', value: 'ar' }],
      search: 'ist'
    }
  ],
  [
    '(2) search "ist" only',
    { ...page, sort: null, filters: [], search: 'ist' }
  ],
  [
    '(3) score desc only',
    { ...page, sort: { field: 'score', direction: 'desc' }, filters: [] }
  ]
]

for (const count of [10_000, 50_000]) {
  const rows = people(count)
  describe(`${String(count)} rows`, () => {
    for (const [name, query] of scenarios) {
      const result = applyQuery(rows, query, dataset, { profile: 'tr-1' })
      // The selectivity is part of the name, so it lands in every report.
      const matched = result.ok ? result.totalRows : result.error.code
      test(`${name} [${String(matched)} match]`, async ({
        annotate,
        bench
      }) => {
        expect(result.ok).toBe(true)
        const run = await bench(name, () => {
          applyQuery(rows, query, dataset, { profile: 'tr-1' })
        }).run()
        // The table has no median column; the target is a median.
        await annotate(`median ${run.latency.p50.toFixed(2)} ms`)
      })
    }
  })
}
