import Link from 'next/link'
import { ArrowLeft, ShieldCheck } from 'lucide-react'
import { buttonClass } from '@/components/ledger-ui'
import { FlowMintLogo } from '@/components/logo'
import { cn } from '@/lib/utils'

export const metadata = {
  title: 'Privacy Policy | FlowMint',
  description: 'FlowMint Privacy Policy explaining contractor financial data handling, voice processing, and data security.',
}

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-dvh bg-background px-4 py-8 md:px-8 md:py-12">
      <div className="mx-auto max-w-3xl">
        {/* Navigation & Brand */}
        <div className="mb-8 flex items-center justify-between border-b pb-5">
          <Link href="/" className="inline-flex items-center gap-2">
            <FlowMintLogo size={36} />
            <span className="font-bold tracking-tight text-foreground text-lg">FlowMint</span>
          </Link>
          <Link
            href="/"
            className={cn(buttonClass('outline'), 'inline-flex items-center gap-1.5 text-xs')}
          >
            <ArrowLeft className="size-3.5" />
            <span>Back to Dashboard</span>
          </Link>
        </div>

        {/* Disclaimer Banner */}
        <div className="mb-6 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-xs font-medium text-amber-800 dark:text-amber-200">
          <p className="font-bold uppercase tracking-wider">Notice for Pre-Production Review</p>
          <p className="mt-1">
            This document serves as FlowMint’s privacy statement template reflecting current system architecture. Please have it reviewed by qualified legal counsel prior to commercial launch.
          </p>
        </div>

        <article className="prose prose-neutral dark:prose-invert max-w-none text-foreground">
          <div className="flex items-center gap-2 text-primary">
            <ShieldCheck className="size-6" />
            <h1 className="text-2xl font-bold tracking-tight md:text-3xl m-0">Privacy Policy</h1>
          </div>
          <p className="text-xs text-muted-foreground mt-1 mb-6">
            Effective Date: October 31, 2026 · Version 1.0
          </p>

          <section className="mb-6">
            <h2 className="text-lg font-bold text-foreground">1. Overview</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              FlowMint (&ldquo;we,&rdquo; &ldquo;our,&rdquo; or &ldquo;us&rdquo;) provides a voice-first financial management assistant and cashbook ledger designed for building contractors and construction supervisors. We prioritize the confidentiality, integrity, and security of your financial and site operational data.
            </p>
          </section>

          <section className="mb-6">
            <h2 className="text-lg font-bold text-foreground">2. Information We Collect</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              To operate FlowMint, we collect only the information necessary to provide you with contractor ledger services:
            </p>
            <ul className="list-disc pl-5 text-sm text-muted-foreground space-y-1 mt-2">
              <li><strong>Account Credentials:</strong> Name, business name, location, and verified email address via password login or Google OAuth.</li>
              <li><strong>Financial Transactions:</strong> Ledger entries including amounts in INR, dates, payment methods (Cash, UPI, Bank Transfer, Cheque), counterparty names, and expense categories.</li>
              <li><strong>Project Contracts:</strong> Building project names, client names, contract values, and start/completion dates.</li>
              <li><strong>Audio Recordings:</strong> Spoken voice recordings captured through your device microphone when you tap the voice button.</li>
            </ul>
          </section>

          <section className="mb-6">
            <h2 className="text-lg font-bold text-foreground">3. How Voice and AI Transcription Operates</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              When you record a voice entry (in English, Tamil, Tanglish, or Hindi):
            </p>
            <ul className="list-disc pl-5 text-sm text-muted-foreground space-y-1 mt-2">
              <li>Your device compresses the audio stream and transmits it securely via HTTPS to our server.</li>
              <li>Audio is temporarily buffered in volatile server memory solely to transcribe text and extract details using the Google Gemini API.</li>
              <li>Audio data is not permanently stored on third-party AI model training repositories.</li>
              <li>All parsed amounts and project details are presented to you for confirmation before any record is committed to your database ledger.</li>
            </ul>
          </section>

          <section className="mb-6">
            <h2 className="text-lg font-bold text-foreground">4. Data Storage and Security Controls</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              We employ comprehensive technical and organizational measures to safeguard your financial ledger:
            </p>
            <ul className="list-disc pl-5 text-sm text-muted-foreground space-y-1 mt-2">
              <li><strong>Database Isolation:</strong> Data is hosted in PostgreSQL on Supabase with Row Level Security (RLS) policies ensuring each contractor accesses only their own projects and cashbook.</li>
              <li><strong>Encryption:</strong> Data is encrypted in transit using TLS 1.3/HTTPS and at rest using industry-standard AES-256 encryption.</li>
              <li><strong>Authentication:</strong> Session tokens are signed cryptographically with HMAC-SHA256 and stored in secure, HttpOnly, SameSite cookies.</li>
            </ul>
          </section>

          <section className="mb-6">
            <h2 className="text-lg font-bold text-foreground">5. Contractor Ownership and Rights</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              You maintain 100% ownership of your business data:
            </p>
            <ul className="list-disc pl-5 text-sm text-muted-foreground space-y-1 mt-2">
              <li>You may export complete transaction statements and project cash flow reports to CSV at any time.</li>
              <li>You may update or delete individual transactions and projects whenever needed.</li>
              <li>You may request complete account and data deletion by contacting our support team.</li>
            </ul>
          </section>

          <section className="border-t pt-5">
            <h2 className="text-base font-bold text-foreground">6. Contact and Inquiries</h2>
            <p className="text-xs text-muted-foreground">
              If you have questions regarding this Privacy Policy or your contractor data, please reach out via our support channel or visit our settings page.
            </p>
          </section>
        </article>
      </div>
    </div>
  )
}

