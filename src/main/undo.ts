import { describeChange } from '@core/safety'
import type { Library } from '@core/types'

/**
 * Phase 36: the last few changes, so the "Done · Undo" bar can put one back. Kept in memory only:
 * an undo is for the next few seconds, not for later.
 */

interface Step {
  id: number
  label: string
  before: Library
  after: Library
}

const steps: Step[] = []
let next = 1

export interface UndoOffer {
  id: number
  label: string
}

/** Remembers a change; returns what the bar should say, or null when nothing changed. */
export function remember(before: Library, after: Library): UndoOffer | null {
  const label = describeChange(before, after)
  if (!label) return null
  const step = { id: next++, label, before, after }
  steps.push(step)
  if (steps.length > 20) steps.shift()
  return { id: step.id, label }
}

/**
 * The library to go back to for an offer, or an error when something else has changed it since
 * (then putting the old copy back would lose that newer change too).
 */
export function undoTarget(id: number, current: Library): { ok: true; library: Library; label: string } | { ok: false; error: string } {
  const i = steps.findIndex((s) => s.id === id)
  if (i < 0) return { ok: false, error: 'That change can’t be undone any more.' }
  const step = steps[i]
  if (step.after !== current) return { ok: false, error: 'Something else has changed since, so that can’t be undone now.' }
  steps.splice(i)
  return { ok: true, library: step.before, label: step.label }
}

/**
 * A quiet change saved straight after another (noting a milestone was shown) shouldn't stop that
 * one being undone: it's carried into the step, so undoing it keeps the quiet change too.
 */
export function carryForward(before: Library, after: Library, fn: (lib: Library) => Library): void {
  const step = steps.find((s) => s.after === before)
  if (!step) return
  step.after = after
  step.before = fn(step.before)
}

export const forgetUndo = (): void => void steps.splice(0)

/**
 * A small follow-up that belongs to the last change (phase 47: how the episode you just ticked hit
 * you) keeps that change undoable: undoing the tick takes the reaction with it.
 */
export function carryUndo(before: Library, after: Library): void {
  for (const s of steps) if (s.after === before) s.after = after
}
