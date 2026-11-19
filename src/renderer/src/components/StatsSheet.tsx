import { CalendarDays, Clapperboard, Flame, Heart, ListChecks, Repeat, Sparkles, Star, Trophy, Tv, Users } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { MilestoneTrack } from '@core/milestones'
import type { AllTimeStats } from '@core/stats'
import { STATUS_LABELS, WATCH_STATUSES } from '@core/types'
import { formatDate, formatMonth, plural } from '@core/format'
import { formatHours } from '@core/time'
import { useApp } from '../store/app'
import Sheet from './Sheet'
import Poster from './Poster'
import Credits from './Credits'
import Logo from './Logo'

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const fmt = (n: number): string => n.toLocaleString('en-GB')
/** "That's 312 hours", or "3 days 4 hours" once it's long. */
const longTime = (minutes: number): string => {
  const hours = Math.round(minutes / 60)
  if (hours < 72) return formatHours(minutes)
  const days = Math.floor(hours / 24)
  return `${plural(days, 'day')} ${plural(hours % 24, 'hour')}`
}

/** Bars like Your year's months: one per label, the biggest lit. */
function Bars({ items, label }: { items: { label: string; minutes: number; title: string }[]; label: string }): React.JSX.Element {
  const peak = Math.max(1, ...items.map((i) => i.minutes))
  const top = items.reduce((a, b, i) => (b.minutes > items[a].minutes ? i : a), 0)
  return (
    <div className="year-bars stats-bars" style={{ gridTemplateColumns: `repeat(${items.length}, 1fr)` }} aria-label={label}>
      {items.map((m, i) => (
        <div key={m.title} className={`year-bar ${m.minutes && i === top ? 'peak' : ''}`} title={`${m.title}: ${m.minutes ? formatHours(m.minutes) : 'nothing'}`}>
          <span className="year-bar-value">{m.minutes ? formatHours(m.minutes) : ''}</span>
          <span className="year-bar-fill" style={{ height: `${Math.max(m.minutes ? 4 : 0, (m.minutes / peak) * 100)}%` }} />
          <span className="year-bar-label">{m.label}</span>
        </div>
      ))}
    </div>
  )
}

/** Stats (phase 53): everything you've watched, added up over all time, and all your milestones. */
export default function StatsSheet(): React.JSX.Element {
  const go = useApp((s) => s.go)
  const library = useApp((s) => s.library)
  const [data, setData] = useState<{ stats: AllTimeStats; milestones: MilestoneTrack[] } | null>(null)
  const [error, setError] = useState('')

  // Added up again whenever the library changes (a tick on another page, or the other computer).
  useEffect(() => {
    let cancelled = false
    window.api.stats().then((r) => {
      if (cancelled) return
      if (r.ok) {
        setData(r.value)
        setError('')
      } else setError(r.error)
    })
    return () => {
      cancelled = true
    }
  }, [library])

  const open = (key: string): void => {
    const [type, id] = key.split(':')
    go({ name: 'title', type: type as 'movie' | 'tv', id: Number(id) })
  }
  const s = data?.stats

  return (
    <Sheet className="year stats">
      <div className="sheet-head">
        <h1>Your stats</h1>
        <button className="btn glass" onClick={() => go({ name: 'year' })}>
          <CalendarDays size={16} /> Your year
        </button>
      </div>
      {error && <p className="error">{error}</p>}
      {!data && !error && <p className="muted">Adding everything up…</p>}
      {s && !s.minutes && <p>Nothing watched yet. Tick an episode or mark a film as watched and it starts counting.</p>}
      {s && s.minutes > 0 && (
        <>
          <p className="muted stats-lede">
            {s.first ? `Since ${formatDate(s.first.day)}, starting with ${s.first.name}.` : ''}
            {s.undated > 0 ? ` ${fmt(s.undated)} ${s.undated === 1 ? 'watch has' : 'watches have'} no date (seen before Eclipse): they count in the totals but not in the charts.` : ''}
          </p>

          <div className="year-big">
            <div>
              <strong>{longTime(s.minutes)}</strong>
              <span>watched in all</span>
            </div>
            <div>
              <strong>{fmt(s.episodes)}</strong>
              <span>episodes of {plural(s.showsStarted, 'show')}</span>
            </div>
            <div>
              <strong>{fmt(s.films)}</strong>
              <span>{s.filmWatches > s.films ? `films, watched ${fmt(s.filmWatches)} times` : 'films'}</span>
            </div>
            <div>
              <strong>{fmt(s.days)}</strong>
              <span>days with something on</span>
            </div>
          </div>

          <div className="year-grid">
            <section className="card">
              <h2>
                <Tv size={16} /> Shows and films
              </h2>
              <p>
                <strong>{formatHours(s.showMinutes)}</strong> of shows and <strong>{formatHours(s.filmMinutes)}</strong> of films.
              </p>
              <div className="stats-split" aria-hidden>
                <span style={{ width: `${(s.showMinutes / s.minutes) * 100}%` }} />
              </div>
              {s.againMinutes > 0 && <p className="muted small">{formatHours(s.againMinutes)} of it was watching again.</p>}
              {s.perDay > 0 && <p className="muted small">About {formatHours(s.perDay)} on a day you watch.</p>}
            </section>
            <section className="card">
              <h2>
                <ListChecks size={16} /> Finished
              </h2>
              <p>
                {plural(s.showsFinished, 'show')} all the way through, and {plural(s.seasonsFinished, 'season')}.
              </p>
              {s.rewatchesFinished > 0 && <p className="muted small">{plural(s.rewatchesFinished, 'rewatch', 'rewatches')} finished.</p>}
            </section>
            <section className="card">
              <h2>
                <Flame size={16} /> Records
              </h2>
              {s.binge && (
                <p>
                  Longest binge: {plural(s.binge.episodes, 'episode')} of{' '}
                  <button className="note-open" onClick={() => open(s.binge!.key)}>
                    <strong>{s.binge.name}</strong>
                  </button>{' '}
                  on {formatDate(s.binge.day)}.
                </p>
              )}
              {s.busiestDay && (
                <p className="muted small">
                  Busiest day: {formatDate(s.busiestDay.day)}, {formatHours(s.busiestDay.minutes)}
                  {s.busiestDay.films ? ` (${plural(s.busiestDay.films, 'film')}${s.busiestDay.episodes ? `, ${plural(s.busiestDay.episodes, 'episode')}` : ''})` : ''}.
                </p>
              )}
              {s.busiestMonth && (
                <p className="muted small">
                  Busiest month: {formatMonth(`${s.busiestMonth.month}-01`)}, {formatHours(s.busiestMonth.minutes)}.
                </p>
              )}
            </section>
            <section className="card">
              <h2>
                <Sparkles size={16} /> Days in a row
              </h2>
              {s.longestStreak && (
                <p>
                  Longest: <strong>{plural(s.longestStreak.days, 'day')}</strong>
                  {s.longestStreak.days > 1 ? `, ${formatDate(s.longestStreak.from)} to ${formatDate(s.longestStreak.to)}` : ''}.
                </p>
              )}
              <p className="muted small">{s.currentStreak > 1 ? `You’re on ${s.currentStreak} days in a row right now.` : s.currentStreak === 1 ? 'Something on yesterday or today: keep it going.' : 'Nothing on yesterday or today.'}</p>
            </section>
            <section className="card">
              <h2>
                <Heart size={16} /> Your library
              </h2>
              <p>
                {fmt(s.library.titles)} titles: {plural(s.library.shows, 'show')} and {plural(s.library.films, 'film')}.
              </p>
              <p className="muted small">{WATCH_STATUSES.map((st) => `${STATUS_LABELS[st]} ${fmt(s.statuses[st])}`).join(' · ')}</p>
            </section>
            {s.ratings.count > 0 && (
              <section className="card">
                <h2>
                  <Star size={16} /> Ratings
                </h2>
                <p>
                  {plural(s.ratings.count, 'rating')}, {s.ratings.average} out of 10 on average.
                </p>
                <p className="muted small">
                  Highest:{' '}
                  {s.ratings.top.map((t, i) => (
                    <span key={t.key}>
                      {i > 0 && ', '}
                      <button className="note-open" onClick={() => open(t.key)}>
                        {t.name}
                      </button>{' '}
                      ({t.rating})
                    </span>
                  ))}
                </p>
              </section>
            )}
            {s.people.length > 0 && (
              <section className="card">
                <h2>
                  <Users size={16} /> Watching with
                </h2>
                {s.people.slice(0, 4).map((p) => (
                  <p key={p.name}>
                    <strong>{p.name}</strong>: {formatHours(p.minutes)}
                    <span className="muted small"> · {p.titles.slice(0, 3).join(', ')}{p.titles.length > 3 ? ` and ${p.titles.length - 3} more` : ''}</span>
                  </p>
                ))}
              </section>
            )}
          </div>

          <section className="card year-months">
            <h2>The last 12 months</h2>
            <Bars label="Hours by month" items={s.months.map((m) => ({ label: MONTHS[Number(m.month.slice(5)) - 1], minutes: m.minutes, title: formatMonth(`${m.month}-01`) }))} />
          </section>
          <div className="year-grid">
            <section className="card year-months">
              <h2>Nights of the week</h2>
              <Bars label="Hours by weekday" items={s.weekdays.map((m, i) => ({ label: WEEKDAYS[i], minutes: m, title: WEEKDAYS[i] }))} />
            </section>
            {s.byYear.length > 1 && (
              <section className="card year-months">
                <h2>Year by year</h2>
                <Bars label="Hours by year" items={s.byYear.slice(-8).map((y) => ({ label: String(y.year), minutes: y.minutes, title: `${y.year}: ${plural(y.episodes, 'episode')}, ${plural(y.films, 'film')}` }))} />
              </section>
            )}
          </div>

          {s.topShows.length > 0 && (
            <>
              <h2 className="list-sub">Shows you’ve spent longest with</h2>
              <div className="year-top">
                {s.topShows.map((t, i) => (
                  <button key={t.key} className="year-top-item" onClick={() => open(t.key)}>
                    <span className="year-rank">{i + 1}</span>
                    <span className="year-top-poster">
                      <Poster path={t.posterPath} type={t.type} id={Number(t.key.split(':')[1])} name={t.name} size="w185" />
                    </span>
                    <span className="year-top-name">{t.name}</span>
                    <span className="muted small">
                      {formatHours(t.minutes)} · {plural(t.count, 'episode')}
                    </span>
                  </button>
                ))}
              </div>
            </>
          )}
          {s.topFilms.length > 0 && (
            <>
              <h2 className="list-sub">Films you keep coming back to</h2>
              <div className="year-top">
                {s.topFilms.map((t) => (
                  <button key={t.key} className="year-top-item" onClick={() => open(t.key)}>
                    <span className="year-top-poster">
                      <Poster path={t.posterPath} type={t.type} id={Number(t.key.split(':')[1])} name={t.name} size="w185" />
                    </span>
                    <span className="year-top-name">{t.name}</span>
                    <span className="muted small">
                      <Repeat size={12} /> {t.count} times
                    </span>
                  </button>
                ))}
              </div>
            </>
          )}

          <div className="year-grid">
            {s.genres.length > 0 && (
              <section className="card">
                <h2>
                  <Clapperboard size={16} /> Genres
                </h2>
                <ul className="stats-rows">
                  {s.genres.map((g) => (
                    <li key={g.name}>
                      <span className="stats-row-name">{g.name}</span>
                      <span className="stats-row-bar">
                        <span style={{ width: `${(g.minutes / s.genres[0].minutes) * 100}%` }} />
                      </span>
                      <span className="muted small">{formatHours(g.minutes)}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {s.decades.length > 0 && (
              <section className="card">
                <h2>
                  <CalendarDays size={16} /> By decade made
                </h2>
                <ul className="stats-rows">
                  {s.decades.map((d) => (
                    <li key={d.decade}>
                      <span className="stats-row-name">{d.decade}s</span>
                      <span className="stats-row-bar">
                        <span style={{ width: `${(d.titles / Math.max(...s.decades.map((x) => x.titles))) * 100}%` }} />
                      </span>
                      <span className="muted small">{plural(d.titles, 'title')}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>

          <Milestones tracks={data!.milestones} open={open} />
        </>
      )}
      <Credits />
    </Sheet>
  )
}

/** Every milestone: what you've reached in each, and how far to the next. */
function Milestones({ tracks, open }: { tracks: MilestoneTrack[]; open: (key: string) => void }): React.JSX.Element | null {
  const [openId, setOpenId] = useState<string | null>(null)
  if (!tracks.length) return null
  const total = tracks.reduce((a, t) => a + t.reached.length, 0)
  const kinds = [...new Set(tracks.map((t) => t.kind))]
  return (
    <section className="stats-milestones" aria-label="Milestones">
      <h2 className="list-sub">
        <Trophy size={18} /> Milestones <span className="muted small">{fmt(total)} reached</span>
      </h2>
      <div className="year-grid">
        {kinds.map((kind) => {
          const list = tracks.filter((t) => t.kind === kind)
          return (
            <section key={kind} className="card milestone-card">
              <h3>{list[0].title}</h3>
              {list.map((t) => {
                const lastStep = t.reached[t.reached.length - 1] ?? 0
                const pct = Math.min(100, ((t.value - lastStep) / Math.max(1, t.next - lastStep)) * 100)
                return (
                  <div key={t.id} className="milestone-track">
                    <div className="milestone-track-head">
                      {t.reached.length > 0 && (
                        <span className="milestone-badge" aria-hidden>
                          <Logo size={16} />
                        </span>
                      )}
                      {t.key ? (
                        <button className="note-open milestone-track-label" onClick={() => open(t.key!)}>
                          {t.label}
                        </button>
                      ) : (
                        <span className="milestone-track-label">{t.label}</span>
                      )}
                    </div>
                    <div className="stats-row-bar milestone-progress" title={`${fmt(t.next - t.value)} to go`}>
                      <span style={{ width: `${pct}%` }} />
                    </div>
                    <div className="milestone-track-foot muted small">
                      <span>Next: {fmt(t.next)}</span>
                      {t.notes.length > 0 && (
                        <button className="link-btn" onClick={() => setOpenId(openId === t.id ? null : t.id)} aria-expanded={openId === t.id}>
                          {openId === t.id ? 'Hide' : `${t.notes.length} reached`}
                        </button>
                      )}
                    </div>
                    {openId === t.id && (
                      <ul className="milestone-notes">
                        {t.notes.map((n) => (
                          <li key={n}>{n}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                )
              })}
            </section>
          )
        })}
      </div>
    </section>
  )
}
