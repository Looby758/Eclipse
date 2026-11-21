import { useState } from 'react'
import { ArrowLeft, Check, ChevronDown, ExternalLink, Play } from 'lucide-react'
import { activeEntry, nextEpisodeFor, nextOutEpisodeFor, preferencesOf } from '@core/library'
import { freeElsewhere, onMyServices, JUSTWATCH_URL } from '@core/providers'
import { imageUrl, tmdbPageUrl } from '@core/tmdb'
import { formatDate, formatRuntime } from '@core/format'
import { UNDATED, episodeKey, STATUS_LABELS, WATCH_STATUSES, type MediaType, type Provider, type Season, type TitleDetails, type WatchStatus } from '@core/types'
import { usePhone } from './store'
import { getDetails, getProviders, getSeason, useLoad } from './cache'
import { Poster, epLabel, itemOf } from './ui'
import { today } from './LibraryTab'

/** A film or show: status, next episode, where to watch, and every season's episodes to tick. */
export default function TitlePage({ type, id, onBack }: { type: MediaType; id: number; onBack: () => void }): React.JSX.Element {
  const { data: d, error } = useLoad(() => getDetails(type, id), [type, id])
  const raw = usePhone((s) => s.view.entries[`${type}:${id}`])
  // The poster you chose on the computer (phase 55), if any.
  const chosen = usePhone((s) => s.view.posters?.[`${type}:${id}`])
  const entry = activeEntry(raw)
  return (
    <div className="page">
      <header className="page-bar">
        <button className="icon-btn" onClick={onBack} aria-label="Back">
          <ArrowLeft size={22} />
        </button>
        <span className="page-bar-title">{d?.name ?? entry?.title.name ?? ''}</span>
      </header>
      {error && !d && <p className="error pad">{error}</p>}
      {!d && !error && <p className="empty">Loading…</p>}
      {d && (
        <>
          <div className="hero">
            {d.backdropPath && <img className="hero-backdrop" src={imageUrl(d.backdropPath, 'w780')!} alt="" />}
            <div className="hero-row">
              <Poster path={chosen ?? d.posterPath} name={d.name} size="w342" className="hero-poster" />
              <div className="hero-text">
                <h1>{d.name}</h1>
                <p className="sub">{[d.year, type === 'tv' ? (d.numberOfSeasons ? `${d.numberOfSeasons} season${d.numberOfSeasons === 1 ? '' : 's'}` : 'Show') : formatRuntime(d.runtime), d.genres.slice(0, 2).join(', ')].filter(Boolean).join(' · ')}</p>
                {raw?.rewatches?.some((r) => !r.finishedOn && !r.with) && <p className="sub accent">Rewatching</p>}
              </div>
            </div>
          </div>
          <StatusButtons d={d} current={raw?.status ?? null} />
          {type === 'tv' && entry && entry.status !== 'want' && <NextUp d={d} />}
          <WhereToWatch type={type} id={id} />
          {d.overview && <p className="overview">{d.overview}</p>}
          {d.trailer && (
            <a className="btn ghost trailer" href={`https://www.youtube.com/watch?v=${d.trailer}`} target="_blank" rel="noreferrer">
              <Play size={16} /> Watch the trailer
            </a>
          )}
          {type === 'tv' && <Seasons d={d} />}
          <p className="credit">
            Details from <a href={tmdbPageUrl(type, id)} target="_blank" rel="noreferrer">TMDB</a>. Where to watch from <a href={JUSTWATCH_URL} target="_blank" rel="noreferrer">JustWatch</a>. This product uses the TMDB API but is not endorsed or certified by TMDB.
          </p>
        </>
      )}
    </div>
  )
}

const SHORT: Record<WatchStatus, string> = { want: 'Want', watching: 'Watching', watched: 'Watched', stopped: 'Stopped' }

function StatusButtons({ d, current }: { d: TitleDetails; current: WatchStatus | null }): React.JSX.Element {
  const act = usePhone((s) => s.act)
  const set = (status: WatchStatus): void => {
    if (status === current) return
    act({ kind: 'status', item: itemOf(d), status, was: current })
  }
  return (
    <div className="status-row" role="group" aria-label="Status">
      {WATCH_STATUSES.map((s) => (
        <button key={s} className={`chip ${current === s ? 'on' : ''}`} aria-pressed={current === s} aria-label={STATUS_LABELS[s]} onClick={() => set(s)}>
          {SHORT[s]}
        </button>
      ))}
    </div>
  )
}

function NextUp({ d }: { d: TitleDetails }): React.JSX.Element | null {
  const raw = usePhone((s) => s.view.entries[d.key])
  const act = usePhone((s) => s.act)
  const entry = activeEntry(raw)
  // Only an episode that's out: when the next one hasn't aired you're caught up.
  const next = nextOutEpisodeFor(entry, d, today())
  const { data: season } = useLoad(() => (next ? getSeason(d.id, next.season) : Promise.resolve(null)), [d.id, next?.season])
  if (!next) return <div className="card next-card">All caught up{d.nextEpisode?.airDate ? `. Next episode ${formatDate(d.nextEpisode.airDate)}.` : '.'}</div>
  const ep = season?.episodes.find((e) => e.number === next.episode)
  return (
    <div className="card next-card">
      <div>
        <span className="eyebrow">Up next</span>
        <b>
          {epLabel(next.season, next.episode)}
          {ep?.name ? ` · ${ep.name}` : ''}
        </b>
        {ep?.runtime ? <span className="sub">{formatRuntime(ep.runtime)}</span> : null}
      </div>
      <button className="btn primary" onClick={() => act({ kind: 'episodes', item: itemOf(d), keys: [episodeKey(next.season, next.episode)], watched: true, day: today(), had: !!raw })}>
        <Check size={16} /> Tick it
      </button>
    </div>
  )
}

function Logos({ list }: { list: Provider[] }): React.JSX.Element {
  return (
    <span className="logos">
      {list.map((p) => (
        <span className="logo-chip" key={p.id}>
          {p.logoPath && <img src={imageUrl(p.logoPath, 'w92')!} alt="" />}
          {p.name}
        </span>
      ))}
    </span>
  )
}

function WhereToWatch({ type, id }: { type: MediaType; id: number }): React.JSX.Element {
  const prefs = preferencesOf(usePhone((s) => s.view))
  const { data: p, error } = useLoad(() => getProviders(type, id, prefs.region), [type, id, prefs.region])
  const mine = onMyServices(p, prefs.services)
  const free = freeElsewhere(p, prefs.services)
  const others = (p?.stream ?? []).filter((s) => !prefs.services.includes(s.id))
  const rentBuy = [...new Map([...(p?.rent ?? []), ...(p?.buy ?? [])].map((x) => [x.id, x])).values()]
  return (
    <section className="card where">
      <h2>Where to watch</h2>
      {error && <p className="sub">{error}</p>}
      {!p && !error && <p className="sub">Checking…</p>}
      {p && (
        <>
          {mine.length > 0 && (
            <div className="where-line mine">
              <span>On your services</span>
              <Logos list={mine} />
            </div>
          )}
          {free.length > 0 && (
            <div className="where-line">
              <span>Free</span>
              <Logos list={free} />
            </div>
          )}
          {others.length > 0 && (
            <div className="where-line">
              <span>{mine.length ? 'Also on' : 'Streaming on'}</span>
              <Logos list={others} />
            </div>
          )}
          {rentBuy.length > 0 && (
            <div className="where-line">
              <span>Rent or buy</span>
              <Logos list={rentBuy.slice(0, 4)} />
            </div>
          )}
          {!mine.length && !free.length && !others.length && !rentBuy.length && <p className="sub">Not streaming anywhere in your country right now.</p>}
          {p.link && (
            <a className="link" href={p.link} target="_blank" rel="noreferrer">
              All the options <ExternalLink size={13} />
            </a>
          )}
        </>
      )}
    </section>
  )
}

function Seasons({ d }: { d: TitleDetails }): React.JSX.Element {
  const regular = d.seasons.filter((s) => s.number > 0)
  const specials = d.seasons.filter((s) => s.number === 0)
  const raw = usePhone((s) => s.view.entries[d.key])
  const next = nextEpisodeFor(activeEntry(raw), d.seasons)
  const [open, setOpen] = useState<number | null>(next?.season ?? regular[0]?.number ?? null)
  return (
    <section className="seasons">
      <h2>Episodes</h2>
      {[...regular, ...specials].map((s) => (
        <SeasonBlock key={s.number} d={d} season={s} open={open === s.number} onToggle={() => setOpen(open === s.number ? null : s.number)} />
      ))}
    </section>
  )
}

function SeasonBlock({ d, season, open, onToggle }: { d: TitleDetails; season: Season; open: boolean; onToggle: () => void }): React.JSX.Element {
  const raw = usePhone((s) => s.view.entries[d.key])
  const act = usePhone((s) => s.act)
  const entry = activeEntry(raw)
  const ticks = entry?.episodes ?? {}
  const seen = Array.from({ length: season.episodeCount }, (_, i) => ticks[episodeKey(season.number, i + 1)]).filter(Boolean).length
  const { data, error } = useLoad(() => (open ? getSeason(d.id, season.number) : Promise.resolve(null)), [open, d.id, season.number])
  const next = nextEpisodeFor(entry, d.seasons)
  const [offer, setOffer] = useState<{ keys: string[]; label: string } | null>(null)
  const todayDay = today()

  const tick = (keys: string[], watched: boolean): void => act({ kind: 'episodes', item: itemOf(d), keys, watched, day: todayDay, had: !!raw })

  const toggle = (n: number): void => {
    const key = episodeKey(season.number, n)
    if (ticks[key]) {
      tick([key], false)
      setOffer(null)
      return
    }
    tick([key], true)
    // Ticked one further on: offer to tick the ones before it too.
    const before = Array.from({ length: n - 1 }, (_, i) => episodeKey(season.number, i + 1)).filter((k) => !ticks[k])
    setOffer(before.length ? { keys: before, label: `Also tick the ${before.length === 1 ? 'one' : before.length} before it?` } : null)
  }

  const aired = (date: string | null): boolean => !!date && date <= todayDay
  return (
    <div className={`season ${open ? 'open' : ''}`}>
      <button className="season-head" onClick={onToggle} aria-expanded={open}>
        <b>{season.number === 0 ? 'Specials' : `Season ${season.number}`}</b>
        <span className="sub">
          {seen}/{season.episodeCount}
        </span>
        <ChevronDown size={18} className="chev" />
      </button>
      {open && (
        <div className="season-body">
          {error && <p className="error">{error}</p>}
          {!data && !error && <p className="sub">Loading…</p>}
          {data && seen < season.episodeCount && season.number > 0 && (
            <button
              className="btn ghost small"
              onClick={() =>
                tick(
                  data.episodes.filter((e) => aired(e.airDate)).map((e) => episodeKey(season.number, e.number)),
                  true
                )
              }
            >
              Tick all of season {season.number}
            </button>
          )}
          {offer && (
            <div className="offer">
              <span>{offer.label}</span>
              <button className="btn ghost small" onClick={() => setOffer(null)}>
                No
              </button>
              <button
                className="btn small"
                onClick={() => {
                  tick(offer.keys, true)
                  setOffer(null)
                }}
              >
                Tick them
              </button>
            </div>
          )}
          <ul className="episodes">
            {data?.episodes.map((e) => {
              const key = episodeKey(season.number, e.number)
              const day = ticks[key]
              const isNext = next?.season === season.number && next.episode === e.number
              // Like the computer: titles past your next episode stay hidden, so nothing's spoilt.
              const reached = !!day || isNext || !next || next.season > season.number || (next.season === season.number && next.episode > e.number)
              return (
                <li key={e.number} className={`episode ${day ? 'seen' : ''} ${isNext ? 'next' : ''}`}>
                  <button className="tick" onClick={() => toggle(e.number)} aria-pressed={!!day} aria-label={`${day ? 'Untick' : 'Tick'} ${epLabel(season.number, e.number)}`}>
                    {day && <Check size={16} />}
                  </button>
                  <span className="ep-text">
                    <b>
                      {e.number}. {reached ? e.name : `Episode ${e.number}`}
                    </b>
                    <span className="sub">
                      {day
                        ? day === UNDATED
                          ? 'Seen'
                          : `Watched ${formatDate(day)}`
                        : [e.airDate ? (aired(e.airDate) ? formatDate(e.airDate) : `Out ${formatDate(e.airDate)}`) : 'Date not known', formatRuntime(e.runtime)].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}
