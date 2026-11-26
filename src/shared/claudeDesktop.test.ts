import { describe, expect, it } from 'vitest'
import { bridgeEntry, claudeConfigPaths, cleanAreas, hasEclipseServer, withEclipseServer, withoutEclipseServer } from './claudeDesktop'

const entry = bridgeEntry('C:\\Eclipse\\Eclipse.exe', 'C:\\data\\bridge.cjs', 'C:\\data\\port.json', 'secret')

describe('Claude Desktop’s settings file', () => {
  it('adds Eclipse beside what’s there (Orbit included)', () => {
    const before = JSON.stringify({ theme: 'dark', mcpServers: { orbit: { command: 'orbit' } } })
    const after = JSON.parse(withEclipseServer(before, entry))
    expect(after.theme).toBe('dark')
    expect(after.mcpServers.orbit).toEqual({ command: 'orbit' })
    expect(after.mcpServers.eclipse.env).toEqual({ ELECTRON_RUN_AS_NODE: '1', ECLIPSE_PORT_FILE: 'C:\\data\\port.json', ECLIPSE_TOKEN: 'secret' })
    expect(hasEclipseServer(JSON.stringify(after), 'secret')).toBe(true)
    expect(hasEclipseServer(JSON.stringify(after), 'other')).toBe(false)
  })

  it('starts a file that isn’t there yet, and never overwrites a broken one', () => {
    expect(JSON.parse(withEclipseServer(null, entry)).mcpServers.eclipse.command).toBe('C:\\Eclipse\\Eclipse.exe')
    expect(() => withEclipseServer('{ not json', entry)).toThrow()
    expect(() => withEclipseServer('[]', entry)).toThrow()
  })

  it('takes only Eclipse back out', () => {
    const both = withEclipseServer(JSON.stringify({ mcpServers: { orbit: { command: 'orbit' } } }), entry)
    expect(JSON.parse(withoutEclipseServer(both)!).mcpServers).toEqual({ orbit: { command: 'orbit' } })
    expect(withoutEclipseServer(JSON.stringify({ mcpServers: {} }))).toBeNull()
  })

  it('knows where the file is', () => {
    expect(claudeConfigPaths('darwin', { home: '/Users/x' })).toEqual(['/Users/x/Library/Application Support/Claude/claude_desktop_config.json'])
    expect(claudeConfigPaths('win32', { home: 'C:\\Users\\x', appData: 'C:\\Users\\x\\AppData\\Roaming', localAppData: 'C:\\L', packages: ['Claude_abc'] })).toEqual([
      'C:\\Users\\x\\AppData\\Roaming\\Claude\\claude_desktop_config.json',
      'C:\\L\\Packages\\Claude_abc\\LocalCache\\Roaming\\Claude\\claude_desktop_config.json'
    ])
  })
})

it('fills in missing switches', () => {
  expect(cleanAreas({ tracking: false, nonsense: true })).toEqual({ library: true, tracking: false, discover: true, evenings: true, settings: true })
  expect(cleanAreas(null).library).toBe(true)
})
