import { describe, expect, it } from 'vitest'

import { cidrOf, isIp, rangeOfCidr } from '../src/grammar/ip'

describe('C-118 IP column: addresses', () => {
  it('reads IPv4 and IPv6 addresses', () => {
    for (const text of [
      '0.0.0.0',
      '10.1.2.3',
      '255.255.255.255',
      '::',
      '::1',
      'fe80::1',
      'FE80::A',
      '2001:db8:0:0:1:0:0:1',
      '::ffff:192.168.1.70',
      '1:2:3:4:5:6:7:8'
    ]) {
      expect(isIp(text), text).toBe(true)
    }
  })

  it('refuses text that is not one address', () => {
    for (const text of [
      '',
      'abc',
      '1.70',
      '10.1',
      '256.1.1.1',
      '01.2.3.4',
      '1.2.3.4.5',
      '1.2.3.',
      ' 1.2.3.4',
      '1::2::3',
      '1:2:3:4:5:6:7:8:9',
      '1:2:3:4:5:6:7::8',
      'fe80::1%eth0',
      '12345::',
      'g::1',
      '10.1.0.0/16'
    ]) {
      expect(isIp(text), text).toBe(false)
    }
  })
})

describe('C-118 IP column: CIDR', () => {
  it('gives the first and the last address of a prefix', () => {
    expect(rangeOfCidr('10.1.0.0/16')).toEqual(['10.1.0.0', '10.1.255.255'])
    expect(rangeOfCidr('172.16.0.0/12')).toEqual([
      '172.16.0.0',
      '172.31.255.255'
    ])
    expect(rangeOfCidr('10.1.2.3/32')).toEqual(['10.1.2.3', '10.1.2.3'])
    expect(rangeOfCidr('0.0.0.0/0')).toEqual(['0.0.0.0', '255.255.255.255'])
    expect(rangeOfCidr('fe80::/10')).toEqual([
      'fe80::',
      'febf:ffff:ffff:ffff:ffff:ffff:ffff:ffff'
    ])
    expect(rangeOfCidr('2001:db8::/32')).toEqual([
      '2001:db8::',
      '2001:db8:ffff:ffff:ffff:ffff:ffff:ffff'
    ])
  })

  it('masks the host bits of the address', () => {
    expect(rangeOfCidr('10.1.2.3/16')).toEqual(['10.1.0.0', '10.1.255.255'])
  })

  it('writes IPv6 in its short form (RFC 5952)', () => {
    expect(rangeOfCidr('2001:DB8:0:0:1:0:0:1/128')).toEqual([
      '2001:db8::1:0:0:1',
      '2001:db8::1:0:0:1'
    ])
    expect(rangeOfCidr('1:0:0:2:0:0:0:3/128')?.[0]).toBe('1:0:0:2::3')
    expect(rangeOfCidr('1:0:2:3:4:5:6:7/128')?.[0]).toBe('1:0:2:3:4:5:6:7')
  })

  it('refuses a prefix that does not read', () => {
    for (const text of [
      '10.1.0.0',
      '10.1.0.0/33',
      '10.1.0.0/',
      '10.1.0.0/-1',
      '10.1.0.0/016',
      '::/129',
      'abc/8',
      '10.1.0.0/16/8'
    ]) {
      expect(rangeOfCidr(text), text).toBe(null)
    }
  })

  it('writes a range back as a prefix only when it is one', () => {
    expect(cidrOf('10.1.0.0', '10.1.255.255')).toBe('10.1.0.0/16')
    expect(cidrOf('10.1.2.3', '10.1.2.3')).toBe('10.1.2.3/32')
    expect(cidrOf('fe80::', 'febf:ffff:ffff:ffff:ffff:ffff:ffff:ffff')).toBe(
      'fe80::/10'
    )
    expect(cidrOf('10.1.0.0', '10.1.255.254')).toBe(null)
    expect(cidrOf('10.1.0.1', '10.1.255.255')).toBe(null)
    expect(cidrOf('10.1.255.255', '10.1.0.0')).toBe(null)
    expect(cidrOf('10.0.0.0', '::ffff')).toBe(null)
    expect(cidrOf('abc', '10.0.0.1')).toBe(null)
  })
})
