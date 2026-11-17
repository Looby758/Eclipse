import { CalendarClock, Check, Users, X } from 'lucide-react'
import { useState } from 'react'
import { companions, nextEpisodeFor, nextSession, showProgress, watchesWith } from '@core/library'
import { formatDate } from '@core/format'
import { sessionLabel, toLocalInput } from '../lib/together'
import { episodeKey, type TitleDetails } from '@core/types'
import { useApp } from '../store/app'
import { itemOf } from '../lib/item'

/** Every regular episode in order, for the "up to" picker. */
function allEpisodes(d: TitleDetails): string[] {
  const out: string[] = []
  for (const s of [...d.seasons].filter((x) => x.number > 0).sort((a, b) => a.number - b.number)) for (let e = 1; e <= s.episodeCount; e++) out.push(episodeKey(s.number, e))
  return out
}

const label = (k: string): string => k.replace(/^S(\d+)E(\d+)$/, 'S$1 E$2')

/**
 * Shows only: watching with someone ("with Sam"). Each one keeps its own episode progress,
 * apart from yours, so ticking ahead on your own never moves it. Several can run at once.
 */
export default function WatchWithPanel({ details: d }: { details: TitleDetails }): React.JSX.Element | null {
  const entry = useApp((s) => s.library.entries[d.key])
  const library = useApp((s) => s.library)
  const setLibrary = useApp((s) => s.setLibrary)
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  if (d.type !== 'tv') return null
  const watches = watchesWith(entry)
  const people = companions(library)
  const episodes = allEpisodes(d)

  const start = async (): Promise<void> => {
    if (!name.trim()) return
    setLibrary(await window.api.startWatchWith(itemOf(d), name))
    setName('')
    setAdding(false)
  }

  return (
    <div className="with">
      {watches.map(({ index, watch }) => {
        const view = { ...entry!, episodes: watch.episodes }
        const next = nextEpisodeFor(view, d.seasons)
        const p = showProgress(view, d.seasons)
        const nextKey = next ? episodeKey(next.season, next.episode) : null
        const session = nextSession(watch, new Date())
        const plan = (at: string, weekly: boolean): Promise<void> => window.api.planWatchWith(d.key, index, at ? { at, weekly } : null).then(setLibrary)
        return (
          <div className="with-row" key={index}>
            <div className="with-text">
              <strong>
                <Users size={14} /> With {watch.with}
              </strong>
              <span className="muted small">
                {nextKey ? `Next together: ${label(nextKey)}` : 'All caught up together'} · {p.watched} of {p.total} episodes · since {formatDate(watch.startedOn)}
              </span>
              <div className="with-plan">
                <CalendarClock size={15} />
                <span className="small">{session ? `Next time: ${sessionLabel(session, new Date())}${watch.planned?.weekly ? ', every week' : ''}` : 'No time set'}</span>
                <input
                  type="datetime-local"
                  aria-label={`When you're next watching with ${watch.with}`}
                  value={session ? toLocalInput(session) : ''}
                  onChange={(e) => void plan(e.target.value, !!watch.planned?.weekly)}
                />
                <label className="with-weekly small">
                  <input type="checkbox" checked={!!watch.planned?.weekly} disabled={!session} onChange={(e) => session && void plan(toLocalInput(session), e.target.checked)} /> Every week
                </label>
                {session && (
                  <button className="link-btn inline small" onClick={() => void plan('', false)}>
                    Clear
                  </button>
                )}
              </div>
            </div>
            <div className="row">
              {nextKey && (
                <button className="chip" onClick={async () => setLibrary(await window.api.tickWith(d.key, index, [nextKey], true))}>
                  <Check size={14} /> Watched {label(nextKey)}
                </button>
              )}
              <select
                className="with-upto"
                aria-label={`Where you're up to with ${watch.with}`}
                value=""
                onChange={async (e) => {
                  const upto = episodes.indexOf(e.target.value)
                  if (upto >= 0) setLibrary(await window.api.tickWith(d.key, index, episodes.slice(0, upto + 1), true))
                }}
              >
                <option value="">Up to…</option>
                {episodes.map((k) => (
                  <option key={k} value={k}>
                    {label(k)}
                  </option>
                ))}
              </select>
              <button className="link-btn inline small" onClick={async () => setLibrary(await window.api.endWatchWith(d.key, index, true))}>
                Finished
              </button>
              <button className="rewatch-remove" title={`Stop watching with ${watch.with} (it won't count)`} aria-label={`Stop watching with ${watch.with}`} onClick={async () => setLibrary(await window.api.endWatchWith(d.key, index, false))}>
                <X size={13} />
              </button>
            </div>
          </div>
        )
      })}
      {adding ? (
        <form
          className="row"
          onSubmit={(e) => {
            e.preventDefault()
            void start()
          }}
        >
          <input className="with-name" autoFocus list="with-people" placeholder="Who with? e.g. Sam" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
          <datalist id="with-people">
            {people.map((p) => (
              <option key={p} value={p} />
            ))}
          </datalist>
          <button className="chip on" type="submit" disabled={!name.trim()}>
            Start
          </button>
          <button className="link-btn inline small" type="button" onClick={() => setAdding(false)}>
            Cancel
          </button>
        </form>
      ) : (
        <button className="link-btn inline small" onClick={() => setAdding(true)}>
          <Users size={14} /> Watch with someone
        </button>
      )}
    </div>
  )
}
