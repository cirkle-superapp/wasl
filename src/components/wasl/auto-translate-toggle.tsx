'use client'

// ─────────────────────────────────────────────────────────────────────────────
// AutoTranslateToggle — Cross-Lingual Live Translate
// LEAPFROG feature: beyond iMessage iOS 19's *announced* auto-translate.
//
// A globe button in the chat header. Pick a language for THIS conversation
// → every incoming foreign message translates itself inline (no pill tap),
// cached per message via the consensus AI engine. Persisted per device.
// ─────────────────────────────────────────────────────────────────────────────

import { Languages, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { useWaslStore } from '@/lib/store'

// Languages ordered for Wasl's core audience (MENA-first) then globally.
const LANGUAGES: { name: string; native: string }[] = [
  { name: 'English', native: 'English' },
  { name: 'Arabic', native: 'العربية' },
  { name: 'French', native: 'Français' },
  { name: 'Spanish', native: 'Español' },
  { name: 'German', native: 'Deutsch' },
  { name: 'Turkish', native: 'Türkçe' },
  { name: 'Italian', native: 'Italiano' },
  { name: 'Portuguese', native: 'Português' },
  { name: 'Russian', native: 'Русский' },
  { name: 'Persian', native: 'فارسی' },
  { name: 'Urdu', native: 'اردو' },
  { name: 'Hindi', native: 'हिन्दी' },
  { name: 'Chinese', native: '中文' },
  { name: 'Japanese', native: '日本語' },
  { name: 'Korean', native: '한국어' },
  { name: 'Indonesian', native: 'Bahasa Indonesia' },
  { name: 'Dutch', native: 'Nederlands' },
  { name: 'Swahili', native: 'Kiswahili' },
  { name: 'Amharic', native: 'አማርኛ' },
]

export function AutoTranslateToggle({ conversationId }: { conversationId: string }) {
  const activeLang = useWaslStore(
    (s) => s.autoTranslateLangs[conversationId] ?? null
  )
  const setAutoTranslateLang = useWaslStore((s) => s.setAutoTranslateLang)

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn('relative flex', activeLang && 'text-[var(--wasl-green)]')}
          title={
            activeLang
              ? `Auto-translate is ON — incoming foreign messages translate to ${activeLang}`
              : 'Auto-translate — pick a language for this chat'
          }
          aria-label={activeLang ? `Auto-translate on, ${activeLang}` : 'Auto-translate off'}
        >
          <Languages className="w-5 h-5" />
          {activeLang && (
            <span
              className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-[var(--wasl-green)]"
              aria-hidden
            />
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="text-[11px] uppercase tracking-wide text-muted-foreground">
          Auto-translate this chat
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => setAutoTranslateLang(conversationId, null)}
          className={cn(!activeLang && 'text-[var(--wasl-green)] font-medium')}
        >
          <span className="w-4 mr-2 inline-flex justify-center">
            {!activeLang && <Check className="w-4 h-4" />}
          </span>
          Off
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <div className="max-h-72 overflow-y-auto">
          {LANGUAGES.map((lang) => (
            <DropdownMenuItem
              key={lang.name}
              onClick={() => setAutoTranslateLang(conversationId, lang.name)}
              className={cn(activeLang === lang.name && 'text-[var(--wasl-green)] font-medium')}
            >
              <span className="w-4 mr-2 inline-flex justify-center">
                {activeLang === lang.name && <Check className="w-4 h-4" />}
              </span>
              <span className="flex-1">{lang.native}</span>
              <span className="text-[10px] text-muted-foreground">{lang.name}</span>
            </DropdownMenuItem>
          ))}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
