import { currentRewatch, localDate, type LibraryItem } from './library'
import { foldPhone, phoneView, resolvePhone, type NewPhoneChange, type PhoneChange } from './phone'
import type { Library, LibraryEntry } from './types'

/**
 * Handing changes over between computers. The two-computer guard (guard.ts) makes a copy read-only
 * while Eclipse is open on your other computer, so the two never overwrite library.json. But some
 * changes are small and clear enough to pass across safely: ticking an episode (from the tray, the
 * phone remote or the window) and changing a title's status.
 *
 * Whatever made the change (the tray, the window, the phone remote, Claude's tools), it's worked
 * out from the library before and after, so nothing has to know it's read-only.
 *
 * A read-only copy writes those into its own file in the data folder, from-computer-<name>.json,
 * in the same shape as the phone's from-phone.json, and shows them straight away on top of the
 * library. The copy that's saving folds every computer's file into library.json and notes the ids
 * in `phoneApplied`; when that arrives back through Drive, the read-only copy tidies them out of
 * its file. Each file still has exactly one writer, so Drive never makes clashing copies, and
 * nothing waits for the other computer to close.
 *
 * If a handed-over change clashes with what was done on the saving copy (an episode already ticked
 * on another day, a title removed there), the saving copy's version is kept.
 */

export const HANDOFF_PREFIX = 'from-computer-'

/** "Loobys-MacBook-Air" → "from-computer-loobys-macbook-air.json". */
export function handoffFileName(computer: string): string {
  const slug = computer
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
  return `${HANDOFF_PREFIX}${slug || 'computer'}.json`
}

/** Only exact names: Drive's "from-computer-x (1).json" conflict copies are left alone. */
export const isHandoffFileName = (name: string): boolean => /^from-computer-[a-z0-9-]+\.json$/.test(name)

/** Gives a change an id and a time, ready to hand over. */
export const stampChange = (change: NewPhoneChange, id: string, now: Date): PhoneChange => ({ ...change, id, at: now.toISOString() } as PhoneChange)

/**
 * Folds handed-over changes into the library, oldest first. Clashes keep the saving copy's
 * version (they're marked as folded in, so they don't come back).
 */
export function foldHandoffs(library: Library, changes: PhoneChange[]): { library: Library; applied: number; kept: number } {
  const { library: folded, conflicts, applied } = foldPhone(library, changes)
  let lib = folded
  const byId = new Map(changes.map((c) => [c.id, c]))
  for (const conflict of conflicts) lib = resolvePhone(lib, byId.get(conflict.id)!, 'computer')
  return { library: lib, applied, kept: conflicts.length }
}

/** The ticks that count for a show right now: its current rewatch's, or the first watch's. */
const ticksOf = (e: LibraryEntry | undefined): Record<string, string> => (currentRewatch(e) ? currentRewatch(e)!.episodes : e?.episodes) ?? {}

const itemOf = (e: LibraryEntry): LibraryItem => ({ key: e.key, type: e.type, id: e.id, title: e.title })

/** A library with the times every change stamps taken out, for comparing what was changed. */
function bare(library: Library): string {
  const entries: Record<string, unknown> = {}
  for (const key of Object.keys(library.entries).sort()) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { updatedAt, addedAt, ...rest } = library.entries[key]
    entries[key] = rest
  }
  return JSON.stringify({ ...library, entries }, (_k, v) => (v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b))) : v))
}

/**
 * The changes that turn `before` into `after`, if they're all ones that can be handed over
 * (statuses set and episodes ticked or unticked), or null if anything else changed. Checked by
 * replaying them, so a change is only ever handed over when the other computer will make exactly
 * the same one.
 */
export function changesBetween(before: Library, after: Library, now: Date): NewPhoneChange[] | null {
  const out: NewPhoneChange[] = []
  for (const key of new Set([...Object.keys(before.entries), ...Object.keys(after.entries)])) {
    const was = before.entries[key]
    const is = after.entries[key]
    if (was === is) continue
    // Removing a title can't be handed over.
    if (!is) return null
    if (!was || was.status !== is.status) out.push({ kind: 'status', item: itemOf(is), status: is.status, was: was?.status ?? null })
    if (is.type !== 'tv') continue
    const from = ticksOf(was)
    const to = ticksOf(is)
    const added = new Map<string, string[]>()
    for (const [k, day] of Object.entries(to)) if (from[k] !== day) added.set(day, [...(added.get(day) ?? []), k])
    const removed = Object.keys(from).filter((k) => !(k in to))
    if (removed.length) out.push({ kind: 'episodes', item: itemOf(is), keys: removed, watched: false, day: localDate(now), had: !!was })
    for (const [day, keys] of added) {
      // "Seen, no date" can't be handed over.
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null
      out.push({ kind: 'episodes', item: itemOf(is), keys, watched: true, day, had: !!was })
    }
  }
  if (!out.length) return null
  const replayed = phoneView(
    before,
    out.map((c, i) => stampChange(c, `check-${i}`, now))
  )
  return bare(replayed) === bare(after) ? out : null
}
