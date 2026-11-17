/**
 * Phase 41: the same keys on every screen.
 * - Arrow keys move along a row of choices (Dark / Light, the Library tabs) and pick the one you
 *   land on, like radio buttons. On a title's status buttons they only move; Enter picks.
 * - Arrow keys move between posters in a grid, by where they sit on screen.
 * - Enter and Space press whatever has focus (buttons do that already; nothing clickable is a bare div).
 * - Escape closes what's open, or goes back a page (in App.tsx).
 */

const GROUPS = '.segmented, .tabs, .status-buttons, [role="radiogroup"]'
const GRIDS = '.grid, .recs, .list-grid'

/** Typing somewhere: leave the keys alone. */
export const isTyping = (t: EventTarget | null): boolean =>
  t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement || (t instanceof HTMLElement && t.isContentEditable)

function inGroup(el: HTMLElement, key: string): boolean {
  const group = el.closest(GROUPS)
  if (!group || el.tagName !== 'BUTTON') return false
  const buttons = [...group.querySelectorAll<HTMLButtonElement>(':scope > button:not(:disabled)')]
  const i = buttons.indexOf(el as HTMLButtonElement)
  if (i < 0) return false
  const step = key === 'ArrowRight' || key === 'ArrowDown' ? 1 : key === 'ArrowLeft' || key === 'ArrowUp' ? -1 : 0
  if (!step) return false
  const next = buttons[(i + step + buttons.length) % buttons.length]
  next.focus()
  // Settings-like choices are picked as you land on them; the status buttons only move focus
  // (Enter picks one), so arrowing past them never changes a title by accident.
  if (!group.classList.contains('status-buttons')) next.click()
  return true
}

function inGrid(el: HTMLElement, key: string): boolean {
  const card = el.closest<HTMLElement>('.title-card')
  const grid = card?.closest(GRIDS)
  if (!card || !grid) return false
  const cards = [...grid.querySelectorAll<HTMLElement>('.title-card')]
  const here = card.getBoundingClientRect()
  const cx = here.left + here.width / 2
  const cy = here.top + here.height / 2
  let best: HTMLElement | null = null
  let bestScore = Infinity
  for (const c of cards) {
    if (c === card) continue
    const r = c.getBoundingClientRect()
    const dx = r.left + r.width / 2 - cx
    const dy = r.top + r.height / 2 - cy
    const along = key === 'ArrowRight' ? dx : key === 'ArrowLeft' ? -dx : key === 'ArrowDown' ? dy : -dy
    const across = key === 'ArrowRight' || key === 'ArrowLeft' ? Math.abs(dy) : Math.abs(dx)
    if (along <= 4) continue
    // Same row (or column) first, then the nearest.
    const score = across * 4 + along
    if (score < bestScore) {
      bestScore = score
      best = c
    }
  }
  if (!best) return false
  best.focus()
  best.scrollIntoView({ block: 'nearest' })
  return true
}

export function handleArrows(e: KeyboardEvent): void {
  if (!e.key.startsWith('Arrow') || e.altKey || e.ctrlKey || e.metaKey || isTyping(e.target)) return
  const el = document.activeElement
  if (!(el instanceof HTMLElement)) return
  if (inGroup(el, e.key) || inGrid(el, e.key)) e.preventDefault()
}
