/**
 * Text size (the window's zoom), remembered on each computer. Ctrl + and Ctrl − (⌘ on a Mac) step
 * through these sizes, Ctrl 0 goes back to normal, and Settings → Appearance picks one directly.
 */
export const ZOOM_STEPS = [0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2] as const

export const DEFAULT_ZOOM = 1

/** The nearest allowed size to any number (an old or hand-edited setting). */
export function clampZoom(z: unknown): number {
  if (typeof z !== 'number' || !Number.isFinite(z)) return DEFAULT_ZOOM
  return ZOOM_STEPS.reduce((best, s) => (Math.abs(s - z) < Math.abs(best - z) ? s : best), DEFAULT_ZOOM as number)
}

/** One step bigger (+1) or smaller (−1), stopping at either end. */
export function stepZoom(current: number, direction: 1 | -1): number {
  const i = ZOOM_STEPS.indexOf(clampZoom(current) as (typeof ZOOM_STEPS)[number])
  return ZOOM_STEPS[Math.max(0, Math.min(ZOOM_STEPS.length - 1, i + direction))]
}

/** Which zoom key a key press is, if any: Ctrl/⌘ with + or = (bigger), − or _ (smaller), or 0 (normal). */
export function zoomKey(input: { key: string; control: boolean; meta: boolean; alt: boolean; type: string }, mac: boolean): 'in' | 'out' | 'reset' | null {
  if (input.type !== 'keyDown' || input.alt || !(mac ? input.meta : input.control)) return null
  if (input.key === '+' || input.key === '=') return 'in'
  if (input.key === '-' || input.key === '_') return 'out'
  if (input.key === '0') return 'reset'
  return null
}

/** "110%". */
export const zoomLabel = (z: number): string => `${Math.round(z * 100)}%`
