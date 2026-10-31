'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { FlowMintLogo } from '@/components/logo'
import { AuthLoadingScreen } from '@/components/auth/auth-loading-screen'

export const PUBLIC_ROUTES = [
  '/login',
  '/signup',
  '/forgot-password',
  '/reset-password',
  '/privacy',
  '/terms',
]

export function isPublicRoute(pathname: string | null): boolean {
  if (!pathname) return false
  return PUBLIC_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`) || pathname.startsWith(`${route}?`),
  )
}

export type BusinessDetails = {
  businessName: string
  ownerName: string
  businessType: string
  location: string
}

export type AuthUser = {
  id: string
  name: string
  email: string
  isGoogle?: boolean
}

export type GoogleUserProfile = {
  id?: string
  name: string
  email: string
  picture?: string
  credential?: string
  idToken?: string
  accessToken?: string
}

type AuthContextValue = {
  user: AuthUser | null
  business: BusinessDetails
  isAuthenticated: boolean
  isReady: boolean
  login: (email: string, password?: string) => Promise<void>
  loginWithGoogle: (account?: GoogleUserProfile) => Promise<void>
  signup: (name: string, email: string, password?: string) => Promise<void>
  signupWithGoogle: (account?: GoogleUserProfile) => Promise<void>
  saveBusinessDetails: (details: BusinessDetails) => Promise<void>
  logout: () => void
}

export const DEFAULT_BUSINESS: BusinessDetails = {
  businessName: '',
  ownerName: '',
  businessType: '',
  location: '',
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()

  const [isReady, setIsReady] = useState(false)
  const [user, setUser] = useState<AuthUser | null>(null)
  const [business, setBusiness] = useState<BusinessDetails>(DEFAULT_BUSINESS)
  const [authLoading, setAuthLoading] = useState<{
    title: string
    subtitle: string
  } | null>(null)

  // Clear auth loading transition once navigation completes
  useEffect(() => {
    if (authLoading && user && (pathname === '/' || pathname === '/onboarding')) {
      const timer = setTimeout(() => {
        setAuthLoading(null)
      }, 400)
      return () => clearTimeout(timer)
    }
  }, [authLoading, user, pathname])

  // Initialize on mount
  useEffect(() => {
    try {
      localStorage.removeItem('flowmint_user')
      localStorage.removeItem('sitebook_user')

      const sessionUser = sessionStorage.getItem('flowmint_user')
      if (sessionUser) {
        const parsed = JSON.parse(sessionUser)
        setUser(parsed)

        // Revalidate & fetch fresh details from Supabase database
        fetch('/api/auth/me', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        })
          .then((res) => (res.ok ? res.json() : null))
          .then((data) => {
            if (data?.user) {
              setUser(data.user)
            }
            if (data?.business && (data.business.businessName || data.business.ownerName)) {
              setBusiness(data.business)
              try {
                localStorage.setItem('flowmint_business', JSON.stringify(data.business))
              } catch {}
            }
          })
          .catch(() => {})
      } else {
        // Check if an HTTP-only cookie session is active
        fetch('/api/auth/me', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        })
          .then((res) => (res.ok ? res.json() : null))
          .then((data) => {
            if (data?.user) {
              setUser(data.user)
              try {
                sessionStorage.setItem('flowmint_user', JSON.stringify(data.user))
              } catch {}
            }
            if (data?.business && (data.business.businessName || data.business.ownerName)) {
              setBusiness(data.business)
              try {
                localStorage.setItem('flowmint_business', JSON.stringify(data.business))
              } catch {}
            }
          })
          .catch(() => {
            setUser(null)
          })
      }

      const savedBiz = localStorage.getItem('flowmint_business') || localStorage.getItem('sitebook_business')
      if (savedBiz) {
        const parsed = JSON.parse(savedBiz)
        if (parsed.businessName === 'AP Builders' && parsed.ownerName === 'Arun Prakash') {
          localStorage.removeItem('flowmint_business')
          localStorage.removeItem('sitebook_business')
          setBusiness(DEFAULT_BUSINESS)
        } else {
          setBusiness(parsed)
        }
      } else {
        setBusiness(DEFAULT_BUSINESS)
      }
    } catch {
      setUser(null)
      setBusiness(DEFAULT_BUSINESS)
    }
    setIsReady(true)
  }, [])

  // Route protection
  useEffect(() => {
    if (!isReady) return

    const isPublic = isPublicRoute(pathname)

    // When unauthenticated, redirect to /login only if NOT on a public route
    if (!user && !isPublic) {
      router.replace('/login')
    } else if (user && (pathname === '/login' || pathname === '/signup')) {
      // If already authenticated and visiting login/signup, go to dashboard
      router.replace('/')
    }
  }, [isReady, user, pathname, router])

  const login = useCallback(
    async (email: string, password?: string) => {
      setAuthLoading({
        title: 'Signing you in…',
        subtitle: 'Opening your FlowMint cashbook…',
      })

      try {
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password }),
        })

        const data = await res.json()
        if (!res.ok) {
          throw new Error(data.error || 'Failed to log in.')
        }

        setUser(data.user)
        if (data.business) {
          setBusiness(data.business)
          try {
            localStorage.setItem('flowmint_business', JSON.stringify(data.business))
          } catch {}
        }

        try {
          sessionStorage.setItem('flowmint_user', JSON.stringify(data.user))
        } catch {}

        if (data.onboardingCompleted === false) {
          router.push('/onboarding')
        } else {
          router.push('/')
        }
      } catch (err) {
        setAuthLoading(null)
        throw err
      }
    },
    [router],
  )

  const loginWithGoogle = useCallback(
    async (account?: GoogleUserProfile) => {
      if (!account?.email) {
        throw new Error('Google did not provide an email address.')
      }

      setAuthLoading({
        title: 'Connecting Google Account…',
        subtitle: 'Authenticating your contractor account…',
      })

      try {
        const res = await fetch('/api/auth/google-login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: account.email,
            name: account.name,
            googleId: account.id,
            picture: account.picture,
            credential: account.credential,
            idToken: account.idToken,
            accessToken: account.accessToken,
          }),
        })

        const data = await res.json()
        if (!res.ok) {
          throw new Error(data.error || 'Google login failed.')
        }

        setUser(data.user)
        if (data.business) {
          setBusiness(data.business)
          try {
            localStorage.setItem('flowmint_business', JSON.stringify(data.business))
          } catch {}
        }

        try {
          sessionStorage.setItem('flowmint_user', JSON.stringify(data.user))
        } catch {}

        if (data.onboardingCompleted === false) {
          router.push('/onboarding')
        } else {
          router.push('/')
        }
      } catch (err) {
        setAuthLoading(null)
        throw err
      }
    },
    [router],
  )

  const signup = useCallback(
    async (name: string, email: string, password?: string) => {
      setAuthLoading({
        title: 'Creating your account…',
        subtitle: 'Setting up your contractor workspace…',
      })

      try {
        const res = await fetch('/api/auth/signup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, email, password }),
        })

        const data = await res.json()
        if (!res.ok) {
          throw new Error(data.error || 'Failed to create account.')
        }

        setUser(data.user)
        if (data.business) {
          setBusiness(data.business)
          try {
            localStorage.setItem('flowmint_business', JSON.stringify(data.business))
          } catch {}
        }

        try {
          sessionStorage.setItem('flowmint_user', JSON.stringify(data.user))
        } catch {}

        router.push('/onboarding')
      } catch (err) {
        setAuthLoading(null)
        throw err
      }
    },
    [router],
  )

  const signupWithGoogle = useCallback(
    async (account?: GoogleUserProfile) => {
      if (!account?.email) {
        throw new Error('Google did not provide an email address.')
      }

      setAuthLoading({
        title: 'Setting up Google Account…',
        subtitle: 'Preparing your contractor workspace…',
      })

      try {
        const res = await fetch('/api/auth/google-signup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: account.email,
            name: account.name,
            googleId: account.id,
            picture: account.picture,
            credential: account.credential,
            idToken: account.idToken,
            accessToken: account.accessToken,
          }),
        })

        const data = await res.json()
        if (!res.ok) {
          throw new Error(data.error || 'Google sign-up failed.')
        }

        setUser(data.user)
        if (data.business) {
          setBusiness(data.business)
          try {
            localStorage.setItem('flowmint_business', JSON.stringify(data.business))
          } catch {}
        }

        try {
          sessionStorage.setItem('flowmint_user', JSON.stringify(data.user))
        } catch {}

        router.push('/onboarding')
      } catch (err) {
        setAuthLoading(null)
        throw err
      }
    },
    [router],
  )

  const saveBusinessDetails = useCallback(
    async (details: BusinessDetails) => {
      setAuthLoading({
        title: 'Opening your Cashbook…',
        subtitle: 'Loading your projects & balances…',
      })

      try {
        setBusiness(details)
        try {
          localStorage.setItem('flowmint_business', JSON.stringify(details))
        } catch {}

        // Save to Supabase database
        await fetch('/api/auth/save-business', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: user?.id,
            email: user?.email,
            business: details,
          }),
        })

        router.push('/')
      } catch (err) {
        setAuthLoading(null)
        throw err
      }
    },
    [user, router],
  )

  const logout = useCallback(() => {
    fetch('/api/auth/logout', { method: 'POST' }).catch(() => {})
    setUser(null)
    setBusiness(DEFAULT_BUSINESS)
    try {
      sessionStorage.removeItem('flowmint_user')
      localStorage.removeItem('flowmint_user')
      localStorage.removeItem('flowmint_business')
      localStorage.removeItem('sitebook_user')
      localStorage.removeItem('sitebook_business')
    } catch {}
    router.replace('/login')
  }, [router])

  const value = useMemo(
    () => ({
      user,
      business,
      isAuthenticated: !!user,
      isReady,
      login,
      loginWithGoogle,
      signup,
      signupWithGoogle,
      saveBusinessDetails,
      logout,
    }),
    [user, business, isReady, login, loginWithGoogle, signup, signupWithGoogle, saveBusinessDetails, logout],
  )

  const isPublic = isPublicRoute(pathname)

  // 1. If actively transitioning between auth and dashboard
  if (authLoading) {
    return <AuthLoadingScreen title={authLoading.title} subtitle={authLoading.subtitle} />
  }

  // 2. Prevent flash of protected dashboard before redirecting to /login
  if ((!isReady || !user) && !isPublic) {
    return <AuthLoadingScreen title="Opening FlowMint…" subtitle="Checking session…" />
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
