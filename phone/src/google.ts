import { GOOGLE } from './config'

/**
 * Google sign-in and Drive for the phone page. Sign-in is Google's plain "web page" flow: the page
 * goes to Google and comes back with a short-lived access token (about an hour) in the address.
 * When it runs out, the page goes back to Google quietly (no screen, if you're still signed in) and
 * gets a new one. No client secret is involved, and the token never leaves the phone.
 *
 * The only permission asked for is drive.file: the page can see just the files you pick with
 * Google's file picker (your Eclipse folder and its library.json) and the one it makes itself
 * (from-phone.json). Nothing else in your Drive.
 */

const SCOPE = 'https://www.googleapis.com/auth/drive.file'
const TOKEN_KEY = 'eclipse.phone.token'
const STATE_KEY = 'eclipse.phone.oauthState'
const SILENT_KEY = 'eclipse.phone.silentTried'

export class SignInNeeded extends Error {
  constructor() {
    super('Sign in with Google again.')
  }
}

export class NotFound extends Error {}

const store = {
  get(key: string): string | null {
    try {
      return localStorage.getItem(key)
    } catch {
      return null
    }
  },
  set(key: string, value: string | null): void {
    try {
      if (value === null) localStorage.removeItem(key)
      else localStorage.setItem(key, value)
    } catch {
      // Private browsing: it works for this visit only.
    }
  }
}

/** Where Google sends you back: this page, without anything after it. */
const redirectUri = (): string => `${location.origin}${location.pathname}`

function randomState(): string {
  const b = new Uint8Array(16)
  crypto.getRandomValues(b)
  return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')
}

/** Goes to Google to sign in. `quietly`: no screen at all if you're still signed in (it comes back with an error if not). */
export function signIn(quietly = false): void {
  const state = randomState()
  sessionStorage.setItem(STATE_KEY, state)
  if (quietly) sessionStorage.setItem(SILENT_KEY, '1')
  const params = new URLSearchParams({
    client_id: GOOGLE.clientId,
    redirect_uri: redirectUri(),
    response_type: 'token',
    scope: SCOPE,
    include_granted_scopes: 'true',
    state,
    ...(quietly ? { prompt: 'none' } : {})
  })
  location.assign(`https://accounts.google.com/o/oauth2/v2/auth?${params}`)
}

/**
 * Picks up the token Google sent back in the address, if there is one. Returns 'quietFailed' when a
 * quiet sign-in needs you to tap (so the page doesn't keep bouncing to Google).
 */
export function takeTokenFromAddress(): 'signedIn' | 'quietFailed' | 'failed' | null {
  if (!location.hash.includes('access_token') && !location.hash.includes('error')) return null
  const p = new URLSearchParams(location.hash.slice(1))
  const expected = sessionStorage.getItem(STATE_KEY)
  const quiet = sessionStorage.getItem(SILENT_KEY) === '1'
  sessionStorage.removeItem(STATE_KEY)
  sessionStorage.removeItem(SILENT_KEY)
  history.replaceState(null, '', redirectUri())
  if (!expected || p.get('state') !== expected) return 'failed'
  const token = p.get('access_token')
  if (!token) return quiet ? 'quietFailed' : 'failed'
  const seconds = Number(p.get('expires_in') ?? 3599)
  store.set(TOKEN_KEY, JSON.stringify({ token, expires: Date.now() + seconds * 1000 }))
  return 'signedIn'
}

/** The current token, or null when there isn't one or it's about to run out. */
export function accessToken(): string | null {
  try {
    const t = JSON.parse(store.get(TOKEN_KEY) ?? 'null') as { token: string; expires: number } | null
    return t && t.expires - 120_000 > Date.now() ? t.token : null
  } catch {
    return null
  }
}

export const hasSignedInBefore = (): boolean => store.get(TOKEN_KEY) !== null

export function signOut(): void {
  const t = accessToken()
  store.set(TOKEN_KEY, null)
  // Tell Google to forget the token too (best effort).
  if (t) void fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(t)}`, { method: 'POST' }).catch(() => undefined)
}

// ---- Drive ----

async function drive(path: string, init: RequestInit = {}): Promise<Response> {
  const token = accessToken()
  if (!token) throw new SignInNeeded()
  const res = await fetch(`https://www.googleapis.com/${path}`, { ...init, headers: { ...(init.headers ?? {}), Authorization: `Bearer ${token}` } })
  if (res.status === 401) {
    store.set(TOKEN_KEY, null)
    throw new SignInNeeded()
  }
  if (res.status === 404) throw new NotFound('Not found in Google Drive.')
  if (!res.ok) throw new Error(`Google Drive answered with an error (${res.status}).`)
  return res
}

/** A file's contents as JSON. */
export async function readJson(fileId: string): Promise<unknown> {
  const res = await drive(`drive/v3/files/${encodeURIComponent(fileId)}?alt=media`, { cache: 'no-store' })
  return res.json()
}

/** Whether a file is still there (not deleted or in the bin). */
export async function exists(fileId: string): Promise<boolean> {
  try {
    const res = await drive(`drive/v3/files/${encodeURIComponent(fileId)}?fields=id,trashed`)
    return !((await res.json()) as { trashed?: boolean }).trashed
  } catch (err) {
    if (err instanceof NotFound) return false
    throw err
  }
}

/** The page's own from-phone.json in a folder, if it made one before. */
export async function findFile(folderId: string, name: string): Promise<string | null> {
  const q = `name = '${name}' and '${folderId}' in parents and trashed = false`
  const res = await drive(`drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id)&spaces=drive`)
  const files = ((await res.json()) as { files?: { id: string }[] }).files ?? []
  return files[0]?.id ?? null
}

/** Makes a new JSON file in a folder and returns its id. */
export async function createJson(folderId: string, name: string, data: unknown): Promise<string> {
  const boundary = `eclipse${randomState()}`
  const body = [
    `--${boundary}`,
    'Content-Type: application/json; charset=UTF-8',
    '',
    JSON.stringify({ name, parents: [folderId], mimeType: 'application/json' }),
    `--${boundary}`,
    'Content-Type: application/json',
    '',
    JSON.stringify(data, null, 2),
    `--${boundary}--`,
    ''
  ].join('\r\n')
  const res = await drive('upload/drive/v3/files?uploadType=multipart&fields=id', { method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body })
  return ((await res.json()) as { id: string }).id
}

/** Replaces a JSON file's contents. */
export async function writeJson(fileId: string, data: unknown): Promise<void> {
  await drive(`upload/drive/v3/files/${encodeURIComponent(fileId)}?uploadType=media`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data, null, 2)
  })
}

// ---- Google's file picker (it's what gives the page access to your Eclipse folder and library.json) ----

/* eslint-disable @typescript-eslint/no-explicit-any */
declare global {
  interface Window {
    gapi?: any
    google?: any
  }
}

let pickerReady: Promise<void> | null = null

function loadPicker(): Promise<void> {
  pickerReady ??= new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = 'https://apis.google.com/js/api.js'
    s.onload = () => window.gapi.load('picker', { callback: () => resolve(), onerror: () => reject(new Error('Google’s file picker didn’t load.')) })
    s.onerror = () => {
      pickerReady = null
      reject(new Error('Google’s file picker didn’t load. Check your connection.'))
    }
    document.head.appendChild(s)
  })
  return pickerReady
}

export interface Picked {
  id: string
  name: string
}

/** Opens Google's picker: for a folder, or for a file inside `parent`. Null if you closed it. */
export async function pick(kind: 'folder' | 'file', parent?: string): Promise<Picked | null> {
  const token = accessToken()
  if (!token) throw new SignInNeeded()
  await loadPicker()
  const g = window.google.picker
  return new Promise((resolve) => {
    const view =
      kind === 'folder'
        ? new g.DocsView(g.ViewId.FOLDERS).setSelectFolderEnabled(true).setIncludeFolders(true).setMimeTypes('application/vnd.google-apps.folder')
        : new g.DocsView(g.ViewId.DOCS).setIncludeFolders(false).setMode(g.DocsViewMode.LIST)
    if (kind === 'file' && parent) view.setParent(parent)
    const picker = new g.PickerBuilder()
      .addView(view)
      .setOAuthToken(token)
      .setDeveloperKey(GOOGLE.apiKey)
      .setAppId(GOOGLE.projectNumber)
      .setTitle(kind === 'folder' ? 'Pick your Eclipse folder' : 'Tap library.json')
      .setOrigin(location.origin)
      .setCallback((data: any) => {
        if (data[g.Response.ACTION] === g.Action.PICKED) {
          const doc = data[g.Response.DOCUMENTS][0]
          resolve({ id: doc[g.Document.ID], name: doc[g.Document.NAME] })
        } else if (data[g.Response.ACTION] === g.Action.CANCEL) resolve(null)
      })
      .build()
    picker.setVisible(true)
  })
}
