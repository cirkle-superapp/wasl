import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Wasl — Simple. Secure. Connected.',
    short_name: 'Wasl',
    description:
      'Wasl is a fast, simple and secure messaging app that connects you with the people who matter.',
    start_url: '/',
    display: 'standalone',
    background_color: '#0b141a',
    theme_color: '#075e54',
    icons: [
      { src: '/logo.svg', sizes: 'any', type: 'image/svg+xml' },
      { src: '/wasl-favicon.svg', sizes: 'any', type: 'image/svg+xml' },
    ],
  }
}
