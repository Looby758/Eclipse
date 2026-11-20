import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { currentScrollKey, rememberScroll, savedScroll } from '../lib/scrollMemory'

/** A page that slides up over the poster wall. `lifted` sits on its top edge (a title's poster) and drifts away as you scroll. */
export default function Sheet({ children, lifted, className = '' }: { children: ReactNode; lifted?: ReactNode; className?: string }): React.JSX.Element {
  const [scrolled, setScrolled] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  // Which page this is in your history, fixed when it opens (Back keeps your place).
  const [key] = useState(currentScrollKey)

  // Coming back to a page: scroll to where you were. Lists and results can arrive a moment later,
  // so keep trying for a second until the page is tall enough (or you scroll yourself).
  useLayoutEffect(() => {
    const el = ref.current
    const target = savedScroll(key)
    if (!el || !target) return
    let frame = 0
    let gaveUp = false
    const started = performance.now()
    const stop = (): void => {
      gaveUp = true
    }
    el.addEventListener('wheel', stop, { once: true, passive: true })
    el.addEventListener('pointerdown', stop, { once: true })
    const attempt = (): void => {
      if (gaveUp) return
      el.scrollTop = target
      if (Math.abs(el.scrollTop - target) > 2 && performance.now() - started < 1000) frame = requestAnimationFrame(attempt)
    }
    attempt()
    return () => {
      cancelAnimationFrame(frame)
      el.removeEventListener('wheel', stop)
      el.removeEventListener('pointerdown', stop)
    }
  }, [key])

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const onScroll = (): void => rememberScroll(key, el.scrollTop)
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [key])

  return (
    <section className={`sheet ${lifted ? 'has-lifted' : ''} ${scrolled ? 'scrolled' : ''} ${className}`}>
      {lifted && <div className="sheet-lifted">{lifted}</div>}
      <div ref={ref} className="sheet-scroll" onScroll={lifted ? (e) => setScrolled(e.currentTarget.scrollTop > 140) : undefined}>
        {children}
      </div>
    </section>
  )
}
