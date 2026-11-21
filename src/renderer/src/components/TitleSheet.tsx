import TrailerButton from './TrailerButton'
import { ChartNoAxesGantt, ExternalLink, Image as ImageIcon, Popcorn, RefreshCw } from 'lucide-react'
import { useEffect, useState } from 'react'
import { formatDate, formatRuntime, plural, stingerLine } from '@core/format'
import { tmdbPageUrl } from '@core/tmdb'
import type { MediaType, TitleDetails } from '@core/types'
import { DEFAULT_GLOW, hsl, posterGlow, type Hsl } from '../lib/posterColour'
import Poster from './Poster'
import PosterPicker from './PosterPicker'
import { FavouriteButton } from './ShelfSheet'
import { CountdownButton } from './Countdowns'
import JourneyRibbon from './JourneyRibbon'
import MyTerms from './MyTerms'
import { onTimeline } from '@core/timeline'
import { journeyOf } from '@core/journey'
import { useApp } from '../store/app'
import Sheet from './Sheet'
import StatusPicker from './StatusPicker'
import WatchSoonToggle from './WatchSoonToggle'
import Credits from './Credits'
import EntryDetails from './EntryDetails'
import RewatchPanel from './RewatchPanel'
import WatchWithPanel from './WatchWithPanel'
import EpisodeTimeline from './EpisodeTimeline'
import WhereToWatch from './WhereToWatch'
import TimeCard from './TimeCard'
import Heatmap from './Heatmap'
import TitleLinks from './TitleLinks'
import ContinueButton from './ContinueButton'
import MomentsPanel from './MomentsPanel'
import type { EpisodeFocus } from './EpisodeTimeline'

/** A film or show's page: a sheet over the wall, lit in the poster's own colour. */
export default function TitleSheet({ type, id }: { type: MediaType; id: number }): React.JSX.Element {
  const [details, setDetails] = useState<TitleDetails | null>(null)
  const [error, setError] = useState('')
  const [stale, setStale] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [glow, setGlow] = useState<Hsl>(DEFAULT_GLOW)
  const [focus, setFocus] = useState<EpisodeFocus | null>(null)
  const chosenPoster = useApp((s) => s.library.posters?.[`${type}:${id}`])
  const library = useApp((s) => s.library)
  const [picking, setPicking] = useState(false)

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
    if (details) posterGlow(chosenPoster ?? details.posterPath).then(setGlow)
  }, [details?.posterPath, chosenPoster])

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
            <Poster path={d.posterPath} type={d.type} id={d.id} name={d.name} size="w500" />
            <button className="poster-change" onClick={() => setPicking(!picking)}>
              <ImageIcon size={13} /> Change poster
            </button>
          </div>
        }
      >
        <div className="title-head">
          <h1 className="title-name">{d.name}</h1>
          {d.originalName && <div className="muted">{d.originalName}</div>}
          <div className="title-facts">{facts.join(' · ')}</div>
          {d.tagline && <p className="tagline">{d.tagline}</p>}
          {stingerLine(d.stingers) && (
            <p className="stinger">
              <Popcorn size={15} /> {stingerLine(d.stingers)}
            </p>
          )}
          <StatusPicker details={d} />
          <WatchSoonToggle details={d} />
          <TrailerButton className="btn glass fav-toggle" details={d} />
          <CountdownButton className="btn glass fav-toggle" details={d} />
          <FavouriteButton className="btn glass fav-toggle" title={{ key: d.key, type: d.type, id: d.id, name: d.name, year: d.year, posterPath: d.posterPath, date: d.date }} />
          {onTimeline(library.entries[d.key]) && (
            <button className="btn glass fav-toggle" onClick={() => useApp.getState().go({ name: 'timeline', focus: d.key })}>
              <ChartNoAxesGantt size={16} /> On my timeline
            </button>
          )}
          <MyTerms titleKey={d.key} />
          <div className="row" style={{ marginTop: 10 }}>
            <ContinueButton titleKey={d.key} />
          </div>
          <EntryDetails titleKey={d.key} />
          <RewatchPanel details={d} />
          <WatchWithPanel details={d} />
        </div>

        <div className="title-body">
          <JourneyCard details={d} />
          {picking && (
            <section className="card">
              <div className="row spread">
                <h2>Change poster</h2>
                <button className="link-btn" onClick={() => setPicking(false)}>
                  Done
                </button>
              </div>
              <PosterPicker details={d} />
            </section>
          )}
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
                <dd>
                  <button className="link-btn inline" onClick={() => useApp.getState().go({ name: 'list', id: `collection:${d.collection!.id}` })}>
                    {d.collection.name}
                  </button>
                </dd>
              </>
            )}
          </dl>

          <TimeCard details={d} />

          {d.type === 'tv' && d.seasons.length > 0 && (
            <>
              <Heatmap details={d} onPick={(season, episode) => setFocus((f) => ({ season, episode, n: (f?.n ?? 0) + 1 }))} />
              <EpisodeTimeline details={d} focus={focus} />
            </>
          )}

          <MomentsPanel titleKey={d.key} />

          <WhereToWatch type={d.type} id={d.id} />

          <TitleLinks details={d} />

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

/** Phase 57: your journey with a show, on the Classic page. */
function JourneyCard({ details: d }: { details: TitleDetails }): React.JSX.Element | null {
  const raw = useApp((s) => s.library.entries[d.key])
  const journey = d.type === 'tv' ? journeyOf(raw, d.seasons) : null
  if (!journey) return null
  return (
    <section className="card">
      <h2>Your journey</h2>
      <JourneyRibbon journey={journey} />
    </section>
  )
}
