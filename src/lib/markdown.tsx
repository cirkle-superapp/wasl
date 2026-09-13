// Lightweight inline markdown renderer — supports the most common chat
// formatting tokens: **bold**, _italic_, ~~strikethrough~~, `inline code`.
// URLs are linkified. Returns an array of React nodes that can be spread
// into a <span> or <div>.
//
// This is INTENTIONALLY simple — no raw HTML, no nested formatting, no
// script execution. Each token type is processed in a single pass with a
// combined regex so we never have to worry about overlapping matches.

import React from 'react'

const TOKEN_RE = /(\*\*[^*\n]+?\*\*)|(__[^_\n]+?__)|(_[^_\n]+?_)|(`[^`\n]+?`)|(~~[^~\n]+?~~)|(https?:\/\/[^\s<>"']+|www\.[^\s<>"']+)/g

function escapeText(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

export function renderMarkdownLite(text: string): React.ReactNode[] {
  if (!text) return []
  const nodes: React.ReactNode[] = []
  let lastIndex = 0
  let key = 0
  for (const match of text.matchAll(TOKEN_RE)) {
    const m = match[0]
    const start = match.index ?? 0
    // Push the plain text leading up to this match
    if (start > lastIndex) {
      nodes.push(text.slice(lastIndex, start))
    }
    if (m.startsWith('**') && m.endsWith('**')) {
      nodes.push(
        <strong key={key++} className="font-semibold">
          {m.slice(2, -2)}
        </strong>
      )
    } else if (m.startsWith('__') && m.endsWith('__')) {
      nodes.push(
        <strong key={key++} className="font-semibold">
          {m.slice(2, -2)}
        </strong>
      )
    } else if (m.startsWith('_') && m.endsWith('_')) {
      nodes.push(
        <em key={key++} className="italic">
          {m.slice(1, -1)}
        </em>
      )
    } else if (m.startsWith('`') && m.endsWith('`')) {
      nodes.push(
        <code
          key={key++}
          className="px-1 py-0.5 rounded bg-black/10 dark:bg-white/15 font-mono text-[0.85em] text-foreground"
        >
          {m.slice(1, -1)}
        </code>
      )
    } else if (m.startsWith('~~') && m.endsWith('~~')) {
      nodes.push(
        <span key={key++} className="line-through opacity-80">
          {m.slice(2, -2)}
        </span>
      )
    } else if (/^https?:\/\//i.test(m) || /^www\./i.test(m)) {
      const href = /^https?:\/\//i.test(m) ? m : 'https://' + m
      let display = m.replace(/^https?:\/\//i, '')
      if (display.length > 50) display = display.slice(0, 49) + '…'
      nodes.push(
        <a
          key={key++}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[var(--wasl-teal)] dark:text-[var(--wasl-green)] underline decoration-dotted hover:decoration-solid break-all"
          onClick={(e) => e.stopPropagation()}
        >
          {display}
        </a>
      )
    } else {
      // Shouldn't happen, but fall through safely
      nodes.push(m)
    }
    lastIndex = start + m.length
  }
  // Push trailing text
  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex))
  }
  return nodes
}
