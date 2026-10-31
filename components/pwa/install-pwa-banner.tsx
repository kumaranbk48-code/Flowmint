'use client'

import { useEffect, useState } from 'react'
import { Download, Share, X, Smartphone, Check } from 'lucide-react'
import { cn } from '@/lib/utils'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

export function InstallPwaBanner() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [isStandalone, setIsStandalone] = useState(false)
  const [isIos, setIsIos] = useState(false)
  const [showIosModal, setShowIosModal] = useState(false)
  const [isDismissed, setIsDismissed] = useState(true)
  const [installedSuccess, setInstalledSuccess] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return

    // Check if already running as installed PWA app
    const isStandaloneMode =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true

    setIsStandalone(isStandaloneMode)
    if (isStandaloneMode) return

    // Detect iOS devices
    const userAgent = window.navigator.userAgent.toLowerCase()
    const isIosDevice = /iphone|ipad|ipod/.test(userAgent)
    setIsIos(isIosDevice)

    // Check if user previously dismissed banner
    const dismissedUntil = localStorage.getItem('flowmint_pwa_dismissed')
    if (!dismissedUntil || Date.now() > Number(dismissedUntil)) {
      setIsDismissed(false)
    }

    // Listen for Chrome / Android beforeinstallprompt
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)
      setIsDismissed(false)
    }

    // Listen for app installed event
    const handleAppInstalled = () => {
      setDeferredPrompt(null)
      setIsStandalone(true)
      setInstalledSuccess(true)
      setTimeout(() => setInstalledSuccess(false), 4000)
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    window.addEventListener('appinstalled', handleAppInstalled)

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
      window.removeEventListener('appinstalled', handleAppInstalled)
    }
  }, [])

  const handleInstallClick = async () => {
    if (isIos) {
      setShowIosModal(true)
      return
    }

    if (!deferredPrompt) {
      // If Android Chrome hasn't triggered event yet, show instructions
      alert('To install FlowMint:\n1. Tap the 3 dots (⋮) in the top right of your browser.\n2. Tap "Install app" or "Add to Home screen".')
      return
    }

    try {
      await deferredPrompt.prompt()
      const choiceResult = await deferredPrompt.userChoice
      if (choiceResult.outcome === 'accepted') {
        setInstalledSuccess(true)
        setDeferredPrompt(null)
      }
    } catch (err) {
      console.warn('[FlowMint PWA] Install error:', err)
    }
  }

  const handleDismiss = () => {
    setIsDismissed(true)
    // Don't show banner again for 7 days
    try {
      localStorage.setItem('flowmint_pwa_dismissed', String(Date.now() + 7 * 24 * 60 * 60 * 1000))
    } catch {}
  }

  // Do not show banner if already running in standalone mode or dismissed
  if (isStandalone) return null

  if (installedSuccess) {
    return (
      <aside aria-label="Installation success" className="flex items-center justify-between border-b border-primary/20 bg-primary/10 px-4 py-2 text-xs font-medium text-primary transition-all">
        <span className="flex items-center gap-2">
          <Check className="size-4 shrink-0" />
          FlowMint successfully installed! Check your home screen.
        </span>
      </aside>
    )
  }

  if (isDismissed && !deferredPrompt && !isIos) return null
  if (isDismissed) return null

  return (
    <>
      <aside aria-label="Install App" className="flex flex-wrap items-center justify-between gap-3 border-b border-primary/30 bg-primary/5 px-3.5 py-2.5 text-xs transition-all sm:px-6">
        <div className="flex items-center gap-2.5">
          <span className="flex size-7 items-center justify-center rounded-lg bg-primary/15 text-primary">
            <Smartphone className="size-4" />
          </span>
          <div>
            <p className="font-semibold text-foreground">
              Install FlowMint App
            </p>
            <p className="text-[11px] text-muted-foreground">
              Add to your phone&apos;s home screen for fast 1-tap 100% offline access.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleInstallClick}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 font-semibold text-primary-foreground shadow-xs transition-colors hover:bg-primary/90 active:scale-95"
          >
            <Download className="size-3.5" />
            <span>Install</span>
          </button>
          <button
            type="button"
            onClick={handleDismiss}
            aria-label="Dismiss install banner"
            className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>
      </aside>

      {/* iOS Safari Installation Modal */}
      {showIosModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="ios-install-title"
          className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/30 p-4 backdrop-blur-xs sm:items-center"
          onClick={() => setShowIosModal(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl border bg-card p-5 shadow-xl transition-all"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 id="ios-install-title" className="text-sm font-bold text-foreground">
                Install FlowMint on iPhone
              </h3>
              <button
                type="button"
                onClick={() => setShowIosModal(false)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Apple requires installing PWAs through Safari:
            </p>
            <ol className="mt-3.5 flex flex-col gap-2.5 text-xs text-foreground">
              <li className="flex items-center gap-2">
                <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/10 font-bold text-primary">
                  1
                </span>
                <span>
                  Tap the <Share className="inline size-3.5 text-primary" /> <strong>Share</strong> button at the bottom of Safari.
                </span>
              </li>
              <li className="flex items-center gap-2">
                <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/10 font-bold text-primary">
                  2
                </span>
                <span>
                  Scroll down and tap <strong>&ldquo;Add to Home Screen&rdquo;</strong>.
                </span>
              </li>
              <li className="flex items-center gap-2">
                <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/10 font-bold text-primary">
                  3
                </span>
                <span>
                  Tap <strong>Add</strong> in the top right.
                </span>
              </li>
            </ol>
            <button
              type="button"
              onClick={() => setShowIosModal(false)}
              className="mt-5 w-full rounded-lg bg-primary py-2 text-center text-xs font-semibold text-primary-foreground hover:bg-primary/90"
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </>
  )
}

export function InstallMenuItem({ onNavigate }: { onNavigate?: () => void }) {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [isStandalone, setIsStandalone] = useState(true)
  const [isIos, setIsIos] = useState(false)
  const [showIosModal, setShowIosModal] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const isStandaloneMode =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true
    setIsStandalone(isStandaloneMode)
    if (isStandaloneMode) return

    const userAgent = window.navigator.userAgent.toLowerCase()
    setIsIos(/iphone|ipad|ipod/.test(userAgent))

    const handlePrompt = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)
    }
    window.addEventListener('beforeinstallprompt', handlePrompt)
    return () => window.removeEventListener('beforeinstallprompt', handlePrompt)
  }, [])

  if (isStandalone) return null

  const handleClick = async () => {
    if (onNavigate) onNavigate()
    if (isIos) {
      setShowIosModal(true)
      return
    }
    if (deferredPrompt) {
      await deferredPrompt.prompt()
      setDeferredPrompt(null)
    } else {
      alert('To install FlowMint:\n1. Tap the 3 dots (⋮) in your browser.\n2. Tap "Install app" or "Add to Home screen".')
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-primary transition-colors hover:bg-sidebar-accent"
      >
        <Download className="size-4.5" aria-hidden="true" />
        <span>Install FlowMint App</span>
      </button>

      {showIosModal && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/30 p-4 backdrop-blur-xs sm:items-center"
          onClick={() => setShowIosModal(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl border bg-card p-5 shadow-xl transition-all"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-foreground">Install FlowMint on iPhone</h3>
              <button
                type="button"
                onClick={() => setShowIosModal(false)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            </div>
            <ol className="mt-3.5 flex flex-col gap-2.5 text-xs text-foreground">
              <li className="flex items-center gap-2">
                <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/10 font-bold text-primary">
                  1
                </span>
                <span>Tap the Share button in Safari</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/10 font-bold text-primary">
                  2
                </span>
                <span>Tap &ldquo;Add to Home Screen&rdquo;</span>
              </li>
            </ol>
            <button
              type="button"
              onClick={() => setShowIosModal(false)}
              className="mt-4 w-full rounded-lg bg-primary py-2 text-center text-xs font-semibold text-primary-foreground hover:bg-primary/90"
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </>
  )
}
