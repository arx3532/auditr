'use client'

import { LaptopIcon, MoonIcon, SunIcon } from 'lucide-react'
import { useTheme } from 'next-themes'
import { useEffect, useState } from 'react'

import { cn } from '@/lib/utils'

interface ThemeToggleProps {
  className?: string
  variant?: 'icon' | 'switch' | 'segmented'
  size?: 'sm' | 'md' | 'lg'
}

export function ThemeToggle({
  className,
  variant = 'switch',
  size = 'md',
}: ThemeToggleProps) {
  const { theme, resolvedTheme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  // Avoid hydration mismatch — only render interactive states after mounting
  useEffect(() => {
    setMounted(true)
  }, [])

  const isDark = mounted ? resolvedTheme === 'dark' : false

  // 1. Sleek Sliding Switch variant (Linear / iOS inspired)
  if (variant === 'switch') {
    return (
      <button
        type="button"
        role="switch"
        aria-checked={isDark}
        aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
        title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
        onClick={() => setTheme(isDark ? 'light' : 'dark')}
        className={cn(
          'group relative inline-flex items-center rounded-full border border-border/80 p-0.5 shadow-sm transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
          isDark
            ? 'bg-slate-900/90 text-slate-100 hover:border-accent/60'
            : 'bg-muted/90 text-foreground hover:border-accent/40',
          size === 'sm' && 'h-7 w-12',
          size === 'md' && 'h-8 w-15',
          size === 'lg' && 'h-9 w-17',
          className
        )}
      >
        {/* Background track icons */}
        <span className="pointer-events-none absolute inset-0 flex items-center justify-between px-2 text-[10px]">
          <SunIcon
            className={cn(
              'size-3.5 transition-opacity duration-300',
              !isDark ? 'text-amber-500 opacity-90' : 'opacity-30'
            )}
          />
          <MoonIcon
            className={cn(
              'size-3.5 transition-opacity duration-300',
              isDark ? 'text-accent opacity-90' : 'opacity-30'
            )}
          />
        </span>

        {/* Sliding thumb knob */}
        <span
          className={cn(
            'pointer-events-none z-10 flex items-center justify-center rounded-full shadow-md transition-all duration-300 ease-spring',
            isDark
              ? 'translate-x-7 bg-card text-accent ring-1 ring-border/50'
              : 'translate-x-0 bg-white text-amber-500 ring-1 ring-black/5',
            size === 'sm' && (isDark ? 'translate-x-5 size-5' : 'translate-x-0 size-5'),
            size === 'md' && (isDark ? 'translate-x-7 size-6.5' : 'translate-x-0 size-6.5'),
            size === 'lg' && (isDark ? 'translate-x-8 size-7.5' : 'translate-x-0 size-7.5')
          )}
        >
          {mounted ? (
            isDark ? (
              <MoonIcon className="size-3.5 transition-transform duration-300 group-hover:rotate-12" />
            ) : (
              <SunIcon className="size-3.5 transition-transform duration-300 group-hover:rotate-45" />
            )
          ) : (
            <span className="size-3.5 rounded-full bg-muted" />
          )}
        </span>
      </button>
    )
  }

  // 2. Segmented Pill variant (Light / System / Dark)
  if (variant === 'segmented') {
    return (
      <div
        className={cn(
          'inline-flex items-center rounded-full border border-border/80 bg-muted/60 p-0.5 backdrop-blur-md shadow-xs',
          className
        )}
        role="group"
        aria-label="Theme selector"
      >
        <button
          type="button"
          onClick={() => setTheme('light')}
          aria-pressed={mounted && theme === 'light'}
          className={cn(
            'flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-all duration-200',
            mounted && theme === 'light'
              ? 'bg-card text-foreground shadow-xs ring-1 ring-border/50'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          <SunIcon className="size-3.5 text-amber-500" />
          <span className="hidden sm:inline">Light</span>
        </button>
        <button
          type="button"
          onClick={() => setTheme('system')}
          aria-pressed={mounted && theme === 'system'}
          className={cn(
            'flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-all duration-200',
            mounted && theme === 'system'
              ? 'bg-card text-foreground shadow-xs ring-1 ring-border/50'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          <LaptopIcon className="size-3.5" />
          <span className="hidden sm:inline">Auto</span>
        </button>
        <button
          type="button"
          onClick={() => setTheme('dark')}
          aria-pressed={mounted && theme === 'dark'}
          className={cn(
            'flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-all duration-200',
            mounted && theme === 'dark'
              ? 'bg-card text-foreground shadow-xs ring-1 ring-border/50'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          <MoonIcon className="size-3.5 text-accent" />
          <span className="hidden sm:inline">Dark</span>
        </button>
      </div>
    )
  }

  // 3. Compact Icon Button variant
  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      className={cn(
        'relative inline-flex size-9 items-center justify-center rounded-xl border border-border/80 bg-card/80 text-foreground shadow-xs backdrop-blur-sm transition-all duration-200 hover:border-accent/40 hover:bg-accent/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-95',
        className
      )}
    >
      {mounted ? (
        isDark ? (
          <SunIcon className="size-4 text-amber-400 transition-transform duration-300 hover:rotate-45" />
        ) : (
          <MoonIcon className="size-4 text-foreground transition-transform duration-300 hover:-rotate-12" />
        )
      ) : (
        <span className="size-4 rounded-full bg-muted/60" />
      )}
    </button>
  )
}
