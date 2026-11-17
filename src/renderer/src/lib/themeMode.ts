/** Dark, light, or follow the system. Remembered on this computer only. */
export type ThemeMode = 'system' | 'dark' | 'light'

const KEY = 'eclipse.themeMode'

export function savedThemeMode(): ThemeMode {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'dark' || v === 'light' ? v : 'system'
  } catch {
    return 'system'
  }
}

export function applyThemeMode(mode: ThemeMode): void {
  const root = document.documentElement
  if (mode === 'system') delete root.dataset.theme
  else root.dataset.theme = mode
  try {
    localStorage.setItem(KEY, mode)
  } catch {
    // Not remembered; still applied for now.
  }
}
