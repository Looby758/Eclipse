import { Timer, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { localDate, preferencesOf } from '@core/library'
import { countdownTarget, hasCountdown, COUNTDOWNS_MAX, type CountdownTarget } from '@core/countdowns'
import { countdown as left, ukMoment } from '@core/premiere'
import type { MediaType, TitleDetails, TitleRef } from '@core/types'
import { useApp } from '../store/app'
import { usePremieres, usePremiereMode } from '../lib/premiere'
import Poster from './Poster'

/**
 * Countdowns on Home: the films and shows you chose with "Count down on Home" on their page, each
 * counting to its day (Avengers: Doomsday in 29 days). With premiere night set to "Just a
 * countdown", today's premieres count down here too, to their UK time, instead of taking over Home.
 */

interface Row {
  key: string
  type: MediaType
  id: number
  name: string
  posterPath: string | null
  /** "In cinemas · Friday 18 December". */
  line: string
  /** The moment it's out, or null when there's no date yet. */
  at: Date | null
  day: string | null
  /** A premiere tonight (counts to its time, not the day). */
  premiere: boolean
  removable: boolean
}

const two = (n: number): string => String(n).padStart(2, '0')
const dayName = (day: string): string => new Date(`${day}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: day.slice(0, 4) === String(new Date().getFullYear()) ? undefined : 'numeric' })

export default function Countdowns(): React.JSX.Element | null {
  const library = useApp((s) => s.library)
  const go = useApp((s) => s.go)
  const setLibrary = useApp((s) => s.setLibrary)
  const mode = usePremiereMode((s) => s.mode)
  const [now, setNow] = useState(() => new Date())
  const [details, setDetails] = useState<Record<string, TitleDetails>>({})
  const premieres = usePremieres(now)
  const today = localDate(now)
  const chosen = library.countdowns ?? []

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  const keys = chosen.map((r) => r.key).join(',')
  useEffect(() => {
    let live = true
    for (const r of chosen) {
      if (details[r.key]) continue
      window.api.details(r.type, r.id).then((res) => live && res.ok && setDetails((m) => ({ ...m, [r.key]: res.value.data })))
    }
    return () => {
      live = false
    }
  }, [keys])

  const rows: Row[] = []
  if (mode === 'countdown') {
    for (const p of premieres.list) {
      if (premieres.hidden(p)) continue
      rows.push({ key: `${p.item.key}:premiere`, type: 'tv', id: p.item.id, name: p.item.name, posterPath: p.item.posterPath, line: `Season ${p.item.season} · ${p.guessed ? 'about ' : ''}${p.time}${p.service ? ` on ${p.service}` : ''}`, at: p.at, day: p.day, premiere: true, removable: false })
    }
  }
  const region = preferencesOf(library).region
  for (const r of chosen) {
    const d = details[r.key]
    const target: CountdownTarget | null = d ? countdownTarget(d, today, region) : { date: null, label: '' }
    if (!target) continue
    // Already counting down above as tonight's premiere.
    if (rows.some((x) => x.premiere && x.key.startsWith(`${r.key}:`))) continue
    const line = d ? [target.label, target.date ? dayName(target.date) : 'Date not announced yet'].filter(Boolean).join(' · ') : ''
    rows.push({ key: r.key, type: r.type, id: r.id, name: d?.name ?? r.name, posterPath: d?.posterPath ?? r.posterPath, line, at: target.date ? ukMoment(target.date, '00:00') : null, day: target.date, premiere: false, removable: true })
  }
  if (!rows.length) return null

  const remove = async (r: TitleRef): Promise<void> => setLibrary(await window.api.setCountdown(r, false))

  return (
    <section className="otd countdowns" aria-label="Countdowns">
      <div className="otd-kicker">
        <Timer size={14} /> Counting down
      </div>
      <ul className="otd-list">
        {rows.map((r) => {
          const c = r.at ? left(r.at, now) : null
          // Whole days left, then the hours, minutes and seconds after them, so the two always add up.
          const days = c && !r.premiere ? Math.floor(c.hours / 24) : null
          return (
            <li key={r.key} className="cd-row">
              <button className="otd-item" onClick={() => go({ name: 'title', type: r.type, id: r.id })}>
                <span className="otd-poster cd-poster">
                  <Poster path={r.posterPath} type={r.type} id={r.id} name={r.name} size="w185" />
                </span>
                <span className="otd-text">
                  <span className="cd-name">{r.name}</span>
                  {r.line && <span className="cd-line">{r.line}</span>}
                  {c && !c.out && (
                    <span className="cd-clock" role="timer">
                      {days !== null && days >= 1 ? (
                        <>
                          <b>{days}</b> {days === 1 ? 'day' : 'days'}
                          <small>
                            {two(c.hours % 24)}:{two(c.minutes)}:{two(c.seconds)}
                          </small>
                        </>
                      ) : (
                        <b>
                          {c.hours}:{two(c.minutes)}:{two(c.seconds)}
                        </b>
                      )}
                    </span>
                  )}
                  {c?.out && <span className="cd-out">{r.premiere ? 'It’s out' : r.day === today ? 'Out today' : 'Out now'}</span>}
                </span>
              </button>
              {r.removable && (
                <button className="cd-remove" aria-label={`Stop counting down to ${r.name}`} title="Take it off Home" onClick={() => remove({ key: r.key as TitleRef['key'], type: r.type, id: r.id, name: r.name, year: null, posterPath: r.posterPath })}>
                  <X size={14} />
                </button>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}

/** "Count down on Home", on a title's page, for anything with a day coming (or announced without one). */
export function CountdownButton({ details: d, className }: { details: TitleDetails; className: string }): React.JSX.Element | null {
  const on = useApp((s) => hasCountdown(s.library, d.key))
  const full = useApp((s) => (s.library.countdowns?.length ?? 0) >= COUNTDOWNS_MAX)
  const region = useApp((s) => preferencesOf(s.library).region)
  const setLibrary = useApp((s) => s.setLibrary)
  const target = countdownTarget(d, localDate(new Date()), region)
  if (!on && (!target || (target.date && target.date < localDate(new Date())))) return null
  return (
    <button
      className={`${className} ${on ? 'lit' : ''}`}
      aria-pressed={on}
      disabled={!on && full}
      title={!on && full ? `Home has ${COUNTDOWNS_MAX} countdowns already. Take one off first.` : on ? 'Counting down on Home' : 'Count down to it on Home'}
      onClick={async () => setLibrary(await window.api.setCountdown({ key: d.key, type: d.type, id: d.id, name: d.name, year: d.year, posterPath: d.posterPath, date: d.date }, !on))}
    >
      <Timer size={13} /> {on ? 'Counting down' : 'Count down on Home'}
    </button>
  )
}
