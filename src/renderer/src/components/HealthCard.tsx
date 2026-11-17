import { CircleAlert, CircleCheck, CircleDashed, Copy } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { JobState } from '@shared/api'

/** "14 minutes ago" from a time in milliseconds. */
export function ago(at: number, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - at) / 1000))
  if (s < 45) return 'just now'
  const m = Math.round(s / 60)
  if (m < 60) return `${m} minute${m === 1 ? '' : 's'} ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h} hour${h === 1 ? '' : 's'} ago`
  const d = Math.round(h / 24)
  return `${d} day${d === 1 ? '' : 's'} ago`
}

/** Settings, Phase 39: "Is everything working?" */
export default function HealthCard(): React.JSX.Element {
  const [jobs, setJobs] = useState<JobState[]>([])
  const [copied, setCopied] = useState(false)
  const [, tick] = useState(0)

  useEffect(() => {
    const load = (): void => void window.api.health().then(setJobs)
    load()
    const stop = window.api.onHealthChanged(load)
    // Keeps "x minutes ago" fresh.
    const t = window.setInterval(() => tick((n) => n + 1), 30_000)
    return () => {
      stop()
      window.clearInterval(t)
    }
  }, [])

  const problems = jobs.filter((j) => !j.ok).length
  return (
    <section className="card">
      <h2>Is everything working?</h2>
      <p className="muted">
        {problems ? `${problems} thing${problems === 1 ? ' needs' : 's need'} a look.` : 'Everything that has run is fine.'} Problems are also written to a small log on this computer. <em>Copy details</em> puts this
        list and the log on the clipboard, ready to paste to Claude.
      </p>
      <ul className="health-list">
        {jobs.map((j) => {
          const Icon = !j.ok ? CircleAlert : j.at ? CircleCheck : CircleDashed
          return (
            <li key={j.id} className={`health-row ${j.ok ? '' : 'bad'}`}>
              <Icon size={18} className="health-icon" />
              <div>
                <b>{j.label}</b>
                <span className="small">
                  {j.detail}
                  {j.at ? ` · ${ago(j.at)}` : ''}
                </span>
              </div>
            </li>
          )
        })}
      </ul>
      <button
        className="btn glass"
        onClick={async () => {
          await window.api.copyHealth()
          setCopied(true)
          window.setTimeout(() => setCopied(false), 2500)
        }}
      >
        <Copy size={16} /> {copied ? 'Copied' : 'Copy details'}
      </button>
    </section>
  )
}
