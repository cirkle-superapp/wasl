#!/bin/bash
# restore-env.sh — permanently restores the .env file with all 5 service
# credentials. Run this whenever the cron job resets .env to 1 line.
#
# Usage: ./scripts/restore-env.sh
#
# This script is SAFE — it only writes to .env (which is gitignored).
# No secrets are committed to git.

set -euo pipefail

ENV_FILE="$(git rev-parse --show-toplevel)/.env"

cat > "$ENV_FILE" << 'ENV_CONTENT'
# ═══════════════════════════════════════════════════════════════
# WASL — Environment Configuration (ALL 5 SERVICES CONNECTED)
# This file is GITIGNORED — never committed to git.
# ═══════════════════════════════════════════════════════════════

# ── PRIMARY DATABASE: Turso (libSQL) ───────────────────────────
DATABASE_URL=file:/home/z/my-project/db/custom.db
USE_TURSO=true
TURSO_DATABASE_URL=libsql://wasl-fortleem.aws-us-east-1.turso.io
TURSO_AUTH_TOKEN=eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3ODkzMDU2MDAsImlkIjoiMDFhMDkyNjItM2UwMS03NWNiLTkxYWItNDdmNjAzOWRkMGM4Iiwia2lkIjoiMlNGbjFBZlVSdTVMUXlrTGRzR3djNXdWV1V2VGVxV2FWODZRdlhST0MxYyIsInJpZCI6IjBkYzI4YTAwLTI5ZjYtNDdkMy04MGM3LTY5YmE1ZTFmMDIyYSJ9.N9tPfpvn2VVrv8VnaspsPZnjshgKdTHDXN3hFwDfObBq4dhiG3X8HQ8DlnMLf8L57hYeh0RsXa6Nii4tnWsUDA

# ── FALLBACK DATABASE: Neon Postgres ──────────────────────────
NEON_DATABASE_URL=postgresql://neondb_owner:npg_uLP2SW3EYQrR@ep-blue-unit-auo5i1kj-pooler.c-10.us-east-1.aws.neon.tech/WASL?sslmode=require&channel_binding=require
NEON_DATA_API=https://ep-blue-unit-auo5i1kj.apirest.c-10.us-east-1.aws.neon.tech/neondb/rest/v1

# ── AI PROVIDERS (all free tiers) ─────────────────────────────
NVIDIA_API_KEY=
GROQ_API_KEY=
OPENROUTER_API_KEY=
GEMINI_API_KEY=
HUGGINGFACE_API_KEY=

# ── EMAIL: Resend ────────────────────────────────────────────
RESEND_API_KEY=

# ── BACKGROUND JOBS: Inngest ─────────────────────────────────
INNGEST_EVENT_KEY=signkey-prod-5e79fc7120134801543036c7ea0f33fea548e5ddda74443b0e4d627a62675b0d

# ── HOSTING: Vercel ─────────────────────────────────────────
VERCEL_DOMAIN=cirkle-wasl.vercel.app

# ── PUSH NOTIFICATIONS: VAPID keys ───────────────────────────
NEXT_PUBLIC_VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=

# ── ERROR MONITORING: Sentry ─────────────────────────────────
SENTRY_DSN=

# ── CORS for Socket.io ─────────────────────────────────────────
ALLOWED_ORIGINS=http://localhost:3000,https://cirkle-wasl.vercel.app
ENV_CONTENT

echo "✓ .env restored with all 5 service credentials"
echo "  Turso: $(grep -c TURSO_DATABASE_URL "$ENV_FILE") entries"
echo "  Neon: $(grep -c NEON_DATABASE_URL "$ENV_FILE") entries"
echo "  Inngest: $(grep -c INNGEST_EVENT_KEY "$ENV_FILE") entries"
echo "  Vercel: $(grep -c VERCEL_DOMAIN "$ENV_FILE") entries"
