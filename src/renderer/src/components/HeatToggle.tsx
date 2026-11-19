import { useHeatView } from '../lib/heatView'

/** Phase 47: TMDB | Mine, above a show's ratings. */
export default function HeatToggle({ mine }: { mine: number }): React.JSX.Element {
  const { view, set } = useHeatView()
  return (
    <div className="heat-toggle" role="tablist" aria-label="Whose ratings">
      <button role="tab" aria-selected={view === 'tmdb'} className={view === 'tmdb' ? 'on' : ''} onClick={() => set('tmdb')} title="Everyone’s ratings on TMDB">
        TMDB
      </button>
      <button role="tab" aria-selected={view === 'mine'} className={view === 'mine' ? 'on' : ''} onClick={() => set('mine')} title="How each episode hit you">
        Mine{mine > 0 ? ` · ${mine}` : ''}
      </button>
    </div>
  )
}
