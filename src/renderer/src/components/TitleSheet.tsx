import { ExternalLink, RefreshCw } from 'lucide-react'
import { useEffect, useState } from 'react'
import { formatDate, formatRuntime, plural } from '@core/format'
import { tmdbPageUrl } from '@core/tmdb'
import type { MediaType, TitleDetails } from '@core/types'
import { DEFAULT_GLOW, hsl, posterGlow, type Hsl } from '../lib/posterColour'
import Poster from './Poster'
import Sheet from './Sheet'
import StatusPicker from './StatusPicker'
import Credits from './Credits'
import EntryDetails from './EntryDetails'
import EpisodeTimeline from './EpisodeTimeline'
import WhereToWatch from './WhereToWatch'
import TimeCard from './TimeCard'

/** A film or show's page: a sheet over the wall, lit in the poster's own colour. */
export default function TitleSheet({ type, id }: { type: MediaType; id: number }): React.JSX.Element {
  const [details, setDetails] = useState<TitleDetails | null>(null)
  const [error, setError] = useState('')
  const [stale, setStale] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [glow, setGlow] = useState<Hsl>(DEFAULT_GLOW)

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

  useEffect(() => {
    if (details) posterGlow(details.posterPath).then(setGlow)
  }, [details?.posterPath])

  const aurora = (
    <div
      className="aurora"
      aria-hidden
      style={{
        background: `radial-gradient(800px 500px at 25% 10%, ${hsl(glow, 0.55)}, transparent 70%), radial-gradient(700px 500px at 85% 20%, ${hsl({ ...glow, h: (glow.h + 300) % 360 }, 0.4)}, transparent 70%), radial-gradient(600px 400px at 60% 100%, ${hsl({ h: 192, s: 90, l: 60 }, 0.22)}, transparent 70%)`
      }}
    />
  )

  if (!details) {
    return (
      <>
        {aurora}
        <Sheet>{error ? <p className="error">{error}</p> : <p className="muted">Loading…</p>}</Sheet>
      </>
    )
  }

  const d = details
  const facts = [
    d.year ? String(d.year) : '',
    d.genres.slice(0, 2).join(' · '),
    d.type === 'movie' ? formatRuntime(d.runtime) : '',
    d.type === 'tv' && d.numberOfSeasons ? plural(d.numberOfSeasons, 'season') : '',
    d.type === 'tv' && d.runtime ? `~${formatRuntime(d.runtime)} episodes` : '',
    d.voteAverage !== null ? `★ ${d.voteAverage.toFixed(1)}` : ''
  ].filter(Boolean)

  return (
    <>
      {aurora}
      <Sheet
        className="title-sheet"
        lifted={
          <div className="lifted-poster" style={{ boxShadow: `0 30px 70px ${hsl(glow, 0.5)}, 0 0 0 1px rgba(255,255,255,.2)` }}>
            <Poster path={d.posterPath} type={d.type} name={d.name} size="w500" />
          </div>
        }
      >
        <div className="title-head">
          <h1 className="title-name">{d.name}</h1>
          {d.originalName && <div className="muted">{d.originalName}</div>}
          <div className="title-facts">{facts.join(' · ')}</div>
          {d.tagline && <p className="tagline">{d.tagline}</p>}
          <StatusPicker details={d} />
          <EntryDetails titleKey={d.key} />
        </div>

        <div className="title-body">
          {stale && <p className="notice">Offline: showing details saved earlier.</p>}
          {error && <p className="error">{error}</p>}
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

          <TimeCard details={d} />

          {d.type === 'tv' && d.seasons.length > 0 && <EpisodeTimeline details={d} />}

          <WhereToWatch type={d.type} id={d.id} />

          <div className="title-actions">
            <button className="btn glass" onClick={() => load(true)} disabled={refreshing}>
              <RefreshCw size={15} className={refreshing ? 'spin' : ''} /> {refreshing ? 'Refreshing…' : 'Refresh from TMDB'}
            </button>
            <button className="btn glass" onClick={() => window.api.openExternal(tmdbPageUrl(d.type, d.id))}>
              <ExternalLink size={15} /> Open on TMDB
            </button>
          </div>
          <Credits justWatch />
        </div>
      </Sheet>
    </>
  )
}
