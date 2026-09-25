import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Wasl — دواير',
    short_name: 'Wasl',
    description:
      'Wasl (دواير) — a fast, simple and secure messaging app. End-to-end encrypted, real-time, verified agreements. Part of the Cirkle ecosystem.',
    start_url: '/',
    display: 'standalone',
    background_color: '#fdfcf9',
    theme_color: '#1a4a5a',
    icons: [
      { src: '/logo.svg', sizes: 'any', type: 'image/svg+xml' },
      { src: '/wasl-favicon.svg', sizes: 'any', type: 'image/svg+xml' },
    ],
  }
}
