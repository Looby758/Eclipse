import { CalendarClock, Moon, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { localDate, preferencesOf } from '@core/library'
import { formatRuntime, formatShortDay, plural } from '@core/format'
import { onMyServices } from '@core/providers'
import { dayBefore, episodeMinutes, finishPlan, fitTonight, formatHours, nextFriday, nextPremiere, nextRenewal, startBy, timeLeft } from '@core/time'
import type { Provider, TitleDetails } from '@core/types'
import { useApp } from '../store/app'

type Option = { id: string; label: string; day: string }

/**
 * Time on a title page. Films: whether it fits tonight. Shows: what's left, and
 * "Finish it by Friday": pick a deadline and see how many episodes a night it takes.
 */
export default function TimeCard({ details: d }: { details: TitleDetails }): React.JSX.Element | null {
  const entry = useApp((s) => s.library.entries[d.key])
  const prefs = useApp((s) => preferencesOf(s.library))
  const setLibrary = useApp((s) => s.setLibrary)
  const [yours, setYours] = useState<Provider[]>([])
  const [localDeadline, setLocalDeadline] = useState<string | null>(null)
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(timer)
  }, [])
  useEffect(() => {
    let cancelled = false
    window.api.providers(d.type, d.id).then((r) => !cancelled && r.ok && setYours(onMyServices(r.value.data, prefs.services)))
    return () => {
      cancelled = true
    }
  }, [d.key, prefs.services.join(',')])

  const today = localDate(now)
  const left = timeLeft(d, entry, today)
  const each = d.type === 'movie' ? d.runtime || 0 : episodeMinutes(d)
  const bed = prefs.bedtime

  if (d.type === 'movie') {
    if (!d.runtime || entry?.status === 'watched') return null
    const fits = fitTonight(now, prefs, d.runtime) > 0
    return (
      <section className="time-card">
        <div className="time-head">
          <Moon size={17} />
          <h2>Tonight</h2>
        </div>
        <p className="time-line">
          {fits ? (
            <>
              It’s {formatRuntime(d.runtime)}. Start by <b>{startBy(d.runtime, prefs)}</b> to be in bed by {bed}.
            </>
          ) : (
            <>It’s {formatRuntime(d.runtime)}, longer than you’ve got before {bed} tonight.</>
          )}
        </p>
      </section>
    )
  }

  if (left.episodes === 0) return null
  const options: Option[] = [{ id: 'friday', label: `Friday ${formatShortDay(nextFriday(today)).slice(4)}`, day: nextFriday(today) }]
  const premiere = nextPremiere(d, today)
  if (premiere) options.push({ id: 'premiere', label: `Before the new season, ${formatShortDay(dayBefore(premiere))}`, day: dayBefore(premiere) })
  for (const p of yours) {
    const renews = prefs.renewals[String(p.id)]
    if (renews) {
      const day = dayBefore(nextRenewal(renews, today))
      if (day >= today) options.push({ id: `renew-${p.id}`, label: `Before ${p.name} renews, ${formatShortDay(day)}`, day })
    }
  }
  const deadline = entry ? (entry.finishBy ?? null) : localDeadline
  const choose = async (day: string | null): Promise<void> => {
    if (entry) setLibrary(await window.api.setFinishBy(d.key, day))
    else setLocalDeadline(day)
  }
  const plan = deadline && deadline >= today ? finishPlan(left, each, deadline, now, prefs) : null
  const tonightFits = fitTonight(now, prefs, each)
  const nightsLabel = (n: number): string => plural(n, 'night')

  return (
    <section className="time-card">
      <div className="time-head">
        <CalendarClock size={17} />
        <h2>Finish it by…</h2>
        <span className="muted small">
          {plural(left.episodes, 'episode')} left · {left.estimated ? 'about ' : ''}
          {formatHours(left.minutes)}
        </span>
      </div>
      <div className="deadline-chips">
        {options.map((o) => (
          <button key={o.id} className={`chip ${deadline === o.day ? 'on' : ''}`} onClick={() => choose(deadline === o.day ? null : o.day)}>
            {o.label}
          </button>
        ))}
        <label className={`chip date-chip ${deadline && !options.some((o) => o.day === deadline) ? 'on' : ''}`}>
          <span>A date</span>
          <input type="date" min={today} value={deadline ?? ''} onChange={(e) => choose(e.target.value || null)} />
        </label>
        {deadline && (
          <button className="chip clear" onClick={() => choose(null)} aria-label="Clear the deadline">
            <X size={14} />
          </button>
        )}
      </div>

      {deadline && deadline < today && <p className="time-line muted">That day has passed. Pick another.</p>}
      {plan && (
        <div className={`plan ${plan.realistic ? 'ok' : 'tight'}`}>
          {plan.nights === 0 ? (
            <p className="time-line">None of your watching nights are left before {formatShortDay(deadline)}.</p>
          ) : plan.realistic ? (
            <p className="time-line">
              <b>{plural(plan.perNight, 'episode')} a night</b> over {nightsLabel(plan.nights)} gets you there by {formatShortDay(deadline)}.
              {plan.earliestFinish && plan.earliestFinish < deadline! ? ` Watching as much as fits each evening, you’d be done ${formatShortDay(plan.earliestFinish)}.` : ''}
            </p>
          ) : (
            <p className="time-line">
              Not quite: it would take <b>{plural(plan.perNight, 'episode')} a night</b>, and only {plan.maxPerNight} fit between {prefs.startTime} and {bed}.
              {plan.earliestFinish ? ` The earliest you could finish is ${formatShortDay(plan.earliestFinish)}.` : ''}
            </p>
          )}
          <p className="muted small">
            Counting your watching nights ({prefs.watchDays.length === 7 ? 'every night' : `${plural(prefs.watchDays.length, 'night')} a week`}) and about {formatRuntime(each)} an episode. Change your evenings in Settings.
          </p>
        </div>
      )}
      {!entry && deadline && <p className="muted small">Add it to your library to keep this deadline.</p>}
      <p className="time-line tonight">
        <Moon size={14} /> {tonightFits > 0 ? `${plural(Math.min(tonightFits, left.episodes), 'episode')} ${Math.min(tonightFits, left.episodes) === 1 ? 'fits' : 'fit'} before ${bed} tonight.` : `No time left for an episode before ${bed} tonight.`}
      </p>
    </section>
  )
}
