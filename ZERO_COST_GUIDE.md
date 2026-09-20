# Wasl — Zero-Cost Production Guide

> **All services run on free tiers. No billing details required. Ever.**

## Service Architecture (Zero-Cost)

```
┌─────────────────────────────────────────────────────────────┐
│                    WASL — ZERO-COST STACK                     │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  GitHub (github.com/cirkle-superapp/wasl)                   │
│    └─ Source code hosting — UNLIMITED FREE                  │
│    └─ 4 backup tags (v1.0→v4.0)                             │
│    └─ Pre-commit + pre-push hooks (50 protected files)       │
│                                                              │
│  Vercel (cirkle-wasl.vercel.app)                            │
│    └─ Hosting — FREE Hobby tier                             │
│    └─ 100GB bandwidth/month                                 │
│    └─ 1000 build minutes/month                              │
│    └─ 10s serverless function timeout                       │
│    └─ Auto-deploy from GitHub on every push                  │
│    └─ Region: iad1 (us-east-1 — closest to Turso)           │
│    └─ Standalone output for faster cold starts               │
│                                                              │
│  Turso Database (wasl-fortleem.aws-us-east-1.turso.io)      │
│    └─ Primary DB — FREE tier                                │
│    └─ 9GB storage                                            │
│    └─ 500 databases                                          │
│    └─ 1B row reads/month                                    │
│    └─ Region: us-east-1 (same as Vercel)                    │
│    └─ Hrana HTTP API for edge queries                        │
│                                                              │
│  Neon Postgres (ep-blue-unit-auo5i1kj)                     │
│    └─ Fallback DB — FREE tier                                │
│    └─ 3GB storage                                            │
│    └─ Auto-suspend after inactivity (saves cost)            │
│    └─ REST API available                                     │
│                                                              │
│  Inngest (signkey-prod-*)                                   │
│    └─ Background jobs — FREE tier                           │
│    └─ 25K function runs/month                               │
│    └─ Scheduled message processor                            │
│                                                              │
│  Resend (re_*)                                              │
│    └─ Email service — FREE tier                             │
│    └─ 3000 emails/month                                      │
│    └─ 100 emails/day                                         │
│                                                              │
│  AI Providers (all free tiers)                               │
│    └─ NVIDIA DeepSeek (primary) — free API credits          │
│    └─ Groq (fallback 1) — free tier                         │
│    └─ OpenRouter (fallback 2) — free models                 │
│    └─ Gemini (fallback 3) — free tier                       │
│                                                              │
│  Sentry (optional)                                           │
│    └─ Error monitoring — FREE tier                          │
│    └─ 5K errors/month                                        │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## Configuration

### Local Development
```bash
# .env (gitignored — never committed)
USE_TURSO=false                    # Use local SQLite for dev
DATABASE_URL=file:./db/custom.db   # Local SQLite file
# All other keys filled in for production testing
```

### Production (Vercel Dashboard → Settings → Environment Variables)
```
USE_TURSO=true                    # Switch to Turso cloud DB
TURSO_DATABASE_URL=libsql://...   # From Turso dashboard
TURSO_AUTH_TOKEN=eyJ...           # From Turso dashboard
NVIDIA_API_KEY=nvapi-...          # For AI features
RESEND_API_KEY=re_...             # For email
INNGEST_EVENT_KEY=signkey-...      # For background jobs
NEON_DATABASE_URL=postgresql://... # Fallback DB
```

### Vercel Optimization (vercel.json)
- **Region**: `iad1` (us-east-1) — co-located with Turso for minimum latency
- **maxDuration**: `10s` — Vercel Hobby tier limit (free)
- **Static chunks**: `Cache-Control: immutable, max-age=31536000`
- **API routes**: `Cache-Control: no-cache, no-store, must-revalidate`
- **Pages**: `Cache-Control: public, max-age=0, must-revalidate`

### Next.js Optimization (next.config.ts)
- **output: standalone** — minimal self-contained server (faster cold starts)
- **experimental.optimizePackageImports** — tree-shake lucide-react & date-fns
- **typescript.ignoreBuildErrors** — prevents Vercel build failures on minor types

## Monthly Cost: $0.00

| Service | Free Tier | Wasl Usage |
|---------|-----------|------------|
| GitHub | Unlimited repos | 1 repo, 4 tags |
| Vercel | 100GB BW, 1000 build min | ~5GB BW, ~50 build min |
| Turso | 9GB, 1B reads | ~10MB, ~100K reads |
| Neon | 3GB, auto-suspend | ~5MB (fallback only) |
| Inngest | 25K runs/mo | ~1K runs (scheduled msgs) |
| Resend | 3000 emails/mo | ~0 (not yet used) |
| NVIDIA | Free API credits | ~100 AI requests/day |
| Sentry | 5K errors/mo | ~0 errors |

**Total monthly cost: $0.00 — no billing details required on any service.**
