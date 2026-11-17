import { ExternalLink, RefreshCw } from 'lucide-react'
import { useEffect, useState } from 'react'
import { formatDate, formatRuntime, plural } from '@core/format'
import { imageUrl, tmdbPageUrl } from '@core/tmdb'
import type { MediaType, TitleDetails } from '@core/types'
import Poster from './Poster'
import StatusPicker from './StatusPicker'
import Credits from './Credits'

/** A film or show's page: poster, details and your status. */
export default function TitlePage({ type, id }: { type: MediaType; id: number }): React.JSX.Element {
  const [details, setDetails] = useState<TitleDetails | null>(null)
  const [error, setError] = useState('')
  const [stale, setStale] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  const load = async (refresh = false): Promise<void> => {
    setRefreshing(refresh)
    const r = await window.api.details(type, id, refresh)
    setRefreshing(false)
    if (r.ok) {
      setDetails(r.value.data)
      setStale(r.value.stale)
      setError('')
    } else setError(r.error)
  }

  useEffect(() => {
    load()
  }, [type, id])

  if (!details) return <div className="page">{error ? <p className="error">{error}</p> : <p className="muted">Loading…</p>}</div>

  const d = details
  const backdrop = imageUrl(d.backdropPath, 'w1280')
  const facts = [
    d.type === 'movie' ? 'Film' : 'Show',
    d.year ? String(d.year) : '',
    d.type === 'movie' ? formatRuntime(d.runtime) : d.runtime ? `${formatRuntime(d.runtime)} episodes` : '',
    d.type === 'tv' && d.numberOfSeasons ? plural(d.numberOfSeasons, 'season') : '',
    d.type === 'tv' && d.numberOfEpisodes ? plural(d.numberOfEpisodes, 'episode') : '',
    d.voteAverage !== null ? `★ ${d.voteAverage.toFixed(1)}` : ''
  ].filter(Boolean)

  return (
    <div className="title-page">
      <div className="hero">
        {backdrop && <img className="hero-backdrop" src={backdrop} alt="" draggable={false} />}
        <div className="hero-fade" />
        <div className="hero-body">
          <div className="hero-poster">
            <Poster path={d.posterPath} type={d.type} name={d.name} size="w500" />
          </div>
          <div className="hero-text">
            <h1>{d.name}</h1>
            {d.originalName && <div className="muted">{d.originalName}</div>}
            {d.tagline && <p className="tagline">{d.tagline}</p>}
            <div className="facts">
              {facts.map((f) => (
                <span key={f}>{f}</span>
              ))}
            </div>
            {d.genres.length > 0 && (
              <div className="chips">
                {d.genres.map((g) => (
                  <span className="chip" key={g}>
                    {g}
                  </span>
                ))}
              </div>
            )}
            <StatusPicker details={d} />
          </div>
        </div>
      </div>

      <div className="page title-body">
        {stale && <p className="notice">Offline: showing details saved earlier.</p>}
        {error && details && <p className="error">{error}</p>}
        {d.overview && <p className="overview">{d.overview}</p>}

        <dl className="meta-list">
          {d.date && (
            <>
              <dt>{d.type === 'movie' ? 'Released' : 'First aired'}</dt>
              <dd>{formatDate(d.date)}</dd>
            </>
          )}
          {d.status && (
            <>
              <dt>Status</dt>
              <dd>{d.status}</dd>
            </>
          )}
          {d.nextEpisode && (
            <>
              <dt>Next episode</dt>
              <dd>
                S{d.nextEpisode.season} E{d.nextEpisode.episode}
                {d.nextEpisode.name ? ` “${d.nextEpisode.name}”` : ''}
                {d.nextEpisode.airDate ? `, ${formatDate(d.nextEpisode.airDate)}` : ''}
              </dd>
            </>
          )}
          {d.collection && (
            <>
              <dt>Part of</dt>
              <dd>{d.collection.name}</dd>
            </>
          )}
        </dl>

        {d.seasons.length > 0 && (
          <section>
            <h2>Seasons</h2>
            <div className="season-row">
              {d.seasons.map((s) => (
                <div className="season" key={s.number}>
                  <Poster path={s.posterPath ?? d.posterPath} type="tv" name={s.name} size="w185" />
                  <div className="season-name">{s.name}</div>
                  <div className="muted">
                    {plural(s.episodeCount, 'episode')}
                    {s.airDate ? ` · ${s.airDate.slice(0, 4)}` : ''}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        <div className="title-actions">
          <button className="btn ghost" onClick={() => load(true)} disabled={refreshing}>
            <RefreshCw size={15} className={refreshing ? 'spin' : ''} /> {refreshing ? 'Refreshing…' : 'Refresh from TMDB'}
          </button>
          <button className="btn ghost" onClick={() => window.api.openExternal(tmdbPageUrl(d.type, d.id))}>
            <ExternalLink size={15} /> Open on TMDB
          </button>
        </div>
        <Credits />
      </div>
    </div>
  )
}
