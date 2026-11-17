import { spawn, execFile, type ChildProcess } from 'child_process'
import type { NowPlaying } from '@core/watching'

/**
 * Phase 28: what's playing. Windows keeps track of what's playing for its media keys and volume
 * pop-up (the "media session"), and browsers pass the title through. Eclipse asks Windows every few
 * seconds through a small PowerShell script, and also reads the browser window titles as a backup.
 * On a Mac that's closed to apps, so Eclipse asks Chrome, Edge and Safari for the front tab instead
 * (the Mac asks once whether Eclipse may do that). Nothing leaves this computer.
 */

// The PowerShell script: prints one line of JSON every few seconds until Eclipse stops it.
const WINDOWS_SCRIPT = [
  "$ErrorActionPreference = 'SilentlyContinue'",
  'Add-Type -AssemblyName System.Runtime.WindowsRuntime',
  "$asTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' })[0]",
  'function Await($op, [Type]$t) { $task = $asTask.MakeGenericMethod($t).Invoke($null, @($op)); $task.Wait(-1) | Out-Null; $task.Result }',
  '$null = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType = WindowsRuntime]',
  '$mgr = $null',
  'try { $mgr = Await ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]) } catch {}',
  'while ($true) {',
  '  $out = @()',
  '  if ($mgr) {',
  '    foreach ($s in $mgr.GetSessions()) {',
  '      try {',
  '        $p = Await ($s.TryGetMediaPropertiesAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties])',
  '        $tl = $s.GetTimelineProperties()',
  '        $pb = $s.GetPlaybackInfo()',
  "        $out += [pscustomobject]@{ kind = 'media'; app = $s.SourceAppUserModelId; title = $p.Title; artist = $p.Artist; album = $p.AlbumTitle; status = ([string]$pb.PlaybackStatus).ToLower(); position = $tl.Position.TotalSeconds; duration = $tl.EndTime.TotalSeconds; updated = $tl.LastUpdatedTime.ToUnixTimeMilliseconds() }",
  '      } catch {}',
  '    }',
  '  }',
  '  foreach ($w in (Get-Process chrome, msedge, opera -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowTitle })) {',
  "    $out += [pscustomobject]@{ kind = 'window'; app = $w.ProcessName; title = $w.MainWindowTitle }",
  '  }',
  '  [Console]::Out.WriteLine((ConvertTo-Json -Compress -Depth 3 -InputObject @($out)))',
  '  [Console]::Out.Flush()',
  '  Start-Sleep -Seconds 5',
  '}'
].join('\n')

// macOS: the front tab of each browser that's running (title and address), tab-separated.
const MAC_SCRIPT = [
  'on tabOf(appName)',
  '  try',
  '    if application appName is running then',
  '      if appName is "Safari" then',
  '        tell application "Safari" to return (name of current tab of front window) & tab & (URL of current tab of front window)',
  '      else',
  '        tell application appName to return (title of active tab of front window) & tab & (URL of active tab of front window)',
  '      end if',
  '    end if',
  '  end try',
  '  return ""',
  'end tabOf',
  'set out to ""',
  'repeat with b in {"Google Chrome", "Microsoft Edge", "Safari"}',
  '  set t to tabOf(b as text)',
  '  if t is not "" then set out to out & (b as text) & tab & t & linefeed',
  'end repeat',
  'return out'
].join('\n')

interface Raw {
  kind: 'media' | 'window'
  app: string
  title: string
  artist?: string
  album?: string
  status?: string
  position?: number
  duration?: number
  updated?: number
}

export interface PlayingReport {
  at: number
  items: NowPlaying[]
  error: string | null
}

let child: ChildProcess | null = null
let macTimer: NodeJS.Timeout | null = null
let latest: PlayingReport = { at: 0, items: [], error: null }

/** Turns Windows' report into what Eclipse uses, moving the position on to now while it plays. */
export function fromWindows(raw: Raw[], now = Date.now()): NowPlaying[] {
  return raw
    .filter((r) => r && r.title)
    .map((r) => {
      if (r.kind === 'window') return { app: r.app, title: r.title }
      let position = typeof r.position === 'number' ? r.position : null
      if (position != null && r.status === 'playing' && r.updated && r.updated > 0) position += Math.max(0, (now - r.updated) / 1000)
      const duration = typeof r.duration === 'number' && r.duration > 0 ? r.duration : null
      if (position != null && duration != null) position = Math.min(position, duration)
      return { app: r.app, title: r.title, artist: r.artist || undefined, album: r.album || undefined, status: r.status, position, duration }
    })
}

function startWindows(onUpdate: () => void): void {
  const encoded = Buffer.from(WINDOWS_SCRIPT, 'utf16le').toString('base64')
  const ps = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded], { windowsHide: true })
  child = ps
  let buffer = ''
  ps.stdout.setEncoding('utf8')
  ps.stdout.on('data', (chunk: string) => {
    buffer += chunk
    let i: number
    while ((i = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, i).trim()
      buffer = buffer.slice(i + 1)
      if (!line) continue
      try {
        const parsed = JSON.parse(line) as Raw | Raw[]
        latest = { at: Date.now(), items: fromWindows(Array.isArray(parsed) ? parsed : [parsed]), error: null }
        onUpdate()
      } catch {
        // Not a whole line of JSON: skip it.
      }
    }
  })
  ps.on('error', (err) => {
    latest = { ...latest, error: `Couldn’t start PowerShell: ${err.message}` }
    onUpdate()
  })
  ps.on('exit', () => {
    if (child === ps) child = null
  })
}

function readMac(onUpdate: () => void): void {
  execFile('osascript', ['-e', MAC_SCRIPT], { timeout: 8000 }, (err, stdout) => {
    if (err) {
      latest = {
        at: Date.now(),
        items: [],
        error: /not allowed|-1743/.test(err.message) ? 'The Mac hasn’t allowed Eclipse to read your browser tabs. Allow it in System Settings → Privacy & Security → Automation.' : err.message
      }
    } else {
      const items: NowPlaying[] = stdout
        .split('\n')
        .map((l) => l.split('\t'))
        .filter((p) => p.length >= 3 && p[1])
        .map(([app, title, url]) => ({ app, title, url: url || null }))
      latest = { at: Date.now(), items, error: null }
    }
    onUpdate()
  })
}

export function startNowPlaying(onUpdate: () => void): void {
  if (child || macTimer) return
  if (process.platform === 'win32') startWindows(onUpdate)
  else if (process.platform === 'darwin') {
    readMac(onUpdate)
    macTimer = setInterval(() => readMac(onUpdate), 10_000)
  } else latest = { at: Date.now(), items: [], error: 'Only on Windows and Mac.' }
}

export function stopNowPlaying(): void {
  child?.kill()
  child = null
  if (macTimer) clearInterval(macTimer)
  macTimer = null
  latest = { at: 0, items: [], error: null }
}

/** What the computer reported last (nothing once it's been quiet for over a minute). */
export function nowPlaying(): PlayingReport {
  if (latest.at && Date.now() - latest.at > 60_000) return { ...latest, items: [] }
  return latest
}
