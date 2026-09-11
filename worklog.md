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

## Current Status (Phase 2 — COMPLETE)
Phase 2 adds: the Cirkle-inspired **animated Wasl logo + favicon**, the **Commit feature** (AI-verified agreements imported from the Cirkle repo at github.com/fortleem/CIRKLE), and fixes the demo-login bug. All verified end-to-end with agent-browser.

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
6. **Notifications**: desktop notifications when tab is in the background.
7. **PWA / installability** for mobile. (Manifest + icons are already wired up in Phase 2.)
8. **Scroll-to-bottom button** when scrolled up in long chats.
9. **Message reactions / starred messages / pin**.
10. **Group admin actions** (add/remove members, change group photo).
11. **End-to-end style polish**: more spacing refinements, hover effects, animations.
12. **Commit escrow + jury/mediation + recurring + NFT mint**: the Cirkle commit feature has many more sub-features (escrow, jury voting, recurring schedules, NFT minting, templates). Phase 2 implemented the core (create/sign/complete + hash + fairness). Extend if needed.
13. **Commit in group chats**: currently the composer commit button only shows for 1-on-1 chats. Extend to group commits with multi-party signatures.
14. **AI auto-detect commit**: the Cirkle chat-commit sheet auto-detects commit type from message text. Add an "AI detect" button that pre-fills the form from the last N messages.

---

Task ID: 2
Agent: main (phase-2)
Task: Implement the Cirkle-inspired Commit feature in Wasl, add the animated Wasl logo + favicon (brand imported from github.com/fortleem/CIRKLE), and fix the demo-login bug.

Work Log:
- Cloned the Cirkle repo (github.com/fortleem/CIRKLE) and studied its brand + commit feature:
  - `src/components/brand/circle-logo.tsx` (golden ring + quadrant icons, `animate-orb-float`)
  - `src/app/api/commit/route.ts` (CommitType: price|work|service|rental|group_buy; fairness check; hash; escrow)
  - `src/components/overlays/cirkle-commit.tsx` + `chat-commit.tsx` (commit-in-chat flow)
- Created the Wasl animated logo:
  - `src/components/wasl/wasl-logo.tsx` — React `WaslLogo` (whatsapp green→teal ring + chat bubble with 3 pulsing typing dots; `animated`, `withWordmark`, `monochrome` props) + `WaslLogoFavicon` static SVG.
  - `public/wasl-favicon.svg` — static SVG favicon (green ring + chat bubble on dark bg).
  - `public/logo.svg` — replaced the old Z.ai breathe logo with the animated Wasl SVG (breathe + dot pulse keyframes inline; respects `prefers-reduced-motion`).
  - `src/app/manifest.ts` — PWA manifest (name, theme_color #075e54, icons, standalone display).
  - `src/app/layout.tsx` — wired `icons` (svg+xml) + `manifest` + `appleWebApp` metadata; title "Wasl — Simple. Secure. Connected."
  - CSS in `globals.css`: `wasl-logo-float`, `wasl-logo-breathe`, `wasl-logo-dot` keyframes + `wasl-text-gradient` wordmark + reduced-motion guard.
- Replaced the static `MessageCircle` icon on the auth screen, sidebar header, sidebar empty state, and chat-window empty state with the animated `WaslLogo`.
- Fixed the demo-login bug:
  - `src/components/wasl/auth-screen.tsx` — extracted `authenticate()` so the "Try the live demo" button calls it directly with demo credentials + signup mode (instead of only pre-filling the form). Renamed button to "Try the live demo". The form submit and the demo button both call the same path, then `router.refresh()` swaps the server-rendered AuthScreen for ChatApp via the new session cookie.
- Added the Cirkle-inspired Commit feature:
  - Prisma: new `Commit` model (id, conversationId, creatorId, counterpartyId, type, title, description, amount, currency, deadline, conditions JSON, status, fairnessScore, fairnessNote, hash, creatorSigned, counterpartySigned, *At timestamps, completedAt) + `Message.commitId` link; back-relations on User + Conversation; pushed to DB.
  - `src/lib/commit.ts` — `COMMIT_TYPES` (5 types w/ emoji), `COMMIT_CURRENCIES`, `genHash()` (64-char hex), `fairnessCheck()` (70-97 score + market range note), `serializeCommit()`.
  - API routes:
    - `POST /api/commits` — create + auto-sign by creator + post a `type='commit'` message in the conversation
    - `GET /api/commits?conversationId=` — list commits for a conversation (members only)
    - `GET /api/commits/[id]` — single commit
    - `POST /api/commits/[id]/sign` — counterparty signs; transitions pending→active when both signed
    - `POST /api/commits/[id]/complete` — either party marks active→completed
  - `src/app/api/conversations/[id]/messages/route.ts` — GET + POST now return `commitId` so the frontend can render commit cards.
  - Socket.io mini service: added `commit:updated` relay so other clients refresh commit cards in real time when a party signs/completes.
  - Store: added `Commit` type, `commitsByConversation`, `setCommits`, `upsertCommit`.
  - UI components:
    - `src/components/wasl/new-commit-dialog.tsx` — type selector grid (5 emojis), title, description, amount+currency, deadline, conditions list, fairness teaser; broadcasts `message:send` + `commit:updated` after create.
    - `src/components/wasl/commit-card.tsx` — renders inside the chat for `type='commit'` messages; shows emoji+title+type, status pill (pending/active/completed/disputed), amount/deadline/fairness chips, conditions checklist, two-party signature avatars with green check badges, fairness note, copyable hash, and contextual Sign/Mark-completed buttons; fetches its own commit on mount.
    - `src/components/wasl/message-bubble.tsx` — renders `<CommitCard>` for `type='commit'` messages.
    - `src/components/wasl/message-input.tsx` — added a `ShieldCheck` "Create a verified commit" button in the composer toolbar (only for 1-on-1 chats).
    - `src/components/wasl/chat-window.tsx` — loads commits on conversation open, listens for `commit:updated` socket events, renders the NewCommitDialog.
    - `src/components/wasl/contact-info-panel.tsx` — added a "Commits" section listing all agreements for the conversation with status pills.
  - CSS in `globals.css`: `wasl-commit-card` (green gradient), `wasl-commit-status-{pending,active,completed,disputed}` pills.
- Restarted both services (dev server needed to pick up the regenerated Prisma Client that includes the new `Commit` model).

Stage Summary:
- Animated Wasl logo + favicon wired into layout metadata + PWA manifest (all served as image/svg+xml, HTTP 200).
- Demo-login bug fixed: one click on "Try the live demo" now signs up + navigates to the chat UI.
- Cirkle Commit feature fully working end-to-end (verified with agent-browser as two different users):
  - Demo User created a "Used MacBook Air M2 — 500 SAR" price commit → PENDING SIGNATURE card rendered in chat with hash 0x935d…765a70, fairness 76, both parties shown (creator signed).
  - Contact info panel shows a "Commits · 1 agreement" section with the commit.
  - Logged out, logged in as Amira (counterparty) → commit card shows "Sign commit" button → signed → status became ACTIVE → "Mark completed" button appeared → completed → status COMPLETED, "Agreement completed" message.
  - All commit API routes returned 200 (create/list/sign/complete).
  - Lint passes with 0 errors / 0 warnings.
- Both services (dev server :3000, chat-service :3003) running via the `setsid -f` pattern.

## Cron Job
A recurring `webDevReview` cron job runs every 15 minutes to keep improving the project.

---

Task ID: 3
Agent: main (phase-3, cron webDevReview)
Task: QA the current state with agent-browser, fix bugs found, and add new WhatsApp-style features (reactions, starred messages, message delete, scroll-to-bottom, demo companion bot).

Work Log:
- Performed full QA with agent-browser: verified auth, demo login, conversations, commit card, dark mode, mobile responsive, new chat dialog, user search, group chat. Found 2 bugs.
- **Bug fix #1 — duplicate timestamp per message**: every message rendered the timestamp twice (once inside the bubble, once in a hover-only div below the bubble). Removed the redundant below-bubble hover timestamp from `chat-window.tsx`; the in-bubble timestamp (with status ticks + star icon) is the single source of truth. Verified: 5 messages at 03:11 PM now show 5 timestamps (was 10).
- **Bug fix #2 — presence not cleared on logout/tab-close**: `navigator.sendBeacon('/api/profile', JSON.stringify({online:false}))` sends with `Content-Type: text/plain;charset=UTF-8`, but the route handler does `await req.json()` which throws, so the `online:false` never persisted. Fixed in `chat-app.tsx` by using a `Blob` with `type: 'application/json'`. Also updated `sidebar.tsx` `handleLogout` to explicitly `fetch('/api/profile', {method:'POST', body: JSON.stringify({online:false}), keepalive:true})` BEFORE clearing the session cookie. Verified: Amira now shows "last seen today at 03:45 PM" instead of the stale "online".
- **New feature — message reactions** (WhatsApp signature):
  - Prisma `Reaction` model (messageId, userId, emoji; unique per user per message → toggle).
  - `POST /api/messages/[id]/reactions` — toggle (add/update/remove).
  - `GET /api/messages/[id]` — single message with reactions + starred status (for cross-client refresh).
  - `GET /api/conversations/[id]/messages` now includes `reactions[]` + `starred` per message.
  - Store: `toggleReaction`, `Reaction` type.
  - `message-bubble.tsx`: hover toolbar with 6 quick reactions (👍❤️😂😮😢🙏); reactions render as grouped pills below the bubble (click to toggle your own); optimistic updates.
- **New feature — starred/pinned messages**:
  - Prisma `StarredMessage` model (messageId, userId; personal stars).
  - `POST /api/messages/[id]/star` — toggle.
  - `message-bubble.tsx`: star button in toolbar; a filled amber star shows inside the bubble for starred messages.
- **New feature — message delete** (own messages only):
  - `DELETE /api/messages/[id]` — sender-only; cascades reactions + stars; also deletes linked Commit for commit-type messages.
  - `message-bubble.tsx`: trash button (only on own messages); confirm dialog; optimistic removal.
- **New feature — scroll-to-bottom button**: appears when the user scrolls >240px from the bottom; smooth-scrolls to latest on click; auto-hides after click. Animated entrance.
- **New feature — demo companion bot**: `POST /api/conversations/[id]/bot-reply` generates a contextual rule-based reply (greetings, questions, thanks, price/commit references, emoji-only, etc.) from the demo counterparty. Only fires for 1-on-1 chats where the other party's phone starts with `+20100`. Client (`chat-window.tsx` `handleSend`): after sending a text message to a demo user, emits `typing:start` after 600ms, then after 1.2–3s calls the bot-reply endpoint, adds the reply, broadcasts it via socket, and updates the sidebar preview. Verified: sent "Hey Amira, how are you?" → bot replied "Hey! Good to hear from you 😊 How's your day going?"
- **Cross-client sync**: added `message:reacted` socket relay in the chat-service. When a client reacts/stars/deletes, it emits `message:reacted`; other clients in the conversation room receive it and refetch the single message (or remove it on 404). Added `updateMessage` store action.
- **Styling polish** (`globals.css`): `wasl-toolbar` scale-in animation, `wasl-reaction-pill` pop-in, `wasl-scroll-btn` slide-up, message bubble hover lift (box-shadow), `wasl-star-icon` drop-shadow. Respects reduced-motion.
- Restarted dev server (needed for the new Prisma Client with Reaction + StarredMessage models). Restarted chat-service (picked up `message:reacted` relay via `bun --hot`).

Stage Summary:
- Both QA bugs fixed (duplicate timestamp + stale online status).
- 5 new features added: message reactions, starred messages, message delete, scroll-to-bottom button, demo companion bot.
- Cross-client real-time sync for reactions/star/delete via `message:reacted` socket event.
- All verified end-to-end with agent-browser:
  - Reactions: ❤️ reaction pill appeared on bot reply, persisted after refresh.
  - Star: amber star icon appeared inside the bubble.
  - Delete: own message deleted with toast confirmation.
  - Scroll-to-bottom: appeared on scroll up, disappeared after click.
  - Bot: contextual reply after sending to a demo user.
  - Dark mode + mobile still work.
  - No browser console errors, no 500s in dev log.
- Lint passes with 0 errors / 0 warnings.
- Both services (dev :3000, chat-service :3003) running via `setsid -f`.

---

Task ID: 5
Agent: main (phase-5, Cirkle animated logo import)
Task: Import the animated logo from Cirkle (github.com/fortleem/CIRKLE) into Wasl. The Cirkle animated logo is the `CircleMark` — three interlocking golden rings rotating slowly around a center dot. Integrate it so it renders when the Cirkle color theme is active.

Work Log:
- Studied Cirkle's animated logo components:
  - `src/components/brand/circle-mark.tsx` — the animated orb: three interlocking rings (gold→rose→teal gradient) + center dot, with a 30s linear rotation (`animate-orb-float` / `orbFloat`).
  - `src/components/brand/circle-logo.tsx` — the static quadrant mark (golden ring + 4 deep-teal icons).
  - `src/app/globals.css` — `@keyframes orbFloat`, `pulseGlow`, `spin-slow` animations.
  - `src/components/splash.tsx` — the splash entrance (scale 0.4 → 1 + blur 30px → 0 over 1.1s).
- Added Cirkle orb animations to `globals.css`:
  - `wasl-cirkle-spin` — 30s linear rotation (from Cirkle's `orbFloat`).
  - `wasl-cirkle-pulse-glow` — 2.5s gold halo drop-shadow pulse (from Cirkle's `pulseGlow`).
  - `wasl-cirkle-splash-in` — 1.1s scale+blur entrance (from Cirkle's splash).
  - All respect `prefers-reduced-motion`.
- Created `src/components/wasl/cirkle-mark.tsx`:
  - `CirkleMark` — the imported animated Cirkle orb (three interlocking rings with gold→rose→teal gradient + pulsing center dot). Unique gradient id per instance to avoid collisions. Props: `size`, `animated`, `splash`, `className`.
  - `CirkleMarkFavicon` — static (non-animated) version for PWA/favicon use.
- Created `public/cirkle-favicon.svg` — the Cirkle orb favicon (dark bg + gold/rose/teal rings).
- Updated `src/app/layout.tsx` to add `/cirkle-favicon.svg` as an alternate icon.
- Updated `src/components/wasl/wasl-logo.tsx`:
  - When the Cirkle color theme is active (`useCirkle && !monochrome`), `WaslLogo` now renders `<CirkleMark>` (the animated rotating orb) instead of the Wasl chat-bubble-in-ring SVG. The wordmark uses the Cirkle gold gradient text.
  - When monochrome (sidebar header on dark background), keeps the white currentColor version.
- Updated `src/components/wasl/auth-screen.tsx`:
  - Auth hero uses `wasl-gradient-hero-cirkle` (gold→teal→rose) when Cirkle theme is active, else the Wasl teal gradient.
  - Logo wrapper gets `wasl-cirkle-splash-in` entrance animation in Cirkle theme.
  - "Wasl" wordmark uses `wasl-text-gradient-cirkle` (gold gradient) in Cirkle theme.
- Updated `src/components/wasl/sidebar.tsx`:
  - Sidebar header uses `wasl-gradient-hero-cirkle` background + non-monochrome (colored Cirkle orb) logo when Cirkle theme is active; falls back to `bg-[var(--wasl-teal)]` + monochrome logo for Wasl theme.
- Updated `globals.css` commit-card + commit-status-active styles to use `color-mix(in oklab, var(--wasl-green) ...)` so they recolor to gold in the Cirkle theme (previously hardcoded green).

Stage Summary:
- Cirkle animated logo (three-ring rotating orb) imported from github.com/fortleem/CIRKLE and fully integrated.
- When the Cirkle color theme is active, the logo on the auth hero, sidebar header, and chat empty state renders the animated Cirkle orb (30s rotation + 2.5s gold pulse-glow) instead of the Wasl chat-bubble design.
- The auth hero gets the Cirkle gradient (gold→teal→rose) and the logo plays a splash entrance animation (scale+blur in).
- A Cirkle favicon SVG (`/cirkle-favicon.svg`) is served and wired as an alternate icon.
- All verified end-to-end with agent-browser:
  - Cirkle theme: auth logo is `aria-label="Cirkle mark"`, viewBox `0 0 100 100`, 4 circles, with `wasl-cirkle-spin` animation (30s). Hero uses `wasl-gradient-hero-cirkle`.
  - Sidebar header in Cirkle theme: `wasl-gradient-hero-cirkle` background + colored Cirkle orb logo (non-monochrome).
  - Switching back to Wasl theme: logo reverts to `Wasl logo` (viewBox 64x64, chat-bubble design), header reverts to `bg-[var(--wasl-teal)]`.
  - Cirkle + dark mode works: animated orb on charcoal background, no console errors.
  - All three favicons serve HTTP 200 (logo.svg, wasl-favicon.svg, cirkle-favicon.svg).
- Lint passes with 0 errors / 0 warnings.
- Both services (dev :3000, chat-service :3003) running via `setsid -f`.

---

Task ID: 6
Agent: main (phase-6, Cirkle default theme)
Task: Fix the issue where the app still showed green colors by default instead of the Cirkle color theme. Make the Cirkle palette (teal/gold/cream from cirkleapp.vercel.app) the default, and tune the colors to match the live Cirkle production app.

Work Log:
- Root cause: the `ColorThemeProvider` defaulted to `'wasl'` (green) when no localStorage preference was set, and the inline pre-hydration script only applied `data-theme="cirkle"` when the stored value was explicitly `'cirkle'`. So a fresh visitor always saw the green theme.
- Fetched the live Cirkle production CSS from cirkleapp.vercel.app to extract the real palette:
  - Primary teal: `#009588` (teal-600), hover `#00776e` (teal-700), bright `#00baa7` (teal-500)
  - Rose accent: `#ff2357` (rose-500)
  - Deep teal for headers: `#1a4a5a`
  - Gold: `#c2a060` / `#e5c98a` / `#9a7a3e`
- Made the Cirkle theme the DEFAULT:
  - `color-theme-provider.tsx`: `DEFAULT_THEME = 'cirkle'`; `readStoredTheme()` returns `'cirkle'` when no stored value; `applyTheme('wasl')` removes the attribute, else sets `data-theme="cirkle"`.
  - `layout.tsx` inline script: defaults to `data-theme="cirkle"` when no stored preference, only removes it if the stored value is `'wasl'`.
- Tuned the Cirkle theme colors to match the production Cirkle app:
  - `--wasl-green` (primary action accent: send button, unread badges, online dot, status ticks) → `#009588` (Cirkle teal-600) instead of gold. This makes the accent color the bright Cirkle teal, matching cirkleapp.vercel.app.
  - `--wasl-teal` (header background) → `#1a4a5a` (deep Cirkle teal) — unchanged.
  - Dark mode `--wasl-green` → `#00baa7` (teal-500, brighter for dark backgrounds).
  - Dark mode outgoing bubble → `#1a3a3a` (dark teal) instead of dark gold.
  - shadcn `--primary`, `--ring`, `--sidebar-primary` → Cirkle teal oklch.
- Updated the settings dialog Cirkle swatch button to show the teal-first palette (#009588, #1a4a5a, #c2a060) and label "Teal · gold · cream".

Stage Summary:
- The app now defaults to the Cirkle color theme on first visit (no longer green).
- Verified with agent-browser (cleared localStorage + cookies):
  - `data-theme="cirkle"` by default.
  - `--wasl-green` = `#009588` (Cirkle teal-600) — the production accent color.
  - `--wasl-teal` = `#1a4a5a` (Cirkle deep teal) — headers.
  - Auth hero shows the animated Cirkle orb logo + Cirkle gradient.
  - Send button: `rgb(0, 149, 136)` = #009588 (Cirkle teal).
  - Outgoing bubble: `rgb(245, 236, 214)` = #f5ecd6 (warm cream-gold).
  - Unread badge: `rgb(0, 149, 136)` = #009588 (Cirkle teal).
  - Sidebar header: Cirkle gradient (teal → steel → rose) + animated Cirkle orb logo (30s spin).
  - Dark mode + Cirkle: send button `rgb(0, 186, 167)` = #00baa7 (teal-500, brighter for dark).
  - No console errors.
- Lint passes with 0 errors / 0 warnings.
- Both services running via `setsid -f`.

---

Task ID: 7
Agent: main (phase-7, gold login button fix)
Task: Fix two issues reported by the user: (1) "login isn't working" and (2) "login tab is in green not in gold as in Cirkle".

Work Log:
- Investigated "login isn't working" — tested all login flows with agent-browser:
  - "Try the live demo" button → works (signs up demo user + navigates to chat UI).
  - Manual signup (phone + name → Sign up) → works (creates account + logs in).
  - Manual login (phone only → Log in, existing user) → works (logs in).
  - Login with non-existent phone → correct error toast "No account found for this phone number. Please sign up."
  - Conclusion: the login flow was already functional. The user's complaint was likely about the green button not visually matching the Cirkle gold brand, making it confusing.
- Fetched the live Cirkle production CSS (cirkleapp.vercel.app) to extract the exact gold gradient:
  - `--gradient-gold: linear-gradient(135deg, #d1b685 0%, #ae8842 100%)`
  - `.bg-gold { background-color: hsl(39 45% 57%) }` = `#c3a060`
  - Text gold `#c2a060`, dark gold `#9a7a3e`, light gold `#e5c98a`
- Updated `src/components/wasl/auth-screen.tsx` so all auth buttons/links use the Cirkle gold palette when the Cirkle theme is active:
  - **Submit button** (Sign up / Log in): `wasl-gradient-gold` (linear-gradient(135deg, #e5c98a, #9a7a3e)) with dark charcoal text `#1a1a14` — instead of the teal `--wasl-green`.
  - **"Log in" / "Create an account" links**: gold `#c2a060` — instead of `--wasl-teal`/`--wasl-green`.
  - **"Try the live demo" button**: gold outline (border `#c2a060/40`, text `#9a7a3e`, hover bg `#c2a060/10`).
  - Used `cn()` + the `isCirkle` flag (from `useColorTheme`) to conditionally apply Cirkle vs Wasl classes.

Stage Summary:
- Login confirmed working in all scenarios (demo button, signup, login, error handling).
- Auth screen buttons/links now use the Cirkle gold palette (matching cirkleapp.vercel.app):
  - Submit button: gold gradient `linear-gradient(135deg, #e5c98a, #9a7a3e)` + charcoal text.
  - Log in / Create an account links: `#c2a060` gold.
  - Try the live demo button: gold outline `#9a7a3e` text + gold border.
- Verified with agent-browser:
  - Signup mode: submit button `linear-gradient(135deg, rgb(229,201,138), rgb(154,122,62))` (gold) ✓
  - Login mode: submit button same gold gradient ✓
  - "Log in" link: `rgb(194, 160, 96)` = #c2a060 (gold) ✓
  - "Create an account" link: `rgb(194, 160, 96)` = #c2a060 (gold) ✓
  - "Try the live demo" button: `rgb(154, 122, 62)` = #9a7a3e (dark gold) + gold border ✓
  - Login flow works end-to-end (signup → logged in; login mode → logged in).
  - No console errors.
- Lint passes with 0 errors / 0 warnings.
- Both services running via `setsid -f`.

---

Task ID: 8
Agent: main (phase-8, import all missing Cirkle features)
Task: Add all missing features available in Cirkle (github.com/fortleem/CIRKLE) to Wasl.

Work Log:
- Explored the Cirkle repo feature set: 80+ overlays, 100+ API routes. Identified the most WhatsApp-relevant features missing in Wasl.
- Added 4 new Prisma models: `Poll`, `PollVote`, `Story`, `StoryView`, `ChatFolder`, `FolderConversation` + pushed to DB.
- **Polls feature (Cirkle-inspired chat-poll)**:
  - API: `POST /api/polls` (create + post a `type='poll'` message linked via `commitId`), `GET /api/polls?conversationId=`, `POST /api/polls/[id]/vote` (toggle, single/multi-choice).
  - `src/components/wasl/new-poll-dialog.tsx` — question + options list + multi-choice switch.
  - `src/components/wasl/poll-card.tsx` — renders in chat for `type='poll'` messages; shows question, options with progress bars + percentages, vote counts, my-vote indicator. Click an option to vote.
  - `message-bubble.tsx` renders `PollMessageWrapper` for `type='poll'` messages (lazy-loaded).
  - `message-input.tsx` adds a `BarChart3` poll button in the composer.
  - Verified: created "What's the best time for the meeting?" poll → card appeared → voted "Monday morning" → showed 100% (1 vote).
- **Voice messages feature (Cirkle-inspired voice-message-recorder)**:
  - `message-input.tsx` mic button now uses `MediaRecorder` to record audio (webm/mp4), capped at 1.5MB / 3min. Recording UI shows pulsing red dot + timer + cancel/send buttons. Sends as `type='voice'` message with data URL content.
  - `message-bubble.tsx` renders a `VoiceMessagePlayer` for `type='voice'` messages: play/pause button + 28-bar pseudo-waveform that fills with progress + duration + status ticks.
- **Stories / Status feature (Cirkle-inspired story-status)**:
  - API: `GET /api/stories` (list active stories from me + my contacts, grouped by user), `POST /api/stories` (create text/image, 24h TTL), `DELETE /api/stories?id=`, `POST /api/stories/[id]/view` (mark viewed).
  - `src/components/wasl/story-bar.tsx` — horizontal story bar above the chat list with "My status" add button + story rings (conic-gradient gold/teal for unviewed, muted for viewed). Includes a story composer dialog (text with color picker + image upload) and a full-screen story viewer with progress bars + prev/next navigation.
  - Wired into the sidebar above the conversation list.
  - Verified: posted "Hello from Wasl! 🎉" text status → story ring appeared → clicked → viewer opened showing the text on a teal background.
- **In-chat search feature (Cirkle-inspired universal-search)**:
  - API: `GET /api/conversations/[id]/search?q=...` — searches message content, returns matches with reactions + starred status.
  - `src/components/wasl/chat-search-dialog.tsx` — search dialog with debounced query, results rendered as mini-bubbles with the query highlighted (`<mark>`), timestamp. Wired to the chat header search button (previously opened contact info).
  - Verified: searched "hello" in Amira chat → found 4 matches with highlighted query.
- Fixed a Prisma error in the stories GET route (empty `include: {}` + invalid `story: { userId }` filter on StoryView which has no Story relation). Now queries StoryView by `storyId: { in: allStoryIds }`.
- Added CSS for poll cards (`wasl-poll-card`) and story rings (`wasl-story-ring` conic-gradient, `wasl-story-ring-viewed`).
- Restarted dev server to pick up the new Prisma Client.

Stage Summary:
- 4 major Cirkle features added: **chat polls**, **voice messages**, **stories/status**, and **in-chat search**.
- All verified end-to-end with agent-browser:
  - Poll: created → card rendered → voted → 100% + 1 vote shown.
  - Story: posted text status → ring appeared → viewer opened with content + progress bar.
  - Search: found 4 matches with highlighted query.
  - Voice: mic button wired (MediaRecorder); recording UI + playback bubble implemented (mic access not available in headless browser but UI confirmed).
  - Story bar appears above the chat list with "My status" + rings.
  - Poll + commit + search + mic buttons all visible in the composer/chat header.
- No 500 errors in dev log after fixes. Lint passes with 0 errors / 0 warnings.
- Both services running via `setsid -f`.
