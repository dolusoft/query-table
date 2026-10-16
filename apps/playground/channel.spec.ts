import { describe, expect, it } from 'vitest'

import { channelHref } from './channel'

describe('playground channel URLs', () => {
  it.each(['#/overview', '#/filtering?q=name%20asc', '#/ai#ai-llms', ''])(
    'keeps the complete hash when switching both ways: %s',
    hash => {
      expect(channelHref('/query-table/', 'release', 'next', hash)).toBe(
        `/query-table/next/${hash}`
      )
      expect(channelHref('/query-table/next/', 'next', 'release', hash)).toBe(
        `/query-table/${hash}`
      )
    }
  )

  it('keeps theme and dataset parameters outside the hash', () => {
    expect(
      channelHref(
        '/query-table/next/',
        'next',
        'release',
        '#/ai#ai-llms',
        '?theme=dark'
      )
    ).toBe('/query-table/?theme=dark#/ai#ai-llms')
  })

  it('supports local hosting and selecting the current channel', () => {
    expect(channelHref('/', 'release', 'next', '#/sorting')).toBe(
      '/next/#/sorting'
    )
    expect(channelHref('/next/', 'next', 'release', '#/sorting')).toBe(
      '/#/sorting'
    )
    expect(channelHref('/query-table/next/', 'next', 'next', '#/sorting')).toBe(
      '/query-table/next/#/sorting'
    )
  })
})
