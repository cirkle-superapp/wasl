'use client'

import { createContext, useContext, useState, useEffect, useCallback } from 'react'

type Lang = 'en' | 'ar'

const LangContext = createContext<{ lang: Lang; setLang: (l: Lang) => void }>({
  lang: 'en',
  setLang: () => {},
})

const STORAGE_KEY = 'wasl-lang'

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  // Lazy initializer reads localStorage on first client render — no effect needed
  const [lang, setLangState] = useState<Lang>(() => {
    if (typeof window === 'undefined') return 'en'
    try {
      const stored = localStorage.getItem(STORAGE_KEY) as Lang | null
      if (stored === 'ar' || stored === 'en') return stored
    } catch {}
    return 'en'
  })

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
