import type { ReactNode } from 'react'

/** A page that slides up over the poster wall. `lifted` sits on its top edge (a title's poster). */
export default function Sheet({ children, lifted, className = '' }: { children: ReactNode; lifted?: ReactNode; className?: string }): React.JSX.Element {
  return (
    <section className={`sheet ${lifted ? 'has-lifted' : ''} ${className}`}>
      {lifted && <div className="sheet-lifted">{lifted}</div>}
      <div className="sheet-scroll">{children}</div>
    </section>
  )
}
