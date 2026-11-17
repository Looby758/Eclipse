import { Clock, MoonStar, Undo2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { preferencesOf } from '@core/library'
import { clock, formatHours, tonight } from '@core/time'
import type { WeekSoFar } from '@core/week'
import type { Preferences } from '@core/types'
import { useApp } from '../store/app'

/**
 * Just for tonight (phase 35): "Not watching tonight", "Starting late" or "Later bedtime tonight",
 * for this one evening only, plus the weekly budget's "6h of this week's 10h left".
 */
export default function JustTonight({ now, compact = false }: { now: Date; compact?: boolean }): React.JSX.Element {
  const library = useApp((s) => s.library)
  const setLibrary = useApp((s) => s.setLibrary)
  const prefs = preferencesOf(library)
  const [open, setOpen] = useState(false)
  const [week, setWeek] = useState<WeekSoFar | null>(null)
  const t = tonight(now, prefs)
  const changed = prefs.justTonight?.day === t.day ? prefs.justTonight : null

  useEffect(() => {
    let live = true
    window.api.weekBudget().then((r) => live && r.ok && setWeek(r.value))
    return () => {
      live = false
    }
  }, [library, prefs.weeklyBudgetMinutes])

  const save = async (patch: Partial<Preferences>): Promise<void> => setLibrary(await window.api.setPreferences(patch))
  const set = (j: { off?: boolean; start?: string; bedtime?: string } | null): Promise<void> =>
    save({ justTonight: j ? { day: t.day, ...(changed && !changed.off && !j.off ? { start: changed.start, bedtime: changed.bedtime } : {}), ...j } : null })

  const first = t.slots[0]
  const last = t.slots[t.slots.length - 1]
  const summary = !t.slots.length
    ? changed?.off
      ? 'Not watching tonight'
      : 'Not a watching night'
    : `Tonight ${t.slots.map((s) => `${clock(s.start)}–${clock(s.end)}`).join(' and ')}`
  const budget = week ? ` · ${week.leftMinutes ? formatHours(week.leftMinutes) : 'none'} left of your ${formatHours(week.budgetMinutes)} this week` : ''

  return (
    <div className={`just-tonight ${compact ? 'compact' : ''}`}>
      <button className="jt-summary" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <Clock size={14} /> {summary}
        {budget}
        <span className="jt-change">{changed ? 'Changed' : 'Change'}</span>
      </button>
      {open && (
        <div className="jt-panel" role="group" aria-label="Just for tonight">
          {t.slots.length > 0 && (
            <button className="chip" onClick={() => set({ off: true })}>
              <MoonStar size={15} /> Not watching tonight
            </button>
          )}
          <label className="jt-time">
            <span>{t.slots.length ? 'Starting late' : 'Watching after all, from'}</span>
            <input key={`s${JSON.stringify(changed)}`} type="time" defaultValue={changed?.start ?? (first ? clock(Math.max(first.start, t.now)) : prefs.startTime)} onBlur={(e) => e.target.value && void set({ start: e.target.value })} />
          </label>
          <label className="jt-time">
            <span>Bedtime tonight</span>
            <input key={`b${JSON.stringify(changed)}`} type="time" defaultValue={changed?.bedtime ?? (last ? clock(last.end + (prefs.windDownMinutes || 0)) : prefs.bedtime)} onBlur={(e) => e.target.value && void set({ bedtime: e.target.value })} />
          </label>
          {changed && (
            <button className="chip" onClick={() => set(null)}>
              <Undo2 size={15} /> Back to usual
            </button>
          )}
          <p className="muted small">Only for this evening; tomorrow goes back to your usual week.</p>
        </div>
      )}
    </div>
  )
}
