import { useId } from 'react'

/** The Eclipse logo, "Play eclipse" in Halo blue (Phase 34). Colours come from the theme. */
export default function Logo({ size = 28, className }: { size?: number; className?: string }): React.JSX.Element {
  const id = useId().replace(/:/g, '')
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 100 100" aria-hidden>
      <defs>
        <linearGradient id={`${id}c`} x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" style={{ stopColor: 'var(--logo-crescent-1)' }} />
          <stop offset="1" style={{ stopColor: 'var(--logo-crescent-2)' }} />
        </linearGradient>
        <linearGradient id={`${id}t`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" style={{ stopColor: 'var(--logo-tile-1)' }} />
          <stop offset="1" style={{ stopColor: 'var(--logo-tile-2)' }} />
        </linearGradient>
        <mask id={`${id}m`}>
          <rect width="100" height="100" fill="#fff" />
          <circle cx="46" cy="54" r="30" fill="#000" />
        </mask>
      </defs>
      <rect width="100" height="100" rx="23" fill={`url(#${id}t)`} />
      <circle cx="50" cy="50" r="34" fill={`url(#${id}c)`} mask={`url(#${id}m)`} />
      <path d="M38 39.5c0-3 3.2-4.8 5.8-3.3l17 10.5c2.4 1.5 2.4 5 0 6.5l-17 10.5c-2.6 1.6-5.8-.3-5.8-3.3Z" style={{ fill: 'var(--logo-play)' }} />
    </svg>
  )
}
