import { History, Repeat, X } from 'lucide-react'
import { formatDate } from '@core/format'
import { activeEntry, currentRewatch, showProgress, watchCount } from '@core/library'
import type { TitleDetails } from '@core/types'
import { useApp } from '../store/app'
import { itemOf } from '../lib/item'

const TIMES = ['', 'once', 'twice']
export const timesLabel = (n: number): string => TIMES[n] ?? `${n} times`

/**
 * On a title page: how many times you've watched it, "seen it before" for things you watched
 * before Eclipse (no date needed), and rewatches. A show's rewatch has its own episode ticks.
 */
export default function RewatchPanel({ details: d }: { details: TitleDetails }): React.JSX.Element | null {
  const entry = useApp((s) => s.library.entries[d.key])
  const setLibrary = useApp((s) => s.setLibrary)
  const film = d.type === 'movie'
  const item = itemOf(d)
  const current = currentRewatch(entry)
  const count = watchCount(entry)
  const finished = (entry?.rewatches ?? []).map((r, index) => ({ r, index })).filter((x) => x.r.finishedOn)
  const seenOnce = count > 0

  if (!seenOnce) {
    return (
      <div className="rewatch">
        <button className="link-btn inline small" onClick={async () => setLibrary(await window.api.markSeenBefore(item))}>
          <History size={14} /> Seen it before? Mark it watched with no date
        </button>
      </div>
    )
  }

  const progress = current && !film ? showProgress(activeEntry(entry), d.seasons) : null
  const first = entry?.seenBefore ? 'the first time before Eclipse, no date' : entry?.watchedOn ? `first on ${formatDate(entry.watchedOn)}` : null

  return (
    <div className="rewatch">
      <div className="rewatch-head">
        <span className="rewatch-count">
          <Repeat size={15} /> Watched {timesLabel(count)}
        </span>
        {first && <span className="muted small">{first}</span>}
      </div>

      {current && progress && (
        <div className="rewatch-now">
          <div>
            <strong>Rewatching</strong> since {formatDate(current.startedOn)}
            <span className="muted"> · {progress.watched} of {progress.total} episodes</span>
          </div>
          <div className="row">
            <button className="chip on" onClick={async () => setLibrary(await window.api.endRewatch(d.key, true))}>
              {progress.total > 0 && progress.watched >= progress.total ? 'Finished it: count this rewatch' : 'Finish rewatch'}
            </button>
            <button className="link-btn inline small" onClick={async () => setLibrary(await window.api.endRewatch(d.key, false))}>
              Give up (don’t count it)
            </button>
          </div>
          <p className="muted small">Ticks on the episodes below now go to this rewatch. Your first watch is kept as it was.</p>
        </div>
      )}

      {!current && (film || entry?.status === 'watched') && (
        <div className="row">
          <button className="chip" onClick={async () => setLibrary(await window.api.startRewatch(item))}>
            <Repeat size={14} /> {film ? 'Watched it again today' : 'Start a rewatch'}
          </button>
        </div>
      )}

      {finished.length > 0 && (
        <ol className="rewatch-list">
          {finished.map(({ r, index }, n) => (
            <li key={index}>
              <span>
                Rewatch {n + 1}
                <span className="muted">
                  {' · '}
                  {film || r.startedOn === r.finishedOn ? formatDate(r.finishedOn) : `${formatDate(r.startedOn)} to ${formatDate(r.finishedOn)}`}
                </span>
              </span>
              <button className="rewatch-remove" aria-label={`Take off rewatch ${n + 1}`} title="Take this one off" onClick={async () => setLibrary(await window.api.removeRewatch(d.key, index))}>
                <X size={13} />
              </button>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
