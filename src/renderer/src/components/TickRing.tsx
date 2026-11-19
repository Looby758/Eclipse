import { useEffect, useRef, useState } from 'react'

/**
 * Phase 60: the progress ring beside "169 / 177 episodes watched". It fills to how far through you
 * are, and when you tick an episode it jumps: a quick pop and a flash of light round the ring.
 * With "Keep the poster wall still" it just moves to the new amount.
 */
export default function TickRing({ seen, total, size = 64 }: { seen: number; total: number; size?: number }): React.JSX.Element {
  const svg = useRef<SVGSVGElement>(null)
  const before = useRef(seen)
  const [jump, setJump] = useState(0)
  useEffect(() => {
    if (seen > before.current) {
      setJump((n) => n + 1)
      const calm = document.documentElement.hasAttribute('data-still') || window.matchMedia('(prefers-reduced-motion: reduce)').matches
      if (!calm) svg.current?.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.18) rotate(-6deg)', offset: 0.3 }, { transform: 'scale(1)' }], { duration: 500, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' })
    }
    before.current = seen
  }, [seen])
  const r = size / 2 - 5
  const c = 2 * Math.PI * r
  const share = total ? Math.min(1, seen / total) : 0
  const mid = size / 2
  return (
    <svg ref={svg} className="tick-ring" width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
      <circle className="tick-ring-track" cx={mid} cy={mid} r={r} />
      <circle className="tick-ring-fill" cx={mid} cy={mid} r={r} strokeDasharray={c} style={{ strokeDashoffset: c * (1 - share) }} transform={`rotate(-90 ${mid} ${mid})`} />
      {jump > 0 && <circle key={jump} className="tick-ring-flash" cx={mid} cy={mid} r={r} />}
    </svg>
  )
}
