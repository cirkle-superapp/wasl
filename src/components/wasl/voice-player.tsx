'use client'

/**
 * VoicePlayer — a custom audio player used for both voice notes (recorded
 * in-browser, stored as `data:audio/*` data URLs) and uploaded audio files
 * (URLs to `/uploads/...`). Replaces the previous bare `<audio controls>`
 * rendering with a polished, theme-aware UI that matches the wasl bubble
 * palette.
 *
 * Features:
 *  - Play/pause button (circular, wasl-green for outgoing / wasl-teal for
 *    incoming) with a subtle scale-pulse animation while playing.
 *  - Waveform-like progress bar (deterministic pseudo-waveform bars) with a
 *    transparent `<input type="range">` overlay for seek + keyboard a11y.
 *  - Current time / total duration readout (e.g. "0:03 / 0:12").
 *  - Playback speed pill that cycles 1x → 1.5x → 2x → 0.5x → 1x.
 *  - Loading state (spinner inside the play button while metadata loads).
 *  - Ended state (resets to start, shows the play button again).
 *  - `prefers-reduced-motion` disables the pulse animation.
 *  - Keyboard a11y: Space/Enter toggles play, Enter cycles speed,
 *    ArrowLeft/Right seek 5s.
 *  - Mic icon for voice notes, Music icon for uploaded audio files.
 *  - Optional voice-note transcription (Task 36-b):
 *      • When `messageId` is provided (voice notes only), renders a
 *        "Transcribe" / "Show transcription" toggle below the player.
 *      • If `transcription` is already present (server-provided), it is
 *        shown immediately when toggled open — no API call needed.
 *      • Otherwise, the toggle triggers POST /api/ai/transcribe, shows a
 *        "Transcribing…" spinner, and caches the result locally so future
 *        toggles don't re-fetch.
 *      • Transcription box uses bg-muted/30 + italic muted text, with a
 *        smooth expand/collapse animation via a CSS grid-rows transition.
 *  - No indigo/blue — only wasl-green / wasl-teal / theme tokens.
 */

import { useEffect, useRef, useState } from 'react'
import { FileText, Loader2, Mic, Music, Pause, Play } from 'lucide-react'
import { cn } from '@/lib/utils'

/** Speed cycle: 1x → 1.5x → 2x → 0.5x → 1x (loops). */
const SPEED_CYCLE = [1, 1.5, 2, 0.5] as const
const SPEED_LABEL: Readonly<Record<number, string>> = {
  0.5: '0.5×',
  1: '1×',
  1.5: '1.5×',
  2: '2×',
}

export interface VoicePlayerProps {
  /** Audio source — a `data:audio/*` URL or an http(s)/relative URL. */
  src: string
  /** Whether the message is outgoing (drives the accent colour). */
  mine: boolean
  /** If true (protected recipient), the player is read-only. */
  blocked?: boolean
  /** `voice` shows a Mic icon, `audio` shows a Music icon. */
  variant?: 'voice' | 'audio'
  /** Optional aria-label override for the play/pause button. */
  label?: string
  className?: string
  /** Voice-note transcription (Task 36-b). When provided (and `messageId`
   *  is set), the toggle reveals the transcription immediately without an
   *  API call. The parent passes `message.transcription` straight through. */
  transcription?: string | null
  /** Message ID for the underlying voice note. Required to enable the
   *  "Transcribe" CTA — when omitted (e.g. for uploaded audio files), no
   *  transcription UI is rendered at all. */
  messageId?: string
}

/** Format seconds as `m:ss` (e.g. 73 → "1:13"). Returns "0:00" for NaN/0. */
function formatTime(sec: number): string {
  if (!Number.isFinite(sec) || Number.isNaN(sec) || sec <= 0) return '0:00'
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

export function VoicePlayer({
  src,
  mine,
  blocked = false,
  variant = 'voice',
  label,
  className,
  transcription: initialTranscription,
  messageId,
}: VoicePlayerProps) {
  // The audio element is created lazily on first play so we don't fetch the
  // media (esp. large base64 data URLs) until the user actually wants to
  // listen. The ref holds the element across re-renders and is cleaned up
  // on unmount.
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [playing, setPlaying] = useState(false)
  const [progress, setProgress] = useState(0)
  const [duration, setDuration] = useState(0)
  const [loading, setLoading] = useState(true)
  const [speedIdx, setSpeedIdx] = useState(0) // default 1x
  // Initial value computed lazily so the SSR/first-render state already
  // matches the user's OS setting; the effect below only subscribes for
  // future changes (so it never calls setState synchronously in its body).
  const [reducedMotion, setReducedMotion] = useState<boolean>(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false
    try {
      return window.matchMedia('(prefers-reduced-motion: reduce)').matches
    } catch {
      return false
    }
  })

  const speed = SPEED_CYCLE[speedIdx]

  // Track the user's prefers-reduced-motion setting so we can suppress the
  // pulse animation on the play button (a11y). Subscribe-only effect —
  // setState happens inside the `change` callback, not in the effect body.
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    let mq: MediaQueryList
    try {
      mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    } catch {
      return
    }
    const onChange = () => setReducedMotion(mq.matches)
    if (typeof mq.addEventListener === 'function') {
      mq.addEventListener('change', onChange)
      return () => mq.removeEventListener('change', onChange)
    }
    // Safari < 14 fallback
    mq.addListener(onChange)
    return () => mq.removeListener(onChange)
  }, [])

  // ---- Transcription state (Task 36-b) ------------------------------------
  // `transcription` is the locally-cached value: initialised from the
  // server-provided `initialTranscription` prop, then updated when the user
  // triggers the POST /api/ai/transcribe call. `transcribing` is the
  // in-flight flag for the spinner. `showTranscription` controls the
  // expand/collapse of the transcription box.
  const [transcription, setTranscription] = useState<string | null>(
    initialTranscription ?? null
  )
  const [transcribing, setTranscribing] = useState(false)
  const [showTranscription, setShowTranscription] = useState(false)
  const [transcriptionError, setTranscriptionError] = useState<string | null>(
    null
  )

  // The transcription UI only makes sense for in-browser voice notes —
  // uploaded audio files (variant === 'audio') don't carry a `messageId`
  // and the API only transcribes `type: 'voice'` rows.
  const supportsTranscription = !!messageId && variant === 'voice'

  // Lazily instantiate the HTMLAudioElement and wire up its event listeners
  // once. Subsequent calls return the cached element from the ref. Not
  // memoized with useCallback on purpose — the audio element is cached in
  // `audioRef`, so the function identity changing on re-render is fine and
  // avoids the React Compiler "preserve-manual-memoization" warning that
  // would fire if we declared `[src]` deps while the body also referenced
  // `speed`. Speed is applied separately in `togglePlay` + the effect below.
  function ensureAudio(): HTMLAudioElement {
    if (audioRef.current) return audioRef.current
    const audio = new Audio()
    audio.preload = 'metadata'
    audio.src = src
    audioRef.current = audio
    audio.addEventListener('loadedmetadata', () => {
      // Some browsers report Infinity briefly for streamed media; treat
      // that as "unknown" (0) so the seek bar stays disabled.
      const d = audio.duration
      setDuration(Number.isFinite(d) && d > 0 ? d : 0)
      setLoading(false)
    })
    audio.addEventListener('timeupdate', () => {
      setProgress(audio.currentTime || 0)
    })
    audio.addEventListener('ended', () => {
      setPlaying(false)
      setProgress(0)
    })
    audio.addEventListener('error', () => {
      setLoading(false)
    })
    return audio
  }

  // Keep the audio element's playbackRate in sync with the speed state.
  // Runs on mount + whenever `speed` changes. If the audio hasn't been
  // created yet (user hasn't pressed play), this is a no-op and the rate
  // is applied by `togglePlay` when the user starts playback.
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = speed
    }
  }, [speed])

  // Pause + release the audio element on unmount so we don't leak a playing
  // track after the bubble is scrolled out of view.
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current.src = ''
        audioRef.current = null
      }
    }
  }, [])

  function togglePlay() {
    if (blocked) return
    const audio = ensureAudio()
    if (playing) {
      audio.pause()
      setPlaying(false)
      return
    }
    audio.playbackRate = speed
    void audio
      .play()
      .then(() => setPlaying(true))
      .catch(() => setPlaying(false))
  }

  function cycleSpeed() {
    if (blocked) return
    setSpeedIdx((i) => (i + 1) % SPEED_CYCLE.length)
  }

  function handleSeek(e: React.ChangeEvent<HTMLInputElement>) {
    if (blocked || !audioRef.current) return
    const v = parseFloat(e.target.value)
    if (!Number.isFinite(v)) return
    audioRef.current.currentTime = v
    setProgress(v)
  }

  // ArrowLeft/ArrowRight seek 5s (overriding the range input's default
  // 1-step behaviour). ArrowUp/ArrowDown also seek 5s for consistency.
  function handleSeekKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (blocked || !audioRef.current) return
    const cur = audioRef.current.currentTime
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
      e.preventDefault()
      const next = Math.max(0, cur - 5)
      audioRef.current.currentTime = next
      setProgress(next)
    } else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
      e.preventDefault()
      const next = Math.min(duration || cur + 5, cur + 5)
      audioRef.current.currentTime = next
      setProgress(next)
    }
  }

  // Toggle the transcription panel open/closed. On the first open, if no
  // transcription is cached locally, kick off POST /api/ai/transcribe and
  // show a spinner while we wait. Re-opening afterwards is instant because
  // the result is stored in `transcription` state.
  async function handleToggleTranscription() {
    if (blocked || !messageId) return
    if (showTranscription) {
      setShowTranscription(false)
      return
    }
    setShowTranscription(true)
    setTranscriptionError(null)
    if (transcription) return
    setTranscribing(true)
    try {
      const res = await fetch('/api/ai/transcribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageId }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        setTranscriptionError(
          (data && typeof data === 'object' && 'error' in data
            ? String((data as { error: unknown }).error)
            : null) || 'Transcription failed'
        )
        return
      }
      const data = (await res.json()) as { transcription?: string }
      if (typeof data.transcription === 'string') {
        setTranscription(data.transcription)
      }
    } catch {
      setTranscriptionError('Network error — try again')
    } finally {
      setTranscribing(false)
    }
  }

  // Outgoing → wasl-green accent. Incoming → wasl-teal accent.
  // (No indigo/blue per project rules.)
  const accentColor = mine ? 'var(--wasl-green)' : 'var(--wasl-teal)'
  // Subtle tinted surface behind the player so it reads as a distinct UI
  // element inside the bubble. Outgoing uses a green tint; incoming uses a
  // neutral surface tint that works in both light and dark modes.
  const surfaceBg = mine
    ? 'bg-[var(--wasl-green)]/10'
    : 'bg-black/[0.04] dark:bg-white/[0.06]'

  const pct = duration > 0 ? (progress / duration) * 100 : 0

  // Deterministic pseudo-waveform bars — stable per `src` so the visual
  // doesn't jitter on re-render. 28 bars gives a nice density without
  // overflowing on narrow mobile bubbles.
  const bars = Array.from({ length: 28 }, (_, i) => {
    const h = 30 + Math.sin(i * 1.3 + src.length) * 22 + Math.cos(i * 2.1) * 14
    return Math.max(12, Math.min(100, Math.abs(h)))
  })

  const Icon = variant === 'audio' ? Music : Mic

  return (
    <div className="flex flex-col gap-1">
      <div
        className={cn(
          'flex items-center gap-2 min-w-[220px] max-w-[300px]',
          'rounded-lg px-2 py-1.5',
          surfaceBg,
          blocked && 'opacity-60 pointer-events-none',
          className
        )}
      >
        <Icon
          className="w-4 h-4 shrink-0"
          style={{ color: accentColor }}
          aria-hidden
        />
        <button
          type="button"
          onClick={togglePlay}
          disabled={blocked}
          aria-label={label ?? (playing ? 'Pause audio' : 'Play audio')}
          aria-pressed={playing}
          className={cn(
            'w-9 h-9 rounded-full flex items-center justify-center shrink-0',
            'text-white shadow-sm transition-opacity hover:opacity-90',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1',
            'focus-visible:ring-[var(--ring)] disabled:cursor-not-allowed',
            playing && !reducedMotion && 'wasl-voice-pulse'
          )}
          style={{ backgroundColor: accentColor }}
        >
          {loading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : playing ? (
            <Pause className="w-4 h-4" />
          ) : (
            <Play className="w-4 h-4 ml-0.5" />
          )}
        </button>
        <div className="flex-1 min-w-0">
          <div
            className={cn(
              'relative flex items-center gap-0.5 h-7 rounded group',
              !blocked && 'focus-within:ring-2 focus-within:ring-[var(--ring)]/40 focus-within:ring-offset-1'
            )}
          >
            {bars.map((h, i) => {
              const barProgress = (i / bars.length) * 100
              const active = barProgress < pct
              return (
                <div
                  key={i}
                  className="w-0.5 rounded-full transition-colors"
                  style={{
                    height: `${h}%`,
                    backgroundColor: active
                      ? accentColor
                      : mine
                      ? 'color-mix(in oklab, var(--foreground) 30%, transparent)'
                      : 'color-mix(in oklab, var(--foreground) 22%, transparent)',
                  }}
                />
              )
            })}
            {/* Transparent range input overlay — provides seek + keyboard
                a11y on top of the visual waveform bars. opacity-0 keeps the
                bars visible while the input still receives clicks + focus. */}
            <input
              type="range"
              min={0}
              max={duration || 0}
              step={0.1}
              value={progress}
              onChange={handleSeek}
              onKeyDown={handleSeekKey}
              disabled={blocked || loading || duration === 0}
              aria-label="Seek audio position"
              aria-valuemin={0}
              aria-valuemax={Math.round(duration)}
              aria-valuenow={Math.round(progress)}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
            />
          </div>
          <div className="flex items-center justify-between mt-0.5 gap-2">
            <span className="text-[10px] text-foreground/70 tabular-nums">
              {formatTime(playing ? progress : duration)}
              {duration > 0 ? ` / ${formatTime(duration)}` : ''}
            </span>
            <button
              type="button"
              onClick={cycleSpeed}
              disabled={blocked || loading}
              aria-label={`Playback speed ${SPEED_LABEL[speed]} — click to change`}
              className={cn(
                'shrink-0 inline-flex items-center justify-center',
                'text-[10px] font-semibold leading-none px-1.5 py-0.5 rounded-full',
                'transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]',
                'disabled:cursor-not-allowed'
              )}
              style={{
                backgroundColor: `color-mix(in oklab, ${accentColor} 18%, transparent)`,
                color: accentColor,
              }}
              title="Playback speed"
            >
              {SPEED_LABEL[speed]}
            </button>
          </div>
        </div>
      </div>
      {supportsTranscription && (
        <div className="flex flex-col gap-1 min-w-[220px] max-w-[300px]">
          <button
            type="button"
            onClick={handleToggleTranscription}
            disabled={blocked || transcribing}
            aria-expanded={showTranscription}
            aria-controls={
              messageId ? `wasl-transcription-${messageId}` : undefined
            }
            className={cn(
              'self-start inline-flex items-center gap-1',
              'text-[11px] font-medium leading-none px-2 py-1 rounded-md',
              'transition-colors text-muted-foreground',
              'hover:text-foreground hover:bg-black/[0.04] dark:hover:bg-white/[0.06]',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]',
              'disabled:cursor-not-allowed disabled:opacity-60'
            )}
          >
            {transcribing ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <FileText className="w-3 h-3" />
            )}
            <span>
              {transcribing
                ? 'Transcribing…'
                : transcription
                ? showTranscription
                  ? 'Hide transcription'
                  : 'Show transcription'
                : 'Transcribe'}
            </span>
          </button>
          {/* Smooth expand/collapse using a CSS grid-rows transition. The
              container animates from 0fr → 1fr, giving a height-based
              reveal without measuring the content with JS. */}
          <div
            className={cn(
              'grid transition-[grid-template-rows] duration-200 ease-out',
              showTranscription ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
            )}
          >
            <div className="overflow-hidden">
              <div
                id={
                  messageId ? `wasl-transcription-${messageId}` : undefined
                }
                role="region"
                aria-label="Voice message transcription"
                className={cn(
                  'rounded-md bg-muted/30 px-2 py-1.5',
                  'text-[11px] italic text-muted-foreground leading-snug'
                )}
              >
                {transcribing ? (
                  <span className="inline-flex items-center gap-1.5 not-italic">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    Transcribing audio…
                  </span>
                ) : transcriptionError ? (
                  <span className="not-italic text-foreground/70">
                    {transcriptionError}
                  </span>
                ) : transcription ? (
                  transcription
                ) : (
                  <span className="not-italic text-foreground/40">
                    No transcription yet.
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
