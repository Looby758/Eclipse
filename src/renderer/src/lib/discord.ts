import { useEffect, useState } from 'react'
import type { DiscordStatus } from '@shared/api'

/** The Discord status (Phase 44), kept up to date while the window is open (the tray can switch it too). */
export function useDiscord(): [DiscordStatus | null, (patch: { on?: boolean; appId?: string }) => Promise<void>] {
  const [status, setStatus] = useState<DiscordStatus | null>(null)
  useEffect(() => {
    let live = true
    void window.api.discordStatus().then((s) => live && setStatus(s))
    const off = window.api.onDiscordChanged((s) => live && setStatus(s))
    return () => {
      live = false
      off()
    }
  }, [])
  const set = async (patch: { on?: boolean; appId?: string }): Promise<void> => setStatus(await window.api.setDiscord(patch))
  return [status, set]
}

/** A line for what the status is doing, in plain words. */
export function discordLine(s: DiscordStatus): string {
  if (!s.on) return 'Off: Discord doesn’t show what you’re watching.'
  switch (s.state) {
    case 'needs-id':
      return 'Paste your Discord application ID below to finish setting it up.'
    case 'connected':
      return s.showing ? `Showing: Watching ${s.showing}` : 'Connected to Discord. Nothing showing until something of yours plays.'
    case 'connecting':
      return 'Looking for the Discord app…'
    case 'error':
      return s.error ?? 'Something went wrong talking to Discord.'
    default:
      return 'On. When something of yours plays, Eclipse looks for the Discord app on this computer. If Discord isn’t open, nothing is shown and it tries again.'
  }
}
