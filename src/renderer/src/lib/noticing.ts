import { useEffect, useState } from 'react'
import type { NoticingStatus } from '@shared/api'

/** What Eclipse is noticing (Phases 27 to 30), kept up to date while the window is open. */
export function useNoticing(): [NoticingStatus | null, (s: NoticingStatus) => void] {
  const [status, setStatus] = useState<NoticingStatus | null>(null)
  useEffect(() => {
    let live = true
    const load = (): void => void window.api.noticingStatus().then((s) => live && setStatus(s))
    load()
    const off = window.api.onNoticingChanged(load)
    return () => {
      live = false
      off()
    }
  }, [])
  return [status, setStatus]
}
