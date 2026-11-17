import { useEffect, useState } from 'react'
import { emptyHistory, type ServiceHistory } from '@core/services'

/** What arrived on and left your services lately (the app checks once a day). */
export function useServiceHistory(): ServiceHistory {
  const [h, setH] = useState<ServiceHistory>(emptyHistory)
  useEffect(() => {
    let cancelled = false
    window.api.servicesHistory().then((x) => !cancelled && setH(x))
    const off = window.api.onServicesChanged(setH)
    return () => {
      cancelled = true
      off()
    }
  }, [])
  return h
}
