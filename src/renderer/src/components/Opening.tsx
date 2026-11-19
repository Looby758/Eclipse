import { useEffect, useId, useRef, useState } from 'react'
import { OPENING, flightsFor } from '../lib/opening'

/**
 * Phase 51: an opening for Eclipse, like a studio logo before a film. On a dark curtain the Halo-blue
 * eclipse rises and the moon slides aside to show its crescent, then the curtain lifts and your
 * posters fly out of the eclipse into the wall, the middle ones first. The eclipse fades and Home
 * comes up. About two and a half seconds.
 *
 * Any key or click skips it (and does nothing else, so a click can't open a poster underneath).
 * The app decides whether it plays at all: once per launch, not when Eclipse started quietly in the
 * tray, and not with "Keep the poster wall still" or the computer's reduce-animations setting.
 */
export default function Opening({ onReveal, onDone }: { onReveal: () => void; onDone: () => void }): React.JSX.Element {
  const id = useId().replace(/:/g, '')
  const [leaving, setLeaving] = useState<'' | 'settle' | 'skip'>('')
  const calls = useRef({ onReveal, onDone })
  calls.current = { onReveal, onDone }

  useEffect(() => {
    let timers: number[] = []
    let flown: HTMLElement[] = []
    let finished = false
    const at = (ms: number, fn: () => void): void => void timers.push(window.setTimeout(fn, ms))

    const land = (): void => {
      for (const el of flown) {
        el.classList.remove('flying')
        for (const v of ['--fly-x', '--fly-y', '--fly-turn', '--fly-delay']) el.style.removeProperty(v)
      }
      flown = []
    }
    const fly = (): void => {
      const tiles = [...document.querySelectorAll<HTMLElement>('.wall .wall-tile')]
      const flights = flightsFor(
        tiles.map((t) => t.getBoundingClientRect()),
        { width: window.innerWidth, height: window.innerHeight }
      )
      tiles.forEach((el, i) => {
        const f = flights[i]
        if (!f) return
        el.style.setProperty('--fly-x', `${f.x}px`)
        el.style.setProperty('--fly-y', `${f.y}px`)
        el.style.setProperty('--fly-turn', `${f.turn}deg`)
        el.style.setProperty('--fly-delay', `${f.delay}ms`)
        el.classList.add('flying')
        flown.push(el)
      })
    }
    const stopListening = (): void => {
      window.removeEventListener('keydown', onKey, true)
      window.removeEventListener('pointerdown', swallow, true)
    }
    const finish = (skip: boolean): void => {
      if (finished) return
      finished = true
      timers.forEach(clearTimeout)
      timers = []
      if (skip) land()
      setLeaving(skip ? 'skip' : 'settle')
      calls.current.onReveal()
      at(skip ? OPENING.skip : OPENING.reveal, () => {
        land()
        stopListening()
        window.removeEventListener('click', swallow, true)
        calls.current.onDone()
      })
    }
    // Any key or click skips, and goes no further: no Escape going back, no poster opening.
    const swallow = (e: Event): void => {
      e.preventDefault()
      e.stopImmediatePropagation()
      if (e.type !== 'click') finish(true)
    }
    const onKey = (e: KeyboardEvent): void => swallow(e)

    window.addEventListener('keydown', onKey, true)
    window.addEventListener('pointerdown', swallow, true)
    window.addEventListener('click', swallow, true)
    at(OPENING.fly, fly)
    at(OPENING.settle, () => finish(false))
    return () => {
      timers.forEach(clearTimeout)
      land()
      stopListening()
      window.removeEventListener('click', swallow, true)
    }
  }, [])

  const times = {
    '--o-rise': `${OPENING.rise}ms`,
    '--o-fly': `${OPENING.fly}ms`,
    '--o-flight': `${OPENING.flight}ms`,
    '--o-reveal': `${OPENING.reveal}ms`,
    '--o-skip': `${OPENING.skip}ms`
  } as React.CSSProperties

  return (
    <div className={`opening-layer ${leaving}`} style={times} aria-hidden>
      <div className="opening-curtain" />
      <div className="opening-mark">
        <svg className="opening-eclipse" viewBox="0 0 100 100">
          <defs>
            <linearGradient id={`${id}c`} x1="0" y1="1" x2="1" y2="0">
              <stop offset="0" style={{ stopColor: 'var(--logo-crescent-1)' }} />
              <stop offset="1" style={{ stopColor: 'var(--logo-crescent-2)' }} />
            </linearGradient>
            <radialGradient id={`${id}g`}>
              <stop offset="0.55" stopColor="#8fe3ff" stopOpacity="0.55" />
              <stop offset="0.72" stopColor="#3f5bff" stopOpacity="0.28" />
              <stop offset="1" stopColor="#3f5bff" stopOpacity="0" />
            </radialGradient>
            <mask id={`${id}m`}>
              <rect width="100" height="100" fill="#fff" />
              <circle className="opening-moon" cx="46" cy="54" r="30" fill="#000" />
            </mask>
          </defs>
          <circle className="opening-corona" cx="50" cy="50" r="50" fill={`url(#${id}g)`} />
          <circle className="opening-moon" cx="46" cy="54" r="30" fill="#070816" />
          <circle cx="50" cy="50" r="34" fill={`url(#${id}c)`} mask={`url(#${id}m)`} />
          <path
            className="opening-play"
            d="M38 39.5c0-3 3.2-4.8 5.8-3.3l17 10.5c2.4 1.5 2.4 5 0 6.5l-17 10.5c-2.6 1.6-5.8-.3-5.8-3.3Z"
            style={{ fill: 'var(--logo-play)' }}
          />
        </svg>
        <div className="opening-word">ECLIPSE</div>
      </div>
    </div>
  )
}
