// The address grammar of an `ip` column (C-118): IPv4 in dotted decimal,
// IPv6 in any RFC 4291 text form, and a CIDR prefix of either. No zone id,
// no short IPv4 form (`10.1`): the server reads neither.

/** An address as a number and its width in bits (32 or 128). */
interface Address {
  value: bigint
  bits: 32 | 128
}

const ipv4 = (text: string): bigint | null => {
  const parts = text.split('.')
  if (parts.length !== 4) {
    return null
  }
  let value = 0n
  for (const part of parts) {
    // No leading zero: `010` reads as octal in some parsers.
    if (!/^(0|[1-9]\d{0,2})$/.test(part) || Number(part) > 255) {
      return null
    }
    value = (value << 8n) | BigInt(part)
  }
  return value
}

const ipv6 = (text: string): bigint | null => {
  const halves = text.split('::')
  if (halves.length > 2) {
    return null
  }
  const groupsOf = (half: string) => (half === '' ? [] : half.split(':'))
  const head = groupsOf(halves[0])
  const tail = halves.length === 2 ? groupsOf(halves[1]) : []
  const words: bigint[] = []
  for (const [index, group] of [...head, ...tail].entries()) {
    const last = index === head.length + tail.length - 1
    // An IPv4 tail fills the last two groups (`::ffff:1.2.3.4`).
    if (last && group.includes('.')) {
      const v4 = ipv4(group)
      if (v4 === null) {
        return null
      }
      words.push(v4 >> 16n, v4 & 0xffffn)
    } else if (/^[0-9a-f]{1,4}$/i.test(group)) {
      words.push(BigInt(parseInt(group, 16)))
    } else {
      return null
    }
  }
  const missing = 8 - words.length
  // `::` stands for at least one group; without it there are eight.
  if (halves.length === 2 ? missing < 1 : missing !== 0) {
    return null
  }
  const split = halves.length === 2 ? head.length : words.length
  const all = [
    ...words.slice(0, split),
    ...Array<bigint>(missing).fill(0n),
    ...words.slice(split)
  ]
  return all.reduce((value, word) => (value << 16n) | word, 0n)
}

const addressOf = (text: string): Address | null => {
  if (text.includes(':')) {
    const value = ipv6(text)
    return value === null ? null : { value, bits: 128 }
  }
  const value = ipv4(text)
  return value === null ? null : { value, bits: 32 }
}

/** The text of an address: dotted IPv4, or IPv6 in RFC 5952 form. */
const textOf = ({ value, bits }: Address): string => {
  if (bits === 32) {
    return [24n, 16n, 8n, 0n].map(shift => (value >> shift) & 0xffn).join('.')
  }
  const words = [112n, 96n, 80n, 64n, 48n, 32n, 16n, 0n].map(shift =>
    ((value >> shift) & 0xffffn).toString(16)
  )
  // The longest run of two or more zero groups, the first on a tie, is `::`.
  let start = -1
  let length = 0
  for (let i = 0; i < 8; i++) {
    let j = i
    while (j < 8 && words[j] === '0') {
      j++
    }
    if (j - i > length && j - i > 1) {
      start = i
      length = j - i
    }
    i = Math.max(i, j)
  }
  return start < 0
    ? words.join(':')
    : `${words.slice(0, start).join(':')}::${words.slice(start + length).join(':')}`
}

/** Whether `text` is one IPv4 or IPv6 address, without spaces. */
export const isIp = (text: string): boolean => addressOf(text) !== null

/**
 * The first and the last address of the CIDR prefix `text`
 * (`10.1.0.0/16` → `10.1.0.0`, `10.1.255.255`), host bits masked; `null` when
 * `text` is not a prefix.
 */
export const rangeOfCidr = (text: string): [string, string] | null => {
  const match = /^([^/]+)\/(0|[1-9]\d{0,2})$/.exec(text)
  const address = match && addressOf(match[1])
  if (!match || !address || Number(match[2]) > address.bits) {
    return null
  }
  const host = (1n << BigInt(address.bits - Number(match[2]))) - 1n
  const first = address.value & ~host
  return [
    textOf({ value: first, bits: address.bits }),
    textOf({ value: first | host, bits: address.bits })
  ]
}

/**
 * The CIDR prefix whose range is `lower` to `upper`, or `null` when the two
 * addresses are not one prefix of one family.
 */
export const cidrOf = (lower: string, upper: string): string | null => {
  const first = addressOf(lower)
  const last = addressOf(upper)
  if (!first || !last || first.bits !== last.bits) {
    return null
  }
  const host = first.value ^ last.value
  // A prefix: the host bits are a run of ones, zero at the start, one at the end.
  if ((host & (host + 1n)) !== 0n || (first.value & host) !== 0n) {
    return null
  }
  return `${textOf(first)}/${first.bits - host.toString(2).replace(/^0$/, '').length}`
}
