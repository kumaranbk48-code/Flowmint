'use client'

import { useState, useEffect } from 'react'
import { Building2, MapPin, User, Briefcase, ArrowRight } from 'lucide-react'
import { useAuth } from '@/components/auth-provider'
import { buttonClass } from '@/components/ledger-ui'
import { FlowMintLogo } from '@/components/logo'
import { cn } from '@/lib/utils'

export default function OnboardingPage() {
  const { user, business, saveBusinessDetails } = useAuth()

  const [businessName, setBusinessName] = useState(business.businessName || '')
  const [ownerName, setOwnerName] = useState(user?.name || business.ownerName || '')
  const [businessType, setBusinessType] = useState(business.businessType || '')
  const [location, setLocation] = useState(business.location || '')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!ownerName && (user?.name || business.ownerName)) {
      setOwnerName(user?.name || business.ownerName || '')
    }
  }, [user?.name, business.ownerName, ownerName])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!businessName.trim()) {
      setError('Please enter your business name.')
      return
    }
    if (!ownerName.trim()) {
      setError('Please enter the owner name.')
      return
    }
    if (!businessType.trim()) {
      setError('Please enter the business type.')
      return
    }
    if (!location.trim()) {
      setError('Please enter your location.')
      return
    }

    setLoading(true)
    setError('')
    try {
      await saveBusinessDetails({
        businessName: businessName.trim(),
        ownerName: ownerName.trim(),
        businessType: businessType.trim(),
        location: location.trim(),
      })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save business details. Please try again.'
      setError(msg)
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center p-4 sm:p-6 lg:p-8">
      <div className="w-full max-w-lg rounded-2xl border bg-card p-6 shadow-xl sm:p-8">
        {/* Brand & Step indicator */}
        <div className="flex flex-col items-center text-center">
          <FlowMintLogo size={56} className="mb-2" />
          <span className="mt-1 inline-flex items-center rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
            Step 2 of 2 · Primary Setup
          </span>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-foreground">Business details</h1>
          <p className="mt-1 text-pretty text-xs text-muted-foreground sm:text-sm">
            Please provide your primary business information to set up your account.
          </p>
        </div>

        {error ? (
          <div className="mt-5 rounded-lg bg-destructive/10 px-3.5 py-2.5 text-xs font-medium text-destructive">
            {error}
          </div>
        ) : null}

        <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
          {/* Business Name */}
          <div>
            <label htmlFor="biz-name" className="flex items-center gap-1.5 text-xs font-medium text-foreground">
              <Building2 className="size-3.5 text-muted-foreground" aria-hidden="true" />
              Business Name
            </label>
            <input
              id="biz-name"
              type="text"
              required
              placeholder="e.g. AP Builders"
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              className="mt-1 h-11 w-full rounded-lg border border-input bg-card px-3 text-sm text-foreground outline-none transition-colors focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20"
            />
          </div>

          {/* Owner Name */}
          <div>
            <label htmlFor="owner-name" className="flex items-center gap-1.5 text-xs font-medium text-foreground">
              <User className="size-3.5 text-muted-foreground" aria-hidden="true" />
              Owner Name
            </label>
            <input
              id="owner-name"
              type="text"
              required
              placeholder="e.g. Arun Prakash"
              value={ownerName}
              onChange={(e) => setOwnerName(e.target.value)}
              className="mt-1 h-11 w-full rounded-lg border border-input bg-card px-3 text-sm text-foreground outline-none transition-colors focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20"
            />
          </div>

          {/* Business Type */}
          <div>
            <label htmlFor="biz-type" className="flex items-center gap-1.5 text-xs font-medium text-foreground">
              <Briefcase className="size-3.5 text-muted-foreground" aria-hidden="true" />
              Business Type
            </label>
            <input
              id="biz-type"
              type="text"
              required
              placeholder="e.g. Building Contractor"
              value={businessType}
              onChange={(e) => setBusinessType(e.target.value)}
              className="mt-1 h-11 w-full rounded-lg border border-input bg-card px-3 text-sm text-foreground outline-none transition-colors focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20"
            />
          </div>

          {/* Location */}
          <div>
            <label htmlFor="biz-location" className="flex items-center gap-1.5 text-xs font-medium text-foreground">
              <MapPin className="size-3.5 text-muted-foreground" aria-hidden="true" />
              Location
            </label>
            <input
              id="biz-location"
              type="text"
              required
              placeholder="e.g. Chennai, Tamil Nadu"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              className="mt-1 h-11 w-full rounded-lg border border-input bg-card px-3 text-sm text-foreground outline-none transition-colors focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20"
            />
          </div>

          <div className="mt-2">
            <button
              type="submit"
              disabled={loading}
              className={cn(buttonClass('primary', 'lg'), 'w-full')}
            >
              <span>{loading ? 'Saving…' : 'Complete Setup & Go to Dashboard'}</span>
              <ArrowRight className="size-4" aria-hidden="true" />
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
