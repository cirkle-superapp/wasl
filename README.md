# Wasl — Simple. Secure. Connected.

[![Deployed on Vercel](https://img.shields.io/badge/Vercel-cirkle--wasl.vercel.app-black)](https://cirkle-wasl.vercel.app)
[![GitHub](https://img.shields.io/badge/GitHub-cirkle--superapp/wasl-blue)](https://github.com/cirkle-superapp/wasl)
[![Turso](https://img.shields.io/badge/Database-Turso_(libSQL)-teal)](https://turso.tech)
[![License: MIT](https://img.shields.io/badge/License-MIT-green)](LICENSE)

A WhatsApp-like real-time chat application built with Next.js 16, Prisma, and Socket.io. Features Cirkle-inspired branding (gold/teal/cream palette), business accounts with verification, AI-verified commitments, polls, stories, voice messages, and more.

## Live Demo
- **Production**: https://cirkle-wasl.vercel.app
- **Repository**: https://github.com/cirkle-superapp/wasl
- **Database**: Turso (libSQL) — `libsql://wasl-fortleem.aws-us-east-1.turso.io`

## Features

- **Authentication**: Username + password, or login with Cirkle email / phone / username. Live username availability with auto-generated suggestions.
- **Multi-phone numbers**: Add multiple phone numbers and switch the active one anytime.
- **Real-time messaging**: Socket.io with typing indicators, read receipts, online presence, message reactions, starred messages, and delete.
- **Business accounts**: Verified businesses with public/private groups, hidden phone numbers, and business search. Requires personal identity verification + company documents.
- **Admin review queue**: Admins can approve/reject pending business registrations.
- **Commits** (Cirkle-inspired): AI-verified agreements with hash, fairness check, two-party signatures, and complete lifecycle (pending → active → completed).
- **Polls**: Create polls with single/multi-choice voting, live progress bars.
- **Stories/Status**: Ephemeral 24h text/image stories with a full-screen viewer.
- **Voice messages**: MediaRecorder-based recording with waveform playback.
- **In-chat search**: Search messages within any conversation with highlighted results.
- **Demo companion bot**: Contextual auto-replies for single-user testing.
- **Cirkle brand**: Gold/teal/cream color theme with animated rotating orb logo. Switchable to classic WhatsApp green.
- **Arabic RTL**: Full RTL support with language toggle (English/العربية).
- **Dark mode**: Full dark palette for both Cirkle and Wasl themes.
- **PWA**: Installable with offline support and push notifications.
- **Mobile responsive**: Single-pane mobile view with story bar.
- **Desktop notifications**: Browser Notification API when tab is hidden.
- **ChunkLoadError recovery**: Auto-reloads on stale chunk errors.
- **Rate limiting**: All API routes rate-limited (auth, uploads, data, general).
- **Security headers**: X-Frame-Options, X-Content-Type-Options, X-XSS-Protection, Referrer-Policy.

## Tech Stack (100% Zero-Cost)

| Component | Technology | Cost |
|-----------|-----------|------|
| Framework | Next.js 16 (App Router, Turbopack) | Free (MIT) |
| Language | TypeScript 5 | Free |
| Database | Turso (libSQL) / SQLite | Free |
| ORM | Prisma | Free (Apache 2.0) |
| Real-time | Socket.io | Free (MIT) |
| Styling | Tailwind CSS 4 + shadcn/ui | Free |
| Auth | bcrypt + cookie sessions | Free |
| File uploads | Local filesystem | Free |
| PWA | Service Worker + Web Push | Free |
| Rate limiting | In-memory sliding window (proxy.ts) | Free |
| WebRTC | Browser native (voice/video calls) | Free |

## Getting Started

```bash
# Install dependencies
bun install

# Push the database schema
bun run db:push

# Start the chat service (Socket.io)
cd mini-services/chat-service
bun install
bun run dev &

# Start the main app
cd ../..
bun run dev
```

Open http://localhost:3000 and click "Try the live demo".

## Database Configuration

By default, Wasl uses local SQLite. To use Turso (libSQL) for production:

1. Set `USE_TURSO=true` in `.env`
2. Set `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN`
3. Run `bun run scripts/push-turso.ts` to create tables

## Deployment

Wasl is deployed on Vercel with Turso as the database:
- GitHub push → Vercel auto-deploys from `main` branch
- Vercel → Turso via environment variables
- Local dev → Turso via `.env` file

## License

MIT — Free for everyone, forever.
