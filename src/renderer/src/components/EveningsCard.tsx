import { preferencesOf } from '@core/library'
import { Plus, X } from 'lucide-react'
import { dayMinutes, formatHours } from '@core/time'
import type { Preferences, WatchSlot } from '@core/types'
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

const HOURS = (n: number): string => (n === 0 ? 'No budget' : `About ${n} hours a week`)

/** When you watch, day by day: "fits before bed", Finish it by, Watch soon and Catch up all use these. */
export default function EveningsCard(): React.JSX.Element {
  const prefs = useApp((s) => preferencesOf(s.library))
  const setLibrary = useApp((s) => s.setLibrary)
  const save = async (patch: Partial<Preferences>): Promise<void> => setLibrary(await window.api.setPreferences(patch))
  const week = prefs.schedule
  const setDay = (d: number, slots: WatchSlot[]): Promise<void> => save({ schedule: week.map((s, i) => (i === d ? slots : s)) })
  const setSlot = (d: number, i: number, patch: Partial<WatchSlot>): Promise<void> => setDay(d, week[d].map((s, j) => (j === i ? { ...s, ...patch } : s)))
  const minutes = (d: number): number => {
    const day = `2026-11-${String(15 + d).padStart(2, '0')}` // 15 Nov 2026 is a Sunday
    return dayMinutes(day, { ...prefs, justTonight: null, windDownMinutes: 0 })
  }
  const total = [0, 1, 2, 3, 4, 5, 6].reduce((n, d) => n + minutes(d), 0)

  return (
    <section className="card">
      <h2>Your evenings</h2>
      <p className="muted">When you watch, day by day. Used for what fits tonight, how many episodes a night it takes to finish something in time, and planning Watch soon and Catch up.</p>
      <div className="week" role="group" aria-label="Your week">
        {DAYS.map(([d, label]) => {
          const slots = week[d]
          return (
            <div key={d} className={`week-day ${slots.length ? '' : 'off'}`}>
              <button
                className={`chip week-toggle ${slots.length ? 'on' : ''}`}
                aria-pressed={slots.length > 0}
                aria-label={`${label}: ${slots.length ? 'watching' : 'not watching'}`}
                onClick={() => setDay(d, slots.length ? [] : [{ start: prefs.startTime, end: prefs.bedtime }])}
              >
                {label}
              </button>
              {slots.length ? (
                <div className="week-slots">
                  {slots.map((s, i) => (
                    <span key={i} className="week-slot">
                      <input type="time" aria-label={`${label} from`} value={s.start} onChange={(e) => e.target.value && setSlot(d, i, { start: e.target.value })} />
                      <span className="muted">to</span>
                      <input type="time" aria-label={`${label} until`} value={s.end} onChange={(e) => e.target.value && setSlot(d, i, { end: e.target.value })} />
                      {slots.length > 1 && (
                        <button className="icon-btn" aria-label="Remove this time" onClick={() => setDay(d, slots.filter((_, j) => j !== i))}>
                          <X size={15} />
                        </button>
                      )}
                    </span>
                  ))}
                  {slots.length < 3 && (
                    <button className="link-btn" onClick={() => setDay(d, [...slots, slots[0].start > '16:00' ? { start: '14:00', end: '17:00' } : { start: prefs.startTime, end: prefs.bedtime }])}>
                      <Plus size={14} /> Add a time
                    </button>
                  )}
                </div>
              ) : (
                <span className="muted small">Not watching</span>
              )}
              <span className="muted small week-total">{slots.length ? formatHours(minutes(d)) : ''}</span>
            </div>
          )
        })}
      </div>
      <div className="week-actions">
        <button className="link-btn" onClick={() => save({ schedule: week.map((s, i) => (i >= 1 && i <= 5 ? week[1].map((x) => ({ ...x })) : s)) })}>
          Copy Monday to every weeknight
        </button>
        <span className="muted small">{formatHours(total)} a week</span>
      </div>
      <div className="row evening-extras">
        <label className="renewal-row">
          <span>Between episodes</span>
          <select value={prefs.gapMinutes} onChange={(e) => save({ gapMinutes: Number(e.target.value) })}>
            {[0, 5, 10, 15].map((n) => (
              <option key={n} value={n}>
                {n ? `${n} minutes` : 'No gap'}
              </option>
            ))}
          </select>
        </label>
        <label className="renewal-row">
          <span>Wind down before bed</span>
          <select value={prefs.windDownMinutes} onChange={(e) => save({ windDownMinutes: Number(e.target.value) })}>
            {[0, 15, 30, 45, 60].map((n) => (
              <option key={n} value={n}>
                {n ? `${n} minutes` : 'None'}
              </option>
            ))}
          </select>
        </label>
        <label className="renewal-row">
          <span>Weekly budget</span>
          <select value={Math.round(prefs.weeklyBudgetMinutes / 60)} onChange={(e) => save({ weeklyBudgetMinutes: Number(e.target.value) * 60 })}>
            {[...new Set([0, 5, 7, 10, 14, 20, Math.round(prefs.weeklyBudgetMinutes / 60)])].sort((a, b) => a - b).map((n) => (
              <option key={n} value={n}>
                {HOURS(n)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="muted small">With a budget, plans spread out to stay under it and Home shows how much of this week is left. Change just tonight from Home.</p>
      <label className="renewal-row stalled-row">
        <span>Ask “keep going or stop?” about a show I haven’t watched in</span>
        <select value={prefs.stalledDays} onChange={(e) => save({ stalledDays: Number(e.target.value) })}>
          {[30, 60, 90, 180, 365].map((n) => (
            <option key={n} value={n}>
              {n === 365 ? 'a year' : `${n} days`}
            </option>
          ))}
        </select>
      </label>
      <label className="renewal-row stalled-row">
        <span>Catch up before a sequel: don’t suggest it if I watched the one before in the last</span>
        <select value={prefs.catchUpSkipDays} onChange={(e) => save({ catchUpSkipDays: Number(e.target.value) })}>
          {[
            [90, '3 months'],
            [180, '6 months'],
            [365, 'year'],
            [730, '2 years'],
            [0, 'any time (always suggest it)']
          ].map(([n, label]) => (
            <option key={n} value={n}>
              {label}
            </option>
          ))}
        </select>
      </label>
    </section>
  )
}
