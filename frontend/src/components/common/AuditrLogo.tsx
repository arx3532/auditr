import { useId } from 'react'

import { cn } from '@/lib/utils'

interface AuditrLogoProps {
  className?: string
  /**
   * `tile` is the app icon: a cream A and tick on an orange gradient tile.
   * `mark` is the A and tick alone for a plain background: orange gradient.
   */
  variant?: 'tile' | 'mark'
}

const CREAM_WHITE = '#FFFBF5'

function Glyph({ stroke }: { stroke: string }) {
  return (
    <>
      <path
        d="M12 50 L32 14 L52 50"
        stroke={stroke}
        strokeWidth="6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M24.5 42 L29 46.5 L37 37.5"
        stroke={stroke}
        strokeWidth="5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </>
  )
}

/** Decorative: put the name next to it or give the surrounding link an aria-label. */
export function AuditrLogo({ className, variant = 'tile' }: AuditrLogoProps) {
  // Each logo gets its own gradient ids, so several on one page never share or hide a definition.
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '')
  const tileGradient = `url(#${uid}-tile)`
  const glyphGradient = `url(#${uid}-glyph)`
  const glyphGradientDark = `url(#${uid}-glyph-dark)`
  const isTile = variant === 'tile'

  return (
    <svg
      viewBox="0 0 64 64"
      fill="none"
      aria-hidden="true"
      focusable="false"
      className={cn('shrink-0', className)}
    >
      <defs>
        <linearGradient id={`${uid}-tile`} x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#FF5023" />
          <stop offset="1" stopColor="#FF6B1C" />
        </linearGradient>

        {/* Light mode glyph gradient */}
        <linearGradient id={`${uid}-glyph`} x1="12" y1="14" x2="52" y2="50" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#D93A06" />
          <stop offset="1" stopColor="#F05A12" />
        </linearGradient>

        {/* Dark mode glyph gradient */}
        <linearGradient id={`${uid}-glyph-dark`} x1="12" y1="14" x2="52" y2="50" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#FF6B1C" />
          <stop offset="1" stopColor="#FF8F50" />
        </linearGradient>
      </defs>

      {/* Tile background (remains identical in light and dark mode) */}
      {isTile ? <rect width="64" height="64" rx="16" fill={tileGradient} /> : null}

      {/* Light mode glyph gradient */}
      <g className="dark:hidden">
        <Glyph stroke={isTile ? CREAM_WHITE : glyphGradient} />
      </g>

      {/* Dark mode glyph gradient */}
      <g className="hidden dark:block">
        <Glyph stroke={isTile ? CREAM_WHITE : glyphGradientDark} />
      </g>
    </svg>
  )
}