import { CalendarRange, Sparkles } from 'lucide-react'
import { findBatches } from '@core/repair'
import { plural } from '@core/format'
import { useApp } from '../store/app'

/** Settings: your history. Repair old dates (Phase 24) and your year in Eclipse (Phase 25). */
export default function HistoryCard(): React.JSX.Element {
  const library = useApp((s) => s.library)
  const go = useApp((s) => s.go)
  const batches = findBatches(library).length
  return (
    <section className="card">
      <h2>Your history</h2>
      <p className="muted">
        {batches
          ? `${plural(batches, 'day looks', 'days look')} like a batch of episodes ticked late (all on one day). You can spread them back over your evenings.`
          : 'No days with a big batch of late ticks.'}
      </p>
      <div className="row">
        <button className="btn glass" onClick={() => go({ name: 'repair' })}>
          <CalendarRange size={15} /> Repair old dates
        </button>
        <button className="btn glass" onClick={() => go({ name: 'year' })}>
          <Sparkles size={15} /> Your year in Eclipse
        </button>
      </div>
    </section>
  )
}
