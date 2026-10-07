import { describe, expect, it } from 'vitest'

import { createMarks, live } from './marks'

describe('flash marks', () => {
  it('starts a row flash in phase a and ends it after the duration', () => {
    const marks = createMarks()
    marks.flashRow(1, 100, 500, 0)
    const mark = marks.get(1)!.row!
    expect(mark).toMatchObject({ start: 100, end: 600, phase: 'a' })
    expect(live(mark, 599)).toBe(mark)
    expect(live(mark, 600)).toBeNull()
  })

  it('restarts in place: the same objects, a new generation, the other phase in a later frame', () => {
    const marks = createMarks()
    marks.flashCell(1, 'age', 0, 500, 0)
    const rowMarks = marks.get(1)!
    const mark = rowMarks.cells!.get('age')!
    const gen = mark.gen
    marks.flashCell(1, 'age', 100, 500, 1)
    expect(marks.get(1)).toBe(rowMarks)
    expect(rowMarks.cells!.get('age')).toBe(mark)
    expect(mark).toMatchObject({ start: 100, end: 600, phase: 'b' })
    expect(mark.gen).toBeGreaterThan(gen)
  })

  it('merges restarts within one frame: the phase changes once', () => {
    const marks = createMarks()
    marks.flashRow(1, 0, 500, 3)
    marks.flashRow(1, 5, 500, 4)
    marks.flashRow(1, 9, 500, 4)
    expect(marks.get(1)!.row).toMatchObject({ start: 9, phase: 'b' })
  })

  it('gives every start a generation of its own, across rows and cells', () => {
    const marks = createMarks()
    marks.flashRow(1, 0, 500, 0)
    marks.flashCell(2, 'age', 0, 500, 0)
    expect(marks.get(1)!.row!.gen).not.toBe(
      marks.get(2)!.cells!.get('age')!.gen
    )
  })

  it('drops the cell flashes of a row that flashes as new', () => {
    const marks = createMarks()
    marks.flashCell(1, 'age', 0, 500, 0)
    marks.flashRow(1, 10, 500, 1)
    expect(marks.get(1)!.cells!.size).toBe(0)
  })

  it('prunes what ends by a time and tells the nearest end left', () => {
    const marks = createMarks()
    marks.flashRow(1, 0, 100, 0)
    marks.flashCell(2, 'age', 50, 100, 0)
    marks.flashCell(2, 'name', 80, 100, 0)
    expect(marks.prune(120)).toEqual({ nearest: 150, dropped: true })
    expect(marks.get(1)).toBeUndefined()
    expect([...marks.get(2)!.cells!.keys()]).toEqual(['age', 'name'])
    expect(marks.prune(200)).toEqual({ nearest: Infinity, dropped: true })
    expect(marks.size).toBe(0)
    expect(marks.prune(300)).toEqual({ nearest: Infinity, dropped: false })
  })

  it('clears rows, cells of some fields, all cells and everything', () => {
    const marks = createMarks()
    marks.flashRow(1, 0, 100, 0)
    marks.flashCell(2, 'age', 0, 100, 0)
    marks.flashCell(2, 'name', 0, 100, 0)
    expect(marks.clearRows()).toBe(true)
    expect(marks.clearRows()).toBe(false)
    expect(marks.get(1)).toBeUndefined()
    expect(marks.clearCells(['age'])).toBe(true)
    expect([...marks.get(2)!.cells!.keys()]).toEqual(['name'])
    expect(marks.clearCells(['age'])).toBe(false)
    expect(marks.clearCells()).toBe(true)
    expect(marks.size).toBe(0)
    expect(marks.clearCells()).toBe(false)
    marks.flashRow(3, 0, 100, 0)
    expect(marks.clear()).toBe(true)
    expect(marks.clear()).toBe(false)
  })
})
