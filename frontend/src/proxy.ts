import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'

const isPublicRoute = createRouteMatcher(['/', '/robots.txt', '/sitemap.xml', '/login(.*)', '/pay(.*)'])

export default clerkMiddleware(
  async (auth, request) => {
    const isE2eBypass = process.env.E2E_BYPASS_AUTH === 'true'
    if (!isPublicRoute(request) && !isE2eBypass) {
      await auth.protect()
    }
  },
  { signInUrl: '/login', signUpUrl: '/login' },
)

export const config = {
  matcher: [
    // Skip Next.js internals and static files, unless found in search params
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
}
