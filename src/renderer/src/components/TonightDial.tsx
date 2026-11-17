import { tonight, type Evenings, type Span } from '@core/time'

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
  const t = tonight(now, evenings)
  // Tonight's slots, or your usual evening on a night off (drawn empty).
  const slots: Span[] = t.slots.length ? t.slots : [(() => {
    const [sh, sm] = evenings.startTime.split(':').map(Number)
    const [bh, bm] = evenings.bedtime.split(':').map(Number)
    const start = sh * 60 + sm
    let end = bh * 60 + bm
    if (end <= start) end += 1440
    return { start, end }
  })()]
  const from = slots[0].start
  const total = Math.max(1, slots[slots.length - 1].end - from)
  const pos = Math.min(total, Math.max(0, t.now - from))
  const deg = (m: number): number => FROM + (Math.min(total, Math.max(0, m)) / total) * SWEEP

  const ticks: React.JSX.Element[] = []
  for (let m = 0; m <= total; m += 15) {
    const hour = (from + m) % 60 === 0
    const [x0, y0] = at(R + W / 2 + 6, deg(m))
    const [x1, y1] = at(R + W / 2 + (hour ? 16 : 11), deg(m))
    ticks.push(<line key={m} x1={x0} y1={y0} x2={x1} y2={y1} className={`dial-tick ${hour ? 'hour' : ''}`} />)
  }

  // Each episode in the next stretch of tonight it fits in, with your gap between them.
  const placed: [number, number][] = []
  for (const s of t.left) {
    let a = s.start
    while (placed.length < count && a + minutesEach <= s.end) {
      placed.push([a - from, a - from + minutesEach - Math.min(3, minutesEach * 0.08)])
      a += minutesEach + (evenings.gapMinutes ?? 0)
    }
  }
  const segments = placed.map(([a, b], i) => (b > a ? <path key={i} d={arc(deg(a), deg(b))} className={`dial-seg ${i === placed.length - 1 && placed.length > 1 ? 'last' : ''}`} /> : null))
  // Breaks between slots (e.g. between the afternoon and the evening) are left off the track.
  const track = slots.map((s, i) => <path key={i} d={arc(deg(s.start - from), deg(s.end - from))} className="dial-track" />)
  const [nx, ny] = at(R, deg(pos))

  return (
    <div className="dial">
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} role="img" aria-label={`Tonight: ${count} ${count === 1 ? 'fits' : 'fit'} before bed`}>
        {track}
        {ticks}
        {segments}
        <circle cx={nx} cy={ny} r={W / 2 + 3} className="dial-now" />
      </svg>
      <div className="dial-in">{children}</div>
    </div>
  )
}
