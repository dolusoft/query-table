import type { Dataset, DemoRow } from './dataset'
import { day, isoDate, isoDateTime, seeded } from './random'

// Vigil: the alert log of a security monitoring service. One row is one
// alert a detection rule raised, in time order.

const users = [
  'Işık Demir',
  'İpek Yılmaz',
  'Ömer Kaya',
  'Şule Aydın',
  'Ümit Çelik',
  'Çağla Doğan',
  'Ali Şahin',
  'Elif Arslan',
  'Burak Koç',
  'Deniz Öztürk',
  'svc-backup',
  'svc-deploy',
  'admin'
]
const rules = [
  'Brute-force login',
  'Impossible travel',
  'Port scan',
  'Beaconing host',
  'Privilege escalation',
  'Large upload',
  'Encoded PowerShell',
  'MFA push flood',
  'New admin account',
  'DNS tunnelling'
]
const hosts = [
  'fw-edge-01',
  'dc-ank-02',
  'vpn-gw-01',
  'mail-relay-01',
  'proxy-ist-03'
]
const actions = ['deny', 'allow', 'alert', 'drop']
const ports = [22, 53, 80, 443, 445, 3389, 8080]

const severityOf = (draw: number) =>
  draw < 0.06
    ? 'Critical'
    : draw < 0.22
      ? 'High'
      : draw < 0.52
        ? 'Medium'
        : draw < 0.8
          ? 'Low'
          : 'Info'

const createRows = (): DemoRow[] => {
  const random = seeded(4113)
  let time = Date.UTC(2026, 8, 1, 0, 12, 5)
  return Array.from({ length: 200 }, (_, index) => {
    time += random.int(60, 21_600) * 1000
    const severity = severityOf(random.next())
    const weight = severity === 'Critical' ? 12 : severity === 'High' ? 6 : 2
    const internal = random.next() < 0.55
    return {
      id: index + 1,
      time: isoDateTime(time),
      user: random.pick(users),
      severity,
      sourceIp: internal
        ? `10.${random.int(0, 40)}.${random.int(0, 255)}.${random.int(1, 254)}`
        : `${random.pick(['203.0.113', '198.51.100', '192.0.2'])}.${random.int(1, 254)}`,
      rule: random.pick(rules),
      hits: random.int(1, 40) * weight,
      bytes: random.int(800, 9_800_000),
      firstSeen: isoDate(time - random.int(0, 120) * day),
      acknowledged: random.next() < (severity === 'Info' ? 0.9 : 0.55)
    }
  })
}

const megabytes = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 })

export const vigil: Dataset = {
  id: 'vigil',
  name: 'Vigil',
  kind: 'Security alerts',
  noun: { one: 'event', many: 'events' },
  fields: {
    primary: 'user',
    category: 'severity',
    count: 'hits',
    amount: 'bytes',
    when: 'time',
    date: 'firstSeen',
    datetime: 'time',
    flag: 'acknowledged',
    sum: 'bytes'
  },
  columns: {
    id: { field: 'id', title: 'ID', type: 'integer', width: '72px' },
    time: { field: 'time', title: 'Time', type: 'datetime', width: '200px' },
    user: { field: 'user', title: 'User', width: '150px' },
    severity: { field: 'severity', title: 'Severity', width: '150px' },
    sourceIp: { field: 'sourceIp', title: 'Source IP', width: '150px' },
    rule: { field: 'rule', title: 'Rule', width: '190px' },
    hits: { field: 'hits', title: 'Hits', type: 'integer', width: '110px' },
    bytes: { field: 'bytes', title: 'Bytes', type: 'number', width: '150px' },
    firstSeen: {
      field: 'firstSeen',
      title: 'First seen',
      type: 'date',
      width: '200px'
    },
    acknowledged: {
      field: 'acknowledged',
      title: 'Acked',
      type: 'bool',
      width: '130px'
    }
  },
  list: ['id', 'user', 'severity', 'hits', 'bytes', 'time'],
  wide: ['id', 'user', 'severity', 'rule', 'hits', 'bytes', 'acknowledged'],
  showcase: [
    'id',
    'user',
    'severity',
    'sourceIp',
    'hits',
    'bytes',
    'time',
    'acknowledged'
  ],
  searchFields: ['user', 'rule'],
  createRows,
  flagLabels: { on: 'Acknowledged', off: 'Open' },
  amountUnit: 'sent, per alert',
  describe: row =>
    `${String(row.user)} tripped "${String(row.rule)}" from ${String(row.sourceIp)}.`,
  detail: {
    title: row => `Raw log lines of event ${row.id}`,
    columns: () => [
      { field: 'line', title: 'Line', type: 'integer' },
      { field: 'host', title: 'Host' },
      { field: 'action', title: 'Action' },
      { field: 'port', title: 'Port', type: 'integer' }
    ],
    rows: row => {
      const random = seeded(row.id * 31)
      return Array.from({ length: 2 + (row.id % 4) }, (_, index) => ({
        id: index + 1,
        line: row.id * 100 + index + 1,
        host: random.pick(hosts),
        action: random.pick(actions),
        port: random.pick(ports)
      }))
    },
    key: 'line'
  },
  samples: {
    prefix: 'a',
    exact: 'svc-backup',
    category: 'Critical',
    countBelow: 10,
    countAbove: 300
  },
  parser: {
    text: '*crit*,high',
    examples: ['*crit*', 'hi*,!*gh', '!info', '42', 'abc', 'true', '*']
  },
  turkish: {
    primary: 'Kullanıcı',
    count: 'İsabet',
    flag: 'Onaylı',
    noun: 'olay'
  },
  hint: 'Try it: type `!info` into Severity or `svc*` into User, or pick Greater Than in the filter menu of Hits.',
  format: {
    bytes: value => `${megabytes.format(Number(value) / 1_000_000)} MB`,
    time: value => String(value).replace('T', ' ')
  }
}
