import { preferencesOf } from '@core/library'
import { eveningMinutes, formatHours } from '@core/time'
import type { Preferences } from '@core/types'
import { useApp } from '../store/app'

// Monday first, as UK calendars show it.
const DAYS: [number, string][] = [
  [1, 'Mon'],
  [2, 'Tue'],
  [3, 'Wed'],
  [4, 'Thu'],
  [5, 'Fri'],
  [6, 'Sat'],
  [0, 'Sun']
]

/** When you watch: the "Finish it by Friday" and "fits tonight" maths use these. */
export default function EveningsCard(): React.JSX.Element {
  const prefs = useApp((s) => preferencesOf(s.library))
  const setLibrary = useApp((s) => s.setLibrary)
  const save = async (patch: Partial<Preferences>): Promise<void> => setLibrary(await window.api.setPreferences(patch))
  const toggle = (d: number): Promise<void> => save({ watchDays: prefs.watchDays.includes(d) ? prefs.watchDays.filter((x) => x !== d) : [...prefs.watchDays, d] })

  return (
    <section className="card">
      <h2>Your evenings</h2>
      <p className="muted">Used to work out how much fits tonight and how many episodes a night it takes to finish something in time.</p>
      <div className="row evening-times">
        <label className="entry-field">
          <span>Start watching</span>
          <input type="time" value={prefs.startTime} onChange={(e) => e.target.value && save({ startTime: e.target.value })} />
        </label>
        <label className="entry-field">
          <span>Bedtime</span>
          <input type="time" value={prefs.bedtime} onChange={(e) => e.target.value && save({ bedtime: e.target.value })} />
        </label>
        <span className="muted small evening-length">{formatHours(eveningMinutes(prefs))} an evening</span>
      </div>
      <div className="entry-field">
        <span>Nights you usually watch</span>
        <div className="day-chips" role="group" aria-label="Nights you usually watch">
          {DAYS.map(([d, label]) => (
            <button key={d} className={`chip ${prefs.watchDays.includes(d) ? 'on' : ''}`} aria-pressed={prefs.watchDays.includes(d)} onClick={() => toggle(d)}>
              {label}
            </button>
          ))}
        </div>
      </div>
    </section>
  )
}
