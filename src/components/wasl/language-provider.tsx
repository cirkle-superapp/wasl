'use client'

import { createContext, useContext, useState, useEffect, useCallback } from 'react'

type Lang = 'en' | 'ar'

const LangContext = createContext<{ lang: Lang; setLang: (l: Lang) => void }>({
  lang: 'en',
  setLang: () => {},
})

const STORAGE_KEY = 'wasl-lang'

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  // Start from 'en' on both server and client first-render so hydration
  // markup matches. Read persisted value in an effect after mount.
  const [lang, setLangState] = useState<Lang>('en')

  // On mount, read the persisted language (client-only).
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY) as Lang | null
      if (stored === 'ar' || stored === 'en') {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setLangState(stored)
      }
    } catch {}
  }, [])

  // Apply the dir/lang attributes whenever lang changes
  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.lang = lang
      document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr'
    }
  }, [lang])

  const setLang = useCallback((l: Lang) => {
    setLangState(l)
    try { localStorage.setItem(STORAGE_KEY, l) } catch {}
    if (typeof document !== 'undefined') {
      document.documentElement.lang = l
      document.documentElement.dir = l === 'ar' ? 'rtl' : 'ltr'
    }
  }, [])

  return <LangContext.Provider value={{ lang, setLang }}>{children}</LangContext.Provider>
}

export function useLanguage() { return useContext(LangContext) }
