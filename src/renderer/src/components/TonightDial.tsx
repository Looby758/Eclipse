import { eveningMinutes, tonight, type Evenings } from '@core/time'

/**
 * The Tonight dial (Spotlight Home): an arc from when your evening starts to bedtime, with a tick
 * every quarter of an hour, a segment for each episode (or the film) that fits from now, a dot for
 * now, and the spare time left as empty track.
 */

const SIZE = 400
const C = SIZE / 2
const R = 178
const W = 10
const FROM = 135
const SWEEP = 270

const at = (r: number, deg: number): [number, number] => {
  const a = (deg * Math.PI) / 180
  return [C + r * Math.cos(a), C + r * Math.sin(a)]
}
const arc = (a0: number, a1: number): string => {
  const [x0, y0] = at(R, a0)
  const [x1, y1] = at(R, a1)
  return `M${x0.toFixed(1)} ${y0.toFixed(1)} A${R} ${R} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1.toFixed(1)} ${y1.toFixed(1)}`
}

export default function TonightDial({ evenings, minutesEach, count, now, children }: { evenings: Evenings; minutesEach: number; count: number; now: Date; children?: React.ReactNode }): React.JSX.Element {
  const total = Math.max(1, eveningMinutes(evenings))
  const left = tonight(now, evenings).minutesLeft
  const pos = Math.min(total, Math.max(0, total - left))
  const deg = (m: number): number => FROM + (Math.min(total, Math.max(0, m)) / total) * SWEEP
  const startMinute = (() => {
    const [h, m] = evenings.startTime.split(':').map(Number)
    return h * 60 + m
  })()

  const ticks: React.JSX.Element[] = []
  for (let m = 0; m <= total; m += 15) {
    const hour = (startMinute + m) % 60 === 0
    const [x0, y0] = at(R + W / 2 + 6, deg(m))
    const [x1, y1] = at(R + W / 2 + (hour ? 16 : 11), deg(m))
    ticks.push(<line key={m} x1={x0} y1={y0} x2={x1} y2={y1} className={`dial-tick ${hour ? 'hour' : ''}`} />)
  }

  // A small gap between episodes so each one reads as its own segment.
  const gap = Math.min(3, minutesEach * 0.08)
  const segments = Array.from({ length: count }, (_, i) => {
    const a = pos + i * minutesEach
    const b = Math.min(total, a + minutesEach - gap)
    return b > a ? <path key={i} d={arc(deg(a), deg(b))} className={`dial-seg ${i === count - 1 && count > 1 ? 'last' : ''}`} /> : null
  })
  const [nx, ny] = at(R, deg(pos))

  return (
    <div className="dial">
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} role="img" aria-label={`Tonight: ${count} ${count === 1 ? 'fits' : 'fit'} before bed`}>
        <path d={arc(FROM, FROM + SWEEP)} className="dial-track" />
        {ticks}
        {segments}
        <circle cx={nx} cy={ny} r={W / 2 + 3} className="dial-now" />
      </svg>
      <div className="dial-in">{children}</div>
    </div>
  )
}
