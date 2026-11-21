import { describe, expect, it } from 'vitest'
import { rainbowLines, rainbowOrder } from './wall'

const c = (h: number, cc = 60, l = 50) => ({ h, s: 50, l, c: cc })

describe('the rainbow wall (phase 62)', () => {
  it('orders posters round the colour wheel, greys last, unknown at the end', () => {
    const colours = { a: c(220), b: c(5), c: c(120), g: c(0, 5, 80), d: c(0, 5, 20) }
    expect(rainbowOrder(['a', 'b', 'c', 'g', 'd', 'x'], colours)).toEqual(['b', 'c', 'a', 'g', 'd', 'x'])
  })
  it('cuts the order into bands and fills each line', () => {
    const colours = { a: c(5), b: c(60), c: c(120), d: c(240) }
    expect(rainbowLines(['a', 'b', 'c', 'd'], colours, 2, 3).lines).toEqual([
      ['a', 'b', 'a'],
      ['c', 'd', 'c']
    ])
    expect(rainbowLines(['a'], colours, 3, 2).lines).toEqual([['a', 'a'], ['a', 'a'], ['a', 'a']])
  })
  it('gives each band its colour, or none for greys', () => {
    const colours = { a: c(350), b: c(10), g: c(0, 5), h: c(0, 5) }
    expect(rainbowLines(['a', 'b', 'g', 'h'], colours, 2, 2).hues).toEqual([0, null])
  })
})
