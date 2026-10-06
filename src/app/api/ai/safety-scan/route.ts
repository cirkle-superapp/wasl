import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'

export const runtime = 'nodejs'

// ═══════════════════════════════════════════════════════════════════════
// AI Safety / Spam Scanner — risk-score first-time messages (Task 88)
// ═══════════════════════════════════════════════════════════════════════
//
// When a message arrives from a NON-CONTACT (someone the user has never
// exchanged messages with), this endpoint runs a deterministic, multi-rule
// risk-scoring algorithm to flag potential scams / phishing / spam.
//
// The algorithm is intentionally rule-based (no AI dependency) so it runs
// in <50ms even on a cold Vercel function. Each rule produces a partial
// score; the final score is the sum (capped at 100).
//
// Rules (each with weight):
//   R1. Link present                    +15
//   R2. Link domain not in common TLDs  +20  (suspicious TLDs/shorteners)
//   R3. Money / payment request         +25  ("send money", "wire", "bank",
//                                             "payment", "transfer", "bitcoin")
//   R4. Credential request              +20  ("password", "code", "OTP",
//                                             "verification code", "PIN")
//   R5. Urgency language               +15  ("urgent", "immediately",
//                                             "act now", "before ... expires")
//   R6. Too-good-to-be-true             +15  ("you won", "free gift",
//                                             "lottery", "selected", "prize")
//   R7. Impersonation phrasing          +15  ("it's me", "new number",
//                                             "this is my new account",
//                                             "lost my phone")
//   R8. Non-Latin script mixing         +10  (mixed scripts common in
//                                             phishing)
//   R9. Excessive emoji/unicode         +5
//   R10. Long message + ask            +10  (over 400 chars + a question
//                                             asking for action)
//
// Final score → label + recommendation:
//   0-19   Safe         "allow"
//   20-39  Cautious      "warn"
//   40-69  Suspicious    "warn"
//   70-100 Likely scam   "block"

const SUSPICIOUS_TLDS = [
  '.tk', '.ml', '.ga', '.cf', '.gq', // free TLDs
  '.bit', '.xyz', '.click', '.top', '.loan', '.work',
  '.racing', '.review', '.party', '.download', '.kim',
  '.country', '.cricket', '.science', '.accountant',
]

const SHORTENERS = [
  'bit.ly', 'tinyurl.com', 't.co', 'goo.gl', 'ow.ly',
  'is.gd', 'buff.ly', 'rebrand.ly', 'cutt.ly', 'shorturl.at',
]

const MONEY_PATTERNS = [
  /\b(send (money|funds))\b/gi,
  /\b(wire (transfer|money))\b/gi,
  /\b(bank (account|transfer|details?))\b/gi,
  /\b(payment|invoice|crypto|bitcoin|btc|eth|usdt)\b/gi,
  /\b(cash ?app|venmo|paypal|zelle|wise|skrill)\b/gi,
  /\b(gift card|steam card|itunes card|google play)\b/gi,
  /\b(\$|usd|eur|gbp|aed|sar|egp)\s?\d{2,}/gi,
  /\b(deposit|refund|bonus|inheritance|consignment)\b/gi,
]

const CREDENTIAL_PATTERNS = [
  /\b(password|passwd|pwd)\b/gi,
  /\b(verification code|otp|2fa|mfa)\b/gi,
  /\b(\bcode\b).{0,20}(\bconfirm|verify|enter|provide|send)\b/gi,
  /\b(pin|cvv|cvc|security code)\b/gi,
  /\b(login|sign in|credentials|account details)\b/gi,
  /\b(ssn|social security|national id)\b/gi,
]

const URGENCY_PATTERNS = [
  /\b(urgent|immediately|right now|right away|asap)\b/gi,
  /\b(act now|before.{0,30}(expire|end|close|over))\b/gi,
  /\b(within (an? )?hour|today only|last chance|final notice)\b/gi,
  /\b(account (will be|has been) (closed|suspended|locked))\b/gi,
]

const TOO_GOOD_PATTERNS = [
  /\b(you (won|win)|winner|congratulations)\b/gi,
  /\b(free gift|free money|free iphone|free iphone)\b/gi,
  /\b(lottery|sweepstakes|raffle|prize)\b/gi,
  /\b(selected|chosen|qualified)\b/gi,
  /\b(unclaimed|claim your|claim now)\b/gi,
  /\b(investment opportunity|guaranteed return|double your)\b/gi,
]

const IMPERSONATION_PATTERNS = [
  /\b(it'?s me\b|this is me\b)/gi,
  /\b(new number|new account|changed (my )?number|lost my phone)\b/gi,
  /\b(i found your number|got your number|saw your number)\b/gi,
  /\b(this is (my new|the new))\b/gi,
  /\b(i can'?t talk (right now|long))\b/gi,
]

function hasMixedScripts(text: string): boolean {
  // Look for non-ASCII characters mixed with ASCII letters
  const hasNonAscii = /[^\x00-\x7F]/.test(text)
  const hasAscii = /[a-zA-Z]/.test(text)
  // Cyrillic/Greek lookalikes commonly used to spoof Latin
  const hasCyrillic = /[\u0400-\u04FF]/.test(text)
  return (hasNonAscii && hasAscii) || hasCyrillic
}

function excessiveEmojiScore(text: string): number {
  // Count emoji
  const emoji = text.match(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu)
  if (!emoji) return 0
  if (emoji.length > 8) return 5
  if (emoji.length > 4) return 3
  return 0
}

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { content, senderId } = await req.json().catch(() => ({}))
  if (!content || typeof content !== 'string') {
    return NextResponse.json({ error: 'content required' }, { status: 400 })
  }
  if (!senderId) {
    return NextResponse.json({ error: 'senderId required' }, { status: 400 })
  }

  // Has the user EVER exchanged messages with this sender before?
  // We check the user's conversations — if any conversation contains both
  // the user and the sender, they have a history.
  const userConvos = await db.participant.findMany({
    where: { userId: session.id },
    select: { conversationId: true },
  })
  const userConvoIds = userConvos.map((p) => p.conversationId)

  const senderConvos = await db.participant.findMany({
    where: { userId: senderId, conversationId: { in: userConvoIds } },
    select: { conversationId: true },
  })

  const hasHistory = senderConvos.length > 0

  // If they have history, return low-risk + skip the scan
  if (hasHistory) {
    return NextResponse.json({
      riskScore: 0,
      label: 'Safe',
      recommendation: 'allow',
      reason: 'This sender is in your conversations.',
      rules: [],
      hasHistory: true,
    })
  }

  // ---- Run the rules ----
  const rules: { rule: string; weight: number; matched: boolean; detail?: string }[] = []
  let score = 0

  // R1 + R2: links
  const linkMatches = content.match(/https?:\/\/([^\s/<>"']+)/gi)
  if (linkMatches) {
    score += 15
    rules.push({ rule: 'Link present', weight: 15, matched: true, detail: `${linkMatches.length} link(s)` })
    // Parse domains
    for (const raw of linkMatches.slice(0, 3)) {
      const domain = raw.replace(/^https?:\/\//, '').split('/')[0].toLowerCase()
      const suspiciousTld = SUSPICIOUS_TLDS.some((tld) => domain.endsWith(tld))
      const isShortener = SHORTENERS.some((s) => domain.includes(s))
      if (suspiciousTld || isShortener) {
        score += 20
        rules.push({
          rule: 'Suspicious link domain',
          weight: 20,
          matched: true,
          detail: domain,
        })
        break // only count once
      }
    }
  } else {
    rules.push({ rule: 'Link present', weight: 15, matched: false })
  }

  // R3: money requests
  let moneyHits = 0
  for (const p of MONEY_PATTERNS) {
    const m = content.match(p)
    if (m) moneyHits += m.length
  }
  if (moneyHits > 0) {
    score += Math.min(25, moneyHits * 10)
    rules.push({ rule: 'Money/payment request', weight: Math.min(25, moneyHits * 10), matched: true, detail: `${moneyHits} match(es)` })
  } else {
    rules.push({ rule: 'Money/payment request', weight: 25, matched: false })
  }

  // R4: credential requests
  let credHits = 0
  for (const p of CREDENTIAL_PATTERNS) {
    const m = content.match(p)
    if (m) credHits += m.length
  }
  if (credHits > 0) {
    score += Math.min(20, credHits * 10)
    rules.push({ rule: 'Credential request', weight: Math.min(20, credHits * 10), matched: true, detail: `${credHits} match(es)` })
  } else {
    rules.push({ rule: 'Credential request', weight: 20, matched: false })
  }

  // R5: urgency
  let urgHits = 0
  for (const p of URGENCY_PATTERNS) {
    const m = content.match(p)
    if (m) urgHits += m.length
  }
  if (urgHits > 0) {
    score += Math.min(15, urgHits * 8)
    rules.push({ rule: 'Urgency language', weight: Math.min(15, urgHits * 8), matched: true, detail: `${urgHits} match(es)` })
  } else {
    rules.push({ rule: 'Urgency language', weight: 15, matched: false })
  }

  // R6: too-good-to-be-true
  let goodHits = 0
  for (const p of TOO_GOOD_PATTERNS) {
    const m = content.match(p)
    if (m) goodHits += m.length
  }
  if (goodHits > 0) {
    score += Math.min(15, goodHits * 8)
    rules.push({ rule: 'Too-good-to-be-true', weight: Math.min(15, goodHits * 8), matched: true, detail: `${goodHits} match(es)` })
  } else {
    rules.push({ rule: 'Too-good-to-be-true', weight: 15, matched: false })
  }

  // R7: impersonation phrasing
  let impHits = 0
  for (const p of IMPERSONATION_PATTERNS) {
    const m = content.match(p)
    if (m) impHits += m.length
  }
  if (impHits > 0) {
    score += Math.min(15, impHits * 8)
    rules.push({ rule: 'Impersonation phrasing', weight: Math.min(15, impHits * 8), matched: true, detail: `${impHits} match(es)` })
  } else {
    rules.push({ rule: 'Impersonation phrasing', weight: 15, matched: false })
  }

  // R8: mixed scripts
  if (hasMixedScripts(content)) {
    score += 10
    rules.push({ rule: 'Mixed scripts (possible spoofing)', weight: 10, matched: true })
  } else {
    rules.push({ rule: 'Mixed scripts (possible spoofing)', weight: 10, matched: false })
  }

  // R9: excessive emoji
  const emojiScore = excessiveEmojiScore(content)
  if (emojiScore > 0) {
    score += emojiScore
    rules.push({ rule: 'Excessive emoji/unicode', weight: emojiScore, matched: true })
  } else {
    rules.push({ rule: 'Excessive emoji/unicode', weight: 5, matched: false })
  }

  // R10: long + action ask
  if (content.length > 400 && /\?\s*$/.test(content.trim())) {
    score += 10
    rules.push({ rule: 'Long message + question', weight: 10, matched: true })
  } else {
    rules.push({ rule: 'Long message + question', weight: 10, matched: false })
  }

  score = Math.min(100, score)

  let label = 'Safe'
  let recommendation: 'allow' | 'warn' | 'block' = 'allow'
  if (score >= 70) { label = 'Likely scam'; recommendation = 'block' }
  else if (score >= 40) { label = 'Suspicious'; recommendation = 'warn' }
  else if (score >= 20) { label = 'Cautious'; recommendation = 'warn' }

  return NextResponse.json({
    riskScore: score,
    label,
    recommendation,
    reason: hasHistory
      ? 'Sender is in your conversations.'
      : score >= 70
        ? 'Multiple high-risk scam indicators detected.'
        : score >= 40
          ? 'Some suspicious patterns detected. Verify sender identity before responding.'
          : score >= 20
            ? 'Exercise normal caution with new contacts.'
            : 'No high-risk indicators detected.',
    rules,
    hasHistory,
    algorithm: 'safety-scan-v1',
  })
}
