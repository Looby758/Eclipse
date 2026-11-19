import { Clock, Play, Sparkles } from 'lucide-react'
import { useEffect, useState } from 'react'
import { preferencesOf } from '@core/library'
import { addDay, countdown, premierePosters, waitProgress, type Premiere, type ReleaseOverride } from '@core/premiere'
import { watchChoices } from '@core/watching'
import { useApp } from '../store/app'
import { usePremiereWall, type PremiereInfo } from '../lib/premiere'
import Poster from './Poster'

/**
 * Premiere night (phase 50): on the day a season you've been waiting for comes out, Home turns into
 * that show. The wall fills with its posters (never a picture from inside an episode), a ring
 * around the new season's poster fills through the day, and a countdown runs to the UK release
 * time. Then it says "It's out", with one button to start it.
 */

const SIZE = 400
const C = SIZE / 2
const R = 178

const two = (n: number): string => String(n).padStart(2, '0')

/** "Monday 24 November". */
const dayName = (day: string): string => new Date(`${day}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })

export default function PremiereNight({
  premiere: p,
  info,
  others,
  onSwitch,
  onHide,
  onSetTime
}: {
  premiere: Premiere
  info: PremiereInfo
  /** Other seasons out today, to switch to. */
  others: Premiere[]
  onSwitch(p: Premiere): void
  onHide(): void
  onSetTime(time: ReleaseOverride | null): void
}): React.JSX.Element {
  const library = useApp((s) => s.library)
  const go = useApp((s) => s.go)
  const setWall = usePremiereWall((s) => s.set)
  const [now, setNow] = useState(() => new Date())
  const [editing, setEditing] = useState(false)
  const { item, service } = p
  const d = info.details

  // The countdown ticks every second.
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  // The wall becomes this show's posters while it's on Home.
  const chosen = library.posters?.[item.key]
  useEffect(() => {
    let live = true
    const season = d?.seasons.find((s) => s.number === item.season)?.posterPath ?? null
    const seasons = (d?.seasons ?? []).filter((s) => s.number > 0).map((s) => s.posterPath)
    const show = (posters: { path: string; language: string | null }[]): void => {
      if (live) setWall(premierePosters(season, [{ path: d?.posterPath ?? item.posterPath ?? '', language: 'en' }, ...posters].filter((x) => x.path), seasons, chosen), { type: 'tv', id: item.id })
    }
    show([])
    window.api.posterOptions('tv', item.id).then((r) => show(r.ok ? r.value : []))
    return () => {
      live = false
    }
  }, [item.key, item.season, d, chosen])
  useEffect(() => () => setWall(null), [])

  const left = countdown(p.at, now)
  const ring = waitProgress(p.at, now)
  const seasonPoster = d?.seasons.find((s) => s.number === item.season)?.posterPath ?? null
  const seasonName = `Season ${item.season}`
  const where = service ? ` on ${service}` : ''
  const choices = watchChoices(library.entries[item.key], info.providers, preferencesOf(library).services)
  const start = choices.find((c) => c.service === service) ?? choices[0]
  const open = (): void => go({ name: 'title', type: 'tv', id: item.id })

  // A full circle from the top, filled as far through the wait as the day is.
  const angle = ring * 2 * Math.PI - Math.PI / 2
  const end: [number, number] = [C + R * Math.cos(angle), C + R * Math.sin(angle)]
  const arc = ring >= 1 ? null : `M${C} ${C - R} A${R} ${R} 0 ${ring > 0.5 ? 1 : 0} 1 ${end[0].toFixed(1)} ${end[1].toFixed(1)}`

  return (
    <div className={`spot-center premiere ${left.out ? 'is-out' : ''}`}>
      <div className="dial premiere-ring">
        <svg viewBox={`0 0 ${SIZE} ${SIZE}`} role="img" aria-label={left.out ? `${item.name} ${seasonName} is out` : `${Math.round(ring * 100)}% of the way to ${p.time}`}>
          <circle cx={C} cy={C} r={R} className="dial-track" />
          {ring >= 1 ? <circle cx={C} cy={C} r={R} className="premiere-fill" /> : ring > 0.002 && <path d={arc!} className="premiere-fill" />}
          {!left.out && <circle cx={end[0]} cy={end[1]} r={8} className="dial-now" />}
        </svg>
        <div className="dial-in">
          <button className="spot-poster" onClick={open} aria-label={`Open ${item.name}`}>
            <Poster path={seasonPoster ?? chosen ?? item.posterPath} type="tv" name={item.name} size="w342" />
          </button>
        </div>
      </div>

      <div className="spot-under">
        <span className="premiere-eyebrow">
          <Sparkles size={15} /> Premiere night
        </span>
        <h1>{item.name}</h1>
        {left.out ? (
          <>
            <p className="premiere-out">It’s out</p>
            <p>
              {seasonName} is out{where}
            </p>
          </>
        ) : (
          <>
            <p>
              {seasonName} · out at {p.guessed ? 'about ' : ''}
              {p.time}
              {where}
            </p>
            <div className="premiere-clock" role="timer" aria-label={`${left.hours} hours ${left.minutes} minutes to go`}>
              {left.hours > 0 && (
                <>
                  <b>{left.hours}</b>
                  <small>h</small>
                </>
              )}
              <b>{left.hours > 0 ? two(left.minutes) : left.minutes}</b>
              <small>m</small>
              <b>{two(left.seconds)}</b>
              <small>s</small>
            </div>
          </>
        )}

        <div className="spot-btns">
          {left.out ? (
            <button className="spot-btn pri premiere-go" onClick={() => (start ? void window.api.openExternal(start.url) : open())}>
              <Play size={17} /> Start {seasonName}
              {start ? ` on ${start.service}` : ''}
            </button>
          ) : (
            <button className="spot-btn pri" onClick={open}>
              Open the show
            </button>
          )}
          {left.out && (
            <button className="spot-btn" onClick={open}>
              Open the show
            </button>
          )}
          {others.slice(0, 1).map((o) => (
            <button key={o.item.key} className="spot-btn" onClick={() => onSwitch(o)}>
              Also today: {o.item.name}
            </button>
          ))}
        </div>

        <div className="premiere-small">
          {!left.out && (
            <button className="premiere-link" onClick={() => setEditing((v) => !v)} aria-expanded={editing}>
              <Clock size={13} /> {p.usual ? 'Not the right time?' : 'Change the time'}
            </button>
          )}
          <button className="premiere-link" onClick={onHide}>
            Usual Home for today
          </button>
        </div>

        {editing && !left.out && (
          <TimeForm
            premiere={p}
            onSave={(t) => {
              onSetTime(t)
              setEditing(false)
            }}
          />
        )}
      </div>
    </div>
  )
}

/** Set the UK time it's out yourself: TMDB's day or the day after, and a time. */
function TimeForm({ premiere: p, onSave }: { premiere: Premiere; onSave(t: ReleaseOverride | null): void }): React.JSX.Element {
  const first = p.item.date!
  const [day, setDay] = useState(p.day)
  const [time, setTime] = useState(p.time)
  return (
    <form
      className="premiere-time"
      onSubmit={(e) => {
        e.preventDefault()
        if (/^\d\d:\d\d$/.test(time)) onSave({ day, time })
      }}
    >
      <label>
        Out on
        <select value={day} onChange={(e) => setDay(e.target.value)}>
          {[first, addDay(first, 1)].map((d) => (
            <option key={d} value={d}>
              {dayName(d)}
            </option>
          ))}
        </select>
      </label>
      <label>
        at
        <input type="time" value={time} onChange={(e) => setTime(e.target.value)} required />
      </label>
      <span className="premiere-uk">UK time</span>
      <button type="submit" className="spot-btn pri small">
        Save
      </button>
      {!p.usual && (
        <button type="button" className="spot-btn small" onClick={() => onSave(null)}>
          Usual time
        </button>
      )}
    </form>
  )
}
