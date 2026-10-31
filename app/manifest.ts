import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'FlowMint — Contractor Cashbook',
    short_name: 'FlowMint',
    description: 'Focused financial assistant and daily cashbook for building contractors.',
    start_url: '/',
    display: 'standalone',
    background_color: '#f8f6f3',
    theme_color: '#c45a2c',
    orientation: 'portrait-primary',
    scope: '/',
    categories: ['finance', 'business', 'productivity'],
    icons: [
      {
        src: '/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'maskable',
      },
      {
        src: '/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
      {
        src: '/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
    ],
  }
}

