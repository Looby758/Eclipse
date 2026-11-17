import { Loader2 } from 'lucide-react'
import { FILTER_LABELS, type AvailabilityFilter as Filter } from '@core/providers'

const FILTERS: Filter[] = ['any', 'mine', 'rentbuy', 'none']

/** Anywhere / On my services / Rent or buy only / Not streaming anywhere. */
export default function AvailabilityFilter({ value, onChange, checking }: { value: Filter; onChange: (f: Filter) => void; checking?: boolean }): React.JSX.Element {
  return (
    <div className="filter-row">
      <div className="segmented" role="radiogroup" aria-label="Where to watch">
        {FILTERS.map((f) => (
          <button key={f} role="radio" aria-checked={value === f} className={value === f ? 'on' : ''} onClick={() => onChange(f)}>
            {FILTER_LABELS[f]}
          </button>
        ))}
      </div>
      {checking && (
        <span className="muted small checking">
          <Loader2 size={14} className="spin" /> Checking where to watch…
        </span>
      )}
    </div>
  )
}
