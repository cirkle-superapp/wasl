import type { MetadataRoute } from 'next'

// ═══════════════════════════════════════════════════════════════════════
// Wasl PWA Manifest (Task 93 — Mobile App installable from browser)
// ═══════════════════════════════════════════════════════════════════════
//
// This makes Wasl installable directly from the phone's browser — NO App
// Store or Google Play needed. Users tap "Add to Home Screen" (iOS) or
// "Install app" (Chrome Android) and Wasl appears as a standalone app.
//
// Once installed:
//   - Runs in standalone mode (no browser chrome)
//   - Has its own app icon on the home screen
//   - Auto-syncs with the user's other devices (multi-device sync via
//     the chat-service socket + DeviceSession DB tracking)
//   - Works offline (the service worker caches the app shell)
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Wasl — Simple. Secure. Connected.',
    short_name: 'Wasl',
    description:
      'End-to-end encrypted messaging with verified agreements, AI-powered features, and a personal vault. Real-time sync across all your devices.',
    id: '/',
    start_url: '/?source=pwa',
    scope: '/',
    display: 'standalone',
    display_override: ['standalone', 'minimal-ui', 'browser'],
    orientation: 'portrait',
    background_color: '#fdfcf9',
    theme_color: '#009588',
    lang: 'en',
    dir: 'ltr',
    categories: ['social', 'communication', 'productivity'],
    icons: [
      { src: '/wasl-favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
      { src: '/logo.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
      { src: '/cirkle-favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'monochrome' },
    ],
    shortcuts: [
      {
        name: 'New chat',
        short_name: 'New chat',
        description: 'Start a new conversation',
        url: '/?action=new-chat&source=pwa',
        icons: [{ src: '/wasl-favicon.svg', sizes: 'any' }],
      },
      {
        name: 'Search',
        short_name: 'Search',
        description: 'Search messages and contacts',
        url: '/?action=search&source=pwa',
        icons: [{ src: '/wasl-favicon.svg', sizes: 'any' }],
      },
      {
        name: 'Vault',
        short_name: 'Vault',
        description: 'Open your encrypted personal vault',
        url: '/?action=vault&source=pwa',
        icons: [{ src: '/wasl-favicon.svg', sizes: 'any' }],
      },
    ],
    prefer_related_applications: false,
    related_applications: [],
  }
}
