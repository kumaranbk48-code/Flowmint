'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { ArrowRight, Check, UserRound } from 'lucide-react'
import { useLedger } from '@/components/ledger-provider'
import { useAuth } from '@/components/auth-provider'
import { PageHeader, Panel, buttonClass } from '@/components/ledger-ui'
import { formatMoney } from '@/lib/format'
import { validateOpeningBalance } from '@/lib/security/validation'

export default function SettingsPage() {
  const {
    openingBalance,
    setOpeningBalance,
    openingCash,
    setOpeningCash,
  } = useLedger()
  const { business, user } = useAuth()

  // Local state for settings form
  const [balanceInput, setBalanceInput] = useState(String(openingBalance))
  const [cashInput, setCashInput] = useState(String(openingCash))
  const [voiceLanguage, setVoiceLanguage] = useState<'ta-IN' | 'en-IN' | 'hi-IN'>('en-IN')
  const [autoSpeechPrompt, setAutoSpeechPrompt] = useState(true)
  const [savedSuccess, setSavedSuccess] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    setBalanceInput(String(openingBalance))
  }, [openingBalance])

  useEffect(() => {
    setCashInput(String(openingCash))
  }, [openingCash])

  const handleSaveFinances = (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMessage('')
    // Strict: '12,000', '100abc' etc. are rejected instead of being silently read as a different number.
    const balanceCheck = validateOpeningBalance(balanceInput.trim())
    const cashCheck = validateOpeningBalance(cashInput.trim())
    if (!balanceCheck.valid || !cashCheck.valid || balanceCheck.balance < 0 || cashCheck.balance < 0) {
      setErrorMessage('Please enter valid amounts (digits with at most 2 decimals, no commas or symbols).')
      return
    }
    const parsedBalance = balanceCheck.balance
    const parsedCash = cashCheck.balance

    if (parsedCash > parsedBalance) {
      setErrorMessage('Starting cash in hand cannot be more than the opening balance (cash is part of the balance).')
      return
    }

    setOpeningBalance(parsedBalance)
    setOpeningCash(parsedCash)
    setSavedSuccess(true)
    setTimeout(() => setSavedSuccess(false), 2500)
  }

  return (
    <>
      <PageHeader
        title="Settings"
        description="Configure your contractor cashbook preferences, voice language, and balances."
      />

      <div className="flex max-w-3xl flex-col gap-6 px-4 py-5 md:px-8 md:py-7">
        {/* Contractor Account Preview Card */}
        <Panel bodyClassName="flex items-center justify-between p-4 md:p-5">
          <div className="flex items-center gap-3.5">
            <span
              aria-hidden="true"
              className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary"
            >
              <UserRound className="size-5" />
            </span>
            <div>
              <p className="font-semibold text-sm text-foreground">
                {business.businessName || 'FlowMint Contractor'}
              </p>
              <p className="text-xs text-muted-foreground">
                {business.ownerName || user?.name || user?.email || 'Active Account'}
              </p>
            </div>
          </div>
          <Link
            href="/profile"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
          >
            <span>Edit Profile</span>
            <ArrowRight className="size-3" />
          </Link>
        </Panel>

        {/* Ledger & Balance Preferences */}
        <Panel
          title="Cashbook & Opening Balances"
          bodyClassName="p-4 md:p-6"
        >
          <form onSubmit={handleSaveFinances} className="flex flex-col gap-4">
            <p className="text-xs text-muted-foreground">
              Set these once, when you start using FlowMint. Every day then opens with the previous day&apos;s closing balance
              automatically. Changing them later re-states the balance of every day and every report, so only change them to correct a mistake.
            </p>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="opening-balance" className="block text-xs font-semibold text-foreground">
                  Opening Balance (₹): total money you start with
                </label>
                <div className="relative mt-1.5">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-muted-foreground">
                    ₹
                  </span>
                  <input
                    id="opening-balance"
                    type="number"
                    min="0"
                    step="0.01"
                    value={balanceInput}
                    onChange={(e) => setBalanceInput(e.target.value)}
                    className="h-10 w-full rounded-lg border border-input bg-card pl-7 pr-3 text-sm font-semibold text-foreground outline-none transition-colors focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20"
                  />
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Current: {formatMoney(openingBalance)}
                </p>
              </div>

              <div>
                <label htmlFor="opening-cash" className="block text-xs font-semibold text-foreground">
                  Starting Cash in Hand (₹): the part of it held as physical cash
                </label>
                <div className="relative mt-1.5">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-muted-foreground">
                    ₹
                  </span>
                  <input
                    id="opening-cash"
                    type="number"
                    min="0"
                    step="0.01"
                    value={cashInput}
                    onChange={(e) => setCashInput(e.target.value)}
                    className="h-10 w-full rounded-lg border border-input bg-card pl-7 pr-3 text-sm font-semibold text-foreground outline-none transition-colors focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20"
                  />
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Current: {formatMoney(openingCash)}
                </p>
              </div>
            </div>

            {errorMessage && (
              <p className="text-xs font-semibold text-destructive animate-in fade-in">
                {errorMessage}
              </p>
            )}

            <div className="flex items-center justify-between border-t pt-4">
              {savedSuccess ? (
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-income">
                  <Check className="size-4" />
                  Balances updated!
                </span>
              ) : (
                <span className="text-[11px] text-muted-foreground">
                  Updates reflect instantly on Dashboard and Cashbook
                </span>
              )}
              <button type="submit" className={buttonClass('primary', 'md')}>
                Save Balances
              </button>
            </div>
          </form>
        </Panel>

        {/* Voice Recognition Settings */}
        <Panel
          title="Voice Entry Preferences"
          bodyClassName="flex flex-col gap-4 p-4 md:p-6"
        >
          <div className="flex flex-col gap-1">
            <label htmlFor="voice-lang" className="text-xs font-semibold text-foreground">
              Primary Speech Recognition Language
            </label>
            <p className="text-xs text-muted-foreground">
              The AI speech parser supports mixed English, Tamil, and Hindi contractor terminology.
            </p>
            <select
              id="voice-lang"
              value={voiceLanguage}
              onChange={(e) => setVoiceLanguage(e.target.value as 'ta-IN' | 'en-IN' | 'hi-IN')}
              className="mt-1 h-10 rounded-lg border border-input bg-card px-3 text-xs font-medium text-foreground outline-none"
            >
              <option value="en-IN">English (India) · Supports Lakhs & Rupee amounts</option>
              <option value="ta-IN">Tamil (India) · தமிழ்</option>
              <option value="hi-IN">Hindi (India) · हिन्दी</option>
            </select>
          </div>

          <div className="flex items-center justify-between border-t pt-4">
            <div>
              <p className="text-xs font-semibold text-foreground">Review Before Saving</p>
              <p className="text-[11px] text-muted-foreground">
                Always show detected transaction details for 1-tap confirmation before saving to ledger.
              </p>
            </div>
            <input
              type="checkbox"
              checked={autoSpeechPrompt}
              onChange={(e) => setAutoSpeechPrompt(e.target.checked)}
              className="size-4 accent-primary"
            />
          </div>
        </Panel>

        {/* Legal & Compliance Panel */}
        <Panel title="About & Legal Information" bodyClassName="p-4 md:p-6 flex flex-col gap-3">
          <p className="text-xs text-muted-foreground">
            FlowMint · Dedicated financial assistant and cashbook ledger for building contractors. Your data is privately stored and protected.
          </p>
          <div className="flex flex-wrap items-center gap-4 border-t pt-3 text-xs font-semibold text-primary">
            <Link href="/privacy" className="hover:underline">
              Privacy Policy
            </Link>
            <span className="text-muted-foreground font-normal">·</span>
            <Link href="/terms" className="hover:underline">
              Terms of Service
            </Link>
          </div>
        </Panel>
      </div>
    </>
  )
}
