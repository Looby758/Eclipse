import { describe, expect, it } from 'vitest'
import { clampZoom, stepZoom, zoomKey, zoomLabel } from './zoom'

describe('text size', () => {
  it('steps up and down and stops at the ends', () => {
    expect(stepZoom(1, 1)).toBe(1.1)
    expect(stepZoom(1, -1)).toBe(0.9)
    expect(stepZoom(2, 1)).toBe(2)
    expect(stepZoom(0.67, -1)).toBe(0.67)
  })

  it('snaps odd saved values to the nearest size', () => {
    expect(clampZoom(1.12)).toBe(1.1)
    expect(clampZoom('big')).toBe(1)
    expect(clampZoom(NaN)).toBe(1)
    expect(stepZoom(1.12, 1)).toBe(1.25)
  })

  it('knows the zoom keys on each computer', () => {
    const k = (key: string, over: Partial<{ control: boolean; meta: boolean; alt: boolean; type: string }> = {}) => ({ key, control: true, meta: false, alt: false, type: 'keyDown', ...over })
    expect(zoomKey(k('='), false)).toBe('in')
    expect(zoomKey(k('+'), false)).toBe('in')
    expect(zoomKey(k('-'), false)).toBe('out')
    expect(zoomKey(k('0'), false)).toBe('reset')
    expect(zoomKey(k('0', { type: 'keyUp' }), false)).toBeNull()
    expect(zoomKey(k('k'), false)).toBeNull()
    expect(zoomKey(k('='), true)).toBeNull()
    expect(zoomKey(k('=', { control: false, meta: true }), true)).toBe('in')
    expect(zoomKey(k('=', { alt: true }), false)).toBeNull()
    expect(zoomLabel(1.25)).toBe('125%')
  })
})
