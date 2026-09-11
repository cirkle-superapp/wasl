# Wasl - WhatsApp-like Chat App

## Project Overview
Building "Wasl" - a WhatsApp-like real-time chat application using Next.js 16, Prisma (SQLite), and Socket.io mini service.

## Architecture
- **Frontend**: Next.js 16 App Router, single `/` route (auth screen + chat interface)
- **Real-time**: Socket.io mini service on port 3003 (XTransformPort routing via Caddy)
- **Database**: Prisma + SQLite at `db/custom.db`
- **Styling**: Tailwind CSS 4 + shadcn/ui, WhatsApp green theme, light/dark mode via next-themes

## Important Infrastructure Notes (for future agents)
- **The sandbox's persistent shell does NOT keep background processes alive between tool calls.** Plain `&` / `nohup` / `setsid` (without `-f`) all die when the parent bash exits. The reliable pattern is `setsid -f bash -c '...' < /dev/null > /dev/null 2>&1` — this performs a proper double-fork detach and the process survives across tool calls and HTTP requests.
- Both services must be running for the app to work:
  - Chat service: `cd /home/z/my-project/mini-services/chat-service && setsid -f bash -c 'exec bun --hot index.ts > /tmp/wasl-chat-service.log 2>&1' < /dev/null > /dev/null 2>&1`
  - Dev server: `cd /home/z/my-project && setsid -f bash -c 'exec ./node_modules/.bin/next dev -p 3000 > /home/z/my-project/dev.log 2>&1' < /dev/null > /dev/null 2>&1`
- Logs: `/home/z/my-project/dev.log` (Next.js) and `/tmp/wasl-chat-service.log` (socket.io).
- The schema uses `prisma db push` (`bun run db:push`) — no migrations folder needed.

## Current Status (Phase 1 — COMPLETE)
Phase 1 MVP is fully working and verified end-to-end with agent-browser.

## Completed
- Prisma schema: `User`, `Conversation`, `Participant`, `Message` (with reply, status, type)
- Socket.io mini service on port 3003:
  - User identify + presence (online/offline) broadcast
  - Conversation room join/leave
  - `message:send` → broadcast `message:received` to room + `conversation:updated` globally
  - `message:status` (delivered/read) broadcast
  - `typing:start` / `typing:stop` + auto-timeout cleaner
  - `conversation:upserted` for new-chats notifications
- REST API (Next.js Route Handlers, `runtime = nodejs`):
  - `POST /api/auth/signup`, `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me` — cookie session via `wasl_session`
  - `GET/POST /api/conversations` — list (with last message preview + unread count), create (1-on-1 dedup + group)
  - `GET/PATCH/DELETE /api/conversations/[id]` — details, rename group, leave/delete
  - `GET/POST/PATCH /api/conversations/[id]/messages` — paginated history (marks read on fetch), send (text/image/reply), mark delivered/read
  - `GET /api/users/search?q=` — search by name or phone
  - `PATCH /api/profile`, `POST /api/profile` — update profile, set presence
  - `POST /api/seed` — seed demo contacts + a 1-on-1 chat (with sample messages) + a group
- Frontend (`src/components/wasl/`):
  - `auth-screen.tsx` — Wasl-branded hero banner + signup/login form + demo credentials button
  - `chat-app.tsx` — main container, bootstraps user, socket listeners, presence heartbeat, mobile view derivation
  - `sidebar.tsx` — chat list with search, filter tabs (All/Unread/Groups), conversation rows with avatars/last message/unread badges/online status, profile footer
  - `chat-window.tsx` — header (avatar, last-seen, call/search/menu actions), messages with date dividers + reply previews, infinite-scroll-up history, typing indicator, message status ticks (sent/delivered/read)
  - `message-bubble.tsx` — WhatsApp-style bubbles (green out / white in) with tails, system bubbles for group events
  - `message-input.tsx` — auto-resize textarea, emoji picker, image attach, reply banner, send/mic button, typing emit
  - `contact-info-panel.tsx` — right-side info panel (hero, about, phone, members for groups, shared media, actions)
  - `new-chat-dialog.tsx` — search users + toggle single/group mode + group name
  - `settings-dialog.tsx` — edit name/about, theme toggle, seed demo data
  - `emoji-picker.tsx` — categorized emoji picker popover
  - `wasl-avatar.tsx` — colored avatar with initials, online status dot
  - `theme-provider.tsx` — next-themes wrapper
- Styling (`src/app/globals.css`):
  - WhatsApp signature palette (green/teal) for light + dark mode
  - Chat background doodle pattern
  - Bubble tails, typing dots animation, date divider pills, fade-in animation
  - Custom thin scrollbar
- `lib/`:
  - `auth.ts` (cookie session), `db.ts` (prisma client), `socket.ts` (socket.io singleton), `store.ts` (zustand store), `time.ts` (formatters), `avatar.ts` (colors/initials)
- Lint passes with 0 errors / 0 warnings.

## Verification (agent-browser)
- Auth screen renders, "Use demo credentials" pre-fills, Sign up → chat UI
- Settings → "Add demo contacts" seeds 8 demo users + 1-on-1 chat + group chat
- Conversation list shows avatars, last message, timestamps, unread badges
- Clicking a conversation opens it; messages load with date dividers
- Sending a text+emoji message works; status ticks show; sidebar preview updates
- Dark mode toggle works (`document.documentElement.className === "dark"`)
- New chat dialog searches users by name (returns "Amira Hassan")
- Group chat shows system bubble "Demo User created the group..." and sender name on messages
- Mobile viewport (375x720): single-pane view with back button → returns to list
- Browser console: no runtime errors
- All API routes return 200 in dev log

## Unresolved / Next-Phase Priorities
1. **Real multi-user presence**: cross-session presence works but we have no second logged-in browser in this single-session test. Consider a "demo companion bot" that posts a random reply so single-user testing feels alive.
2. **Image attachment UX**: currently stores data URL in DB (capped ~1.5MB). Consider file-based storage for larger images.
3. **Voice messages**: mic button is currently disabled — implement MediaRecorder + upload.
4. **Unread badge update after sending**: when a message is sent, the conversation row should bump its preview/last-message time (it does update locally; verify socket broadcast refreshes other clients).
5. **Search within a conversation**: search button currently opens contact info; add in-chat message search.
6. **Notifications**: desktop notifications when tab is in background.
7. **PWA / installability** for mobile.
8. **Scroll-to-bottom button** when scrolled up in long chats.
9. **Message reactions / starred messages / pin**.
10. **Group admin actions** (add/remove members, change group photo).
11. **End-to-end style polish**: more spacing refinements, hover effects, animations.

## Cron Job
A recurring `webDevReview` cron job runs every 15 minutes to keep improving the project.
