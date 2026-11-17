/** Phase 41: "Keep the poster wall still". Remembered on this computer only. */

const KEY = 'eclipse.still'

export function savedStill(): boolean {
  try {
    return localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

export function applyStill(on: boolean): void {
  if (on) document.documentElement.dataset.still = ''
  else delete document.documentElement.dataset.still
  try {
    localStorage.setItem(KEY, on ? '1' : '0')
  } catch {
    // Not remembered; still applied for now.
  }
}
