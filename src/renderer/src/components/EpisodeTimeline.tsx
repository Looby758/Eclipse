import { Check, CheckCheck, Eye, Undo2, History } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { formatDate, formatRuntime, plural } from '@core/format'
import { activeEntry, currentRewatch, localDate, nextEpisodeFor, showProgress } from '@core/library'
import { imageUrl } from '@core/tmdb'
import { episodeKey, type SeasonDetails, type TitleDetails, UNDATED } from '@core/types'
import { itemOf } from '../lib/item'
import { useApp } from '../store/app'
import { useJustTicked } from '../lib/justTicked'

/**
 * A show's seasons as a row of dots you tick off. Ticking saves today's date; the next episode
 * glows. Episodes you haven't reached keep their summary hidden until you ask (no spoilers).
 */
/** An episode to jump to (from the heatmap); `n` changes on every jump, so the same one can be picked twice. */
export type EpisodeFocus = { season: number; episode: number; n: number }

export default function EpisodeTimeline({ details, focus }: { details: TitleDetails; focus?: EpisodeFocus | null }): React.JSX.Element | null {
  const sectionRef = useRef<HTMLElement>(null)
  const entry = useApp((s) => activeEntry(s.library.entries[details.key]))
  const setLibrary = useApp((s) => s.setLibrary)
  const rewatching = useApp((s) => !!currentRewatch(s.library.entries[details.key]))
  const counts = useMemo(() => details.seasons.map((s) => ({ number: s.number, episodeCount: s.episodeCount })), [details])
  const next = nextEpisodeFor(entry, counts)
  const regular = details.seasons.filter((s) => s.number > 0)
  const [seasonNo, setSeasonNo] = useState<number | null>(null)
  const shown = seasonNo ?? (entry && next ? next.season : (regular[0]?.number ?? details.seasons[0]?.number ?? null))
  const [loaded, setLoaded] = useState<Record<number, SeasonDetails>>({})
  const [error, setError] = useState('')
  const [picked, setPicked] = useState<number | null>(null)
  const [reveal, setReveal] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setLoaded({})
    setSeasonNo(null)
    setPicked(null)
  }, [details.key])

  useEffect(() => {
    if (!focus) return
    setSeasonNo(focus.season)
    setPicked(focus.episode)
    setReveal(false)
    sectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [focus?.n])

  useEffect(() => {
    if (shown === null || loaded[shown]) return
    let cancelled = false
    window.api.season(details.id, shown).then((r) => {
      if (cancelled) return
      if (r.ok) {
        setLoaded((l) => ({ ...l, [shown]: r.value.data }))
        setError('')
      } else setError(r.error)
    })
    return () => {
      cancelled = true
    }
  }, [details.id, shown])

  // Phase 60: episodes ticked just now, to ink their dots.
  const inked = useJustTicked(Object.keys(entry?.episodes ?? {}).filter((k) => k.startsWith(`S${shown}E`)), `${details.key}:${shown}:${rewatching}`)
  if (shown === null) return null
  const info = details.seasons.find((s) => s.number === shown)!
  const season = loaded[shown]
  const today = localDate(new Date())
  const seen = entry?.episodes ?? {}
  const count = season?.episodes.length ?? info.episodeCount
  const numbers = season ? season.episodes.map((e) => e.number) : Array.from({ length: count }, (_, i) => i + 1)
  const aired = (n: number): boolean => {
    const ep = season?.episodes.find((e) => e.number === n)
    return !ep?.airDate || ep.airDate <= today
  }
  const isNext = (n: number): boolean => !!entry && next?.season === shown && next.episode === n
  const selected = picked ?? (next?.season === shown ? next.episode : null)
  const ep = selected !== null ? season?.episodes.find((e) => e.number === selected) : undefined
  const seenHere = numbers.filter((n) => seen[episodeKey(shown, n)])
  const leftMinutes = season ? season.episodes.filter((e) => !seen[episodeKey(shown, e.number)] && aired(e.number)).reduce((m, e) => m + (e.runtime ?? details.runtime ?? 0), 0) : 0
  const overall = showProgress(entry, counts)

  const tick = async (keys: string[], watched: boolean, undated = false): Promise<void> => {
    if (!keys.length) return
    setBusy(true)
    try {
      setLibrary(await window.api.setEpisodes(itemOf(details), keys, watched, undated))
    } finally {
      setBusy(false)
    }
  }
  /** Every aired episode up to and including this one, from Season 1 on (specials aside). */
  const upTo = (n: number): string[] => {
    const keys: string[] = []
    for (const s of regular) {
      if (shown > 0 && s.number < shown) for (let e = 1; e <= s.episodeCount; e++) keys.push(episodeKey(s.number, e))
    }
    for (const e of numbers) if (e <= n && aired(e)) keys.push(episodeKey(shown, e))
    return keys.filter((k) => !seen[k])
  }
  const allHere = numbers.filter(aired).map((n) => episodeKey(shown, n))
  const pickedKey = selected !== null ? episodeKey(shown, selected) : null
  const pickedSeen = pickedKey ? !!seen[pickedKey] : false
  const spoiler = ep && !pickedSeen && !isNext(ep.number) && !reveal

  return (
    <section className="seasons" ref={sectionRef}>
      <div className="seasons-head">
        <div className="season-tabs">
          {details.seasons.map((s) => (
            <button
              key={s.number}
              className={s.number === shown ? 'on' : ''}
              onClick={() => {
                setSeasonNo(s.number)
                setPicked(null)
                setReveal(false)
              }}
            >
              {s.number === 0 ? 'Specials' : `Season ${s.number}`}
            </button>
          ))}
        </div>
        <div className="muted small">
          {seenHere.length} of {plural(count, 'episode')} seen
          {leftMinutes > 0 && seenHere.length > 0 ? ` · ${formatRuntime(leftMinutes)} left` : ''}
          {overall.total > 0 && regular.length > 1 ? ` · ${overall.watched}/${overall.total} overall` : ''}
        </div>
      </div>

      {error && <p className="error">{error}</p>}
      <ol className="timeline-dots" aria-label={`Season ${shown} episodes`}>
        {numbers.map((n) => {
          const key = episodeKey(shown, n)
          const watched = !!seen[key]
          const cls = ['timeline-dot', watched ? 'seen' : '', isNext(n) ? 'next' : '', aired(n) ? '' : 'future', selected === n ? 'picked' : '', inked.has(key) ? 'inked' : ''].filter(Boolean).join(' ')
          return (
            <li key={n}>
              <button
                className={cls}
                aria-pressed={watched}
                aria-label={`Episode ${n}${watched ? ', watched' : ''}${isNext(n) ? ', up next' : ''}`}
                onClick={() => {
                  setPicked(n)
                  setReveal(false)
                }}
                onDoubleClick={() => aired(n) && tick([key], !watched)}
                title={watched ? (seen[key] === UNDATED ? 'Seen before (no date)' : `Watched ${formatDate(seen[key])}`) : 'Double-click to tick'}
              >
                {watched ? <Check size={14} strokeWidth={3} /> : n}
              </button>
            </li>
          )
        })}
      </ol>

      {selected !== null && (
        <div className={`episode-panel ${isNext(selected) ? 'next' : ''}`}>
          {ep?.stillPath && !spoiler && <img className="episode-still" src={imageUrl(ep.stillPath, 'w342') ?? ''} alt="" draggable={false} />}
          <div className="episode-info">
            <div className="episode-kicker">
              {shown === 0 ? 'Special' : `S${shown} E${selected}`}
              {isNext(selected) ? ' · Up next' : ''}
              {pickedSeen ? (seen[pickedKey!] === UNDATED ? ' · Seen before' : ` · Watched ${formatDate(seen[pickedKey!])}`) : ''}
            </div>
            <div className="episode-name">{spoiler ? 'Title hidden until you get here' : ep?.name || `Episode ${selected}`}</div>
            <div className="muted small">
              {[ep?.airDate ? (aired(selected) ? formatDate(ep.airDate) : `Airs ${formatDate(ep.airDate)}`) : '', formatRuntime(ep?.runtime ?? details.runtime), ep?.voteAverage ? `★ ${ep.voteAverage.toFixed(1)}` : ''].filter(Boolean).join(' · ')}
            </div>
            {ep?.overview && (spoiler ? (
              <button className="link-btn" onClick={() => setReveal(true)}>
                <Eye size={13} /> Show title and summary
              </button>
            ) : (
              <p className="episode-overview">{ep.overview}</p>
            ))}
            <div className="row episode-actions">
              {aired(selected) ? (
                <>
                  <button className={`btn ${pickedSeen ? 'glass' : 'primary'}`} disabled={busy} onClick={() => tick([pickedKey!], !pickedSeen)}>
                    {pickedSeen ? <Undo2 size={15} /> : <Check size={15} />} {pickedSeen ? 'Mark unwatched' : 'Mark watched'}
                  </button>
                  {shown > 0 && upTo(selected).length > 1 && (
                    <button className="btn glass" disabled={busy} onClick={() => tick(upTo(selected), true)}>
                      <CheckCheck size={15} /> Watched up to here
                    </button>
                  )}
                </>
              ) : (
                <span className="muted small">Not out yet.</span>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="row season-actions">
        {seenHere.length < allHere.length ? (
          <button className="link-btn" disabled={busy} onClick={() => tick(allHere.filter((k) => !seen[k]), true)}>
            <CheckCheck size={13} /> Mark all of {shown === 0 ? 'Specials' : `Season ${shown}`} watched
          </button>
        ) : null}
        {seenHere.length < allHere.length && !rewatching ? (
          <button className="link-btn" disabled={busy} onClick={() => tick(allHere.filter((k) => !seen[k]), true, true)} title="For seasons you watched before Eclipse: ticked with no date">
            <History size={13} /> Seen {shown === 0 ? 'these' : `season ${shown}`} before (no date)
          </button>
        ) : null}
        {seenHere.length > 0 && (
          <button className="link-btn" disabled={busy} onClick={() => tick(seenHere.map((n) => episodeKey(shown, n)), false)}>
            <Undo2 size={13} /> Clear this season
          </button>
        )}
        <span className="muted small">Double-click a dot to tick it quickly.</span>
      </div>
    </section>
  )
}
