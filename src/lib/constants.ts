// Shared, app-wide constants for Wasl.
//
// Centralising these here lets the API routes, the Prisma-touching server
// logic, and the client UI all read the SAME number — so a future tweak
// (e.g. 30 minutes instead of 15) only requires editing one file.

/**
 * How long after a message is sent it can still be edited.
 *
 * - Enforced server-side in `src/app/api/messages/[id]/edit/route.ts`:
 *   a PATCH arriving past this window is rejected with 403.
 * - Mirrored client-side in `src/components/wasl/message-bubble.tsx`
 *   to hide the "Edit" toolbar button once the window has elapsed, and
 *   in `src/components/wasl/edit-message-dialog.tsx` to disable the
 *   Save button + show a "Xm left" countdown.
 *
 * Default: 15 minutes (`15 * 60 * 1000`).
 */
export const MESSAGE_EDIT_TIME_LIMIT_MS = 15 * 60 * 1000 // 15 minutes

/**
 * Once the remaining edit window drops below this threshold, the edit
 * dialog shows an amber "less than 2 minutes" warning. Kept in the same
 * module so the client + any future server rendering stay in sync.
 *
 * Default: 2 minutes (`2 * 60 * 1000`).
 */
export const MESSAGE_EDIT_WARNING_THRESHOLD_MS = 2 * 60 * 1000 // 2 minutes

/**
 * When the remaining edit window is below this threshold the message
 * bubble's Edit toolbar button surfaces a "Edit window: Xm left" tooltip
 * so the user is nudged that the window is closing soon.
 *
 * Default: 5 minutes (`5 * 60 * 1000`).
 */
export const MESSAGE_EDIT_TOOLTIP_THRESHOLD_MS = 5 * 60 * 1000 // 5 minutes
