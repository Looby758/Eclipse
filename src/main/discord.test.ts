import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { createServer, type Server, type Socket } from 'net'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { decodeFrames, encodeFrame } from '@core/discord'
import type { Recognised } from '@core/watching'

// Settings without Electron.
const settings: Record<string, unknown> = {}
vi.mock('./settings', () => ({
  loadSettings: () => settings,
  saveSettings: (patch: Record<string, unknown>) => Object.assign(settings, patch)
}))

const r: Recognised = { key: 'tv:1402', name: 'The Walking Dead', type: 'tv', season: 9, episode: 4, sure: true, service: null, position: 60, duration: 2700, playing: true }
const until = async (check: () => boolean): Promise<void> => {
  for (let i = 0; i < 100 && !check(); i++) await new Promise((res) => setTimeout(res, 20))
  expect(check()).toBe(true)
}

/** A stand-in for the Discord app on its local connection. */
describe('talking to Discord', () => {
  const dir = mkdtempSync(join(tmpdir(), 'discord-'))
  const got: { op: number; data: any }[] = []
  let server: Server
  let client: Socket | null = null
  beforeAll(async () => {
    process.env.XDG_RUNTIME_DIR = dir
    server = createServer((s) => {
      client = s
      let buf = Buffer.alloc(0)
      s.on('data', (chunk) => {
        const { frames, rest } = decodeFrames(Buffer.concat([buf, chunk]))
        buf = Buffer.from(rest)
        for (const f of frames) {
          got.push(f)
          if (f.op === 0) s.write(encodeFrame(1, { cmd: 'DISPATCH', evt: 'READY', data: { v: 1 } }))
        }
      })
    })
    // Windows talks to Discord over a named pipe, which ignores XDG_RUNTIME_DIR; elsewhere it's a socket file in that folder.
    const where = process.platform === 'win32' ? '\\\\?\\pipe\\discord-ipc-0' : join(dir, 'discord-ipc-0')
    await new Promise<void>((res, rej) => server.once('error', rej).listen(where, res))
  })
  afterAll(() => {
    server.close()
    rmSync(dir, { recursive: true, force: true })
  })

  it('stays quiet until switched on with an ID, then sets and clears the status', async () => {
    const d = await import('./discord')
    d.setupDiscord(() => undefined)
    d.updateDiscord(r, null)
    expect(d.discordStatus().state).toBe('off')

    d.setDiscord({ on: true })
    expect(d.discordStatus().state).toBe('needs-id')
    d.setDiscord({ appId: '1234567890123456789' })
    d.updateDiscord(r, '/p.jpg')
    await until(() => got.some((f) => f.op === 1 && f.data.cmd === 'SET_ACTIVITY'))
    expect(got[0]).toEqual({ op: 0, data: { v: 1, client_id: '1234567890123456789' } })
    const set = got.find((f) => f.data.cmd === 'SET_ACTIVITY')!
    expect(set.data.args.activity.details).toBe('The Walking Dead · S9 E4')
    expect(d.discordStatus()).toMatchObject({ state: 'connected', showing: 'The Walking Dead · S9 E4' })

    // Five seconds on: nothing new to send.
    const before = got.length
    d.updateDiscord({ ...r, position: 65 }, '/p.jpg')
    expect(got.length).toBe(before)

    // Stopped: cleared.
    d.updateDiscord(null)
    await until(() => got.length > before)
    expect(got.at(-1)!.data.args.activity).toBeUndefined()
    expect(d.discordStatus().showing).toBeNull()

    // Switched off while playing: cleared at once.
    d.updateDiscord(r, null)
    await until(() => got.at(-1)!.data.args.activity !== undefined)
    d.setDiscord({ on: false })
    await until(() => got.at(-1)!.data.args.activity === undefined)
    expect(d.discordStatus().state).toBe('off')
  })

  it('Discord not running: says so and does not throw', async () => {
    const d = await import('./discord')
    server.close()
    client?.destroy()
    await new Promise((res) => setTimeout(res, 50))
    rmSync(join(dir, 'discord-ipc-0'), { force: true })
    d.setDiscord({ on: true })
    d.updateDiscord(r, null)
    await until(() => d.discordStatus().state === 'not-running')
    d.setDiscord({ on: false })
  })
})
