import { Check, ChevronDown, ChevronUp } from 'lucide-react'
import { useState } from 'react'
import { plural } from '@core/format'
import { episodeKey, type PartEpisodes as Part } from '@core/types'
import { useApp } from '../store/app'

/**
 * "5 episodes": click to see which ones (season, number, title and air year), with a tick on the
 * ones you've seen. Asked for only when opened, as it can take TMDB a few seconds.
 */
export default function PartEpisodes({ tvId, personId, creditIds, count }: { tvId: number; personId: number; creditIds: string[]; count?: number }): React.JSX.Element {
  const library = useApp((s) => s.library)
  const [open, setOpen] = useState(false)
  const [part, setPart] = useState<Part | null>(null)
  const [error, setError] = useState('')
  const ticked = library.entries[`tv:${tvId}`]?.episodes ?? {}

  const toggle = async (): Promise<void> => {
    setOpen(!open)
    if (open || part) return
    const r = await window.api.partEpisodes(tvId, personId, creditIds)
    if (r.ok) setPart(r.value)
    else setError(r.error)
  }

  const label = count ? plural(count, 'episode') : 'Which episodes'
  return (
    <div className="part-episodes">
      <button className="link-btn part-toggle" aria-expanded={open} onClick={toggle}>
        {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />} {label}
      </button>
      {open && (
        <div className="part-list">
          {error && <p className="error small">{error}</p>}
          {!part && !error && <p className="muted small">Finding the episodes…</p>}
          {part && part.episodes.length === 0 && (
            <p className="muted small">
              {part.seasons.length ? `TMDB doesn’t say which episodes, only ${part.seasons.length === 1 ? 'season' : 'seasons'} ${part.seasons.join(', ')}.` : 'TMDB doesn’t say which episodes.'}
            </p>
          )}
          {part && part.episodes.length > 0 && (
            <ol>
              {part.episodes.map((e) => {
                const seen = !!ticked[episodeKey(e.season, e.number)]
                return (
                  <li key={`${e.season}:${e.number}`} className={seen ? 'seen' : ''}>
                    <span className="part-code">
                      S{e.season} E{e.number}
                    </span>
                    <span className="part-name">{e.name}</span>
                    {e.airDate && <span className="part-year">{e.airDate.slice(0, 4)}</span>}
                    {seen && (
                      <span className="part-seen" title="You’ve seen this one">
                        <Check size={13} strokeWidth={3} />
                      </span>
                    )}
                  </li>
                )
              })}
            </ol>
          )}
        </div>
      )}
    </div>
  )
}
