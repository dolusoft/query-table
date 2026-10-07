import type { Dataset, DemoRow } from './dataset'
import { isoDate, isoDateTime, round2, seeded } from './random'

// Market quotes: the quote board of a stock exchange terminal. One row is one
// listed company with its last price.

const names = [
  ['Işıklar', 'ISI'],
  ['İpekyolu', 'IPE'],
  ['Ömür', 'OMR'],
  ['Şelale', 'SEL'],
  ['Çınar', 'CIN'],
  ['Ümran', 'UMR'],
  ['Anadolu', 'ANA'],
  ['Ege', 'EGE'],
  ['Karadeniz', 'KRD'],
  ['Toros', 'TOR'],
  ['Marmara', 'MAR'],
  ['Kuzey', 'KUZ'],
  ['Güney', 'GUN'],
  ['Yıldız', 'YLD'],
  ['Atlas', 'ATL'],
  ['Delta', 'DLT'],
  ['Vega', 'VEG'],
  ['Orion', 'ORI'],
  ['Nova', 'NOV'],
  ['Pera', 'PER']
] as const
const sectors = [
  ['Enerji', 'EN', 'Energy'],
  ['Holding', 'HO', 'Holding'],
  ['Gıda', 'GD', 'Food'],
  ['Teknoloji', 'TK', 'Technology'],
  ['Lojistik', 'LJ', 'Logistics'],
  ['Tekstil', 'TX', 'Textiles'],
  ['Turizm', 'TR', 'Tourism'],
  ['Sigorta', 'SG', 'Insurance'],
  ['Madencilik', 'MD', 'Mining'],
  ['Yazılım', 'YZ', 'Software']
] as const
const sessionDays = [16, 17, 18, 21, 22, 23, 24, 25, 28, 29, 30]

const createRows = (): DemoRow[] => {
  const random = seeded(7019)
  type Listing = [(typeof names)[number], (typeof sectors)[number]]
  const listings = names.flatMap(name =>
    sectors.map((sector): Listing => [name, sector])
  )
  // Fisher-Yates with the fixed seed: a mixed board, the same on every call.
  for (let i = listings.length - 1; i > 0; i--) {
    const j = random.int(0, i)
    ;[listings[i], listings[j]] = [listings[j], listings[i]]
  }
  return listings.map(([[name, code], [suffix, sectorCode, sector]], index) => {
    const active = random.next() > 0.08
    const session = active
      ? sessionDays[sessionDays.length - 1 - random.int(0, 1)]
      : random.pick(sessionDays.slice(0, 6))
    const quoted =
      Date.UTC(2026, 8, session, 7, 0, 0) + random.int(0, 8 * 3600) * 1000
    const draw = random.next()
    return {
      id: index + 1,
      symbol: `${code}${sectorCode}`,
      company: `${name} ${suffix}`,
      sector,
      price: round2(4 + draw * draw * 900),
      change: round2((random.next() - 0.5) * 14),
      volume: random.int(20, 24_000) * 1000 + random.int(0, 999),
      tradeDate: isoDate(quoted),
      updated: isoDateTime(quoted),
      active
    }
  })
}

const price = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
})

export const ticker: Dataset = {
  id: 'ticker',
  name: 'Market quotes',
  noun: { one: 'symbol', many: 'symbols' },
  fields: {
    primary: 'symbol',
    category: 'sector',
    count: 'volume',
    amount: 'price',
    when: 'tradeDate',
    date: 'tradeDate',
    datetime: 'updated',
    flag: 'active',
    sum: 'volume'
  },
  columns: {
    id: { field: 'id', title: 'ID', type: 'integer', width: '72px' },
    symbol: { field: 'symbol', title: 'Symbol', width: '140px' },
    company: { field: 'company', title: 'Company', width: '200px' },
    sector: { field: 'sector', title: 'Sector', width: '140px' },
    price: { field: 'price', title: 'Price', type: 'number', width: '120px' },
    change: {
      field: 'change',
      title: 'Change %',
      type: 'number',
      width: '150px'
    },
    volume: {
      field: 'volume',
      title: 'Volume',
      type: 'integer',
      width: '140px'
    },
    tradeDate: {
      field: 'tradeDate',
      title: 'Trade date',
      type: 'date',
      width: '200px'
    },
    updated: {
      field: 'updated',
      title: 'Last quote',
      type: 'datetime',
      width: '200px'
    },
    active: { field: 'active', title: 'Trading', type: 'bool', width: '120px' }
  },
  list: ['id', 'symbol', 'sector', 'price', 'change', 'volume', 'tradeDate'],
  wide: ['id', 'symbol', 'sector', 'company', 'price', 'volume', 'active'],
  showcase: [
    'id',
    'symbol',
    'company',
    'sector',
    'price',
    'change',
    'volume',
    'active'
  ],
  searchFields: ['symbol', 'company'],
  createRows,
  flagLabels: { on: 'Trading', off: 'Halted' },
  amountUnit: 'TRY, last trade',
  describe: row =>
    `${String(row.company)} (${String(row.symbol)}) trades in ${String(row.sector)}.`,
  detail: {
    title: row => `Recent trades of ${String(row.symbol)}`,
    columns: () => [
      { field: 'trade', title: 'Trade', type: 'integer' },
      { field: 'side', title: 'Side' },
      { field: 'lots', title: 'Lots', type: 'integer' },
      { field: 'price', title: 'Price', type: 'number' }
    ],
    rows: row => {
      const random = seeded(row.id * 53)
      const last = Number(row.price)
      return Array.from({ length: 2 + (row.id % 4) }, (_, index) => ({
        id: index + 1,
        trade: row.id * 1000 + index + 1,
        side: random.next() < 0.5 ? 'Buy' : 'Sell',
        lots: random.int(1, 400),
        price: round2(last * (1 + (random.next() - 0.5) / 50))
      }))
    },
    key: 'trade'
  },
  samples: {
    prefix: 'e',
    exact: 'NOVYZ',
    category: 'Energy',
    countBelow: 1_000_000,
    countAbove: 20_000_000
  },
  parser: {
    text: '*tech*,energy',
    examples: ['*tech*', 'en*,!*ing', '!mining', '42', 'abc', 'true', '*']
  },
  turkish: {
    primary: 'Sembol',
    count: 'Hacim',
    flag: 'İşlemde',
    noun: 'hisse'
  },
  hint: 'Try it: type `!mining` into Sector or `ege*,kar*` into Symbol, or pick Greater Than in the filter menu of Volume.',
  format: {
    price: value => price.format(Number(value)),
    change: value => {
      const number = Number(value)
      return `${number > 0 ? '+' : ''}${price.format(number)}%`
    },
    updated: value => String(value).replace('T', ' ')
  }
}
