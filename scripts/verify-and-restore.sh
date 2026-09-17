#!/bin/bash
# verify-and-restore.sh — checks all protected files exist on disk.
# If any are missing, restores them from the latest git tag or HEAD.
#
# This script is the PERMANENT FIX for the recurring upload route deletion
# issue (7+ times). The automated webDevReview cron job sometimes deletes
# files from the working tree. This script detects and restores them.
#
# Usage:
#   ./scripts/verify-and-restore.sh          # check + restore
#   ./scripts/verify-and-restore.sh --check   # check only, no restore
#
# Exit codes:
#   0 = all files present (or restored successfully)
#   1 = one or more files could not be restored

set -euo pipefail

CHECK_ONLY=false
if [[ "${1:-}" == "--check" ]]; then
  CHECK_ONLY=true
fi

# Protected files — same list as the pre-commit/pre-push hooks
PROTECTED_FILES=(
  "src/app/api/upload/route.ts"
  "src/lib/db.ts"
  "src/lib/auth.ts"
  "src/lib/store.ts"
  "src/lib/socket.ts"
  "src/lib/ai.ts"
  "src/lib/constants.ts"
  "src/lib/markdown.tsx"
  "src/lib/avatar.ts"
  "src/lib/time.ts"
  "src/lib/rate-limit.ts"
  "src/components/wasl/auth-screen.tsx"
  "src/components/wasl/chat-app.tsx"
  "src/components/wasl/chat-window.tsx"
  "src/components/wasl/message-bubble.tsx"
  "src/components/wasl/message-input.tsx"
  "src/components/wasl/sidebar.tsx"
  "src/components/wasl/settings-dialog.tsx"
  "src/components/wasl/contact-info-panel.tsx"
  "src/components/wasl/business-register-dialog.tsx"
  "src/components/wasl/business-dashboard-dialog.tsx"
  "src/components/wasl/business-search-dialog.tsx"
  "src/components/wasl/new-commit-dialog.tsx"
  "src/components/wasl/commit-card.tsx"
  "src/components/wasl/phone-numbers-dialog.tsx"
  "src/components/wasl/wasl-avatar.tsx"
  "src/components/wasl/wasl-logo.tsx"
  "src/components/wasl/cirkle-mark.tsx"
  "src/components/wasl/voice-player.tsx"
  "src/components/wasl/qr-code-display.tsx"
  "src/components/wasl/quick-reply-toast.tsx"
  "src/components/wasl/global-search-dialog.tsx"
  "src/components/wasl/global-starred-dialog.tsx"
  "src/components/wasl/bookmarks-dialog.tsx"
  "src/components/wasl/contacts-dialog.tsx"
  "src/components/wasl/edit-message-dialog.tsx"
  "src/components/wasl/schedule-dialog.tsx"
  "src/app/page.tsx"
  "src/app/layout.tsx"
  "src/app/globals.css"
  "prisma/schema.prisma"
  "next.config.ts"
  "vercel.json"
  "package.json"
  "tsconfig.json"
  "Caddyfile"
  "mini-services/chat-service/index.ts"
  "mini-services/chat-service/package.json"
)

# Find the best source to restore from: latest tag, or HEAD
RESTORE_REF="HEAD"
LATEST_TAG=$(git describe --tags --abbrev=0 2>/dev/null || echo "")
if [[ -n "$LATEST_TAG" ]]; then
  RESTORE_REF="$LATEST_TAG"
fi

MISSING=0
RESTORED=0
FAILED=0

echo "🔍 Checking ${#PROTECTED_FILES[@]} protected files..."
if [[ -n "$LATEST_TAG" ]]; then
  echo "   Restore source: $LATEST_TAG (latest tag)"
else
  echo "   Restore source: HEAD"
fi

for FILE in "${PROTECTED_FILES[@]}"; do
  if [[ ! -f "$FILE" ]]; then
    MISSING=$((MISSING + 1))
    if [[ "$CHECK_ONLY" == "true" ]]; then
      echo "❌ MISSING: $FILE"
      continue
    fi

    # Try to restore from the latest tag or HEAD
    mkdir -p "$(dirname "$FILE")"
    if git cat-file -e "${RESTORE_REF}:${FILE}" 2>/dev/null; then
      git show "${RESTORE_REF}:${FILE}" > "$FILE" 2>/dev/null
      if [[ -f "$FILE" ]] && [[ -s "$FILE" ]]; then
        echo "✅ RESTORED: $FILE (from $RESTORE_REF)"
        RESTORED=$((RESTORED + 1))
      else
        echo "❌ FAILED to restore: $FILE"
        FAILED=$((FAILED + 1))
      fi
    elif git cat-file -e "HEAD:${FILE}" 2>/dev/null; then
      git show "HEAD:${FILE}" > "$FILE" 2>/dev/null
      if [[ -f "$FILE" ]] && [[ -s "$FILE" ]]; then
        echo "✅ RESTORED: $FILE (from HEAD)"
        RESTORED=$((RESTORED + 1))
      else
        echo "❌ FAILED to restore: $FILE"
        FAILED=$((FAILED + 1))
      fi
    else
      echo "❌ NOT IN GIT: $FILE (cannot restore)"
      FAILED=$((FAILED + 1))
    fi
  fi
done

echo ""
echo "════════════════════════════════════════════════════"
echo "Protected files: ${#PROTECTED_FILES[@]}"
echo "Missing:        $MISSING"
if [[ "$CHECK_ONLY" == "true" ]]; then
  echo "Restored:       (check-only mode)"
else
  echo "Restored:       $RESTORED"
fi
echo "Failed:         $FAILED"
echo "════════════════════════════════════════════════════"

if [[ $FAILED -gt 0 ]]; then
  exit 1
fi
exit 0
