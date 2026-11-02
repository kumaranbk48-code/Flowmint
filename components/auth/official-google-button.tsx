'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { Loader2 } from 'lucide-react'

export type GoogleUserProfile = {
  id: string
  name: string
  email: string
  picture?: string
  credential?: string
  idToken?: string
  accessToken?: string
}

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: {
            client_id: string
            callback: (response: { credential: string }) => void
            auto_select?: boolean
            cancel_on_tap_outside?: boolean
          }) => void
          renderButton: (
            parent: HTMLElement,
            options: {
              type?: 'standard' | 'icon'
              theme?: 'outline' | 'filled_blue' | 'filled_black'
              size?: 'large' | 'medium' | 'small'
              text?: 'signin_with' | 'signup_with' | 'continue_with'
              shape?: 'rectangular' | 'pill' | 'circle'
              logo_alignment?: 'left' | 'center'
              width?: number | string
            },
          ) => void
          prompt: (notification?: (notification: unknown) => void) => void
          cancel?: () => void
        }
        oauth2: {
          initTokenClient: (config: {
            client_id: string
            scope: string
            callback: (response: { access_token?: string; error?: string }) => void
            error_callback?: (error: unknown) => void
          }) => {
            requestAccessToken: (overrideConfig?: { prompt?: string }) => void
          }
        }
      }
    }
  }
}

const GOOGLE_CLIENT_ID =
  process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ||
  '252631070414-mrdvd5pdrvqc07h8340dgneopnsl5au0.apps.googleusercontent.com'

function decodeGoogleJwt(token: string): GoogleUserProfile | null {
  try {
    const base64Url = token.split('.')[1]
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/')
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join(''),
    )
    const payload = JSON.parse(jsonPayload)
    return {
      id: payload.sub || `google_${Date.now()}`,
      name: payload.name || payload.given_name || 'Google User',
      email: payload.email || '',
      picture: payload.picture,
    }
  } catch (err) {
    console.error('Failed to decode Google ID Token:', err)
    return null
  }
}

export function OfficialGoogleButton({
  mode = 'login',
  onSuccess,
  onError,
}: {
  mode?: 'login' | 'signup'
  onSuccess: (profile: GoogleUserProfile) => Promise<void> | void
  onError?: (errMessage: string) => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [loading, setLoading] = useState(false)
  const [scriptLoaded, setScriptLoaded] = useState(false)
  const [hasIframe, setHasIframe] = useState(false)
  const tokenClientRef = useRef<{ requestAccessToken: (opts?: { prompt?: string }) => void } | null>(null)
  const initializedRef = useRef(false)

  const handleCredential = useCallback(
    async (credential: string) => {
      setLoading(true)
      const profile = decodeGoogleJwt(credential)
      if (profile) {
        try {
          await onSuccess({
            ...profile,
            credential,
            idToken: credential,
          })
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : 'Google sign-in failed. Please try again.'
          onError?.(msg)
        } finally {
          setLoading(false)
        }
      } else {
        onError?.('Could not extract user details from Google credentials.')
        setLoading(false)
      }
    },
    [onSuccess, onError],
  )

  // Fetch user profile using access token
  const fetchUserInfo = useCallback(
    async (accessToken: string) => {
      try {
        setLoading(true)
        const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
          headers: { Authorization: `Bearer ${accessToken}` },
        })
        if (!res.ok) throw new Error('Failed to fetch user info from Google.')
        const info = await res.json()
        await onSuccess({
          id: info.sub || `google_${Date.now()}`,
          name: info.name || `${info.given_name || ''} ${info.family_name || ''}`.trim() || 'Google User',
          email: info.email,
          picture: info.picture,
          accessToken,
        })
      } catch (e: unknown) {
        console.error('Failed to fetch Google user info:', e)
        const msg = e instanceof Error ? e.message : 'Failed to fetch profile details from Google.'
        onError?.(msg)
      } finally {
        setLoading(false)
      }
    },
    [onSuccess, onError],
  )

  // Listen for OAuth hash token from popup or redirect
  useEffect(() => {
    if (typeof window === 'undefined') return

    const hash = window.location.hash
    if (hash && hash.includes('access_token=')) {
      const params = new URLSearchParams(hash.substring(1))
      const token = params.get('access_token')
      if (token) {
        // Clear hash from URL
        window.history.replaceState(null, '', window.location.pathname + window.location.search)
        fetchUserInfo(token)
      }
    }
  }, [fetchUserInfo])

  // Detect or load Google Identity Services SDK
  useEffect(() => {
    if (typeof window === 'undefined') return

    // 1. Check if already available on window
    if (window.google?.accounts?.id) {
      setScriptLoaded(true)
      return
    }

    // 2. Poll briefly in case next/script beforeInteractive is finishing
    const pollInterval = setInterval(() => {
      if (window.google?.accounts?.id) {
        setScriptLoaded(true)
        clearInterval(pollInterval)
      }
    }, 150)

    // Stop polling after 4 seconds
    const timeout = setTimeout(() => {
      clearInterval(pollInterval)
    }, 4000)

    // 3. Also inject script tag if not yet present
    let script = document.getElementById('google-gsi-client') as HTMLScriptElement | null
    if (!script) {
      script = document.createElement('script')
      script.id = 'google-gsi-client'
      script.src = 'https://accounts.google.com/gsi/client'
      script.async = true
      script.defer = true
      script.onload = () => setScriptLoaded(true)
      // Do NOT trigger onError immediately on script load error; let the styled fallback work!
      script.onerror = () => {
        console.warn('Google GSI script could not load directly. Fallback OAuth enabled.')
      }
      document.head.appendChild(script)
    }

    return () => {
      clearInterval(pollInterval)
      clearTimeout(timeout)
    }
  }, [])

  // Observe container for Google rendered iframe
  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const checkIframe = () => {
      if (el.querySelector('iframe')) {
        setHasIframe(true)
      }
    }

    checkIframe()
    const observer = new MutationObserver(checkIframe)
    observer.observe(el, { childList: true, subtree: true })

    return () => observer.disconnect()
  }, [])

  // Initialize Google Sign-In button and OAuth2 client once script is loaded
  useEffect(() => {
    if (!scriptLoaded || !window.google?.accounts || initializedRef.current) return
    initializedRef.current = true

    try {
      // Initialize GSI ID token client
      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: (response: { credential: string }) => {
          if (response?.credential) {
            handleCredential(response.credential)
          }
        },
      })

      // Render official Google button into container
      if (containerRef.current) {
        containerRef.current.innerHTML = ''
        window.google.accounts.id.renderButton(containerRef.current, {
          type: 'standard',
          theme: 'outline',
          size: 'large',
          text: mode === 'signup' ? 'signup_with' : 'continue_with',
          shape: 'rectangular',
          logo_alignment: 'left',
          width: 384,
        })
      }

      // Also initialize OAuth2 token client for custom button click or fallback
      tokenClientRef.current = window.google.accounts.oauth2.initTokenClient({
        client_id: GOOGLE_CLIENT_ID,
        scope: 'email profile openid',
        callback: async (tokenResponse) => {
          if (tokenResponse?.access_token) {
            fetchUserInfo(tokenResponse.access_token)
          } else if (tokenResponse?.error) {
            setLoading(false)
            if (tokenResponse.error !== 'popup_closed_by_user') {
              onError?.(`Google sign-in error: ${tokenResponse.error}`)
            }
          }
        },
        error_callback: (err) => {
          setLoading(false)
          console.error('Google OAuth error:', err)
        },
      })
    } catch (err) {
      console.error('Error initializing Google Sign-In:', err)
    }

    return () => {
      try {
        window.google?.accounts?.id?.cancel?.()
      } catch {
        /* ignore */
      }
    }
  }, [scriptLoaded, mode, handleCredential, fetchUserInfo, onError])

  // Direct OAuth popup fallback if GSI client is blocked or not ready
  const handleCustomClick = () => {
    if (loading) return

    if (tokenClientRef.current) {
      setLoading(true)
      tokenClientRef.current.requestAccessToken({ prompt: 'select_account' })
      return
    }

    if (window.google?.accounts?.id) {
      window.google.accounts.id.prompt()
      return
    }

    // Direct Google OAuth2 fallback popup for adblocker/browser-restricted environments
    setLoading(true)
    const normalizedPath = window.location.pathname.startsWith('/signup') ? '/signup' : '/login'
    const redirectUri = `${window.location.origin}${normalizedPath}`
    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(
      GOOGLE_CLIENT_ID,
    )}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=token&scope=${encodeURIComponent(
      'email profile openid',
    )}&prompt=select_account`

    const width = 500
    const height = 620
    const left = window.screenX + (window.outerWidth - width) / 2
    const top = window.screenY + (window.outerHeight - height) / 2
    const popup = window.open(
      authUrl,
      'google_login_popup',
      `width=${width},height=${height},left=${left},top=${top},status=no,resizable=yes`,
    )

    if (!popup || popup.closed) {
      // If popup blocked, redirect directly
      window.location.href = authUrl
      return
    }

    // Safety timeout to prevent infinite loading spinner if Google blocks the request
    const maxWaitTimeout = setTimeout(() => {
      setLoading(false)
    }, 20000)

    // Poll popup for completion
    const timer = setInterval(() => {
      try {
        if (!popup || popup.closed) {
          clearInterval(timer)
          clearTimeout(maxWaitTimeout)
          setLoading(false)
          return
        }

        if (popup.location.href.includes(window.location.origin)) {
          const hash = popup.location.hash
          if (hash && hash.includes('access_token=')) {
            const params = new URLSearchParams(hash.substring(1))
            const token = params.get('access_token')
            clearInterval(timer)
            clearTimeout(maxWaitTimeout)
            popup.close()
            if (token) {
              fetchUserInfo(token)
            } else {
              setLoading(false)
            }
          }
        }
      } catch {
        // Cross-origin access while still on google.com is expected, ignore
      }
    }, 300)
  }

  return (
    <div className="flex w-full flex-col items-center">
      {/* Official Google-rendered button container */}
      <div
        ref={containerRef}
        className={`flex w-full justify-center [&>div]:w-full [&_iframe]:w-full ${
          hasIframe ? 'block' : 'hidden'
        }`}
      />

      {/* Styled Google button shown while iframe loads or if custom fallback is active */}
      {!hasIframe && (
        <button
          type="button"
          disabled={loading}
          onClick={handleCustomClick}
          className="flex h-11 w-full items-center justify-center gap-3 rounded-lg border bg-card px-4 text-sm font-medium text-foreground shadow-xs transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
        >
          {loading ? (
            <>
              <Loader2 className="size-4.5 animate-spin text-primary" />
              <span>Connecting to Google…</span>
            </>
          ) : (
            <>
              <svg className="size-4.5 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  fill="#4285F4"
                />
                <path
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  fill="#34A853"
                />
                <path
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                  fill="#FBBC05"
                />
                <path
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                  fill="#EA4335"
                />
              </svg>
              <span>{mode === 'signup' ? 'Sign up with Google' : 'Continue with Google'}</span>
            </>
          )}
        </button>
      )}
    </div>
  )
}
