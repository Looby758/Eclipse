import { spawn } from 'child_process'
import { createServer, request, type Server } from 'http'
import { mkdtempSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { BRIDGE_SCRIPT, cleanAreas, type ClaudeArea, type ClaudeShow } from '@shared/claudeDesktop'
import { setStatus, setEpisodes, startWatchWith, tickWith } from '@core/library'
import type { Library, SearchResult, TitleDetails } from '@core/types'

/**
 * The Claude Desktop connection end to end: a real server on 127.0.0.1, Claude's side played by
 * the MCP SDK's own client (and by the bridge script, run with Node as Claude Desktop runs it).
 */

const home = mkdtempSync(join(tmpdir(), 'eclipse-claude-'))

vi.mock('electron', () => ({
  app: { getPath: () => home, getVersion: () => '9.9.9', on: () => undefined },
  ipcMain: { handle: () => undefined, on: () => undefined },
  safeStorage: { isEncryptionAvailable: () => true, encryptString: (s: string) => Buffer.from(s), decryptString: (b: Buffer) => b.toString() }
}))
vi.mock('./health', () => ({ log: vi.fn() }))

const { handleRequest, eclipseMcpServer } = await import('./claudeDesktop')
type Deps = Parameters<typeof eclipseMcpServer>[0]

const TOKEN = 'test-token-1234567890'
const NOW = new Date('2026-11-25T20:00:00')

const show = (id: number, name: string, year: number, seasons: [number, number][]): TitleDetails => ({
  key: `tv:${id}`,
  type: 'tv',
  id,
  name,
  originalName: null,
  year,
  date: `${year}-01-01`,
  tagline: '',
  overview: `${name} overview`,
  posterPath: null,
  backdropPath: null,
  genres: ['Drama'],
  runtime: 50,
  status: 'Returning Series',
  voteAverage: 8.5,
  voteCount: 100,
  seasons: seasons.map(([number, episodeCount]) => ({ number, name: `Season ${number}`, episodeCount, airDate: `${year + number - 1}-01-01`, posterPath: null })),
  numberOfSeasons: seasons.length,
  numberOfEpisodes: seasons.reduce((n, s) => n + s[1], 0),
  nextEpisode: null,
  lastAirDate: null,
  collection: null
})
const film = (id: number, name: string, year: number): TitleDetails => ({ ...show(id, name, year, []), key: `movie:${id}`, type: 'movie', runtime: 150 })

const DETAILS: Record<string, TitleDetails> = {
  'tv:95396': show(95396, 'Severance', 2022, [[1, 9], [2, 10]]),
  'tv:1396': show(1396, 'Breaking Bad', 2008, [[1, 7], [2, 13]]),
  'movie:438631': film(438631, 'Dune', 2021),
  'movie:841': film(841, 'Dune', 1984),
  'movie:27205': film(27205, 'Inception', 2010)
}
const asResult = (d: TitleDetails, popularity = 10): SearchResult => ({ key: d.key, type: d.type, id: d.id, name: d.name, year: d.year, posterPath: null, overview: d.overview, popularity })

let library: Library
let shown: ClaudeShow[] = []
let areas: Record<ClaudeArea, boolean> = cleanAreas({})
let undo: Library | null = null
let looks: string[] = []

function startLibrary(): Library {
  const item = (d: TitleDetails) => ({ key: d.key, type: d.type, id: d.id, title: { name: d.name, year: d.year, posterPath: null } })
  let l: Library = { version: 1, entries: {} }
  l = setStatus(l, item(DETAILS['tv:95396']), 'watching', NOW)
  l = setEpisodes(l, item(DETAILS['tv:95396']), ['S1E1', 'S1E2'], true, NOW)
  l = setStatus(l, item(DETAILS['tv:1396']), 'watched', NOW)
  // Watching Breaking Bad again with Jack, up to S1E2, no time set (like the Walking Dead card).
  l = startWatchWith(l, item(DETAILS['tv:1396']), 'Jack', NOW)
  l = tickWith(l, 'tv:1396', 0, ['S1E1', 'S1E2'], true, NOW)
  return l
}

const deps = (): Deps => ({
  areas,
  library: () => library,
  change: (fn) => {
    undo = library
    library = fn(library)
    return library
  },
  undoLast: () => {
    if (!undo) return 'There’s nothing of Claude’s to undo.'
    library = undo
    undo = null
    return 'Undone.'
  },
  tmdb: {
    hasKey: () => true,
    search: async (q) => Object.values(DETAILS).filter((d) => d.name.toLowerCase().includes(q.toLowerCase())).map((d) => asResult(d, d.year === 2021 ? 100 : 40)),
    details: async (type, id) => {
      const d = DETAILS[`${type}:${id}`]
      if (!d) throw new Error('Not found')
      return d
    },
    detailsMany: async (keys) => Object.fromEntries(keys.filter((k) => DETAILS[k]).map((k) => [k, DETAILS[k]])),
    season: async (tvId, n) => ({ tvId, number: n, name: `Season ${n}`, episodes: Array.from({ length: DETAILS[`tv:${tvId}`].seasons.find((s) => s.number === n)!.episodeCount }, (_, i) => ({ season: n, number: i + 1, name: `Episode ${i + 1}`, airDate: null, runtime: 50, overview: '', voteAverage: null, voteCount: 0, stillPath: null })) }),
    providers: async () => ({ region: 'GB', link: null, stream: [{ id: 8, name: 'Netflix', logoPath: null }, { id: 350, name: 'Apple TV Plus', logoPath: null }], free: [], rent: [], buy: [] }),
    services: async () => [
      { id: 8, name: 'Netflix', logoPath: null },
      { id: 337, name: 'Disney Plus', logoPath: null },
      { id: 350, name: 'Apple TV Plus', logoPath: null }
    ],
    credits: async () => ({ directors: [{ id: 1, name: 'Ben Stiller', profilePath: null, role: 'Director' }], cast: [{ id: 2, name: 'Adam Scott', profilePath: null, role: 'Mark' }] }),
    searchPeople: async () => [{ id: 2, name: 'Adam Scott', profilePath: null, knownFor: 'Acting', knownTitles: ['Severance'] }],
    person: async () => ({ id: 2, name: 'Adam Scott', profilePath: null, knownFor: 'Acting', directed: [], acted: [{ key: 'tv:95396', type: 'tv', id: 95396, name: 'Severance', year: 2022, posterPath: null, role: 'Mark' }] }),
    recommendations: async () => [{ ...asResult(DETAILS['movie:27205']), score: 1, because: ['Severance'] }],
    traitsOf: async () => [],
    calendar: async () => [{ uid: 'a', date: '2026-12-01', kind: 'season', key: 'tv:95396', title: 'Severance: season 3 starts', detail: '', url: '' }] as never,
    weekBudget: async () => null
  },
  show: (what) => void shown.push(what),
  app: { status: () => 'tray: false', set: (s, v) => `${s} is now ${v}` },
  more: {
    suggestions: () => [],
    acceptSuggestion: () => undefined,
    dismissSuggestion: () => undefined,
    backups: async () => [{ day: '2026-11-24', titles: 3, episodes: 2, watched: 1 }],
    restoreBackup: () => undefined,
    health: () => [{ label: 'Saving', ok: true, detail: 'Saved', at: null }],
    appearance: (setting, value) => void looks.push(`${setting}=${value}`)
  },
  now: () => NOW
})

let server: Server
let port = 0

beforeAll(async () => {
  server = createServer((req, res) => void handleRequest(req, res, TOKEN, () => eclipseMcpServer(deps())))
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  port = (server.address() as { port: number }).port
})
afterAll(() => server.close())
beforeEach(() => {
  library = startLibrary()
  shown = []
  undo = null
  looks = []
  areas = cleanAreas({})
})

async function connect(token = TOKEN): Promise<Client> {
  const client = new Client({ name: 'test', version: '1.0.0' })
  await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`), { requestInit: { headers: { Authorization: `Bearer ${token}` } } }))
  return client
}

const textOf = (r: unknown): string => ((r as { content: { text: string }[] }).content ?? []).map((c) => c.text).join('\n')
const call = async (name: string, args: Record<string, unknown> = {}): Promise<{ text: string; isError: boolean }> => {
  const c = await connect()
  const r = await c.callTool({ name, arguments: args })
  await c.close()
  return { text: textOf(r), isError: !!(r as { isError?: boolean }).isError }
}

function post(headers: Record<string, string>, body = '{}'): Promise<number> {
  return new Promise((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port, path: '/mcp', method: 'POST', headers: { 'Content-Type': 'application/json', ...headers } }, (res) => {
      res.resume()
      resolve(res.statusCode ?? 0)
    })
    req.on('error', reject)
    req.end(body)
  })
}

describe('who can reach it', () => {
  it('turns away a wrong secret, a web page and other paths', async () => {
    expect(await post({ Authorization: 'Bearer nope' })).toBe(401)
    expect(await post({ Authorization: `Bearer ${TOKEN}`, Origin: 'https://evil.example' })).toBe(403)
    expect(await post({ Authorization: `Bearer ${TOKEN}`, Host: 'evil.example' })).toBe(403)
    await expect(connect('nope')).rejects.toThrow()
  })
})

describe('tools', () => {
  it('offers only the parts that are switched on', async () => {
    const c = await connect()
    const all = (await c.listTools()).tools.map((t) => t.name)
    await c.close()
    for (const name of ['get_overview', 'mark_episodes', 'search', 'get_evenings', 'set_app_setting', 'open_in_eclipse', 'undo_last_change']) expect(all).toContain(name)
    areas = { ...cleanAreas({}), tracking: false, settings: false }
    const c2 = await connect()
    const fewer = (await c2.listTools()).tools.map((t) => t.name)
    await c2.close()
    expect(fewer).toContain('get_overview')
    expect(fewer).not.toContain('mark_episodes')
    expect(fewer).not.toContain('set_app_setting')
    expect(fewer).toContain('open_in_eclipse')
  })

  it('gives an overview with what’s up next', async () => {
    const r = await call('get_overview')
    expect(r.text).toContain('1 watching')
    expect(r.text).toMatch(/Severance \(2022\) \[tv:95396\]: next S01E03/)
  })

  it('ticks the next episode, and undoes it', async () => {
    const r = await call('tick_next_episode', { title: 'severance', count: 2 })
    expect(r.text).toContain('Ticked S01E03 to S01E04')
    expect(r.text).toContain('Next: S01E05')
    expect(Object.keys(library.entries['tv:95396'].episodes ?? {})).toHaveLength(4)
    expect((await call('undo_last_change')).text).toBe('Undone.')
    expect(Object.keys(library.entries['tv:95396'].episodes ?? {})).toHaveLength(2)
  })

  it('ticks up to an episode, and a season seen long ago', async () => {
    await call('mark_episodes', { title: 'tv:95396', season: 2, episode: 3, up_to: true })
    expect(Object.keys(library.entries['tv:95396'].episodes ?? {})).toHaveLength(12)
    const r = await call('mark_episodes', { title: 'Breaking Bad', season: 1, before_eclipse: true })
    expect(r.text).toContain('S01E01 to S01E07')
    expect(library.entries['tv:1396'].episodes?.S1E1).toBe('seen')
  })

  it('adds a title found on TMDB, and asks which when it isn’t clear', async () => {
    const added = await call('set_status', { title: 'Inception', status: 'want' })
    expect(added.text).toBe('Added Inception (2010) [movie:27205] to Want to watch.')
    expect(library.entries['movie:27205'].status).toBe('want')
    // Two films called Dune, neither far more popular: Claude is asked to choose by key.
    const dune = await call('set_status', { title: 'Dune', status: 'want' })
    expect(dune.isError).toBe(true)
    expect(dune.text).toContain('[movie:438631]')
    expect(dune.text).toContain('[movie:841]')
    expect(library.entries['movie:438631']).toBeUndefined()
    const unclear = await call('set_status', { title: 'Severance (1999)', status: 'want' })
    expect(unclear.isError).toBe(true)
  })

  it('asks which when the library has two', async () => {
    library = setStatus(library, { key: 'movie:438631', type: 'movie', id: 438631, title: { name: 'Dune', year: 2021, posterPath: null } }, 'watched', NOW)
    library = setStatus(library, { key: 'movie:841', type: 'movie', id: 841, title: { name: 'Dune', year: 1984, posterPath: null } }, 'want', NOW)
    const r = await call('update_title', { title: 'Dune', rating: 9 })
    expect(r.isError).toBe(true)
    expect(r.text).toContain('[movie:841]')
    const ok = await call('update_title', { title: 'Dune (2021)', rating: 9, note: 'IMAX' })
    expect(ok.text).toContain('rated it 9/10')
    expect(library.entries['movie:438631'].rating).toBe(9)
    expect(library.entries['movie:438631'].note).toBe('IMAX')
  })

  it('reads a title, a season and history', async () => {
    const t = await call('get_title', { title: 'Severance', cast: true })
    expect(t.text).toContain('Season 1: 9 episodes')
    expect(t.text).toContain('The user’s next episode: S01E03')
    expect(t.text).toContain('Adam Scott (Mark)')
    const s = await call('get_season', { title: 'Severance', season: 1 })
    expect(s.text).toContain('S01E02 “Episode 2”, 50 min, watched 2026-11-25')
    const h = await call('get_watch_history')
    expect(h.text).toContain('Severance (2022) [tv:95396]: S01E01 to S01E02')
  })

  it('changes evenings and services', async () => {
    const r = await call('set_evenings', { bedtime: '00:30', days: ['friday', 'saturday'], nights_off: ['monday'] })
    expect(r.text).toContain('Friday: 20:00 to 00:30')
    expect(r.text).toContain('Monday: not watching')
    expect(r.text).toContain('Tuesday: 20:00 to 23:00')
    const s = await call('set_services', { add: ['netflix', 'Disney+'] })
    expect(s.text).toBe('Services now: Netflix, Disney Plus.')
    const w = await call('where_to_watch', { title: 'Severance' })
    expect(w.text).toContain('Netflix (yours)')
  })

  it('keeps lists, Watch soon and favourites', async () => {
    await call('create_list', { name: 'Cosy', titles: ['Breaking Bad'] })
    expect(library.lists?.[0].items?.map((r) => r.key)).toEqual(['tv:1396'])
    await call('set_in_list', { list: 'cosy', title: 'Severance', on: true })
    expect(library.lists?.[0].items).toHaveLength(2)
    await call('set_watch_soon', { title: 'Severance', on: true })
    expect(library.watchSoon?.[0].key).toBe('tv:95396')
    await call('set_favourite', { title: 'Breaking Bad', on: true })
    expect(library.favourites?.[0].key).toBe('tv:1396')
  })

  it('opens a page or a title in the window', async () => {
    await call('open_in_eclipse', { page: 'stats' })
    await call('open_in_eclipse', { title: 'Severance' })
    expect(shown).toEqual([{ page: 'stats' }, { title: { type: 'tv', id: 95396 } }])
  })

  it('reports a failure as a message, not a crash', async () => {
    const r = await call('react_to_episode', { title: 'Severance', season: 1, episode: 5, reaction: 'fire' })
    expect(r.isError).toBe(true)
    expect(r.text).toContain('isn’t ticked yet')
  })
})

describe('watching together', () => {
  it('shows in the overview and its own list', async () => {
    const o = await call('get_overview')
    expect(o.text).toContain('Watching together')
    expect(o.text).toMatch(/With Jack: Breaking Bad \(2008\) \[tv:1396\], next S01E03, no time set/)
    const t = await call('get_watching_together')
    expect(t.text).toContain('With Jack')
    expect(t.text).toContain('People they’ve watched with: Jack')
  })

  it('ticks the next one together without touching the user’s own progress', async () => {
    const r = await call('tick_next_episode', { title: 'Breaking Bad', with: 'jack' })
    expect(r.text).toContain('Ticked S01E03 of Breaking Bad (2008) [tv:1396] with Jack. Next together: S01E04.')
    expect(Object.keys(library.entries['tv:1396'].rewatches![0].episodes!)).toEqual(['S1E1', 'S1E2', 'S1E3'])
    expect(library.entries['tv:1396'].episodes).toBeUndefined()
    const m = await call('mark_episodes', { title: 'Breaking Bad', season: 1, episode: 4, with: 'Jack' })
    expect(m.text).toContain('on the watch with Jack')
    expect(Object.keys(library.entries['tv:1396'].rewatches![0].episodes!)).toHaveLength(4)
  })

  it('sets a time, starts and ends watches together', async () => {
    await call('plan_watching_with', { title: 'Breaking Bad', with: 'Jack', at: '2026-11-28T20:30', weekly: true })
    expect(library.entries['tv:1396'].rewatches![0].planned).toEqual({ at: '2026-11-28T20:30', weekly: true })
    expect((await call('get_watching_together')).text).toContain('every week, next 2026-11-28 20:30')
    await call('start_watching_with', { title: 'Severance', with: 'Sam' })
    expect(library.entries['tv:95396'].rewatches![0].with).toBe('Sam')
    const wrong = await call('tick_next_episode', { title: 'Severance', with: 'Jack' })
    expect(wrong.isError).toBe(true)
    expect(wrong.text).toContain('It’s being watched with Sam')
    await call('end_watching_with', { title: 'Breaking Bad', with: 'Jack', action: 'finish' })
    expect(library.entries['tv:1396'].rewatches![0].finishedOn).toBe('2026-11-25')
  })
})

describe('everything else', () => {
  it('clears out and puts back', async () => {
    await call('set_status', { title: 'Inception', status: 'want' })
    await call('drop_from_watchlist', { title: 'Inception' })
    expect(library.entries['movie:27205']).toBeUndefined()
    expect((await call('get_dropped')).text).toContain('Inception')
    await call('restore_dropped', { title: 'inception' })
    expect(library.entries['movie:27205'].status).toBe('want')
  })

  it('reorders Watch soon', async () => {
    await call('set_watch_soon', { title: 'Severance', on: true })
    await call('set_watch_soon', { title: 'Breaking Bad', on: true })
    await call('reorder', { where: 'watch_soon', title: 'Breaking Bad', position: 1 })
    expect(library.watchSoon?.map((r) => r.key)).toEqual(['tv:1396', 'tv:95396'])
  })

  it('changes looks, and reads backups and health', async () => {
    expect((await call('set_appearance', { setting: 'theme', value: 'light' })).text).toBe('theme is now light.')
    expect((await call('set_appearance', { setting: 'theme', value: 'pink' })).isError).toBe(true)
    expect(looks).toEqual(['theme=light'])
    expect((await call('get_backups')).text).toContain('2026-11-24: 3 titles')
    expect((await call('get_health')).text).toContain('ok Saving')
  })

  it('marks something seen before Eclipse', async () => {
    await call('mark_seen_before', { title: 'Inception' })
    expect(library.entries['movie:27205']).toMatchObject({ status: 'watched', seenBefore: true })
  })
})

describe('the bridge Claude Desktop runs', () => {
  it('passes messages through to Eclipse and back', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'eclipse-bridge-'))
    const script = join(dir, 'bridge.cjs')
    const portFile = join(dir, 'port.json')
    writeFileSync(script, BRIDGE_SCRIPT)
    writeFileSync(portFile, JSON.stringify({ port }))
    const child = spawn(process.execPath, [script], { env: { ...process.env, ECLIPSE_PORT_FILE: portFile, ECLIPSE_TOKEN: TOKEN } })
    const out: string[] = []
    child.stdout.on('data', (b: Buffer) => out.push(...b.toString().split('\n').filter(Boolean)))
    const done = new Promise<void>((resolve) => child.on('exit', () => resolve()))
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'x', version: '1' } } }) + '\n')
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' }) + '\n')
    child.stdin.end()
    await done
    const answers = out.map((l) => JSON.parse(l) as { id: number; result?: { serverInfo?: { name: string }; tools?: unknown[] } })
    expect(answers.find((a) => a.id === 1)?.result?.serverInfo?.name).toBe('eclipse')
    expect(answers.find((a) => a.id === 2)?.result?.tools?.length).toBeGreaterThan(20)
  })

  it('says when Eclipse isn’t open', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'eclipse-bridge-'))
    const script = join(dir, 'bridge.cjs')
    writeFileSync(script, BRIDGE_SCRIPT)
    const child = spawn(process.execPath, [script], { env: { ...process.env, ECLIPSE_PORT_FILE: join(dir, 'missing.json'), ECLIPSE_TOKEN: TOKEN } })
    let out = ''
    child.stdout.on('data', (b: Buffer) => (out += b.toString()))
    const done = new Promise<void>((resolve) => child.on('exit', () => resolve()))
    child.stdin.end(JSON.stringify({ jsonrpc: '2.0', id: 7, method: 'tools/list' }) + '\n')
    await done
    expect(JSON.parse(out).error.message).toContain('Eclipse isn’t open')
  })
})
