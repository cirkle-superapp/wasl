'use client'

import { createContext, useContext, useState, useEffect, useCallback } from 'react'

type ColorTheme = 'wasl' | 'cirkle'

type ColorThemeContextValue = {
  colorTheme: ColorTheme
  setColorTheme: (t: ColorTheme) => void
}

const ColorThemeContext = createContext<ColorThemeContextValue>({
  colorTheme: 'wasl',
  setColorTheme: () => {},
})

const STORAGE_KEY = 'wasl-color-theme'

function readStoredTheme(): ColorTheme {
  if (typeof window === 'undefined') return 'wasl'
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    if (stored === 'cirkle' || stored === 'wasl') return stored
  } catch {
    // ignore
  }
  return 'wasl'
}

export function ColorThemeProvider({ children }: { children: React.ReactNode }) {
  // Lazy initializer — runs once on the client (SSR returns 'wasl', then the
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
  if (t === 'cirkle') {
    document.documentElement.setAttribute('data-theme', 'cirkle')
  } else {
    document.documentElement.removeAttribute('data-theme')
  }
}

export function useColorTheme() {
  return useContext(ColorThemeContext)
}

export type { ColorTheme }
