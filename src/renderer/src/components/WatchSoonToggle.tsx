import { Hourglass } from 'lucide-react'
import { isWatchSoon } from '@core/watchsoon'
import type { TitleDetails } from '@core/types'
import { useApp } from '../store/app'

/** On a title page: put it on (or take it off) Watch soon. */
export default function WatchSoonToggle({ details: d }: { details: TitleDetails }): React.JSX.Element {
  const on = useApp((s) => isWatchSoon(s.library, d.key))
  const { setLibrary, go } = useApp.getState()
  return (
    <div className="row soon-toggle">
      <button
        className={`chip ${on ? 'on' : ''}`}
        aria-pressed={on}
        onClick={async () => setLibrary(await window.api.setWatchSoon({ key: d.key, type: d.type, id: d.id, name: d.name, year: d.year, posterPath: d.posterPath, date: d.date }, !on))}
      >
        <Hourglass size={14} /> {on ? 'On Watch soon' : 'Watch soon'}
      </button>
      {on && (
        <button className="link-btn inline small" onClick={() => go({ name: 'soon' })}>
          See what fits your evenings
        </button>
      )}
    </div>
  )
}
