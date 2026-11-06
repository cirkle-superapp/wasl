#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════
# protected-files-watchdog.sh — CONTINUOUS self-healing file-loss guard
# ═══════════════════════════════════════════════════════════════════════
#
# ROOT-CAUSE FIX for the recurring "tracked files vanish from the working
# tree" problem (upload route deleted 9+ times by automated agents; 904
# skills files wiped in a single incident).
#
# Existing defenses (pre-commit / pre-push hooks, verify-and-restore.sh)
# only fire at commit/push time. This watchdog runs CONTINUOUSLY and
# restores ANY deleted tracked file within 60 seconds.
#
# Layers of defense (defense in depth):
#   1. THIS watchdog  — continuous, restores any deletion within 60s
#   2. pre-commit     — blocks deletion at commit time (if watchdog missed)
#   3. pre-push       — last line of defense at push time
#
# Escape hatch: to INTENTIONALLY delete a tracked file, add its path to
# .watchdog-allowlist (one path per line) BEFORE deleting it. The watchdog
# will ignore allowlisted paths for that check. Remove the entry afterwards.
#
# Usage:
#   ./scripts/protected-files-watchdog.sh            # run in foreground
#   setsid -f bash -c 'exec ./scripts/protected-files-watchdog.sh' ...  # detached
#
# Log: .watchdog.log (gitignored via *.log) — every restore is recorded.

set -u

REPO_ROOT="$(git -C "$(dirname "$0")/.." rev-parse --show-toplevel 2>/dev/null || echo "$(cd "$(dirname "$0")/.." && pwd)")"
cd "$REPO_ROOT" || exit 1

INTERVAL=60           # seconds between checks
ALLOWLIST=".watchdog-allowlist"
LOG=".watchdog.log"
PROTECTED_CRITICAL=(
  "src/app/api/upload/route.ts"
  "src/lib/db.ts"
  "src/lib/auth.ts"
  "src/lib/ai.ts"
  "src/lib/store.ts"
  "src/lib/socket.ts"
)

log() {
  echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*" >> "$LOG"
}

# ── Periodic DB snapshot (every DB_BACKUP_EVERY checks ≈ 30 min) ──────
# Root-cause protection for the database: point-in-time snapshots so any
# future wipe/rollback of db/custom.db is recoverable. Keeps the newest
# DB_KEEP backups, prunes older ones.
DB_BACKUP_EVERY=30   # check cycles (30 × 60s = 30 min)
DB_KEEP=10           # backups to retain
CYCLE=0

backup_db() {
  local ts src dst
  ts="$(date -u +%Y-%m-%dT%H-%M-%SZ)"
  src="db/custom.db"
  dst="db/backups/custom-${ts}.db"
  [[ -f "$src" ]] || return 0
  # Skip if unchanged since the last backup (same size + mtime file marker)
  local marker=".db-last-backup"
  if [[ -f "$marker" ]]; then
    local last
    last="$(cat "$marker" 2>/dev/null)"
    local cur
    cur="$(stat -c '%s-%Y' "$src" 2>/dev/null)"
    [[ "$last" == "$cur" ]] && return 0
  fi
  if cp "$src" "$dst" 2>>"$LOG"; then
    stat -c '%s-%Y' "$src" > "$marker" 2>/dev/null
    log "DB SNAPSHOT: $dst"
    # Prune old snapshots (keep newest DB_KEEP)
    ls -1t db/backups/custom-*.db 2>/dev/null | tail -n +$((DB_KEEP + 1)) | while IFS= read -r old; do
      rm -f -- "$old" && log "DB SNAPSHOT PRUNED: $old"
    done
  else
    log "❌ DB SNAPSHOT FAILED: $src -> $dst"
  fi
}

log "── watchdog started (pid $$, interval ${INTERVAL}s) ──"

# ── Env guard — .env must keep its API keys ────────────────────────────
# The sandbox/agents have wiped .env before (API keys vanished). If the
# keys go missing, restore .env from the off-repo backup if it exists.
ENV_BACKUP="$HOME/.wasl-env-backup"
ENV_KEYS=(NVIDIA_API_KEY GROQ_API_KEY OPENROUTER_API_KEY GEMINI_API_KEY HUGGINGFACE_API_KEY)

check_env() {
  local missing=0
  for k in "${ENV_KEYS[@]}"; do
    if ! grep -q "^${k}=" .env 2>/dev/null; then missing=$((missing + 1)); fi
  done
  if (( missing > 0 )); then
    if [[ -f "$ENV_BACKUP" ]] && grep -q "^GROQ_API_KEY=" "$ENV_BACKUP" 2>/dev/null; then
      cp "$ENV_BACKUP" .env && chmod 600 .env
      log "🚨 RESTORED .env from $ENV_BACKUP ($missing API keys were missing)"
    else
      log "❌ .env is missing $missing API keys and no valid backup at $ENV_BACKUP"
    fi
  fi
}

while true; do
  CYCLE=$((CYCLE + 1))
  check_env
  if (( CYCLE % DB_BACKUP_EVERY == 1 )); then
    backup_db
  fi

  # Find every deleted tracked file (worktree deletions, staged or not).
  # -z handles spaces/special chars in filenames safely.
  while IFS= read -r -d '' f; do
    [[ -z "$f" ]] && continue

    # Skip intentionally-allowlisted deletions
    if [[ -f "$ALLOWLIST" ]] && grep -qxF "$f" "$ALLOWLIST"; then
      continue
    fi

    # Restore from HEAD
    if git restore -- "$f" 2>>"$LOG"; then
      critical="no"
      for p in "${PROTECTED_CRITICAL[@]}"; do
        [[ "$p" == "$f" ]] && critical="yes"
      done
      if [[ "$critical" == "yes" ]]; then
        log "🚨 RESTORED CRITICAL FILE: $f"
      else
        log "RESTORED: $f"
      fi
    else
      log "❌ FAILED to restore: $f"
    fi
  done < <(git ls-files -d -z 2>>"$LOG")

  # Extra belt-and-braces: the critical list must ALWAYS exist on disk,
  # even if git ls-files somehow misses them (e.g. mid-repack race).
  for p in "${PROTECTED_CRITICAL[@]}"; do
    if [[ ! -f "$p" ]]; then
      if git checkout HEAD -- "$p" 2>>"$LOG"; then
        log "🚨 RESTORED CRITICAL FILE (forced): $p"
      else
        log "❌ CRITICAL FILE MISSING AND UNRESTORABLE: $p"
      fi
    fi
  done

  sleep "$INTERVAL"
done
