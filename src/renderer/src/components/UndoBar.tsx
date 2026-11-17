import { Check, Undo2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { UndoOffer } from '@shared/api'
import { useApp } from '../store/app'

const SHOW_FOR = 7000

/** Phase 36: "Done · Undo" for a few seconds after a change (Ctrl+Z works too while it shows). */
export default function UndoBar(): React.JSX.Element | null {
  const [offer, setOffer] = useState<UndoOffer | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const timer = useRef<number | undefined>(undefined)
  const setLibrary = useApp((s) => s.setLibrary)

  const hideLater = (ms: number): void => {
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => {
      setOffer(null)
      setNote(null)
    }, ms)
  }

  useEffect(() => {
    const stop = window.api.onUndoOffer((o) => {
      setOffer(o)
      setNote(null)
      hideLater(SHOW_FOR)
    })
    return () => {
      stop()
      window.clearTimeout(timer.current)
    }
  }, [])

  const undo = async (): Promise<void> => {
    if (!offer) return
    const r = await window.api.undo(offer.id)
    if (r.ok) {
      setLibrary(r.value)
      setNote(`Undone: ${offer.label}`)
    } else setNote(r.error)
    setOffer(null)
    hideLater(3500)
  }

  useEffect(() => {
    if (!offer) return
    const onKey = (e: KeyboardEvent): void => {
      const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement
      if (!typing && (e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        void undo()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  if (!offer && !note) return null
  return (
    <div className="undo-bar" role="status" aria-live="polite">
      {offer ? (
        <>
          <Check size={16} className="undo-done" />
          <span className="undo-label">{offer.label}</span>
          <button className="undo-btn" onClick={undo}>
            <Undo2 size={15} /> Undo
          </button>
        </>
      ) : (
        <span className="undo-label">{note}</span>
      )}
    </div>
  )
}
