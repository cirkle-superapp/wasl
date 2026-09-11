'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { Plus, Camera, Loader2, X, Type, Eye, Trash2 } from 'lucide-react'
import { WaslAvatar } from './wasl-avatar'
import { useWaslStore } from '@/lib/store'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

type StoryGroup = {
  userId: string
  userName: string
  userAvatar: string | null
  userAvatarColor: string
  stories: {
    id: string
    type: string
    content: string
    bgColor: string | null
    createdAt: string
    viewed: boolean
  }[]
}

const TEXT_BG_COLORS = [
  '#1a4a5a', '#009588', '#c2a060', '#c25a6e', '#4a6b88', '#9a7a3e',
]

export function StoryBar() {
  const { user } = useWaslStore()
  const [groups, setGroups] = useState<StoryGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [composerOpen, setComposerOpen] = useState(false)
  const [viewer, setViewer] = useState<{ groupIdx: number; storyIdx: number } | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/stories', { cache: 'no-store' })
      if (!res.ok) return
      const data = await res.json()
      setGroups(data.stories || [])
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  // Find my stories
  const myGroup = groups.find((g) => g.userId === user?.id)
  const otherGroups = groups.filter((g) => g.userId !== user?.id)

  async function markViewed(groupId: number, storyIdx: number) {
    const g = groups[groupId]
    if (!g) return
    const story = g.stories[storyIdx]
    if (!story || story.viewed) return
    try {
      await fetch(`/api/stories/${story.id}/view`, { method: 'POST' })
      setGroups((prev) => {
        const next = [...prev]
        const ng = { ...next[groupId] }
        ng.stories = ng.stories.map((s, i) =>
          i === storyIdx ? { ...s, viewed: true } : s
        )
        next[groupId] = ng
        return next
      })
    } catch {
      // ignore
    }
  }

  function openStory(groupId: number) {
    const g = groups[groupId]
    if (!g) return
    setViewer({ groupIdx: groupId, storyIdx: 0 })
    markViewed(groupId, 0)
  }

  function nextStory() {
    if (!viewer) return
    const g = groups[viewer.groupIdx]
    if (!g) return
    if (viewer.storyIdx + 1 < g.stories.length) {
      const ni = viewer.storyIdx + 1
      setViewer({ ...viewer, storyIdx: ni })
      markViewed(viewer.groupIdx, ni)
    } else {
      // Next group, or close
      if (viewer.groupIdx + 1 < groups.length) {
        const ng = viewer.groupIdx + 1
        setViewer({ groupIdx: ng, storyIdx: 0 })
        markViewed(ng, 0)
      } else {
        setViewer(null)
      }
    }
  }

  function prevStory() {
    if (!viewer) return
    if (viewer.storyIdx > 0) {
      setViewer({ ...viewer, storyIdx: viewer.storyIdx - 1 })
    } else if (viewer.groupIdx > 0) {
      const pg = viewer.groupIdx - 1
      const g = groups[pg]
      setViewer({ groupIdx: pg, storyIdx: g.stories.length - 1 })
    }
  }

  const currentStory = viewer ? groups[viewer.groupIdx]?.stories[viewer.storyIdx] : null

  return (
    <>
      <div className="px-2 py-2 border-b border-border bg-[var(--wasl-sidebar-bg)] overflow-x-auto wasl-scroll">
        <div className="flex items-center gap-3 min-w-max">
          {/* My status / Add */}
          <button
            type="button"
            onClick={() => setComposerOpen(true)}
            className="flex flex-col items-center gap-1 shrink-0"
            title={myGroup ? 'Add to my status' : 'Add status'}
          >
            <div className="relative">
              <WaslAvatar
                name={user?.name || 'Me'}
                src={user?.avatar}
                color={user?.avatarColor}
                size={54}
              />
              <span className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full bg-[var(--wasl-green)] border-2 border-[var(--wasl-sidebar-bg)] flex items-center justify-center text-white">
                <Plus className="w-3 h-3" />
              </span>
            </div>
            <span className="text-[10px] font-medium">My status</span>
          </button>

          {/* My existing stories */}
          {myGroup && myGroup.stories.length > 0 && (
            <button
              type="button"
              onClick={() => {
                const idx = groups.findIndex((g) => g.userId === user?.id)
                if (idx >= 0) openStory(idx)
              }}
              className="flex flex-col items-center gap-1 shrink-0"
            >
              <div className="wasl-story-ring">
                <WaslAvatar
                  name={user?.name || 'Me'}
                  src={user?.avatar}
                  color={user?.avatarColor}
                  size={54}
                />
              </div>
              <span className="text-[10px] font-medium truncate max-w-[60px]">My status</span>
            </button>
          )}

          {/* Other stories */}
          {otherGroups.map((g) => {
            const allViewed = g.stories.every((s) => s.viewed)
            return (
              <button
                key={g.userId}
                type="button"
                onClick={() => {
                  const idx = groups.findIndex((gr) => gr.userId === g.userId)
                  if (idx >= 0) openStory(idx)
                }}
                className="flex flex-col items-center gap-1 shrink-0"
              >
                <div className={allViewed ? 'wasl-story-ring-viewed' : 'wasl-story-ring'}>
                  <WaslAvatar
                    name={g.userName}
                    src={g.userAvatar}
                    color={g.userAvatarColor}
                    size={54}
                  />
                </div>
                <span className="text-[10px] font-medium truncate max-w-[60px]">
                  {g.userName.split(' ')[0]}
                </span>
              </button>
            )
          })}

          {loading && (
            <div className="flex items-center gap-2 text-muted-foreground text-xs">
              <Loader2 className="w-3 h-3 animate-spin" /> Loading…
            </div>
          )}
          {!loading && groups.length === 0 && (
            <p className="text-xs text-muted-foreground py-2">
              No recent updates
            </p>
          )}
        </div>
      </div>

      {/* Story composer */}
      <StoryComposer
        open={composerOpen}
        onOpenChange={setComposerOpen}
        onCreated={load}
      />

      {/* Story viewer */}
      {viewer && currentStory && (
        <div
          className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center"
          onClick={() => setViewer(null)}
        >
          {/* Progress bars */}
          <div className="absolute top-4 left-4 right-4 flex gap-1">
            {groups[viewer.groupIdx]?.stories.map((_, i) => (
              <div
                key={i}
                className="flex-1 h-1 rounded-full bg-white/30 overflow-hidden"
              >
                <div
                  className="h-full bg-white transition-all"
                  style={{ width: i < viewer.storyIdx ? '100%' : i === viewer.storyIdx ? '100%' : '0%' }}
                />
              </div>
            ))}
          </div>
          {/* Close */}
          <button
            type="button"
            className="absolute top-8 right-4 text-white/80 hover:text-white"
            onClick={(e) => { e.stopPropagation(); setViewer(null) }}
          >
            <X className="w-6 h-6" />
          </button>
          {/* Prev / Next */}
          <button
            type="button"
            className="absolute left-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center"
            onClick={(e) => { e.stopPropagation(); prevStory() }}
          >
            ‹
          </button>
          <button
            type="button"
            className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center"
            onClick={(e) => { e.stopPropagation(); nextStory() }}
          >
            ›
          </button>

          {/* Content */}
          <div
            className="max-w-md w-full h-[80vh] mx-4 rounded-2xl overflow-hidden flex items-center justify-center relative"
            onClick={(e) => e.stopPropagation()}
            style={
              currentStory.type === 'text'
                ? { backgroundColor: currentStory.bgColor || '#1a4a5a' }
                : undefined
            }
          >
            {currentStory.type === 'image' ? (
               
              <img
                src={currentStory.content}
                alt="story"
                className="w-full h-full object-contain"
              />
            ) : (
              <p className="text-white text-2xl font-medium text-center px-8 whitespace-pre-wrap">
                {currentStory.content}
              </p>
            )}
            <div className="absolute bottom-3 left-0 right-0 text-center text-white/70 text-xs">
              {groups[viewer.groupIdx]?.userName}
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function StoryComposer({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  onCreated: () => void
}) {
  const [text, setText] = useState('')
  const [bgColor, setBgColor] = useState(TEXT_BG_COLORS[0])
  const [type, setType] = useState<'text' | 'image'>('text')
  const [image, setImage] = useState<string | null>(null)
  const [posting, setPosting] = useState(false)
  const fileRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (open) {
      setText('')
      setType('text')
      setImage(null)
      setBgColor(TEXT_BG_COLORS[0])
    }
  }, [open])

  async function post() {
    setPosting(true)
    try {
      const content = type === 'image' ? image : text.trim()
      if (!content) {
        toast.error(type === 'image' ? 'Please select an image' : 'Please enter text')
        setPosting(false)
        return
      }
      const res = await fetch('/api/stories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type,
          content,
          bgColor: type === 'text' ? bgColor : null,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => null)
        toast.error(err?.error || 'Failed to post status')
        return
      }
      toast.success('Status posted')
      onOpenChange(false)
      onCreated()
    } catch {
      toast.error('Network error')
    } finally {
      setPosting(false)
    }
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 2 * 1024 * 1024) {
      toast.error('Image too large (max 2MB)')
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      setImage(reader.result as string)
      setType('image')
    }
    reader.readAsDataURL(file)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Camera className="w-5 h-5 text-[var(--wasl-green)]" />
            Add status
          </DialogTitle>
          <DialogDescription>
            Share a text or image status that disappears after 24 hours.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {/* Type tabs */}
          <div className="flex gap-2">
            <Button
              type="button"
              variant={type === 'text' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setType('text')}
              className="flex-1"
            >
              <Type className="w-4 h-4 mr-1" /> Text
            </Button>
            <Button
              type="button"
              variant={type === 'image' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setType('image')}
              className="flex-1"
            >
              <Camera className="w-4 h-4 mr-1" /> Image
            </Button>
          </div>

          {type === 'text' ? (
            <>
              <Textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="What's on your mind?"
                rows={4}
                maxLength={500}
                style={{ backgroundColor: bgColor, color: '#fff' }}
                className="border-0 font-medium"
              />
              <div>
                <Label className="text-xs">Background color</Label>
                <div className="flex gap-2 mt-1">
                  {TEXT_BG_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setBgColor(c)}
                      className={cn(
                        'w-8 h-8 rounded-full border-2 transition-all',
                        bgColor === c ? 'border-foreground scale-110' : 'border-transparent'
                      )}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>
            </>
          ) : (
            <div>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={onFileChange}
              />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="w-full h-48 rounded-lg border-2 border-dashed border-border flex items-center justify-center hover:bg-muted/50 transition-colors"
              >
                {image ? (
                   
                  <img src={image} alt="preview" className="w-full h-full object-contain rounded-lg" />
                ) : (
                  <div className="text-center text-muted-foreground">
                    <Camera className="w-10 h-10 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">Tap to select an image</p>
                  </div>
                )}
              </button>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={posting}>
            Cancel
          </Button>
          <Button
            onClick={post}
            disabled={posting || (type === 'text' ? !text.trim() : !image)}
            className="bg-[var(--wasl-green)] hover:bg-[var(--wasl-green-dark)] text-white"
          >
            {posting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Post status
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}