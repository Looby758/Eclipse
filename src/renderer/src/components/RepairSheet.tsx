import { CalendarRange, Check, EyeOff, X } from 'lucide-react'
import { useState } from 'react'
import { preferencesOf } from '@core/library'
import { findBatches, spreadBatch, type Batch } from '@core/repair'
import { episodeMinutes } from '@core/time'
import { formatDate, formatShortDay, plural } from '@core/format'
import { parseEpisodeKey } from '@core/types'
import { useApp } from '../store/app'
import { useDetailsMany } from '../lib/availability'
import Sheet from './Sheet'
import Credits from './Credits'

const label = (k: string): string => {
  const p = parseEpisodeKey(k)!
  return `S${p.season} E${p.episode}`
}

/** "S1 E3 – S2 E5" */
const span = (b: Batch): string => (b.episodes.length > 1 ? `${label(b.episodes[0])} – ${label(b.episodes[b.episodes.length - 1])}` : label(b.episodes[0]))

/** Repair old dates (Phase 24): batches of late ticks, one at a time, nothing changed without your say-so. */
export default function RepairSheet(): React.JSX.Element {
  const library = useApp((s) => s.library)
  const { setLibrary, go } = useApp.getState()
  const prefs = preferencesOf(library)
  const batches = findBatches(library)
  const { map } = useDetailsMany(
    [...new Set(batches.map((b) => b.key))],
    batches.length > 0
  )
  const [done, setDone] = useState(0)
  const [error, setError] = useState('')

  const act = async (b: Batch, choice: Parameters<typeof window.api.repairBatch>[1]): Promise<void> => {
    try {
      setLibrary(await window.api.repairBatch(b, choice))
      setDone((n) => n + 1)
      setError('')
    } catch (e) {
      setError(e instanceof Error ? e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : String(e))
    }
  }

  return (
    <Sheet className="repair">
      <div className="sheet-head">
        <h1>Repair old dates</h1>
      </div>
      <p className="muted">
        When episodes get ticked late, lots of them end up “watched” on the same day. Here are the days that look like that. For each one, spread the episodes back over your usual
        evenings (from Settings → Your evenings), mark them seen with no date, or leave them as they are. Your library is copied aside before the first change.
      </p>
      {error && <p className="error">{error}</p>}
      {!batches.length && <p>{done ? `All sorted: ${plural(done, 'batch', 'batches')} done.` : 'Nothing to repair: no day has a big batch of ticks.'}</p>}
      <div className="repair-list">
        {batches.slice(0, 20).map((b) => {
          const d = map[b.key]
          const plan = spreadBatch(b, prefs, d ? episodeMinutes(d) : 45)
          const [type, id] = b.key.split(':')
          return (
            <section key={b.id} className="card repair-batch">
              <h2>
                <button className="note-open" onClick={() => go({ name: 'title', type: type as 'tv', id: Number(id) })}>
                  {b.name}
                </button>
              </h2>
              <p>
                <strong>{plural(b.episodes.length, 'episode')}</strong> ({span(b)}) all ticked on {formatDate(b.day)}.
              </p>
              <p className="muted small">
                Spread out: {plan.perNight} a night over {plural(plan.nights, 'evening')}, {formatShortDay(plan.from)} to {formatShortDay(plan.to)} {plan.to.slice(0, 4)}.
              </p>
              <div className="row">
                <button className="btn glass" onClick={() => act(b, { kind: 'spread', days: plan.days })}>
                  <CalendarRange size={15} /> Spread them out
                </button>
                <button className="btn glass" onClick={() => act(b, { kind: 'undated' })}>
                  <EyeOff size={15} /> Seen, no date
                </button>
                <button className="btn glass" onClick={() => act(b, { kind: 'leave' })}>
                  <X size={15} /> Leave them
                </button>
              </div>
            </section>
          )
        })}
      </div>
      {batches.length > 20 && <p className="muted">And {batches.length - 20} more after these.</p>}
      {done > 0 && batches.length > 0 && (
        <p className="muted small">
          <Check size={13} /> {plural(done, 'batch', 'batches')} done.
        </p>
      )}
      <Credits />
    </Sheet>
  )
}
