'use client'

import { createContext, useContext, useState, useEffect, useCallback } from 'react'

type ColorTheme = 'wasl' | 'cirkle'

type ColorThemeContextValue = {
  colorTheme: ColorTheme
  setColorTheme: (t: ColorTheme) => void
}

// Default to the Cirkle color theme (gold/teal/cream) — the brand palette
// imported from github.com/fortleem/CIRKLE. Users can switch back to the
// classic WhatsApp-green "Wasl" theme in Settings.
const DEFAULT_THEME: ColorTheme = 'cirkle'

const ColorThemeContext = createContext<ColorThemeContextValue>({
  colorTheme: DEFAULT_THEME,
  setColorTheme: () => {},
})

const STORAGE_KEY = 'wasl-color-theme'

function readStoredTheme(): ColorTheme {
  if (typeof window === 'undefined') return DEFAULT_THEME
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    if (stored === 'cirkle' || stored === 'wasl') return stored
  } catch {
    // ignore
  }
  return DEFAULT_THEME
}

export function ColorThemeProvider({ children }: { children: React.ReactNode }) {
  // Lazy initializer — runs once on the client (SSR returns the default, then the
  // client picks up the stored value on the very first render, no flash and
  // no setState-in-effect lint error).
  const [colorTheme, setColorThemeState] = useState<ColorTheme>(() =>
    readStoredTheme()
  )

  // Apply the data-theme attribute whenever the theme changes.
  useEffect(() => {
    applyTheme(colorTheme)
  }, [colorTheme])

  const setColorTheme = useCallback((t: ColorTheme) => {
    setColorThemeState(t)
    try {
      localStorage.setItem(STORAGE_KEY, t)
    } catch {
      // ignore
    }
  }, [])

  return (
    <ColorThemeContext.Provider value={{ colorTheme, setColorTheme }}>
      {children}
    </ColorThemeContext.Provider>
  )
}

function applyTheme(t: ColorTheme) {
  if (typeof document === 'undefined') return
  if (t === 'wasl') {
    document.documentElement.removeAttribute('data-theme')
  } else {
    document.documentElement.setAttribute('data-theme', 'cirkle')
  }
}

export function useColorTheme() {
  return useContext(ColorThemeContext)
}

export type { ColorTheme }
