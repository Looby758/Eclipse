import { ArrowLeft, ArrowRight, ExternalLink, Info, SkipForward, ThumbsDown, ThumbsUp } from 'lucide-react'
import { useEffect, useState } from 'react'
import { whyText, type Recommendation } from '@core/recommend'
import { formatRuntime, plural } from '@core/format'
import { useApp } from '../store/app'
import { useDetailsMany } from '../lib/availability'
import Sheet from './Sheet'
import Poster from './Poster'
import Credits from './Credits'

type Kind = 'all' | 'movie' | 'tv'
const KINDS: [Kind, string][] = [
  ['all', 'Both'],
  ['movie', 'Films'],
  ['tv', 'Shows']
]

const itemOf = (r: Recommendation) => ({ key: r.key, type: r.type, id: r.id, title: { name: r.name, year: r.year, posterPath: r.posterPath } })

/**
 * Recommendations one at a time (phase 43), like *Clear out the watchlist*: each pick with its
 * trailer and why it's there, and **Interested** (adds it to Want to watch), **Not for me** or
 * **Skip**. Every answer teaches it: a no lowers anything sharing the pick's creators, network, main
 * cast or keywords, a yes raises them. Keys: → or I interested, ← or N not for me, S skip.
 */
export default function PicksSheet(): React.JSX.Element {
  const library = useApp((s) => s.library)
  const { setLibrary, go } = useApp.getState()
  const [kind, setKind] = useState<Kind>('all')
  const [queue, setQueue] = useState<Recommendation[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [pos, setPos] = useState(0)
  const [yes, setYes] = useState(0)
  const [no, setNo] = useState(0)
  const [busy, setBusy] = useState(false)
  const pick = queue?.[pos]
  const { map: details } = useDetailsMany(queue ? queue.slice(pos, pos + 2).map((r) => r.key) : [], !!queue)
  const d = pick ? details[pick.key] : undefined
  const done = !!queue && pos >= queue.length
  const taste = library.recsTaste
  const answers = (taste?.yes ?? 0) + (taste?.no ?? 0)

  const start = async (): Promise<void> => {
    setLoading(true)
    setError('')
    const r = await window.api.recommendations()
    setLoading(false)
    if (!r.ok) return setError(r.error)
    const hidden = new Set(library.recsHidden ?? [])
    setQueue(r.value.filter((x) => !library.entries[x.key] && !hidden.has(x.key) && (kind === 'all' || x.type === kind)).slice(0, 25))
    setPos(0)
    setYes(0)
    setNo(0)
  }
  const answer = async (a: 'yes' | 'no'): Promise<void> => {
    if (!pick || busy) return
    setBusy(true)
    try {
      setLibrary(await window.api.answerRecommendation(itemOf(pick), a))
      if (a === 'yes') setYes((n) => n + 1)
      else setNo((n) => n + 1)
      setPos((p) => p + 1)
    } finally {
      setBusy(false)
    }
  }
  const skip = (): void => setPos((p) => p + 1)

  useEffect(() => {
    if (!queue || done) return
    const onKey = (e: KeyboardEvent): void => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT' || e.metaKey || e.ctrlKey || e.altKey) return
      const k = e.key.toLowerCase()
      if (e.key === 'ArrowRight' || k === 'i') void answer('yes')
      else if (e.key === 'ArrowLeft' || k === 'n') void answer('no')
      else if (k === 's') skip()
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  // Already answered elsewhere (added from its page, or hidden from Search): move past it.
  useEffect(() => {
    if (pick && !busy && (library.entries[pick.key] || (library.recsHidden ?? []).includes(pick.key))) setPos((p) => p + 1)
  }, [pick, library, busy])

  if (!queue) {
    return (
      <Sheet className="clearout picks">
        <div className="sheet-head">
          <h1>Find something new</h1>
        </div>
        <p className="muted">
          Recommendations one at a time, with the trailer. Say <strong>Interested</strong> (it goes on Want to watch) or <strong>Not for me</strong>. Each answer teaches it: a no makes anything with the same creators, network, main
          cast or themes less likely, and a yes makes them more likely. It starts out fairly general and gets sharper the more you answer.
        </p>
        <p className="muted small">{answers ? `Learnt from ${plural(answers, 'answer')} so far (${taste?.yes ?? 0} interested, ${taste?.no ?? 0} not for me).` : 'Nothing learnt yet.'}</p>
        <div className="segmented" role="radiogroup" aria-label="Films or shows">
          {KINDS.map(([k, label]) => (
            <button key={k} role="radio" aria-checked={kind === k} className={kind === k ? 'on' : ''} onClick={() => setKind(k)}>
              {label}
            </button>
          ))}
        </div>
        {error && <p className="error">{error}</p>}
        <div className="row" style={{ marginTop: 18 }}>
          <button className="btn primary big" disabled={loading} onClick={() => void start()}>
            {loading ? 'Finding things you might like…' : 'Start'}
          </button>
        </div>
        <Credits />
      </Sheet>
    )
  }

  if (done) {
    return (
      <Sheet className="clearout picks">
        <div className="sheet-head">
          <h1>{queue.length ? 'That’s the lot for now' : 'Nothing new to show'}</h1>
        </div>
        <p>
          {queue.length
            ? `You were interested in ${yes} and said no to ${no}. The next round takes those answers into account.`
            : 'Watch or rate a few more things and new recommendations will turn up.'}
        </p>
        <div className="row">
          <button className="btn glass" onClick={() => void start()} disabled={loading}>
            {loading ? 'Finding more…' : 'Another round'}
          </button>
          <button className="btn glass" onClick={() => go({ name: 'library' })}>
            Back to Library
          </button>
        </div>
        <Credits />
      </Sheet>
    )
  }

  return (
    <Sheet className="clearout picks">
      <div className="clearout-top">
        <span className="muted small">
          {pos + 1} of {queue.length} · interested {yes} · not for me {no}
        </span>
        <button className="link-btn inline small" onClick={() => setQueue(null)}>
          Stop
        </button>
      </div>
      {pick && (
        <div className="clearout-card">
          <div className="clearout-poster">
            <Poster path={pick.posterPath} type={pick.type} id={pick.id} name={pick.name} size="w342" />
          </div>
          <div className="clearout-body">
            <h1>{pick.name}</h1>
            <p className="muted">
              {[pick.type === 'movie' ? 'Film' : 'Show', pick.year, d?.genres.slice(0, 2).join(' · '), pick.type === 'movie' && d?.runtime ? formatRuntime(d.runtime) : d?.numberOfSeasons ? plural(d.numberOfSeasons, 'season') : null]
                .filter(Boolean)
                .join(' · ')}
            </p>
            <p className="pick-why">{whyText(pick)}</p>
            {pick.disliked?.length ? <p className="muted small">Shares {pick.disliked.slice(0, 2).join(' and ')} with ones you said no to, so it’s further down.</p> : null}
            {d?.trailer ? (
              <div className="clearout-trailer">
                <iframe
                  key={d.trailer}
                  src={`https://www.youtube-nocookie.com/embed/${d.trailer}?rel=0&modestbranding=1`}
                  title={`${pick.name} trailer`}
                  allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
                  referrerPolicy="strict-origin-when-cross-origin"
                  allowFullScreen
                />
              </div>
            ) : (
              <p className="clearout-overview">{d ? d.overview || pick.overview || 'No trailer or summary on TMDB.' : 'Loading…'}</p>
            )}
            <div className="row">
              {d?.trailer && (
                <button className="link-btn inline small" onClick={() => window.api.openExternal(`https://www.youtube.com/watch?v=${d.trailer}`)}>
                  <ExternalLink size={13} /> Trailer not playing? Watch it on YouTube
                </button>
              )}
              <button className="link-btn inline small" onClick={() => go({ name: 'title', type: pick.type, id: pick.id })}>
                <Info size={13} /> More about it
              </button>
            </div>
            <div className="clearout-actions">
              <button className="btn big danger" onClick={() => void answer('no')} disabled={busy}>
                <ArrowLeft size={18} /> <ThumbsDown size={18} /> Not for me
              </button>
              <button className="btn big glass" onClick={skip} title="Not sure yet (S)">
                <SkipForward size={18} /> Skip
              </button>
              <button className="btn big primary" onClick={() => void answer('yes')} disabled={busy}>
                <ThumbsUp size={18} /> Interested <ArrowRight size={18} />
              </button>
            </div>
            <p className="muted small">Keys: → or I interested, ← or N not for me, S skip.</p>
          </div>
        </div>
      )}
      <Credits />
    </Sheet>
  )
}
