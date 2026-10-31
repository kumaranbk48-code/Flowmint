import Link from 'next/link'
import { ArrowLeft, Scale } from 'lucide-react'
import { buttonClass } from '@/components/ledger-ui'
import { FlowMintLogo } from '@/components/logo'
import { cn } from '@/lib/utils'

export const metadata = {
  title: 'Terms of Service | FlowMint',
  description: 'FlowMint Terms of Service governing contractor cashbook ledger usage, AI voice transcription, and financial records.',
}

export default function TermsOfServicePage() {
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
            This terms of service agreement is a template designed for FlowMint’s feature set. Legal review is required prior to commercial offering.
          </p>
        </div>

        <article className="prose prose-neutral dark:prose-invert max-w-none text-foreground">
          <div className="flex items-center gap-2 text-primary">
            <Scale className="size-6" />
            <h1 className="text-2xl font-bold tracking-tight md:text-3xl m-0">Terms of Service</h1>
          </div>
          <p className="text-xs text-muted-foreground mt-1 mb-6">
            Last Updated: October 31, 2026 · Version 1.0
          </p>

          <section className="mb-6">
            <h2 className="text-lg font-bold text-foreground">1. Acceptance of Terms</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              By creating an account, recording voice entries, or using the FlowMint web application (&ldquo;Service&rdquo;), you agree to be bound by these Terms of Service. If you do not agree to these terms, please discontinue using the Service.
            </p>
          </section>

          <section className="mb-6">
            <h2 className="text-lg font-bold text-foreground">2. Description of the Service</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              FlowMint provides a specialized financial cashbook, project expense tracker, and voice entry assistant tailored for building contractors, civil engineers, and construction site managers.
            </p>
          </section>

          <section className="mb-6">
            <h2 className="text-lg font-bold text-foreground">3. Financial Verification & Responsibility</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              <strong>Important Notice:</strong> FlowMint is an administrative record-keeping and assistive tool, not a certified chartered accounting firm or financial advisor.
            </p>
            <ul className="list-disc pl-5 text-sm text-muted-foreground space-y-1 mt-2">
              <li>While voice recognition and AI transaction parsing strive for high accuracy across Indian accents and regional languages, acoustic variance or background construction noise may occasionally cause misinterpretations.</li>
              <li>You are solely responsible for reviewing, editing, and verifying the detected amounts, payment modes, and project attributions on the confirmation screen before committing them to your cashbook.</li>
              <li>FlowMint is not liable for tax computation errors, business decisions, or contractor disputes arising from ledger records.</li>
            </ul>
          </section>

          <section className="mb-6">
            <h2 className="text-lg font-bold text-foreground">4. Account Security & Acceptable Use</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              You agree to maintain the security of your password and access credentials. You agree NOT to:
            </p>
            <ul className="list-disc pl-5 text-sm text-muted-foreground space-y-1 mt-2">
              <li>Attempt to access data, projects, or ledgers belonging to another user.</li>
              <li>Perform automated scraping, stress testing, or DoS attacks against FlowMint’s servers or AI voice transcription endpoints.</li>
              <li>Reverse engineer or bypass authentication mechanisms.</li>
            </ul>
          </section>

          <section className="mb-6">
            <h2 className="text-lg font-bold text-foreground">5. Termination</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              We reserve the right to suspend or terminate accounts that violate security policies or engage in abusive API usage. You may terminate your account at any time and export your transaction data.
            </p>
          </section>

          <section className="border-t pt-5">
            <h2 className="text-base font-bold text-foreground">6. Contact</h2>
            <p className="text-xs text-muted-foreground">
              Questions regarding these Terms of Service can be directed through the application support links or by contacting the development team.
            </p>
          </section>
        </article>
      </div>
    </div>
  )
}

