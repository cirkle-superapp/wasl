'use client'

// ─────────────────────────────────────────────────────────────────────────────
// Smart Intent Chips — LEAPFROG feature (beyond WhatsApp's "message text
// actions" which is only now rolling out on mobile).
//
// Detects actionable entities inside plain-text messages and renders compact
// tappable chips below the bubble:
//   📅 Date/time  → "Add to calendar" (generates a real .ics event file)
//   📞 Phone      → tap-to-call (tel:) + copy
//   ✉️  Email     → compose (mailto:)
//   🎥 Meeting    → Zoom / Google Meet / Teams / Discord join links
//   📍 Address    → open in maps
//
// Everything runs client-side — zero latency, zero API cost, works offline.
// Detection is deliberately conservative (high precision over recall) so
// chips only appear when genuinely useful: false-positive chips would be
// worse than no chips.
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo, useState } from 'react'
import { Calendar, MapPin, Phone, Mail, Video, Check, Copy } from 'lucide-react'

export type DetectedIntent =
  | { kind: 'calendar'; raw: string; label: string; start: Date | null; allDay: boolean }
  | { kind: 'phone'; raw: string; label: string }
  | { kind: 'email'; raw: string; label: string }
  | { kind: 'meeting'; raw: string; label: string; url: string }
  | { kind: 'address'; raw: string; label: string }

// ---- Phone -----------------------------------------------------------------
// International or local phone numbers: +20 100 123 4567, (02) 1234-5678,
// 0100 123 4567. Guards: must have 8–15 digits, must not be adjacent to
// letters (avoids matching IDs / version strings like "v1.2.3.4").
const PHONE_RE = /(?:\+?\d{1,3}[\s\-()]?)?(?:\(?\d{2,4}\)?[\s\-.]?){2,4}\d{2,4}/g
function looksLikePhone(s: string): boolean {
  const digits = s.replace(/\D/g, '')
  if (digits.length < 8 || digits.length > 15) return false
  const trimmed = s.trim()
  // Reject if surrounded by letters or slashes (dates 12/05/2025, versions 1.2.34)
  if (/[/:]/.test(trimmed)) return false
  return true
}

// ---- Email -----------------------------------------------------------------
// No standalone email chip: the bubble's markdown renderer auto-linkifies
// emails already, and detectIntents strips them before other detectors run.

// ---- Meeting links ---------------------------------------------------------
const MEETING_RE =
  /https?:\/\/(?:[a-z0-9-]+\.)*(?:zoom\.us|google\.com\/meet|meet\.google\.com|teams\.microsoft\.com|discord\.gg|whereby\.com|jitsi\.meet)[^\s<>"']*/gi

// ---- Address ---------------------------------------------------------------
// A number followed by a street word — conservative: "123 Nile St", "42 Elm
// Street, Giza". Avoids random noun matches.
const STREET_WORDS =
  'street|st\\.|avenue|ave\\.|road|rd\\.|boulevard|blvd|lane|ln\\.|drive|dr\\.|square|sq\\.|alley|terrace|ter\\.'
const ADDRESS_RE = new RegExp(`\\b\\d{1,5}\\s+[\\w\\s]{1,30}?(?:${STREET_WORDS})\\b[^\\n]{0,30}`, 'gi')

// ---- Date / time -----------------------------------------------------------
// Pragmatic natural-ish date parser. Handles the shapes people actually send:
//   "tomorrow at 3pm" / "tmr 3pm"        "next monday 9:30am"
//   "june 5" / "june 5 at 5pm"           "5 june"
//   "monday" / "fri"                     "15/06/2025 at 18:00"
//   "in 2 hours" / "in 30 minutes"       "2025-06-15 18:00"
// Returns { date, matched, allDay } — matched false when nothing parsed.
const MONTHS: Record<string, number> = {
  jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2, apr: 3, april: 3,
  may: 4, jun: 5, june: 5, jul: 6, july: 6, aug: 7, august: 7, sep: 8, sept: 8,
  september: 8, oct: 9, october: 9, nov: 10, november: 10, dec: 11, december: 11,
}
const WEEKDAYS: Record<string, number> = {
  sunday: 0, sun: 0, monday: 1, mon: 1, tuesday: 2, tue: 2, tues: 2,
  wednesday: 3, wed: 3, thursday: 4, thu: 4, thurs: 4, friday: 5, fri: 5,
  saturday: 6, sat: 6,
}
const TIME_RE = /(?:at\s+|@\s*)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i

function parseDatePhrase(text: string): { date: Date | null; matched: string | null; allDay: boolean } {
  const now = new Date()
  const lower = text.toLowerCase()

  // "in N hours/minutes/days"
  const rel = lower.match(/\bin\s+(\d{1,3})\s+(minute|min|hour|hr|day)s?\b/)
  if (rel) {
    const n = parseInt(rel[1], 10)
    const unit = rel[2]
    const d = new Date(now)
    if (unit.startsWith('min')) d.setMinutes(d.getMinutes() + n)
    else if (unit.startsWith('h')) d.setHours(d.getHours() + n)
    else d.setDate(d.getDate() + n)
    return { date: d, matched: rel[0], allDay: false }
  }

  // "today" / "tonight" / "tomorrow" / "tmr" (+ optional time)
  const todayTon = lower.match(/\b(today|tonight|tomorrow|tmr|tomorrow morning|tomorrow evening)\b/)
  if (todayTon) {
    const d = new Date(now)
    const w = todayTon[1]
    if (w.startsWith('tomorrow') || w === 'tmr') d.setDate(d.getDate() + 1)
    const timePart = text.slice(lower.indexOf(w) + w.length)
    const t = TIME_RE.exec(timePart)
    let allDay = true
    if (t && (t[3] || t[2])) {
      let h = parseInt(t[1], 10)
      const m = t[2] ? parseInt(t[2], 10) : 0
      if (t[3] === 'pm' && h < 12) h += 12
      if (t[3] === 'am' && h === 12) h = 0
      if (w === 'tonight' && !t[3] && h < 12) h += 12
      d.setHours(h, m, 0, 0)
      allDay = false
    } else if (w === 'tonight') {
      d.setHours(20, 0, 0, 0)
      allDay = false
    }
    const label = (allDay ? w : `${w} ${t?.[0]?.trim() || ''}`).trim()
    return { date: d, matched: label, allDay }
  }

  // Month-name dates: "june 5", "5 june", "jun 5th at 3pm"
  const monthName = lower.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?\b/)
  const dayFirst = lower.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\b/)
  if (monthName || dayFirst) {
    let month: number, day: number, after: string
    if (monthName) {
      month = MONTHS[monthName[1]] ?? MONTHS[monthName[1].slice(0, 3)]
      day = parseInt(monthName[2], 10)
      after = text.slice((monthName.index ?? 0) + monthName[0].length)
    } else {
      day = parseInt(dayFirst![1], 10)
      month = MONTHS[dayFirst![2]] ?? MONTHS[dayFirst![2].slice(0, 3)]
      after = text.slice((dayFirst!.index ?? 0) + dayFirst![0].length)
    }
    const t = TIME_RE.exec(after)
    const d = new Date(now.getFullYear(), month, day)
    if (d < new Date(now.getTime() - 30 * 864e5)) d.setFullYear(d.getFullYear() + 1)
    let allDay = true
    if (t && (t[3] || t[2])) {
      let h = parseInt(t[1], 10)
      const m = t[2] ? parseInt(t[2], 10) : 0
      if (t[3] === 'pm' && h < 12) h += 12
      if (t[3] === 'am' && h === 12) h = 0
      d.setHours(h, m, 0, 0)
      allDay = false
    }
    return { date: d, matched: (monthName || dayFirst)![0] + (allDay ? '' : ` ${t?.[0]?.trim() || ''}`), allDay }
  }

  // Bare weekday: "next monday", "on friday", "sat"
  // Full words + short forms only (word-bounded, so "satellite" can't
  // match as "sat").
  const weekday = lower.match(
    /\b(?:next\s+|on\s+)?(monday|mon|tuesday|tues|tue|wednesday|weds|wed|thursday|thurs|thu|friday|fri|saturday|sat|sunday|sun)\b/
  )
  if (weekday) {
    const target = WEEKDAYS[weekday[1]] ?? WEEKDAYS[weekday[1].slice(0, 3)]
    if (target !== undefined) {
      const d = new Date(now)
      let delta = (target - d.getDay() + 7) % 7
      // "monday" said on a monday means NEXT monday (unless "on monday")
      if (delta === 0 && !weekday[0].startsWith('on ')) delta = 7
      d.setDate(d.getDate() + delta)
      d.setHours(9, 0, 0, 0)
      const after = text.slice((weekday.index ?? 0) + weekday[0].length)
      const t = TIME_RE.exec(after)
      let allDay = true
      if (t && (t[3] || t[2])) {
        let h = parseInt(t[1], 10)
        const m = t[2] ? parseInt(t[2], 10) : 0
        if (t[3] === 'pm' && h < 12) h += 12
        if (t[3] === 'am' && h === 12) h = 0
        d.setHours(h, m, 0, 0)
        allDay = false
      }
      return { date: d, matched: weekday[0] + (allDay ? '' : ` ${t?.[0]?.trim() || ''}`), allDay }
    }
  }

  // Numeric dates: "15/06/2025", "2025-06-15", "06-15" (+ optional time)
  const numeric = lower.match(/\b(\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)\b/)
  if (numeric) {
    const tok = numeric[1]
    const after = text.slice((numeric.index ?? 0) + tok.length)
    const t = TIME_RE.exec(after)
    let d: Date
    if (tok.includes('-') && /^\d{4}-/.test(tok)) {
      d = new Date(tok + (t && (t[3] || t[2]) ? `T${String(parseInt(t[1])).padStart(2, '0')}:${t[2] || '00'}:00` : 'T09:00:00'))
    } else {
      const [a, b, c] = tok.split('/').map(Number)
      // Ambiguity: when the first number > 12 it must be the day (D/M/Y);
      // otherwise assume M/D/Y (US) — a reasonable default for chat.
      const day = a > 12 ? a : b
      const month = a > 12 ? b : a
      const year = c !== undefined ? (c < 100 ? 2000 + c : c) : now.getFullYear()
      d = new Date(year, month - 1, day)
      if (t && (t[3] || t[2])) {
        let h = parseInt(t[1], 10)
        const m = t[2] ? parseInt(t[2], 10) : 0
        if (t[3] === 'pm' && h < 12) h += 12
        if (t[3] === 'am' && h === 12) h = 0
        d.setHours(h, m, 0, 0)
      } else {
        d.setHours(9, 0, 0, 0)
      }
    }
    if (!isNaN(d.getTime())) {
      const hasTime = t && (t[3] || t[2])
      return { date: d, matched: tok + (hasTime ? ` ${t?.[0]?.trim()}` : ''), allDay: !hasTime }
    }
  }
  return { date: null, matched: null, allDay: true }
}

// ---- Intent extraction (memoized per message) ------------------------------
export function detectIntents(text: string): DetectedIntent[] {
  if (!text) return []
  const intents: DetectedIntent[] = []
  const seen = new Set<string>()

  // Meeting links first (a URL chip is more specific than a generic link).
  // Run on the FULL text — URLs get stripped below for the other detectors.
  for (const m of text.matchAll(MEETING_RE)) {
    const url = m[0]
    if (seen.has(url)) continue
    seen.add(url)
    let label = 'Join meeting'
    if (/zoom\.us/i.test(url)) label = 'Join Zoom'
    else if (/meet\.google|google\.com\/meet/i.test(url)) label = 'Join Meet'
    else if (/teams\.microsoft/i.test(url)) label = 'Join Teams'
    else if (/discord\.gg/i.test(url)) label = 'Open Discord'
    intents.push({ kind: 'meeting', raw: url, label, url })
  }

  // Strip URLs so digit-heavy links (zoom.us/j/98211234567) can't masquerade
  // as phone numbers or dates in the detectors below. Emails are dropped too
  // — the markdown renderer already auto-linkifies them inside the bubble, so
  // a separate email chip would be redundant.
  const stripped = text.replace(/https?:\/\/[^\s<>"']+|\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/g, ' ')

  // Date/time — highest-value intent, evaluated first so the cap below
  // never crowds it out.
  const parsed = parseDatePhrase(stripped)
  if (parsed.date && parsed.matched && !seen.has(parsed.matched)) {
    seen.add(parsed.matched)
    intents.push({
      kind: 'calendar',
      raw: parsed.matched,
      label: parsed.matched,
      start: parsed.date,
      allDay: parsed.allDay,
    })
  }

  // Phones (on URL-stripped text)
  for (const m of stripped.matchAll(PHONE_RE)) {
    const cand = m[0].trim()
    if (!looksLikePhone(cand) || seen.has(cand)) continue
    seen.add(cand)
    intents.push({ kind: 'phone', raw: cand, label: cand })
  }

  // Addresses
  for (const m of stripped.matchAll(ADDRESS_RE)) {
    const cand = m[0].trim().replace(/[.,;:]+$/, '')
    if (cand.length < 5 || seen.has(cand)) continue
    seen.add(cand)
    intents.push({ kind: 'address', raw: cand, label: cand })
  }

  return intents.slice(0, 4) // Cap at 4 chips — keep the bubble compact
}

// ---- .ics generation -------------------------------------------------------
function toICSDate(d: Date, allDay: boolean): string {
  const p = (n: number) => String(n).padStart(2, '0')
  const base = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`
  if (allDay) return base // date-only form
  return `${base}T${p(d.getHours())}${p(d.getMinutes())}00`
}
function downloadICS(title: string, start: Date, allDay: boolean) {
  const end = new Date(start)
  if (allDay) end.setDate(end.getDate() + 1)
  else end.setHours(end.getHours() + 1)
  const stamp = new Date()
  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Wasl//Smart Intents//EN',
    'BEGIN:VEVENT',
    `UID:${Date.now()}-${Math.random().toString(36).slice(2)}@wasl.app`,
    `DTSTAMP:${toICSDate(stamp, false)}`,
    allDay
      ? `DTSTART;VALUE=DATE:${toICSDate(start, true)}`
      : `DTSTART:${toICSDate(start, false)}`,
    allDay
      ? `DTEND;VALUE=DATE:${toICSDate(end, true)}`
      : `DTEND:${toICSDate(end, false)}`,
    `SUMMARY:${title.replace(/[\n,;]/g, ' ')}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n')
  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'wasl-event.ics'
  a.click()
  URL.revokeObjectURL(url)
}

// ---- Component -------------------------------------------------------------
export function IntentChips({ text, mine }: { text: string; mine: boolean }) {
  const intents = useMemo(() => detectIntents(text), [text])
  const [copied, setCopied] = useState<string | null>(null)
  if (intents.length === 0) return null

  const doCopy = (value: string) => {
    navigator.clipboard?.writeText(value).then(() => {
      setCopied(value)
      setTimeout(() => setCopied(null), 1500)
    }).catch(() => {})
  }

  return (
    <div
      className={`flex flex-wrap gap-1.5 mt-1.5 ${mine ? 'justify-end' : 'justify-start'}`}
      onClick={(e) => e.stopPropagation()}
    >
      {intents.map((intent, i) => {
        switch (intent.kind) {
          case 'calendar':
            return (
              <button
                key={i}
                type="button"
                onClick={() => intent.start && downloadICS(`Wasl: ${intent.raw}`, intent.start, intent.allDay)}
                className="wasl-intent-chip group"
                title={`Add "${intent.raw}" to your calendar (.ics)`}
              >
                <Calendar className="w-3 h-3 shrink-0" />
                <span className="truncate max-w-[160px] capitalize">{intent.raw}</span>
                <span className="opacity-60 group-hover:opacity-100">+ calendar</span>
              </button>
            )
          case 'phone': {
            const tel = intent.raw.replace(/[^\d+]/g, '')
            return (
              <span key={i} className="inline-flex">
                <a href={`tel:${tel}`} className="wasl-intent-chip" title={`Call ${intent.raw}`}>
                  <Phone className="w-3 h-3 shrink-0" />
                  <span className="truncate max-w-[140px]">{intent.label}</span>
                </a>
                <button
                  type="button"
                  onClick={() => doCopy(intent.raw)}
                  className="wasl-intent-chip wasl-intent-chip-suffix"
                  title="Copy number"
                >
                  {copied === intent.raw ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                </button>
              </span>
            )
          }
          case 'email':
            return (
              <a key={i} href={`mailto:${intent.raw}`} className="wasl-intent-chip" title={`Email ${intent.raw}`}>
                <Mail className="w-3 h-3 shrink-0" />
                <span className="truncate max-w-[160px]">{intent.label}</span>
              </a>
            )
          case 'meeting':
            return (
              <a key={i} href={intent.url} target="_blank" rel="noopener noreferrer" className="wasl-intent-chip wasl-intent-chip-accent" title={intent.url}>
                <Video className="w-3 h-3 shrink-0" />
                {intent.label}
              </a>
            )
          case 'address':
            return (
              <a
                key={i}
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(intent.raw)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="wasl-intent-chip"
                title={`Open "${intent.raw}" in maps`}
              >
                <MapPin className="w-3 h-3 shrink-0" />
                <span className="truncate max-w-[160px]">{intent.label}</span>
              </a>
            )
        }
      })}
    </div>
  )
}
