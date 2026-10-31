import type { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://flowmint.app'
  return {
    rules: {
      userAgent: '*',
      allow: ['/', '/login', '/signup', '/privacy', '/terms', '/forgot-password'],
      disallow: ['/api/', '/projects', '/reports', '/voice', '/settings', '/profile', '/onboarding'],
    },
    sitemap: `${baseUrl}/sitemap.xml`,
  }
}

