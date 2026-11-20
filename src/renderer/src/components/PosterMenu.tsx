import { Check, CircleCheck, Hourglass, ListPlus, Plus, SquareArrowOutUpRight } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { customListsWith, listsOf } from '@core/lists'
import { isWatchSoon } from '@core/watchsoon'
import type { TitleRef } from '@core/types'
import { useApp } from '../store/app'

/** When a click outside last closed the menu: that click only closes it, it doesn't open the poster under it. */
let closedByClickAt = 0
export const justClosedMenu = (): boolean => performance.now() - closedByClickAt < 500

export interface PosterMenuAt {
  title: TitleRef
  x: number
  y: number
}

/**
 * Right-click a poster on Home: Open, Watch soon, Mark watched and Add to a list, without opening
 * its page. Escape, a click elsewhere or scrolling closes it.
 */
export default function PosterMenu({ at, onClose }: { at: PosterMenuAt; onClose: () => void }): React.JSX.Element {
  const { title: t } = at
  const library = useApp((s) => s.library)
  const { go, setLibrary } = useApp.getState()
  const entry = library.entries[t.key]
  const soon = isWatchSoon(library, t.key)
  const own = listsOf(library).filter((l) => l.source.kind === 'custom')
  const onIt = new Set(customListsWith(library, t.key).map((l) => l.id))
  const [lists, setLists] = useState(false)
  const [newList, setNewList] = useState<string | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ left: at.x, top: at.y })

  // Keep the menu on screen: flip it left or up when it would run off the edge.
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const left = at.x + r.width > window.innerWidth - 8 ? Math.max(8, at.x - r.width) : at.x
    const top = at.y + r.height > window.innerHeight - 8 ? Math.max(8, window.innerHeight - 8 - r.height) : at.y
    setPos({ left, top })
  }, [at.x, at.y, lists, newList !== null, own.length])

  const typing = useRef(false)
  typing.current = newList !== null
  useEffect(() => {
    ref.current?.querySelector<HTMLButtonElement>('button')?.focus()
  }, [])
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.stopImmediatePropagation()
        e.preventDefault()
        if (typing.current) setNewList(null)
        else onClose()
      } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        const items = [...(ref.current?.querySelectorAll<HTMLElement>('button, input') ?? [])]
        const i = items.indexOf(document.activeElement as HTMLElement)
        items[(i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus()
        e.preventDefault()
        e.stopImmediatePropagation()
      }
    }
    const onDown = (e: PointerEvent): void => {
      if (ref.current?.contains(e.target as Node)) return
      closedByClickAt = performance.now()
      onClose()
    }
    window.addEventListener('keydown', onKey, true)
    window.addEventListener('pointerdown', onDown, true)
    window.addEventListener('blur', onClose)
    window.addEventListener('resize', onClose)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      window.removeEventListener('pointerdown', onDown, true)
      window.removeEventListener('blur', onClose)
      window.removeEventListener('resize', onClose)
    }
  }, [onClose])

  const item = { key: t.key, type: t.type, id: t.id, title: { name: t.name, year: t.year, posterPath: t.posterPath } }
  const run = (job: () => Promise<void>): void => {
    onClose()
    void job()
  }

  return createPortal(
    <div ref={ref} className="poster-menu" role="menu" aria-label={t.name} style={pos} onContextMenu={(e) => e.preventDefault()}>
      <div className="poster-menu-name">
        {t.name}
        {t.year ? <span> {t.year}</span> : null}
      </div>
      <button role="menuitem" onClick={() => run(async () => go({ name: 'title', type: t.type, id: t.id }))}>
        <SquareArrowOutUpRight size={15} /> Open
      </button>
      <button role="menuitem" onClick={() => run(async () => setLibrary(await window.api.setWatchSoon(t, !soon)))}>
        <Hourglass size={15} /> {soon ? 'Take off Watch soon' : 'Watch soon'}
      </button>
      {entry?.status !== 'watched' && (
        <button role="menuitem" onClick={() => run(async () => setLibrary(await window.api.setStatus(item, 'watched')))}>
          <CircleCheck size={15} /> Mark watched
        </button>
      )}
      <button role="menuitem" aria-expanded={lists} onClick={() => setLists(!lists)}>
        <ListPlus size={15} /> Add to a list
      </button>
      {lists && (
        <div className="poster-menu-lists">
          {own.map((l) => {
            const on = onIt.has(l.id)
            return (
              <button key={l.id} role="menuitemcheckbox" aria-checked={on} onClick={async () => setLibrary(await window.api.setInList(l.id, t, !on))}>
                <span className="poster-menu-check">{on && <Check size={14} />}</span> {l.name}
              </button>
            )
          })}
          {newList === null ? (
            <button role="menuitem" onClick={() => setNewList('')}>
              <Plus size={14} /> New list
            </button>
          ) : (
            <form
              onSubmit={async (e) => {
                e.preventDefault()
                if (!newList.trim()) return
                const name = newList.trim()
                onClose()
                setLibrary((await window.api.createList(name, [t])).library)
              }}
            >
              <input autoFocus placeholder="List name" value={newList} onChange={(e) => setNewList(e.target.value)} aria-label="New list name" />
            </form>
          )}
        </div>
      )}
    </div>,
    document.body
  )
}
