'use client'

import { useEffect } from 'react'

export function PwaServiceWorker() {
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
      return
    }

    // Register service worker after window load for peak performance
    const registerSW = () => {
      navigator.serviceWorker
        .register('/sw.js')
        .then((registration) => {
          if (process.env.NODE_ENV === 'development') {
            console.log('[FlowMint PWA] Service worker registered with scope:', registration.scope)
          }
        })
        .catch((err) => {
          console.warn('[FlowMint PWA] Service worker registration failed:', err)
        })
    }

    if (document.readyState === 'complete') {
      registerSW()
    } else {
      window.addEventListener('load', registerSW)
      return () => window.removeEventListener('load', registerSW)
    }
  }, [])

  return null
}

