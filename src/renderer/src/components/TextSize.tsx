import { useEffect, useState } from 'react'
import { zoomLabel } from '@core/zoom'

const SIZES: [number, string][] = [
  [0.9, 'Smaller'],
  [1, 'Normal'],
  [1.1, 'Larger'],
  [1.25, 'Largest']
]

/** Settings → Appearance: text size, remembered on this computer (Ctrl + and Ctrl − change it too). */
export default function TextSize(): React.JSX.Element {
  const [zoom, setZoom] = useState<number | null>(null)
  useEffect(() => {
    window.api.zoom().then(setZoom)
    return window.api.onZoomChanged(setZoom)
  }, [])
  const mac = window.api.platform === 'mac'
  const odd = zoom !== null && !SIZES.some(([z]) => z === zoom)
  return (
    <>
      <h3 className="card-sub">Text size</h3>
      <p className="muted small">
        Makes everything bigger or smaller, and Eclipse remembers it on this computer. <kbd>{mac ? '⌘ +' : 'Ctrl +'}</kbd> and <kbd>{mac ? '⌘ −' : 'Ctrl −'}</kbd> change it from anywhere, and{' '}
        <kbd>{mac ? '⌘ 0' : 'Ctrl 0'}</kbd> goes back to normal.
        {odd && ` Right now it’s ${zoomLabel(zoom!)}.`}
      </p>
      <div className="segmented" role="radiogroup" aria-label="Text size">
        {SIZES.map(([z, label]) => (
          <button key={z} role="radio" aria-checked={zoom === z} className={zoom === z ? 'on' : ''} onClick={async () => setZoom(await window.api.setZoom(z))}>
            {label}
          </button>
        ))}
      </div>
    </>
  )
}
