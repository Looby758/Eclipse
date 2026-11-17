import { useState, type ReactNode } from 'react'

/** A page that slides up over the poster wall. `lifted` sits on its top edge (a title's poster) and drifts away as you scroll. */
export default function Sheet({ children, lifted, className = '' }: { children: ReactNode; lifted?: ReactNode; className?: string }): React.JSX.Element {
  const [scrolled, setScrolled] = useState(false)
  return (
    <section className={`sheet ${lifted ? 'has-lifted' : ''} ${scrolled ? 'scrolled' : ''} ${className}`}>
      {lifted && <div className="sheet-lifted">{lifted}</div>}
      <div className="sheet-scroll" onScroll={lifted ? (e) => setScrolled(e.currentTarget.scrollTop > 140) : undefined}>
        {children}
      </div>
    </section>
  )
}
