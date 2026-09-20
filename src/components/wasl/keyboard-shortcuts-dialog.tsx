'use client'

import { useEffect, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Keyboard, Command, ArrowUp, ArrowDown, Search, MessageSquare, Settings, Lock, Send, Plus } from 'lucide-react'

type Shortcut = {
  keys: string[]
  label: string
  icon: any
  group: string
}

const SHORTCUTS: Shortcut[] = [
  // Navigation
  { keys: ['Ctrl', 'K'], label: 'Open command palette', icon: Command, group: 'Navigation' },
  { keys: ['Ctrl', 'N'], label: 'Start a new chat', icon: Plus, group: 'Navigation' },
  { keys: ['Ctrl', '/'], label: 'Show this shortcuts dialog', icon: Keyboard, group: 'Navigation' },
  { keys: ['Esc'], label: 'Close dialog / cancel action', icon: Keyboard, group: 'Navigation' },

  // Messages
  { keys: ['Enter'], label: 'Send message', icon: Send, group: 'Messages' },
  { keys: ['Shift', 'Enter'], label: 'New line in message', icon: Send, group: 'Messages' },
  { keys: ['↑', '↓'], label: 'Navigate search results', icon: ArrowUp, group: 'Messages' },
  { keys: ['Ctrl', 'V'], label: 'Paste image from clipboard', icon: MessageSquare, group: 'Messages' },

  // Search
  { keys: ['Ctrl', 'F'], label: 'Search messages in chat', icon: Search, group: 'Search' },
  { keys: ['Ctrl', 'Shift', 'F'], label: 'Search across all conversations', icon: Search, group: 'Search' },

  // Settings
  { keys: ['Ctrl', ','], label: 'Open settings', icon: Settings, group: 'Settings' },
  { keys: ['Ctrl', 'L'], label: 'Toggle app lock', icon: Lock, group: 'Settings' },
]

export function KeyboardShortcutsDialog() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // Ctrl+/ or Cmd+/ to toggle the shortcuts dialog
      if ((e.metaKey || e.ctrlKey) && e.key === '/') {
        e.preventDefault()
        setOpen((v) => !v)
      }
      // Ctrl+, to open settings (dispatches the same event as the command palette)
      if ((e.metaKey || e.ctrlKey) && e.key === ',') {
        e.preventDefault()
        window.dispatchEvent(new CustomEvent('wasl:settings'))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Group shortcuts by category
  const groups = SHORTCUTS.reduce((acc, s) => {
    if (!acc[s.group]) acc[s.group] = []
    acc[s.group].push(s)
    return acc
  }, {} as Record<string, Shortcut[]>)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Keyboard className="w-5 h-5" />
            Keyboard shortcuts
          </DialogTitle>
          <DialogDescription>
            Use these shortcuts to navigate Wasl faster.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 max-h-[60vh] overflow-y-auto wasl-scroll -mx-2 px-2">
          {Object.entries(groups).map(([group, shortcuts]) => (
            <div key={group}>
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                {group}
              </div>
              <div className="space-y-1.5">
                {shortcuts.map((s, i) => {
                  const Icon = s.icon
                  return (
                    <div
                      key={i}
                      className="flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <Icon className="w-4 h-4 text-muted-foreground shrink-0" />
                        <span className="text-sm truncate">{s.label}</span>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {s.keys.map((key, j) => (
                          <span key={j} className="flex items-center gap-1">
                            <kbd className="inline-flex items-center justify-center min-w-[24px] h-6 px-1.5 rounded-md border border-border bg-muted/60 text-[11px] font-medium text-foreground shadow-sm">
                              {key}
                            </kbd>
                            {j < s.keys.length - 1 && (
                              <span className="text-muted-foreground text-xs">+</span>
                            )}
                          </span>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
          <div className="pt-2 border-t border-border">
            <p className="text-[11px] text-muted-foreground text-center">
              On Mac, use <kbd className="px-1 py-0.5 rounded border border-border bg-muted/60 text-[10px]">⌘</kbd> instead of{' '}
              <kbd className="px-1 py-0.5 rounded border border-border bg-muted/60 text-[10px]">Ctrl</kbd>.
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
