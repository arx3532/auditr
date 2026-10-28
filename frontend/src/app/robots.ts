import type { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/dashboard/', '/invoices/', '/customers/', '/chat/'],
    },
    // TODO: Replace with your production domain URL
    sitemap: 'https://localhost:3000/sitemap.xml',
  }
}
