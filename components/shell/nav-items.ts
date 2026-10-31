import { Building2, ChartColumn, House, Mic, Settings, UserRound } from 'lucide-react'

export const primaryNav = [
  { href: '/voice', label: 'Voice Entry', icon: Mic },
  { href: '/', label: 'Dashboard', icon: House },
  { href: '/projects', label: 'Projects', icon: Building2 },
  { href: '/reports', label: 'Reports', icon: ChartColumn },
]

export const secondaryNav = [
  { href: '/settings', label: 'Settings', icon: Settings },
  { href: '/profile', label: 'Profile', icon: UserRound },
]

export function isActive(pathname: string, href: string) {
  return href === '/' ? pathname === '/' : pathname.startsWith(href)
}
