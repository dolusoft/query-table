import type { Dataset, DemoRow } from './dataset'
import { isoDate, isoDateTime, round2, seeded } from './random'

// Harbor Goods: the order desk of a home goods shop. One row is one order,
// newest last.

const customers = [
  'Işık Aksoy',
  'İpek Tunç',
  'Ömer Bulut',
  'Şule Karaca',
  'Ümit Erdem',
  'Çağla Polat',
  'Ali Güneş',
  'Elif Kurt',
  'Mert Aslan',
  'Zeynep Özkan',
  'Can Yalçın',
  'Ece Tekin',
  'Kerem Uçar',
  'Selin Avcı',
  'Barış Ateş',
  'Derya Sönmez'
]
const cities = [
  'İstanbul',
  'Ankara',
  'İzmir',
  'Bursa',
  'Antalya',
  'Eskişehir',
  'Trabzon',
  'Muğla'
]
const products = [
  ['Linen throw', 640],
  ['Oak side table', 2450],
  ['Ceramic mug set', 380],
  ['Wool rug', 3900],
  ['Desk lamp', 890],
  ['Cotton towel set', 520],
  ['Glass vase', 310],
  ['Rattan chair', 2100],
  ['Copper kettle', 1150],
  ['Bamboo shelf', 1480]
] as const
const steps = ['Packed', 'Picked up', 'In transit', 'Out for delivery']

const createRows = (): DemoRow[] => {
  const random = seeded(5309)
  let placed = Date.UTC(2026, 6, 20, 9, 0, 0)
  return Array.from({ length: 200 }, (_, index) => {
    placed += random.int(1800, 30_000) * 1000
    const [product, unit] = random.pick(products)
    const draw = random.next()
    const quantity =
      draw < 0.5 ? 1 : draw < 0.8 ? random.int(2, 3) : random.int(4, 10)
    const discount = random.next() < 0.25 ? 0.9 : 1
    return {
      id: index + 1,
      customer: random.pick(customers),
      city: random.pick(cities),
      product,
      quantity,
      total: round2(quantity * unit * discount),
      ordered: isoDate(placed),
      updatedAt: isoDateTime(placed + random.int(600, 3 * 86_400) * 1000),
      shipped: placed < Date.UTC(2026, 8, 25) ? random.next() < 0.92 : false
    }
  })
}

const money = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
})

export const harbor: Dataset = {
  id: 'harbor',
  name: 'Harbor Goods',
  kind: 'Store orders',
  noun: { one: 'order', many: 'orders' },
  fields: {
    primary: 'customer',
    category: 'city',
    count: 'quantity',
    amount: 'total',
    when: 'ordered',
    date: 'ordered',
    datetime: 'updatedAt',
    flag: 'shipped',
    sum: 'total'
  },
  columns: {
    id: { field: 'id', title: 'ID', type: 'integer', width: '72px' },
    customer: { field: 'customer', title: 'Customer', width: '150px' },
    city: { field: 'city', title: 'City', width: '130px' },
    product: { field: 'product', title: 'Product', width: '170px' },
    quantity: {
      field: 'quantity',
      title: 'Qty',
      type: 'integer',
      width: '120px'
    },
    total: { field: 'total', title: 'Total', type: 'number', width: '140px' },
    ordered: {
      field: 'ordered',
      title: 'Ordered',
      type: 'date',
      width: '200px'
    },
    updatedAt: {
      field: 'updatedAt',
      title: 'Last update',
      type: 'datetime',
      width: '200px'
    },
    shipped: {
      field: 'shipped',
      title: 'Shipped',
      type: 'bool',
      width: '130px'
    }
  },
  list: ['id', 'customer', 'city', 'product', 'quantity', 'total', 'ordered'],
  wide: ['id', 'customer', 'city', 'product', 'total', 'ordered', 'shipped'],
  showcase: [
    'id',
    'customer',
    'city',
    'product',
    'quantity',
    'total',
    'ordered',
    'shipped'
  ],
  searchFields: ['customer', 'city'],
  createRows,
  flagLabels: { on: 'Shipped', off: 'Pending' },
  amountUnit: 'TRY, incl. VAT',
  describe: row =>
    `${String(row.customer)} ordered ${String(row.product)} to ${String(row.city)}.`,
  detail: {
    title: row => `Tracking of order ${row.id}`,
    columns: () => [
      { field: 'step', title: 'Step', type: 'integer' },
      { field: 'status', title: 'Status' },
      { field: 'hub', title: 'Hub' },
      { field: 'hours', title: 'Hours', type: 'number' }
    ],
    rows: row => {
      const random = seeded(row.id * 97)
      let hours = 0
      return Array.from({ length: 2 + (row.id % 3) }, (_, index) => {
        hours = round2(hours + 1 + random.next() * 20)
        return {
          id: index + 1,
          step: index + 1,
          status: steps[index],
          hub: index === 0 ? 'Bursa' : random.pick(cities),
          hours
        }
      })
    },
    key: 'step'
  },
  samples: {
    prefix: 'e',
    exact: 'Ali Güneş',
    category: 'Ankara',
    countBelow: 2,
    countAbove: 5
  },
  parser: {
    text: '*ank*,izmir',
    examples: ['*ank*', 'ist*,!*mir', '!bursa', '42', 'abc', 'true', '*']
  },
  turkish: {
    primary: 'Müşteri',
    count: 'Adet',
    flag: 'Kargolandı',
    noun: 'sipariş'
  },
  hint: 'Try it: type `!ankara` into City or `ali*,elif*` into Customer, or pick Greater Than in the filter menu of Qty.',
  format: {
    total: value => money.format(Number(value)),
    updatedAt: value => String(value).replace('T', ' ')
  }
}
