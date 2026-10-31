import type { Metadata, Viewport } from 'next'
import Script from 'next/script'
import { IBM_Plex_Sans, IBM_Plex_Mono } from 'next/font/google'
import { AppShell } from '@/components/shell/app-shell'
import { LedgerProvider } from '@/components/ledger-provider'
import { AuthProvider } from '@/components/auth-provider'
import { PwaServiceWorker } from '@/components/pwa/pwa-service-worker'
import './globals.css'

const plexSans = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-plex-sans',
})

const plexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-plex-mono',
})

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || 'https://flowmint.app'),
  title: {
    default: 'FlowMint — Focused financial assistant for building contractors',
    template: '%s | FlowMint',
  },
  description:
    'Record client payments, site expenses, and worker payments by voice. Daily, weekly and monthly project cash flow reports for building contracts.',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'FlowMint',
  },
  icons: {
    icon: '/icon-32.png',
    shortcut: '/favicon.ico',
    apple: '/icon-192.png',
  },
  openGraph: {
    title: 'FlowMint — Focused financial assistant for building contractors',
    description:
      'Record client payments, site expenses, and worker payments by voice. Daily, weekly and monthly project cash flow reports for building contracts.',
    url: 'https://flowmint.app',
    siteName: 'FlowMint',
    locale: 'en_IN',
    type: 'website',
  },
  twitter: {
    card: 'summary',
    title: 'FlowMint — Contractor Financial Assistant',
    description: 'Record client payments, site expenses, and worker payments by voice.',
  },
}

export const viewport: Viewport = {
  colorScheme: 'light',
  themeColor: '#f8f6f3',
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className={`${plexSans.variable} ${plexMono.variable}`}>
      <body className="antialiased">
        <PwaServiceWorker />
        <Script
          id="flowmint-sw-register"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{
            __html: `
              if ('serviceWorker' in navigator) {
                window.addEventListener('load', function() {
                  navigator.serviceWorker.register('/sw.js', { scope: '/' })
                    .catch(function(err) { console.warn('[FlowMint SW]', err); });
                });
                if (document.readyState === 'complete') {
                  navigator.serviceWorker.register('/sw.js', { scope: '/' })
                    .catch(function(err) { console.warn('[FlowMint SW]', err); });
                }
              }
            `,
          }}
        />
        <Script src="https://accounts.google.com/gsi/client" strategy="afterInteractive" />
        <AuthProvider>
          <LedgerProvider>
            <AppShell>{children}</AppShell>
          </LedgerProvider>
        </AuthProvider>
      </body>
    </html>
  )
}
