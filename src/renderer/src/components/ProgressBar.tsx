/** A slim glowing bar: how far through a list you are. */
export default function ProgressBar({ seen, total, big = false }: { seen: number; total: number; big?: boolean }): React.JSX.Element {
  const pct = total ? Math.round((seen / total) * 100) : 0
  return (
    <div className={`progress ${big ? 'big' : ''}`} role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={seen} aria-label={`${seen} of ${total} seen`}>
      <span className="progress-fill" style={{ width: `${pct}%` }} />
    </div>
  )
}
