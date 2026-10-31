'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useRef } from 'react'
import { Menu, Mic, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { isActive, primaryNav, secondaryNav } from './nav-items'
import { useAuth } from '@/components/auth-provider'
import { FlowMintLogo } from '@/components/logo'
import { OfflineIndicator } from '@/components/pwa/offline-indicator'

function Brand() {
  const { business } = useAuth()
  return (
    <Link href="/" className="flex items-center gap-2.5 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <FlowMintLogo size={32} />
      <span className="flex flex-col leading-none">
        <span className="text-[15px] font-semibold tracking-tight">FlowMint</span>
        <span className="mt-0.5 text-[11px] text-muted-foreground">{business.businessName}</span>
      </span>
    </Link>
  )
}

function NavList({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  return (
    <ul className="flex flex-col gap-0.5">
      {primaryNav
        .filter((item) => item.href !== '/voice')
        .map((item) => {
          const active = isActive(pathname, item.href)
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                onClick={onNavigate}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground',
                  active && 'bg-sidebar-accent text-foreground',
                )}
              >
                <item.icon className={cn('size-4.5', active && 'text-primary')} aria-hidden="true" />
                {item.label}
              </Link>
            </li>
          )
        })}
    </ul>
  )
}

function VoiceButton({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  const active = isActive(pathname, '/voice')
  return (
    <Link
      href="/voice"
      onClick={onNavigate}
      aria-current={active ? 'page' : undefined}
      className="flex items-center gap-3 rounded-lg bg-primary px-3 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      <span className="flex size-7 items-center justify-center rounded-md bg-primary-foreground/15">
        <Mic className="size-4" aria-hidden="true" />
      </span>
      Voice Entry
      <kbd className="ml-auto rounded border border-primary-foreground/25 px-1.5 py-0.5 font-mono text-[10px] font-normal text-primary-foreground/80">
        V
      </kbd>
    </Link>
  )
}

function SecondaryList({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  return (
    <ul className="flex flex-col gap-0.5">
      {secondaryNav.map((item) => {
        const active = isActive(pathname, item.href)
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              onClick={onNavigate}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground',
                active && 'bg-sidebar-accent text-foreground',
              )}
            >
              <item.icon className="size-4.5" aria-hidden="true" />
              {item.label}
            </Link>
          </li>
        )
      })}
    </ul>
  )
}

function UserCard() {
  const { business, user } = useAuth()
  const name = business.ownerName || user?.name || 'My Account'
  const initials =
    name
      .split(' ')
      .filter(Boolean)
      .map((n) => n[0])
      .slice(0, 2)
      .join('')
      .toUpperCase() || 'U'

  const subtitle = business.businessType
    ? `${business.businessType}${business.location ? ` · ${business.location.split(',')[0]}` : ''}`
    : 'Contractor Profile'

  return (
    <Link href="/profile" className="flex items-center gap-3 rounded-lg border bg-card px-3 py-2.5 transition-colors hover:bg-surface/60">
      <span
        aria-hidden="true"
        className="flex size-8 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-semibold text-foreground"
      >
        {initials}
      </span>
      <div className="min-w-0 leading-tight">
        <p className="truncate text-sm font-medium text-foreground">{name}</p>
        <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
      </div>
    </Link>
  )
}

const mobileTabs = ['/', '/projects', '/voice', '/reports', '/profile']

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const drawerRef = useRef<HTMLDialogElement>(null)
  const closeDrawer = () => drawerRef.current?.close()

  const isAuthPage =
    pathname === '/login' ||
    pathname === '/signup' ||
    pathname === '/onboarding' ||
    pathname === '/forgot-password' ||
    pathname.startsWith('/reset-password') ||
    pathname === '/privacy' ||
    pathname === '/terms'

  useEffect(() => {
    if (isAuthPage) return
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (target.closest('input, textarea, select, [contenteditable="true"]')) return
      if (e.key === 'v' || e.key === 'V') router.push('/voice')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [router, isAuthPage])

  if (isAuthPage) {
    return <main className="min-h-dvh bg-background">{children}</main>
  }

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[248px_1fr]">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-dvh flex-col gap-6 border-r bg-sidebar px-4 py-5 lg:flex">
        <div className="px-1">
          <Brand />
        </div>
        <VoiceButton pathname={pathname} />
        <nav aria-label="Main" className="flex-1">
          <NavList pathname={pathname} />
        </nav>
        <nav aria-label="Account" className="flex flex-col gap-3">
          <SecondaryList pathname={pathname} />
          <UserCard />
        </nav>
      </aside>

      {/* Mobile header */}
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b bg-background/90 px-4 backdrop-blur lg:hidden">
        <Brand />
        <button
          type="button"
          onClick={() => drawerRef.current?.showModal()}
          className="flex size-9 items-center justify-center rounded-md border bg-card text-foreground"
          aria-label="Open menu"
        >
          <Menu className="size-4.5" aria-hidden="true" />
        </button>
      </header>

      <dialog
        ref={drawerRef}
        aria-label="Menu"
        onClick={(e) => {
          if (e.target === e.currentTarget) closeDrawer()
        }}
        className="m-0 ml-auto h-dvh max-h-dvh w-[86%] max-w-xs bg-sidebar p-0 text-foreground backdrop:bg-foreground/30 lg:hidden"
      >
        <div className="flex h-full flex-col gap-6 px-4 py-4">
          <div className="flex items-center justify-between px-1">
            <Brand />
            <button
              type="button"
              onClick={closeDrawer}
              className="flex size-9 items-center justify-center rounded-md text-muted-foreground hover:bg-sidebar-accent"
              aria-label="Close menu"
            >
              <X className="size-4.5" aria-hidden="true" />
            </button>
          </div>
          <VoiceButton pathname={pathname} onNavigate={closeDrawer} />
          <nav aria-label="Main" className="flex-1">
            <NavList pathname={pathname} onNavigate={closeDrawer} />
          </nav>
          <nav aria-label="Account" className="flex flex-col gap-3">
            <SecondaryList pathname={pathname} onNavigate={closeDrawer} />
            <UserCard />
          </nav>
        </div>
      </dialog>

      <div className="flex min-w-0 flex-1 flex-col">
        <OfflineIndicator />
        <main className="min-w-0 pb-28 lg:pb-0">{children}</main>
      </div>

      {/* Mobile bottom tabs */}
      <nav
        aria-label="Quick"
        className="fixed inset-x-0 bottom-0 z-30 border-t bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
      >
        <ul className="grid grid-cols-5 items-end">
          {mobileTabs.map((href) => {
            const item = [...primaryNav, ...secondaryNav].find((n) => n.href === href)!
            const active = isActive(pathname, href)
            if (href === '/voice') {
              return (
                <li key={href} className="flex justify-center">
                  <Link
                    href="/voice"
                    aria-label="Voice entry"
                    aria-current={active ? 'page' : undefined}
                    className="-mt-6 mb-1.5 flex size-15 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/25 ring-4 ring-background"
                  >
                    <Mic className="size-6" aria-hidden="true" />
                  </Link>
                </li>
              )
            }
            return (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium text-muted-foreground',
                    active && 'text-foreground',
                  )}
                >
                  <item.icon className={cn('size-5', active && 'text-primary')} aria-hidden="true" />
                  {item.label === 'Dashboard' ? 'Home' : item.label}
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>
    </div>
  )
}
