'use client'

import { useState, useEffect, useRef } from 'react'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Search, MessageCircle, Moon, Sun, Settings, Lock, Users } from 'lucide-react'
import { useWaslStore } from '@/lib/store'
import { cn } from '@/lib/utils'

type Command = {
  id: string
  label: string
  icon: any
  action: () => void
}

export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { conversations, setActiveConversation } = useWaslStore()
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)

  // Listen for Ctrl+K
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        onOpenChange(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onOpenChange])

  const commands: Command[] = [
    { id: 'new-chat', label: 'New chat', icon: MessageCircle, action: () => { window.dispatchEvent(new CustomEvent('wasl:new-chat')); onOpenChange(false) } },
    { id: 'toggle-dark', label: 'Toggle dark mode', icon: Moon, action: () => { document.documentElement.classList.toggle('dark'); onOpenChange(false) } },
    { id: 'settings', label: 'Open settings', icon: Settings, action: () => { window.dispatchEvent(new CustomEvent('wasl:settings')); onOpenChange(false) } },
    { id: 'lock', label: 'App lock', icon: Lock, action: () => { window.dispatchEvent(new CustomEvent('wasl:app-lock')); onOpenChange(false) } },
  ]

  conversations.slice(0, 10).forEach(c => {
    commands.push({
      id: 'convo-' + c.id,
      label: 'Open: ' + c.name,
      icon: Users,
      action: () => { setActiveConversation(c.id); onOpenChange(false) },
    })
  })

  const filtered = commands.filter(c => c.label.toLowerCase().includes(query.toLowerCase()))

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelectedIndex(i => Math.min(i + 1, filtered.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSelectedIndex(i => Math.max(i - 1, 0)) }
    else if (e.key === 'Enter' && filtered[selectedIndex]) { filtered[selectedIndex].action() }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-0 gap-0 wasl-command-palette">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
          <Search className="w-4 h-4 text-muted-foreground" />
          <input autoFocus value={query} onChange={e => { setQuery(e.target.value); setSelectedIndex(0) }}
            onKeyDown={onKeyDown} placeholder="Type a command or search..."
            className="flex-1 bg-transparent outline-none text-sm wasl-input-premium" />
          <kbd className="text-[10px] px-1.5 py-0.5 rounded border border-border text-muted-foreground font-mono">⌘K</kbd>
        </div>
        <div className="max-h-72 overflow-y-auto wasl-scroll py-1 px-1">
          {filtered.length === 0 && <p className="text-center text-sm text-muted-foreground py-4">No results</p>}
          {filtered.map((cmd, i) => (
            <button key={cmd.id} type="button" onClick={cmd.action}
              data-selected={i === selectedIndex ? 'true' : undefined}
              className={cn('wasl-command-item w-full flex items-center gap-2.5 px-3 py-2 text-left text-sm',
                i === selectedIndex ? 'bg-[var(--wasl-green)]/10' : 'hover:bg-muted/50')}>
              <cmd.icon className="w-4 h-4 text-muted-foreground shrink-0" />
              <span className="truncate">{cmd.label}</span>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
