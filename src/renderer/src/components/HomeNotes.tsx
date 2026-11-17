import { Check, Eye, History, Hourglass, Play, Sparkles, Tv, Users, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { localDate, nextEpisodeFor, preferencesOf, watchesWith } from '@core/library'
import { comebacks, daysAfter, stalledShows, type ComebackShow } from '@core/nudges'
import { servicesNews } from '@core/services'
import { daysAgo, formatMonth, formatRuntime, formatShortDay } from '@core/format'
import type { CatchUp } from '@core/catchup'
import { onMyServices } from '@core/providers'
import type { WatchProviders } from '@core/types'
import { nextRenewal } from '@core/time'
import { episodeKey, type Episode, type LibraryEntry } from '@core/types'
import { useApp } from '../store/app'
import { useDetailsMany } from '../lib/availability'
import { useServiceHistory } from '../lib/services'
import { useNoticing } from '../lib/noticing'

const itemOf = (e: LibraryEntry): { key: LibraryEntry['key']; type: LibraryEntry['type']; id: number; title: LibraryEntry['title'] } => ({ key: e.key, type: e.type, id: e.id, title: e.title })

const label = (s: number, e: number): string => `S${s} E${e}`

/** Home: "Next with Sam: The Boys S3 E2", one card per show you're watching with someone. */
function Together(): React.JSX.Element | null {
  const library = useApp((s) => s.library)
  const { go, setLibrary } = useApp.getState()
  const shows = Object.values(library.entries).filter((e) => e.type === 'tv' && watchesWith(e).length)
  const { map } = useDetailsMany(
    shows.map((e) => e.key),
    shows.length > 0
  )
  const rows = shows.flatMap((e) =>
    watchesWith(e).map(({ index, watch }) => {
      const d = map[e.key]
      const next = d ? nextEpisodeFor({ ...e, episodes: watch.episodes }, d.seasons) : null
      return { e, index, who: watch.with, next }
    })
  )
  if (!rows.length) return null
  return (
    <section className="note" aria-label="Watching with someone">
      <div className="note-kicker">
        <Users size={14} /> Watching together
      </div>
      {rows.map(({ e, index, who, next }) => (
        <div key={`${e.key}:${index}`} className="note-line">
          <button className="note-open" onClick={() => go({ name: 'title', type: e.type, id: e.id })}>
            Next with {who}: <strong>{e.title.name}</strong>
            {next ? ` ${label(next.season, next.episode)}` : ' (all caught up)'}
          </button>
          {next && (
            <div className="row" style={{ marginTop: 6 }}>
              <button className="chip" onClick={async () => setLibrary(await window.api.tickWith(e.key, index, [episodeKey(next.season, next.episode)], true))}>
                <Check size={14} /> Watched it with {who}
              </button>
            </div>
          )}
        </div>
      ))}
    </section>
  )
}

/** Home: "Just arrived on Disney+: Andor, Loki" and "Gone from NOW TV: …", from the daily check. */
function ServicesNote(): React.JSX.Element | null {
  const library = useApp((s) => s.library)
  const { go } = useApp.getState()
  const history = useServiceHistory()
  const prefs = preferencesOf(library)
  const today = localDate(new Date())
  const news = servicesNews(history, prefs.services, today)
  // A service renewing in the next three days is worth a look, news or not.
  const renewing = prefs.services.filter((id) => {
    const day = prefs.renewals[String(id)]
    if (!day) return false
    const next = nextRenewal(day, today)
    return next <= daysAfter(today, 3)
  })
  const [names, setNames] = useState<Record<number, string>>({})
  const need = renewing.length > 0
  useEffect(() => {
    if (!need) return
    let cancelled = false
    window.api.services().then((r) => !cancelled && r.ok && setNames(Object.fromEntries(r.value.data.map((p) => [p.id, p.name]))))
    return () => {
      cancelled = true
    }
  }, [need])
  if (!news.length && !renewing.length) return null
  const name = (id: number): string => names[id] ?? history.events.find((e) => e.providerId === id)?.provider ?? 'One of your services'
  return (
    <section className="note" aria-label="Your services">
      <div className="note-kicker">
        <Tv size={14} /> Your services
      </div>
      {news.slice(0, 4).map((n) => (
        <div key={`${n.kind}:${n.providerId}`} className="note-line">
          {n.kind === 'arrived' ? 'Just arrived on' : 'Gone from'} {n.provider}:{' '}
          {n.titles.slice(0, 4).map((t, i) => {
            const [type, id] = t.key.split(':')
            return (
              <span key={t.key}>
                {i > 0 && ', '}
                <button className="note-open" onClick={() => go({ name: 'title', type: type as 'movie' | 'tv', id: Number(id) })}>
                  <strong>{t.name}</strong>
                </button>
              </span>
            )
          })}
          {n.titles.length > 4 && ` and ${n.titles.length - 4} more`}
        </div>
      ))}
      {renewing.map((id) => (
        <div key={id} className="note-line">
          <strong>{name(id)}</strong> renews {formatShortDay(nextRenewal(prefs.renewals[String(id)], today))}.
        </div>
      ))}
      <div className="row">
        <button className="chip" onClick={() => go({ name: 'services' })}>
          Do I still need them?
        </button>
      </div>
    </section>
  )
}

/** Home: shows you've drifted away from. "Keep going or stop?" */
function Stalled(): React.JSX.Element | null {
  const library = useApp((s) => s.library)
  const { go, setLibrary } = useApp.getState()
  const today = localDate(new Date())
  const watching = Object.values(library.entries).filter((e) => e.type === 'tv' && e.status === 'watching')
  const { map, checking } = useDetailsMany(
    watching.map((e) => e.key),
    watching.length > 0
  )
  if (checking) return null
  const stalled = stalledShows(library, today, preferencesOf(library).stalledDays, map).slice(0, 3)
  if (!stalled.length) return null
  const snooze = async (key: LibraryEntry['key'], days: number): Promise<void> => setLibrary(await window.api.snooze(key, daysAfter(today, days)))
  return (
    <section className="note" aria-label="Keep going or stop?">
      <div className="note-kicker">
        <Hourglass size={14} /> Keep going or stop?
      </div>
      {stalled.map(({ entry: e, days }) => (
        <div key={e.key} className="note-line">
          <button className="note-open" onClick={() => go({ name: 'title', type: e.type, id: e.id })}>
            <strong>{e.title.name}</strong>
          </button>
          : you last watched it {daysAgo(days)}.
          <div className="row" style={{ marginTop: 6 }}>
            <button
              className="chip"
              onClick={async () => {
                await snooze(e.key, preferencesOf(library).stalledDays)
                go({ name: 'title', type: e.type, id: e.id })
              }}
            >
              Keep going
            </button>
            <button className="chip" onClick={async () => setLibrary(await window.api.setStatus(itemOf(e), 'stopped'))}>
              Stop watching
            </button>
            <button className="chip" onClick={() => snooze(e.key, 14)}>
              Remind me later
            </button>
          </div>
        </div>
      ))}
    </section>
  )
}

/** The last two episodes of the season before, to jog your memory. */
function Recap({ show }: { show: ComebackShow }): React.JSX.Element | null {
  const [eps, setEps] = useState<Episode[] | null>(null)
  useEffect(() => {
    let cancelled = false
    window.api.season(show.entry.id, show.season - 1).then((r) => !cancelled && r.ok && setEps(r.value.data.episodes.slice(-2)))
    return () => {
      cancelled = true
    }
  }, [show.entry.id, show.season])
  if (!eps?.length) return null
  return (
    <>
      {eps.map((ep) => (
        <div key={ep.number} className="note-quote">
          <strong>
            S{ep.season} E{ep.number}
            {ep.name ? `, ${ep.name}` : ''}
          </strong>
          {ep.overview ? `: ${ep.overview}` : ''}
        </div>
      ))}
    </>
  )
}

/** Home: "Season 4 is out. You finished season 3 in March 2024." */
function Comebacks(): React.JSX.Element | null {
  const library = useApp((s) => s.library)
  const { go, setLibrary } = useApp.getState()
  const today = localDate(new Date())
  const shows = Object.values(library.entries).filter((e) => e.type === 'tv' && (e.status === 'watching' || e.status === 'watched') && Object.keys(e.episodes ?? {}).length)
  const { map } = useDetailsMany(
    shows.map((e) => e.key),
    shows.length > 0
  )
  const back = comebacks(library, map, today).slice(0, 2)
  if (!back.length) return null
  return (
    <>
      {back.map((b) => (
        <section key={b.entry.key} className="note" aria-label="Back after a break">
          <div className="note-kicker">
            <Sparkles size={14} /> Back after a break
          </div>
          <div className="note-line">
            <button className="note-open" onClick={() => go({ name: 'title', type: b.entry.type, id: b.entry.id })}>
              <strong>{b.entry.title.name}</strong>
            </button>
            : season {b.season} is out. You finished season {b.season - 1} in {formatMonth(b.finishedOn)}. Here’s how it ended:
          </div>
          <Recap show={b} />
          <div className="row">
            <button className="chip" onClick={() => go({ name: 'title', type: b.entry.type, id: b.entry.id })}>
              Start season {b.season}
            </button>
            <button className="chip" onClick={async () => setLibrary(await window.api.snooze(b.entry.key, daysAfter(today, 60)))}>
              Not now
            </button>
          </div>
        </section>
      ))}
    </>
  )
}

const listDays = (days: string[], today: string): string => {
  const names = days.map((d) => (d === today ? 'tonight' : formatShortDay(d)))
  return names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : (names[0] ?? '')
}

/** Home: catch up before the sequel, a few weeks before a film or new season comes out. */
function CatchUpNote(): React.JSX.Element | null {
  const library = useApp((s) => s.library)
  const { go, setLibrary } = useApp.getState()
  const [list, setList] = useState<CatchUp[]>([])
  const [where, setWhere] = useState<Record<string, WatchProviders>>({})
  const today = localDate(new Date())
  const prefs = preferencesOf(library)
  const count = Object.keys(library.entries).length
  useEffect(() => {
    let live = true
    window.api.catchUps().then((r) => {
      if (!live || !r.ok) return
      setList(r.value)
      if (r.value.length) void window.api.providersMany(r.value.map((c) => c.rewatch.key)).then((p) => live && setWhere(p))
    })
    return () => {
      live = false
    }
  }, [count, prefs.catchUpSkipDays, prefs.watchDays.join(','), prefs.bedtime, prefs.startTime])
  const no = new Set(library.catchUpDismissed ?? [])
  const shown = list.filter((c) => !no.has(c.id)).slice(0, 2)
  if (!shown.length) return null
  return (
    <>
      {shown.map((c) => {
        const r = c.rewatch
        const mine = onMyServices(where[r.key], prefs.services)
        const on = mine.length ? `, on ${mine.map((p) => p.name).join(' and ')}` : ''
        const soon = (library.watchSoon ?? []).some((x) => x.key === r.key)
        const open = (): void => go({ name: 'title', type: r.type, id: r.id })
        return (
          <section key={c.id} className="note" aria-label="Catch up before the sequel">
            <div className="note-kicker">
              <History size={14} /> Catch up before it’s out
            </div>
            {c.kind === 'film' ? (
              <div className="note-line">
                <strong>{c.upcoming.name}</strong> {c.upcoming.cinema ? 'is in cinemas' : 'comes out'} on {formatShortDay(c.upcoming.date)}.{' '}
                <button className="note-open" onClick={open}>
                  <strong>{r.name}</strong>
                </button>{' '}
                is {formatRuntime(r.minutes)}
                {on}. It fits {listDays(c.nights, today)}
                {c.late ? ', though it runs past your usual bedtime' : ''}.
                {c.lastWatched && <span className="muted"> You last saw it in {formatMonth(c.lastWatched)}.</span>}
              </div>
            ) : (
              <div className="note-line">
                <button className="note-open" onClick={open}>
                  <strong>{c.upcoming.name}</strong>
                </button>{' '}
                season {c.upcoming.season} starts {formatShortDay(c.upcoming.date)}.{' '}
                {c.partial
                  ? `All of season ${r.season} won’t fit before then, so just its last ${c.episodes} episodes (E${c.fromEpisode} to E${r.episodes})`
                  : `Rewatch season ${r.season} (${r.episodes} episodes${on})`}
                : {c.perNight} a night on {listDays(c.nights, today)}.
                {c.lastWatched && <span className="muted"> You finished it in {formatMonth(c.lastWatched)}.</span>}
              </div>
            )}
            <div className="row">
              <button
                className={`chip ${soon ? 'on' : ''}`}
                disabled={soon}
                onClick={async () => setLibrary(await window.api.setWatchSoon({ key: r.key, type: r.type, id: r.id, name: r.name, year: r.year, posterPath: r.posterPath, date: r.date ?? null }, true))}
              >
                <Check size={14} /> {soon ? 'In Watch soon' : 'Add to Watch soon'}
              </button>
              <button className="chip" onClick={async () => setLibrary(await window.api.dismissCatchUp(c.id))}>
                Not now
              </button>
            </div>
          </section>
        )
      })}
    </>
  )
}

/** Home in December (and the first week of January): your year in Eclipse is ready. */
function YearNote(): React.JSX.Element | null {
  const go = useApp((s) => s.go)
  const today = localDate(new Date())
  const month = Number(today.slice(5, 7))
  const year = month === 12 ? Number(today.slice(0, 4)) : month === 1 && Number(today.slice(8)) <= 7 ? Number(today.slice(0, 4)) - 1 : null
  if (!year) return null
  return (
    <section className="note" aria-label="Your year in Eclipse">
      <div className="note-kicker">
        <Sparkles size={14} /> Your {year} in Eclipse
      </div>
      <div className="note-line">Your hours, busiest month, longest binge and most-watched director and actor of the year.</div>
      <div className="row">
        <button className="chip" onClick={() => go({ name: 'year', year })}>
          See your year
        </button>
      </div>
    </section>
  )
}

/** Home: "Did you watch these?", from browser history and what was playing (never ticked without a yes). */
function Noticed(): React.JSX.Element | null {
  const [status, setStatus] = useNoticing()
  const { go, setLibrary } = useApp.getState()
  const library = useApp((s) => s.library)
  if (!status) return null
  const list = status.suggestions.slice(-6).reverse()
  const line = status.playing.line
  if (!list.length && !line) return null
  return (
    <section className="note" aria-label="Did you watch these?">
      {line && (
        <div className="note-line">
          <Play size={13} /> Playing now: <strong>{line}</strong>
        </div>
      )}
      {list.length > 0 && (
        <>
          <div className="note-kicker">
            <Eye size={14} /> Did you watch {list.length === 1 ? 'this' : 'these'}?
          </div>
          {list.map((s) => {
            const e = library.entries[s.key]
            return (
              <div key={s.id} className="note-line">
                <button className="note-open" onClick={() => e && go({ name: 'title', type: e.type, id: e.id })}>
                  <strong>{s.name}</strong> {label(s.season, s.episode)}
                </button>
                <span className="muted">
                  {' '}
                  {s.service ? `on ${s.service}, ` : ''}
                  {formatShortDay(s.day)}
                  {s.sure ? '' : ' (Eclipse guessed the episode)'}
                </span>
                <div className="row" style={{ marginTop: 6 }}>
                  <button className="chip" onClick={async () => setLibrary(await window.api.acceptSuggestion(s.id))}>
                    <Check size={14} /> Tick it
                  </button>
                  <button className="chip clear" onClick={async () => setStatus(await window.api.dismissSuggestion(s.id))}>
                    <X size={14} /> Not this
                  </button>
                </div>
              </div>
            )
          })}
        </>
      )}
    </section>
  )
}

/** The small cards above On this day. */
export default function HomeNotes(): React.JSX.Element {
  return (
    <>
      <Noticed />
      <YearNote />
      <Together />
      <CatchUpNote />
      <Comebacks />
      <ServicesNote />
      <Stalled />
    </>
  )
}
