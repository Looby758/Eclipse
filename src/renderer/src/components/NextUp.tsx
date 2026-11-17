import { Check } from 'lucide-react'
import { useEffect, useState } from 'react'
import { localDate, nextEpisodeFor, preferencesOf } from '@core/library'
import { onMyServices } from '@core/providers'
import { formatRuntime, formatShortDay, plural } from '@core/format'
import { episodeMinutes, finishPlan, fitTonight, startBy, timeLeft } from '@core/time'
import { episodeKey, type Episode, type LibraryEntry, type Provider, type TitleDetails } from '@core/types'
import { itemOf } from '../lib/item'
import { useApp } from '../store/app'

/** For a show you're watching: the next episode, where it's on, and a button to tick it. */
export default function NextUp({ entry }: { entry: LibraryEntry }): React.JSX.Element | null {
  const prefs = useApp((s) => preferencesOf(s.library))
  const services = prefs.services
  const setLibrary = useApp((s) => s.setLibrary)
  const [details, setDetails] = useState<TitleDetails | null>(null)
  const [ep, setEp] = useState<Episode | null>(null)
  const [yours, setYours] = useState<Provider[] | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    setDetails(null)
    setYours(null)
    window.api.details(entry.type, entry.id).then((r) => !cancelled && r.ok && setDetails(r.value.data))
    window.api.providers(entry.type, entry.id).then((r) => !cancelled && r.ok && setYours(onMyServices(r.value.data, services)))
    return () => {
      cancelled = true
    }
  }, [entry.key, services.join(',')])

  const next = details && entry.type === 'tv' ? nextEpisodeFor(entry, details.seasons.map((s) => ({ number: s.number, episodeCount: s.episodeCount }))) : null

  useEffect(() => {
    setEp(null)
    if (!next) return
    let cancelled = false
    window.api.season(entry.id, next.season).then((r) => {
      if (!cancelled && r.ok) setEp(r.value.data.episodes.find((e) => e.number === next.episode) ?? null)
    })
    return () => {
      cancelled = true
    }
  }, [entry.id, next?.season, next?.episode])

  const where = yours === null ? '' : yours.length ? `On ${yours.map((p) => p.name).join(' and ')}, which you have.` : 'Not on your services.'
  const now = new Date()
  const today = localDate(now)
  if (entry.type === 'movie') {
    const runtime = details?.runtime
    const timeLine = runtime ? (fitTonight(now, prefs, runtime) ? ` ${formatRuntime(runtime)}: start by ${startBy(runtime, prefs)} to be in bed by ${prefs.bedtime}.` : ` ${formatRuntime(runtime)}, too long for what’s left of tonight.`) : ''
    return where || timeLine ? <p className="hero-where">{where}{timeLine}</p> : null
  }
  if (!details || !next) return where ? <p className="hero-where">{where}</p> : null
  const aired = !ep?.airDate || ep.airDate <= today
  const left = timeLeft(details, entry, today)
  const each = episodeMinutes(details)
  const fits = Math.min(fitTonight(now, prefs, each), left.episodes)
  const plan = entry.finishBy && entry.finishBy >= today ? finishPlan(left, each, entry.finishBy, now, prefs) : null

  return (
    <div className="next-up">
      <div className="next-up-kicker">Up next</div>
      <div className="next-up-name">
        S{next.season} E{next.episode}
        {ep?.name ? ` · ${ep.name}` : ''}
        {ep?.runtime || details.runtime ? <span className="muted"> · {formatRuntime(ep?.runtime ?? details.runtime)}</span> : null}
      </div>
      {where && <div className="muted small">{where}</div>}
      <div className="next-up-time">
        {plan
          ? plan.realistic
            ? `${plural(plan.perNight, 'episode')} a night to finish by ${formatShortDay(entry.finishBy)}. `
            : `Behind for ${formatShortDay(entry.finishBy)}: the earliest you could finish is ${formatShortDay(plan.earliestFinish)}. `
          : ''}
        {fits > 0 ? `${plural(fits, 'episode')} ${fits === 1 ? 'fits' : 'fit'} before bed tonight.` : left.episodes ? 'No time left for one tonight.' : ''}
      </div>
      {aired && (
        <button
          className="btn glass next-up-tick"
          disabled={busy}
          onClick={async () => {
            setBusy(true)
            try {
              setLibrary(await window.api.setEpisodes(itemOf(details), [episodeKey(next.season, next.episode)], true))
            } finally {
              setBusy(false)
            }
          }}
        >
          <Check size={15} /> Mark S{next.season} E{next.episode} watched
        </button>
      )}
    </div>
  )
}
