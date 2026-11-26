import { foldPhone, resolvePhone, type NewPhoneChange, type PhoneChange } from './phone'
import type { Library } from './types'

/**
 * Handing changes over between computers. The two-computer guard (guard.ts) makes a copy read-only
 * while Eclipse is open on your other computer, so the two never overwrite library.json. But some
 * changes are small and clear enough to pass across safely: ticking an episode (from the tray, the
 * phone remote or the window) and changing a title's status.
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
